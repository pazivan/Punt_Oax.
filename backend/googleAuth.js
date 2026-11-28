const { createHash, randomBytes } = require('node:crypto');
const { OAuth2Client } = require('google-auth-library');
// Reutilizar el cliente conserva la caché de certificados rotatorios de Google.
const clienteGoogle = new OAuth2Client({ transporterOptions: { timeout: 8000 } });

const COOKIE = 'puntoax_google';
const secreto = () => randomBytes(32).toString('hex');
const hash = (valor) => createHash('sha256').update(valor).digest('hex');
const esSecreto = (valor) => typeof valor === 'string' && /^[a-f0-9]{64}$/.test(valor);
const COLUMNAS = 'id_usuario, correo, nombre, apellidos, telefono, google_sub, password_hash, correo_verificado_en, version_sesion, activo';

function fallo(status, codigo, message) {
  return Object.assign(new Error(message), { status, codigo });
}

// verifyIdToken comprueba la firma con las claves públicas rotatorias de Google,
// la audiencia, emisor y tiempos. Se exige además expiración estricta (sin skew).
async function verificarCredencial(credential, clientId, cliente = clienteGoogle) {
  try {
    const ticket = await cliente.verifyIdToken({ idToken: credential, audience: clientId });
    const datos = ticket.getPayload();
    const ahora = Math.floor(Date.now() / 1000);
    if (!datos || datos.aud !== clientId ||
        !['accounts.google.com', 'https://accounts.google.com'].includes(datos.iss) ||
        !Number.isFinite(datos.exp) || datos.exp <= ahora ||
        !Number.isFinite(datos.iat) || datos.iat > ahora + 60 ||
        datos.email_verified !== true || typeof datos.sub !== 'string' || !datos.sub.length || datos.sub.length > 255 ||
        typeof datos.email !== 'string' || datos.email.length > 255 ||
        !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(datos.email) ||
        !esSecreto(datos.nonce)) throw new Error('Claims inválidos');
    return { ...datos, email: datos.email.trim().toLowerCase() };
  } catch {
    throw fallo(401, 'GOOGLE_TOKEN_INVALIDO', 'Google no pudo validar tu identidad. Inténtalo de nuevo.');
  }
}

function registrarRutasGoogle(app, {
  pool, crearSesionActiva, verificarPassword, limiteIp,
  env = process.env, verificar = verificarCredencial,
}) {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const produccion = env.NODE_ENV === 'production';
  const origenes = new Set((env.GOOGLE_ALLOWED_ORIGINS ||
    (produccion ? env.APP_URL || 'https://puntoax.online' : 'http://localhost:5173,http://127.0.0.1:5173'))
    .split(',').map((v) => v.trim()).filter(Boolean));
  const cookieNavegador = (req) => {
    const valor = (req.headers.cookie || '').split(';').map((v) => v.trim())
      .find((v) => v.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
    return esSecreto(valor) ? valor : null;
  };
  const proteger = (fn) => async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      if (!clientId) throw fallo(503, 'GOOGLE_NO_CONFIGURADO', 'El acceso con Google no está disponible. Usa tu correo y contraseña.');
      if (!origenes.has(req.headers.origin) || req.get('X-Puntoax-Google') !== '1' || !req.is('application/json')) {
        throw fallo(403, 'GOOGLE_CSRF', 'Solicitud no permitida. Recarga la página e inténtalo de nuevo.');
      }
      if (!await limiteIp(req, 'google')) throw fallo(429, 'GOOGLE_LIMITE', 'Demasiados intentos. Inténtalo más tarde.');
      await fn(req, res);
    } catch (error) {
      // Nunca registrar ID tokens, contraseñas ni respuestas del proveedor.
      if (error.code === '23505') return res.status(409).json({
        error: 'La cuenta o identidad ya existe. Inténtalo de nuevo para iniciar sesión o vincularla.',
        codigo: 'GOOGLE_CONFLICTO',
      });
      res.status(error.status || 503).json({
        error: error.status ? error.message : 'No se pudo completar el acceso con Google. Inténtalo más tarde.',
        codigo: error.codigo || 'GOOGLE_ERROR_TEMPORAL',
      });
    }
  };
  const consumir = async (req, tipo, id) => {
    const navegador = cookieNavegador(req);
    if (!navegador || !esSecreto(id) || !esSecreto(req.body?.csrf)) {
      throw fallo(403, 'GOOGLE_CSRF', 'La solicitud no es válida. Vuelve a comenzar.');
    }
    // DELETE atómico, fuera de la transacción de cuenta: incluso un fallo consume
    // el desafío. Dos workers no pueden aceptar la misma credencial.
    const { rows } = await pool.query(`DELETE FROM desafios_google
      WHERE id_hash=$1 AND navegador_hash=$2 AND csrf_hash=$3 AND tipo=$4 AND vence_en > now()
      RETURNING *`, [hash(id), hash(navegador), hash(req.body.csrf), tipo]);
    if (!rows[0]) throw fallo(401, 'GOOGLE_DESAFIO_VENCIDO', 'El intento venció o ya fue utilizado. Vuelve a comenzar.');
    return rows[0];
  };
  const comprobarCuenta = (cuenta) => {
    if (cuenta.activo === false) throw fallo(403, 'CUENTA_DESACTIVADA', 'Tu cuenta está desactivada. Contacta al administrador.');
    if (!cuenta.correo_verificado_en) throw fallo(403, 'CORREO_NO_VERIFICADO',
      'Verifica el correo de tu cuenta original antes de vincular Google.');
  };
  const responderSesion = async (db, cuenta) => {
    comprobarCuenta(cuenta);
    const { token, sesion_politica } = await crearSesionActiva(db, {
      id: cuenta.id_usuario, correo: cuenta.correo, rol: 'usuario', version_sesion: cuenta.version_sesion,
    });
    return { token, sesion_politica, usuario: {
      id: cuenta.id_usuario, correo: cuenta.correo, nombre: cuenta.nombre,
      apellidos: cuenta.apellidos, telefono: cuenta.telefono || null, rol: 'usuario',
    } };
  };
  const transaccion = async (fn) => {
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const resultado = await fn(db);
      await db.query('COMMIT');
      return resultado;
    } catch (error) {
      await db.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { db.release(); }
  };

  app.post('/api/auth/google/desafio', proteger(async (req, res) => {
    const navegador = cookieNavegador(req) || secreto();
    res.cookie(COOKIE, navegador, {
      httpOnly: true, secure: produccion, sameSite: 'strict',
      path: '/api/auth/google', maxAge: 10 * 60 * 1000,
    });
    const desafio = secreto(), nonce = secreto(), csrf = secreto();
    await pool.query('DELETE FROM desafios_google WHERE vence_en <= now()');
    await pool.query(`INSERT INTO desafios_google (id_hash, navegador_hash, csrf_hash, nonce_hash, tipo)
      VALUES ($1,$2,$3,$4,'acceso')`, [hash(desafio), hash(navegador), hash(csrf), hash(nonce)]);
    res.json({ desafio, nonce, csrf });
  }));

  app.post('/api/auth/google', proteger(async (req, res) => {
    const intento = await consumir(req, 'acceso', req.body?.desafio);
    const credential = req.body?.credential;
    if (typeof credential !== 'string' || credential.length > 16384) {
      throw fallo(400, 'GOOGLE_TOKEN_REQUERIDO', 'Falta la credencial de Google.');
    }
    const identidad = await verificar(credential, clientId);
    if (!esSecreto(identidad.nonce) || hash(identidad.nonce) !== intento.nonce_hash) {
      throw fallo(401, 'GOOGLE_NONCE_INVALIDO', 'La credencial no pertenece a este intento. Vuelve a comenzar.');
    }
    const resultado = await transaccion(async (db) => {
      let { rows: [cuenta] } = await db.query(`SELECT ${COLUMNAS} FROM usuarios WHERE google_sub=$1 FOR UPDATE`, [identidad.sub]);
      if (cuenta) return { cuerpo: await responderSesion(db, cuenta) };
      const { rows: privilegiadas } = await db.query(`SELECT 1 FROM clinicas WHERE LOWER(TRIM(correo_acceso))=$1
        UNION ALL SELECT 1 FROM administradores WHERE LOWER(TRIM(correo))=$1`, [identidad.email]);
      if (privilegiadas.length) throw fallo(403, 'GOOGLE_SOLO_PACIENTES',
        'Google solo está disponible para pacientes. Usa el acceso original de clínica o administración.');
      ({ rows: [cuenta] } = await db.query(`SELECT ${COLUMNAS} FROM usuarios WHERE LOWER(TRIM(correo))=$1 FOR UPDATE`, [identidad.email]));
      if (cuenta) {
        comprobarCuenta(cuenta);
        if (cuenta.google_sub) throw fallo(409, 'GOOGLE_OTRA_IDENTIDAD', 'Esta cuenta ya está vinculada a otra identidad de Google.');
        const vinculacion = secreto();
        await db.query(`INSERT INTO desafios_google
          (id_hash,navegador_hash,csrf_hash,tipo,usuario_id,google_sub,correo,version_sesion,vence_en)
          VALUES ($1,$2,$3,'vinculacion',$4,$5,$6,$7,LEAST(to_timestamp($8),now()+interval '5 minutes'))`,
        [hash(vinculacion), intento.navegador_hash, intento.csrf_hash, cuenta.id_usuario,
          identidad.sub, cuenta.correo, cuenta.version_sesion, identidad.exp]);
        return { status: 409, cuerpo: { codigo: 'GOOGLE_VINCULACION_REQUERIDA', vinculacion,
          correo: cuenta.correo, error: 'Este correo ya tiene una cuenta. Confirma tu contraseña original para vincular Google.' } };
      }
      const nombre = typeof identidad.given_name === 'string' ? identidad.given_name.trim().slice(0, 100) || null : null;
      const apellidos = typeof identidad.family_name === 'string' ? identidad.family_name.trim().slice(0, 150) || null : null;
      ({ rows: [cuenta] } = await db.query(`INSERT INTO usuarios (correo,google_sub,nombre,apellidos,correo_verificado_en)
        VALUES ($1,$2,$3,$4,now()) RETURNING ${COLUMNAS}`, [identidad.email, identidad.sub, nombre, apellidos]));
      return { status: 201, cuerpo: await responderSesion(db, cuenta) };
    });
    res.status(resultado.status || 200).json(resultado.cuerpo);
  }));

  app.post('/api/auth/google/vincular', proteger(async (req, res) => {
    const intento = await consumir(req, 'vinculacion', req.body?.vinculacion);
    const password = req.body?.password;
    if (typeof password !== 'string' || !password || Buffer.byteLength(password) > 72 ||
        req.body?.confirmar !== true) throw fallo(400, 'GOOGLE_CONFIRMACION', 'Confirma la vinculación e introduce tu contraseña original.');
    const cuerpo = await transaccion(async (db) => {
      const { rows: [cuenta] } = await db.query(`SELECT ${COLUMNAS} FROM usuarios WHERE id_usuario=$1 FOR UPDATE`, [intento.usuario_id]);
      if (!cuenta || cuenta.correo !== intento.correo || cuenta.version_sesion !== intento.version_sesion ||
          !await verificarPassword(password, cuenta.password_hash)) {
        throw fallo(401, 'GOOGLE_PASSWORD_INVALIDO', 'No se pudo autenticar la cuenta original. Vuelve a comenzar.');
      }
      comprobarCuenta(cuenta);
      if (cuenta.google_sub) throw fallo(409, 'GOOGLE_CONFLICTO', 'Esta cuenta ya tiene una identidad de Google vinculada.');
      await db.query('UPDATE usuarios SET google_sub=$1 WHERE id_usuario=$2', [intento.google_sub, cuenta.id_usuario]);
      return responderSesion(db, cuenta);
    });
    res.json(cuerpo);
  }));
}

module.exports = { registrarRutasGoogle, verificarCredencial };
