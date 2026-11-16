const { createHmac, randomInt, randomBytes, timingSafeEqual } = require('node:crypto');

const ROLES = {
  usuario: { tabla: 'usuarios', id: 'id_usuario', correo: 'correo' },
  clinica: { tabla: 'clinicas', id: 'id_clinica', correo: 'correo_acceso' },
  administrador: { tabla: 'administradores', id: 'id_administrador', correo: 'correo' },
};
const URL_APP = process.env.APP_URL || 'https://puntoax.online';
const REMITENTE = process.env.BREVO_SENDER_EMAIL || 'notificaciones@puntoax.online';
const NO_ENVIO = '@demo.puntoax.invalid';
const MENSAJE_GENERICO = 'Si existe una cuenta con ese correo, recibirás instrucciones para continuar.';

function permitido(correo) {
  return typeof correo === 'string' && !correo.trim().toLowerCase().endsWith(NO_ENVIO);
}
function digest(valor) {
  const secreto = process.env.JWT_SECRET;
  if (!secreto || secreto.length < 32) throw new Error('Configura JWT_SECRET antes de enviar correo.');
  return createHmac('sha256', secreto).update(valor).digest('hex');
}
function comparar(a, b) {
  return typeof a === 'string' && typeof b === 'string' &&
    a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
function escapar(texto) {
  return String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
function marcoCorreo(contenido) {
  return `<html lang="es"><body style="margin:0;padding:32px 16px;background:#f3f4f3;color:#103328;font-family:Arial,sans-serif">
    <div style="max-width:560px;margin:auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #d6e6e0">
      <div style="padding:24px 32px;background:#103328;color:#fff;font-size:22px;font-weight:bold">PuntOax</div>
      <div style="padding:32px;line-height:1.65">${contenido}</div>
    </div></body></html>`;
}
function plantilla(titulo, mensaje, accion) {
  const texto = `${titulo}\n\n${mensaje}\n\n${accion || ''}\n\nSi no solicitaste esto, ignora este correo.\nPuntOax`;
  const accionHtml = accion?.startsWith('https://')
    ? `<a href="${escapar(accion)}">Restablecer contraseña</a>`
    : escapar(accion || '');
  return { subject: `PuntOax · ${titulo}`, textContent: texto,
    htmlContent: marcoCorreo(`<h1 style="margin-top:0">${escapar(titulo)}</h1><p>${escapar(mensaje)}</p><p>${accionHtml}</p><p>Si no solicitaste esto, ignora este correo.</p><p>PuntOax</p>`) };
}
const BIENVENIDAS = {
  usuario: {
    subject: '¡Bienvenido a PuntOax!',
    parrafos: [
      '¡Hola!',
      '¡Te damos la bienvenida a PuntOax!',
      'Tu cuenta ha sido verificada correctamente y ya puedes comenzar a explorar nuestra plataforma.',
      'PuntOax es un proyecto que busca facilitar el acceso a información sobre centros de salud en Oaxaca, permitiendo consultar ubicaciones, horarios y servicios disponibles desde un mismo lugar.',
      'Nuestro objetivo es ayudarte a encontrar información clara, accesible y organizada para que puedas tomar decisiones informadas sobre tu atención.',
      'Desde tu cuenta podrás explorar el directorio, consultar información de los centros y utilizar las funciones disponibles de la plataforma.',
      'Gracias por formar parte de PuntOax.',
    ],
    enlace: 'Explorar PuntOax',
  },
  clinica: {
    subject: 'Tu cuenta de clínica en PuntOax ha sido creada',
    parrafos: [
      '¡Hola!',
      'Te damos la bienvenida a PuntOax.',
      'Tu correo electrónico ha sido verificado correctamente y tu cuenta de clínica ya está registrada.',
      'Por el momento, la información de tu centro permanecerá en estado de borrador y no aparecerá públicamente hasta completar el proceso de revisión y aprobación correspondiente.',
      'Puedes iniciar sesión para consultar y administrar las funciones disponibles para tu cuenta.',
      'Gracias por participar en PuntOax y contribuir a que la información sobre los servicios de salud en Oaxaca sea más accesible.',
    ],
  },
};
function plantillaBienvenida(rol) {
  const datos = BIENVENIDAS[rol];
  if (!datos) throw new Error('Tipo de bienvenida inválido');
  const enlace = 'https://puntoax.online';
  return {
    subject: datos.subject,
    textContent: [...datos.parrafos, ...(datos.enlace ? [`${datos.enlace}: ${enlace}`] : []), 'Equipo PuntOax'].join('\n\n'),
    htmlContent: marcoCorreo(`<h1 style="font-size:24px;margin-top:0">${escapar(datos.subject)}</h1>` +
      datos.parrafos.map((parrafo) => `<p>${escapar(parrafo)}</p>`).join('') +
      (datos.enlace ? `<p><a href="${enlace}" style="display:inline-block;padding:12px 20px;background:#103328;color:#fff;border-radius:8px;text-decoration:none">${escapar(datos.enlace)}</a></p>` : '') +
      '<p><strong>Equipo PuntOax</strong></p>'),
  };
}
function crearProveedor() {
  // Solo se permite el simulador en una base de pruebas local explícita.
  if (process.env.PUNTOAX_MAIL_PROVIDER === 'mock' &&
      process.env.PUNTOAX_TEST_DB === '1' && /^puntoax_s4_test/.test(process.env.PGDATABASE || '') &&
      ['localhost', '127.0.0.1'].includes(process.env.PGHOST)) {
    const fs = require('node:fs/promises');
    return { listo: () => true, enviar: async (correo, contenido) => {
      if (process.env.PUNTOAX_TEST_FAIL_WELCOME === '1' && Object.values(BIENVENIDAS).some(({ subject }) => subject === contenido.subject)) {
        throw new Error('Fallo simulado de bienvenida');
      }
      await fs.appendFile(process.env.PUNTOAX_MOCK_MAIL_FILE, JSON.stringify({ correo, ...contenido }) + '\n', { mode: 0o600 });
    } };
  }
  return {
    listo: () => Boolean(process.env.BREVO_API_KEY && REMITENTE && /^https:\/\//.test(URL_APP)),
    enviar: async (correo, contenido) => {
      if (!process.env.BREVO_API_KEY) throw new Error('Proveedor de correo no disponible');
      const controlador = new AbortController();
      const plazo = setTimeout(() => controlador.abort(), 8000);
      try {
        const respuesta = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST', signal: controlador.signal,
          headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
          body: JSON.stringify({
            sender: { email: REMITENTE, name: process.env.BREVO_SENDER_NAME || 'PuntOax' },
            to: [{ email: correo }], ...contenido,
          }),
        });
        if (!respuesta.ok) throw new Error('Proveedor de correo no disponible');
      } finally { clearTimeout(plazo); }
    },
  };
}

function registrarRutasCorreo(app, { pool, hashearPassword, validarPassword, proveedor = crearProveedor() }) {
  const respuestaError = (res) => res.status(503).json({ error: 'El correo no está disponible. Inténtalo más tarde.' });
  const controlar = (fn) => async (req, res) => {
    try { await fn(req, res); } catch {
      // No registrar errores del proveedor: podrían contener cabeceras o credenciales.
      respuestaError(res);
    }
  };
  const validarEntrada = (req, res, { incluirCodigo = false } = {}) => {
    const { rol, correo, codigo } = req.body || {};
    if (!ROLES[rol] || typeof correo !== 'string' || correo.length > 255 ||
        !/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(correo.trim()) ||
        (incluirCodigo && (typeof codigo !== 'string' || !/^\d{6}$/.test(codigo)))) {
      res.status(400).json({ error: 'Revisa los datos enviados.' });
      return null;
    }
    return { rol, correo: correo.trim().toLowerCase() };
  };
  const limiteIp = async (req, tipo) => {
    const clave = digest(`ip:${tipo}:${req.ip}`);
    const { rows } = await pool.query(`INSERT INTO limites_correo (clave, ventana_en, cantidad)
      VALUES ($1, now(), 1) ON CONFLICT (clave) DO UPDATE SET
      cantidad = CASE WHEN limites_correo.ventana_en < now() - interval '1 hour' THEN 1 ELSE limites_correo.cantidad + 1 END,
      ventana_en = CASE WHEN limites_correo.ventana_en < now() - interval '1 hour' THEN now() ELSE limites_correo.ventana_en END
      RETURNING cantidad`, [clave]);
    return rows[0].cantidad <= (tipo === 'verificar' ? 60 : 20);
  };
  const buscar = async (db, { rol, correo }, bloqueo = '') => {
    const { tabla, id } = ROLES[rol];
    const campo = ROLES[rol].correo;
    const { rows } = await db.query(`SELECT ${id} AS id, ${campo} AS correo, ${rol === 'administrador' ? 'NULL AS correo_verificado_en' : 'correo_verificado_en'}
      FROM ${tabla} WHERE ${campo} = $1 ${bloqueo}`, [correo]);
    return rows[0];
  };
  const enviarDesafio = async (datos, tipo) => {
    if (!proveedor.listo()) throw new Error('Proveedor no configurado');
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const cuenta = await buscar(db, datos, 'FOR UPDATE');
      if (!cuenta || !permitido(cuenta.correo) || (tipo === 'verificacion' && cuenta.correo_verificado_en)) {
        await db.query('COMMIT'); return;
      }
      const { rows } = await db.query(`SELECT envios, ventana_en, ultimo_envio FROM desafios_correo
        WHERE rol=$1 AND cuenta_id=$2 AND tipo=$3 FOR UPDATE`, [datos.rol, cuenta.id, tipo]);
      const anterior = rows[0];
      const vigente = anterior && Date.now() - new Date(anterior.ventana_en).getTime() < 3600000;
      if (anterior && Date.now() - new Date(anterior.ultimo_envio).getTime() < 60000) {
        await db.query('COMMIT'); return;
      }
      if (vigente && anterior.envios >= 3) { await db.query('COMMIT'); return; }
      const secreto = tipo === 'verificacion'
        ? String(randomInt(0, 1000000)).padStart(6, '0') : randomBytes(32).toString('hex');
      const hash = digest(`${tipo}:${datos.rol}:${cuenta.id}:${secreto}`);
      await db.query(`INSERT INTO desafios_correo
        (rol, cuenta_id, tipo, secreto_hash, vence_en, envios, ventana_en)
        VALUES ($1,$2,$3,$4,now() + interval '10 minutes',$5,now())
        ON CONFLICT (rol, cuenta_id, tipo) DO UPDATE SET
        secreto_hash=$4, vence_en=now() + interval '10 minutes', intentos=0,
        envios=$5, ventana_en=CASE WHEN $5=1 THEN now() ELSE desafios_correo.ventana_en END,
        ultimo_envio=now()`,
      [datos.rol, cuenta.id, tipo, hash, vigente ? anterior.envios + 1 : 1]);
      const contenido = tipo === 'verificacion'
        ? plantilla('Verifica tu correo', 'Tu código vence en 10 minutos.', `Código: ${secreto}`)
        : plantilla('Restablece tu contraseña', 'Este enlace vence en 10 minutos.',
          `${URL_APP.replace(/\/$/, '')}/restablecer?rol=${datos.rol}&correo=${encodeURIComponent(cuenta.correo)}&token=${secreto}`);
      await proveedor.enviar(cuenta.correo, contenido);
      await db.query('COMMIT');
    } catch (error) { await db.query('ROLLBACK').catch(() => {}); throw error; }
    finally { db.release(); }
  };

  app.post('/api/auth/reenviar-verificacion', controlar(async (req, res) => {
    const datos = validarEntrada(req, res);
    if (!datos) return;
    if (datos.rol === 'administrador') return res.status(400).json({ error: 'Tipo de cuenta inválido.' });
    if (!await limiteIp(req, 'verificar')) return res.status(429).json({ error: 'Demasiadas solicitudes. Inténtalo más tarde.' });
    await enviarDesafio(datos, 'verificacion');
    res.json({ mensaje: MENSAJE_GENERICO });
  }));
  app.post('/api/auth/verificar-correo', controlar(async (req, res) => {
    const datos = validarEntrada(req, res, { incluirCodigo: true });
    if (!datos) return;
    if (datos.rol === 'administrador') return res.status(400).json({ error: 'Tipo de cuenta inválido.' });
    if (!await limiteIp(req, 'verificar')) return res.status(429).json({ error: 'Demasiadas solicitudes. Inténtalo más tarde.' });
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const cuenta = await buscar(db, datos, 'FOR UPDATE');
      if (!cuenta || cuenta.correo_verificado_en) { await db.query('COMMIT'); return res.status(400).json({ error: 'Código inválido o vencido.' }); }
      const { rows } = await db.query(`SELECT * FROM desafios_correo WHERE rol=$1 AND cuenta_id=$2 AND tipo='verificacion' FOR UPDATE`,
        [datos.rol, cuenta.id]);
      const desafio = rows[0];
      if (!desafio || desafio.intentos >= 5 || new Date(desafio.vence_en).getTime() <= Date.now()) {
        await db.query('COMMIT'); return res.status(400).json({ error: 'Código inválido o vencido.' });
      }
      if (!comparar(desafio.secreto_hash, digest(`verificacion:${datos.rol}:${cuenta.id}:${req.body.codigo}`))) {
        await db.query(`UPDATE desafios_correo SET intentos=intentos+1 WHERE rol=$1 AND cuenta_id=$2 AND tipo='verificacion'`, [datos.rol, cuenta.id]);
        await db.query('COMMIT'); return res.status(400).json({ error: 'Código inválido o vencido.' });
      }
      const { tabla, id } = ROLES[datos.rol];
      await db.query(`UPDATE ${tabla} SET correo_verificado_en=now() WHERE ${id}=$1`, [cuenta.id]);
      await db.query(`DELETE FROM desafios_correo WHERE rol=$1 AND cuenta_id=$2 AND tipo='verificacion'`, [datos.rol, cuenta.id]);
      await db.query('COMMIT');
      // Solo el primer intento que cambia el estado envía bienvenida. No se
      // revierte la verificación ni se expone el error si falla el proveedor.
      if (permitido(cuenta.correo)) {
        try { await proveedor.enviar(cuenta.correo, plantillaBienvenida(datos.rol)); } catch { /* cuenta funcional */ }
      }
      res.json({ mensaje: 'Correo verificado. Ya puedes iniciar sesión.' });
    } catch (error) { await db.query('ROLLBACK').catch(() => {}); throw error; }
    finally { db.release(); }
  }));
  app.post('/api/auth/solicitar-recuperacion', controlar(async (req, res) => {
    const datos = validarEntrada(req, res);
    if (!datos) return;
    if (!await limiteIp(req, 'recuperar')) return res.status(429).json({ error: 'Demasiadas solicitudes. Inténtalo más tarde.' });
    // La respuesta no revela ni la existencia de la cuenta ni fallos del proveedor.
    try { await enviarDesafio(datos, 'recuperacion'); } catch { /* se puede intentar de nuevo más tarde */ }
    res.json({ mensaje: MENSAJE_GENERICO });
  }));
  app.post('/api/auth/restablecer-password', controlar(async (req, res) => {
    const datos = validarEntrada(req, res);
    if (!datos) return;
    const { token, password } = req.body;
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token) ||
        typeof password !== 'string' || validarPassword(password)) return res.status(400).json({ error: 'Enlace o contraseña no válidos.' });
    if (!await limiteIp(req, 'recuperar')) return res.status(429).json({ error: 'Demasiadas solicitudes. Inténtalo más tarde.' });
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const cuenta = await buscar(db, datos, 'FOR UPDATE');
      const { rows } = cuenta ? await db.query(`SELECT * FROM desafios_correo WHERE rol=$1 AND cuenta_id=$2 AND tipo='recuperacion' FOR UPDATE`, [datos.rol, cuenta.id]) : { rows: [] };
      const desafio = rows[0];
      if (!desafio || desafio.intentos >= 5 || new Date(desafio.vence_en).getTime() <= Date.now() ||
          !comparar(desafio.secreto_hash, digest(`recuperacion:${datos.rol}:${cuenta.id}:${token}`))) {
        if (desafio && desafio.intentos < 5) await db.query(`UPDATE desafios_correo SET intentos=intentos+1 WHERE rol=$1 AND cuenta_id=$2 AND tipo='recuperacion'`, [datos.rol, cuenta.id]);
        await db.query('COMMIT'); return res.status(400).json({ error: 'Enlace inválido o vencido.' });
      }
      const hash = await hashearPassword(password);
      const { tabla, id } = ROLES[datos.rol];
      await db.query(`UPDATE ${tabla} SET password_hash=$1, version_sesion=version_sesion+1 WHERE ${id}=$2`, [hash, cuenta.id]);
      await db.query(`DELETE FROM desafios_correo WHERE rol=$1 AND cuenta_id=$2 AND tipo='recuperacion'`, [datos.rol, cuenta.id]);
      await db.query('COMMIT');
      res.json({ mensaje: 'Contraseña actualizada. Inicia sesión de nuevo.' });
    } catch (error) { await db.query('ROLLBACK').catch(() => {}); throw error; }
    finally { db.release(); }
  }));
  return { enviarDesafio, proveedor, limiteIp };
}

module.exports = { registrarRutasCorreo, crearProveedor, plantilla, plantillaBienvenida, permitido };
