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

const pool = new Pool();
const url = 'http://127.0.0.1:3000';

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
  const correo = `integracion-${randomUUID()}@ejemplo.com`;
  const correoClinica = `clinica-${randomUUID()}@ejemplo.com`;
  const correoAdmin = `admin-${randomUUID()}@ejemplo.com`;
  const password = `Clave-${randomUUID()}`;

  try {
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
    assert.equal((await llamar('/api/auth/login-usuario', { datos: { correo, password: 42 } })).status, 400);
    assert.equal((await llamar('/api/auth/login-usuario', { datos: { correo, password: 'otra-contraseña' } })).status, 401);

    const usuario = await llamar('/api/auth/login-usuario', { datos: { correo, password } });
    assert.equal(usuario.status, 200);
    assert.equal(usuario.cuerpo.usuario.correo, correo);
    assert.equal((await llamar('/api/auth/perfil', { token: usuario.cuerpo.token })).cuerpo.usuarioAutenticado.rol, 'usuario');
    assert.equal((await llamar('/api/admin/panel-prueba', { token: usuario.cuerpo.token })).status, 403);
    assert.equal((await llamar('/api/auth/perfil', { token: 'inválido' })).status, 403);
    assert.equal((await llamar('/api/auth/perfil')).status, 401);

    const hash = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO clinicas (nombre, correo_acceso, password_hash) VALUES ($1,$2,$3)',
      ['Clínica de prueba', correoClinica, hash]);
    const clinica = await llamar('/api/auth/login-clinica', { datos: { correo: correoClinica, password } });
    assert.equal(clinica.status, 200);
    assert.equal(clinica.cuerpo.clinica.correo, correoClinica);
    assert.equal((await llamar('/api/auth/perfil', { token: clinica.cuerpo.token })).cuerpo.usuarioAutenticado.rol, 'clinica');
    assert.equal((await llamar('/api/admin/panel-prueba', { token: clinica.cuerpo.token })).status, 403);

    await pool.query('INSERT INTO administradores (nombre, correo, password_hash) VALUES ($1,$2,$3)',
      ['Admin de prueba', correoAdmin, hash]);
    const admin = await llamar('/api/auth/login-admin', { datos: { correo: correoAdmin, password } });
    assert.equal(admin.status, 200);
    assert.equal((await llamar('/api/admin/panel-prueba', { token: admin.cuerpo.token })).status, 200);
    const directorio = await llamar('/api/clinicas');
    assert.equal(directorio.status, 200);
    assert.ok(Array.isArray(directorio.cuerpo));
  } finally {
    await pool.end();
  }
});
