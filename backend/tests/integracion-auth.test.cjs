const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

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

async function llamar(ruta, { datos, token } = {}) {
  const respuesta = await fetch(`${url}${ruta}`, {
    method: datos ? 'POST' : 'GET',
    headers: {
      ...(datos ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: datos ? JSON.stringify(datos) : undefined,
  });
  return { status: respuesta.status, cuerpo: await respuesta.json() };
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
    assert.equal(typeof registro.cuerpo.token, 'string');
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

    // ---------------------------------------------------------------
    // Acceso administrativo (Jonathan)
    // ---------------------------------------------------------------
    const hash = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO administradores (nombre, correo, password_hash) VALUES ($1,$2,$3)',
      ['Admin de prueba', correoAdmin, hash]);
    const admin = await llamar('/api/auth/login-admin', { datos: { correo: correoAdmin, password } });
    assert.equal(admin.status, 200);
    assert.equal((await llamar('/api/admin/panel-prueba', { token: admin.cuerpo.token })).status, 200);
  } finally {
    await pool.end();
  }
});
