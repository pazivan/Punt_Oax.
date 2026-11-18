const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const fs = require('node:fs');
const jwt = require('jsonwebtoken');

// Rechazar cualquier ejecución accidental contra una base compartida.
if (process.env.PUNTOAX_TEST_DB !== '1' ||
    !process.env.PGDATABASE?.startsWith('puntoax_s4_test') ||
    !['localhost', '127.0.0.1'].includes(process.env.PGHOST)) {
  throw new Error('Usa PUNTOAX_TEST_DB=1 y una base puntoax_s4_test* en localhost.');
}
if (process.env.PGPORT === '55441' || process.env.PGPORT === '5432') {
  throw new Error('No uses los puertos de la base de desarrollo ni de Sprint 3 para las pruebas.');
}
if (!process.env.DOCUMENTS_PRIVATE_DIR?.startsWith('/tmp/opencode/')) {
  throw new Error('Configura DOCUMENTS_PRIVATE_DIR dentro de /tmp/opencode/ para esta prueba aislada.');
}

const pool = new Pool();
const puerto = Number(process.env.PUNTOAX_TEST_API_PORT);
if (!process.env.PUNTOAX_TEST_API_PORT || !Number.isInteger(puerto) ||
    puerto < 1024 || puerto > 65535 || puerto === 3000) {
  throw new Error('Configura PUNTOAX_TEST_API_PORT con un puerto local de API aislada distinto de 3000.');
}
const url = `http://127.0.0.1:${puerto}`;

async function llamar(ruta, { datos, token, metodo } = {}) {
  const respuesta = await fetch(`${url}${ruta}`, {
    method: metodo || (datos ? 'POST' : 'GET'),
    headers: {
      ...(datos ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: datos ? JSON.stringify(datos) : undefined,
  });
  return { status: respuesta.status, cuerpo: await respuesta.json() };
}
function ultimoCorreo(correo) {
  return fs.readFileSync(process.env.PUNTOAX_MOCK_MAIL_FILE, 'utf8').trim().split('\n')
    .map((linea) => JSON.parse(linea)).filter((mensaje) => mensaje.correo === correo).at(-1);
}
async function verificarCuenta(rol, correo) {
  const codigo = ultimoCorreo(correo).textContent.match(/Código: (\d{6})/)[1];
  assert.equal((await llamar('/api/auth/verificar-correo', { datos: { rol, correo, codigo } })).status, 200);
  assert.equal(ultimoCorreo(correo).subject, rol === 'usuario'
    ? '¡Bienvenido a PuntOax!' : 'Tu cuenta de clínica en PuntOax ha sido creada');
}

test('registro, inicio de sesión y permisos reales contra API y BD aisladas', async () => {
  const correo = `integracion-${randomUUID()}@puntoax.online`;
  const correoClinica = `  Clinica-${randomUUID()}@Puntoax.Online  `;
  const correoClinicaNormalizado = correoClinica.trim().toLowerCase();
  const correoAdmin = `admin-${randomUUID()}@puntoax.online`;
  const password = `Clave-${randomUUID()}`;

  try {
    // ---------------------------------------------------------------
    // Salud y registro de usuarios (Kelly)
    // ---------------------------------------------------------------
    assert.equal((await llamar('/health')).status, 200);
    const registro = await llamar('/api/auth/registro-usuario', { datos: { correo, password } });
    assert.equal(registro.status, 201);
    assert.equal(registro.cuerpo.usuario.correo, correo);
    assert.equal(registro.cuerpo.requiere_verificacion, true);
    assert.equal(registro.cuerpo.token, undefined);
    assert.equal((await llamar('/api/auth/login-usuario', { datos: { correo, password } })).status, 403);
    await verificarCuenta('usuario', correo);
    const { rows } = await pool.query('SELECT nombre, password_hash FROM usuarios WHERE correo = $1', [correo]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].nombre, null);
    assert.notEqual(rows[0].password_hash, password);
    assert.equal(await bcrypt.compare(password, rows[0].password_hash), true);

    assert.equal((await llamar('/api/auth/registro-usuario', { datos: { correo, password } })).status, 409);
    assert.equal((await llamar('/api/auth/registro-usuario', { datos: { correo: 'inválido', password } })).status, 400);
    assert.equal((await llamar('/api/auth/registro-usuario', { datos: { correo: 42, password: null } })).status, 400);
    assert.equal((await llamar('/api/auth/registro-usuario', {
      datos: { correo: `debil-${randomUUID()}@puntoax.online`, password: '12345678' },
    })).status, 400);
    assert.equal((await llamar('/api/auth/registro-usuario', {
      datos: { correo: `tel-${randomUUID()}@puntoax.online`, password, telefono: '951 000' },
    })).status, 400);
    assert.equal((await llamar('/api/auth/login-usuario', { datos: { correo, password: 42 } })).status, 400);
    assert.equal((await llamar('/api/auth/login-usuario', { datos: { correo, password: 'otra-contraseña' } })).status, 401);

    const usuario = await llamar('/api/auth/login-usuario', { datos: { correo, password } });
    assert.equal(usuario.status, 200);
    assert.equal(usuario.cuerpo.usuario.correo, correo);
    assert.equal((await llamar('/api/auth/perfil', { token: usuario.cuerpo.token })).cuerpo.usuarioAutenticado.rol, 'usuario');
    assert.equal((await llamar('/api/admin/panel-prueba', { token: usuario.cuerpo.token })).status, 403);
    assert.equal((await llamar('/api/auth/perfil', { token: 'inválido' })).status, 403);
    assert.equal((await llamar('/api/auth/perfil')).status, 401);
    const otroUsuario = await llamar('/api/auth/login-usuario', { datos: { correo, password } });
    assert.equal(otroUsuario.status, 200);
    const idUsuario = (await pool.query('SELECT id_usuario FROM usuarios WHERE correo=$1', [correo])).rows[0].id_usuario;
    const tokenAnterior = jwt.sign({ id: idUsuario, rol: 'usuario', correo }, process.env.JWT_SECRET, { expiresIn: '7d' });
    assert.equal((await llamar('/api/auth/perfil', { token: tokenAnterior })).status, 200,
      'los JWT emitidos antes de agregar version_sesion siguen siendo válidos hasta el logout');

    // Cambio de contraseña desde Mi perfil: exige sesión y verifica la actual.
    const nuevaPassword = `Nueva-${randomUUID()}`;
    assert.equal((await llamar('/api/auth/cambiar-password', {
      metodo: 'PATCH', datos: { passwordActual: password, passwordNueva: nuevaPassword },
    })).status, 401, 'sin sesión no se puede cambiar la contraseña');
    assert.equal((await llamar('/api/auth/cambiar-password', {
      metodo: 'PATCH', token: usuario.cuerpo.token,
      datos: { passwordActual: 'incorrecta', passwordNueva: nuevaPassword },
    })).status, 401, 'una contraseña actual incorrecta se rechaza');
    assert.equal((await llamar('/api/auth/cambiar-password', {
      metodo: 'PATCH', token: usuario.cuerpo.token,
      datos: { passwordActual: password, passwordNueva: '12345678' },
    })).status, 400, 'la nueva contraseña debe cumplir la política');
    assert.equal((await llamar('/api/auth/cambiar-password', {
      metodo: 'PATCH', token: usuario.cuerpo.token,
      datos: { passwordActual: password, passwordNueva: password },
    })).status, 400, 'la nueva contraseña debe ser distinta de la actual');
    assert.equal((await llamar('/api/auth/cambiar-password', {
      metodo: 'PATCH', token: usuario.cuerpo.token,
      datos: { passwordActual: password },
    })).status, 400, 'faltan campos obligatorios');
    assert.equal((await llamar('/api/auth/cambiar-password', {
      metodo: 'PATCH', token: usuario.cuerpo.token,
      datos: { passwordActual: password, passwordNueva: nuevaPassword },
    })).status, 200, 'la contraseña se actualiza con los datos correctos');
    assert.equal((await llamar('/api/auth/login-usuario', { datos: { correo, password } })).status, 401,
      'la contraseña anterior deja de funcionar');
    assert.equal((await llamar('/api/auth/login-usuario', { datos: { correo, password: nuevaPassword } })).status, 200,
      'la contraseña nueva permite iniciar sesión');
    assert.equal((await llamar('/api/auth/perfil', { token: usuario.cuerpo.token })).status, 200,
      'la sesión abierta sigue válida después de cambiar la contraseña');
    // Se restaura la contraseña original para el resto de la suite.
    assert.equal((await llamar('/api/auth/cambiar-password', {
      metodo: 'PATCH', token: usuario.cuerpo.token,
      datos: { passwordActual: nuevaPassword, passwordNueva: password },
    })).status, 200);

    // El registro vigente crea únicamente la cuenta; la ficha se completa después.
    const baseClinica = { nombre: 'Clínica Comunitaria San Jacinto', correo: correoClinica, password };
    for (const datos of [
      { ...baseClinica, nombre: '   ' }, { ...baseClinica, correo: 'invalido' },
      { ...baseClinica, password: '1234567' },
      { ...baseClinica, password: '12345678' },
      { ...baseClinica, password: 'Abcdefg1' },
      { ...baseClinica, password: 'a'.repeat(73) },
      { ...baseClinica, nombre: 'a'.repeat(256) },
    ]) {
      const respuesta = await llamar('/api/auth/registro-clinica', { datos });
      assert.equal(respuesta.status, 400);
    }
    const registroClinica = await llamar('/api/auth/registro-clinica', { datos: baseClinica });
    assert.equal(registroClinica.status, 201);
    assert.equal(registroClinica.cuerpo.clinica.correo, correoClinicaNormalizado);
    assert.equal(registroClinica.cuerpo.clinica.estado_publicacion, 'borrador');
    assert.equal('token' in registroClinica.cuerpo, false);
    assert.equal((await llamar('/api/auth/login-clinica', { datos: { correo: correoClinicaNormalizado, password } })).status, 403);
    await verificarCuenta('clinica', correoClinicaNormalizado);
    const clinicaId = registroClinica.cuerpo.clinica.id;
    const clinicaDb = await pool.query('SELECT password_hash, municipio FROM clinicas WHERE id_clinica = $1', [clinicaId]);
    assert.equal(await bcrypt.compare(password, clinicaDb.rows[0].password_hash), true);
    assert.equal(clinicaDb.rows[0].municipio, null);
    assert.equal((await llamar('/api/auth/registro-clinica', { datos: baseClinica })).status, 409);
    const intentoRol = await llamar('/api/auth/registro-clinica', {
      datos: { ...baseClinica, correo: `rol-${randomUUID()}@puntoax.online`, rol: 'administrador', estado_publicacion: 'aprobada' },
    });
    assert.equal(intentoRol.status, 201);
    assert.equal(intentoRol.cuerpo.clinica.rol, 'clinica');
    assert.equal(intentoRol.cuerpo.clinica.estado_publicacion, 'borrador');
    const clinica = await llamar('/api/auth/login-clinica', { datos: { correo: correoClinicaNormalizado, password } });
    assert.equal(clinica.status, 200);
    assert.equal(clinica.cuerpo.clinica.id, clinicaId);
    const ficha = await llamar('/api/clinicas/mi-ficha', { token: clinica.cuerpo.token });
    assert.equal(ficha.status, 200);
    assert.equal(ficha.cuerpo.clinica.estado_publicacion, 'borrador');
    const invalida = await fetch(`${url}/api/clinicas/mi-ficha`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clinica.cuerpo.token}` },
      body: JSON.stringify({ codigo_postal: 'abcde', horarios: [{ dia_semana: 1, apertura: '17:00', cierre: '09:00' }] }),
    });
    assert.equal(invalida.status, 400);
    const edicion = await fetch(`${url}/api/clinicas/mi-ficha`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${clinica.cuerpo.token}` },
      body: JSON.stringify({ municipio: 'Oaxaca de Juárez', direccion: 'Calle Mina 310' }),
    });
    assert.equal(edicion.status, 200);
    assert.equal((await edicion.json()).clinica.municipio, 'Oaxaca de Juárez');
    assert.equal((await llamar('/api/admin/panel-prueba', { token: clinica.cuerpo.token })).status, 403);
    const directorio = await llamar('/api/clinicas');
    assert.equal(directorio.status, 200);
    assert.equal(directorio.cuerpo.some(c => c.id_clinica === clinicaId), false);
    const otraClinica = await llamar('/api/auth/login-clinica', { datos: { correo: correoClinicaNormalizado, password } });
    assert.equal(otraClinica.status, 200);

    // ---------------------------------------------------------------
    // Acceso administrativo (Jonathan)
    // ---------------------------------------------------------------
    const hash = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO administradores (nombre, correo, password_hash) VALUES ($1,$2,$3)',
      ['Admin de prueba', correoAdmin, hash]);
    const admin = await llamar('/api/auth/login-admin', { datos: { correo: correoAdmin, password } });
    assert.equal(admin.status, 200);
    assert.equal((await llamar('/api/admin/panel-prueba', { token: admin.cuerpo.token })).status, 200);
    const otroAdmin = await llamar('/api/auth/login-admin', { datos: { correo: correoAdmin, password } });
    assert.equal(otroAdmin.status, 200);

    for (const [rol, principal, otro, ruta, datos] of [
      ['usuario', usuario.cuerpo.token, otroUsuario.cuerpo.token, 'login-usuario', { correo, password }],
      ['clinica', clinica.cuerpo.token, otraClinica.cuerpo.token, 'login-clinica', { correo: correoClinicaNormalizado, password }],
      ['administrador', admin.cuerpo.token, otroAdmin.cuerpo.token, 'login-admin', { correo: correoAdmin, password }],
    ]) {
      assert.equal((await llamar('/api/auth/cerrar-sesion', { metodo: 'POST' })).status, 401);
      const cierre = await fetch(`${url}/api/auth/cerrar-sesion`, {
        method: 'POST', headers: { Authorization: `Bearer ${principal}` },
      });
      assert.equal(cierre.status, 200, rol);
      assert.equal((await llamar('/api/auth/perfil', { token: principal })).status, 403, rol);
      assert.equal((await llamar('/api/auth/perfil', { token: otro })).status, 403, rol);
      const rutaProtegida = rol === 'usuario' ? '/api/citas'
        : rol === 'clinica' ? '/api/clinicas/mi-ficha' : '/api/admin/panel-prueba';
      assert.equal((await llamar(rutaProtegida, { token: otro })).status, 403, rol);
      if (rol === 'usuario') assert.equal((await llamar('/api/auth/perfil', { token: tokenAnterior })).status, 403);
      assert.equal((await llamar('/api/auth/' + ruta, { datos })).status, 200, rol);
    }
  } finally {
    await pool.end();
  }
});
