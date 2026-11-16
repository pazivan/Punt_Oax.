const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { plantilla, permitido } = require('../correo');

if (process.env.PUNTOAX_TEST_DB !== '1' || !process.env.PGDATABASE?.startsWith('puntoax_s4_test') ||
    !['localhost', '127.0.0.1'].includes(process.env.PGHOST) ||
    ['5432', '55441'].includes(process.env.PGPORT) || process.env.PUNTOAX_MAIL_PROVIDER !== 'mock') {
  throw new Error('Solo base y proveedor de correo locales de prueba.');
}
const pool = new Pool();
const base = `http://127.0.0.1:${process.env.PUNTOAX_TEST_API_PORT}`;
const password = 'Clave-Segura9!';
async function api(ruta, datos, token) {
  const r = await fetch(base + '/api/auth/' + ruta, { method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(datos) });
  return { status: r.status, body: await r.json() };
}
function correoEnviado(correo) {
  return fs.readFileSync(process.env.PUNTOAX_MOCK_MAIL_FILE, 'utf8').trim().split('\n')
    .map((linea) => JSON.parse(linea)).filter((c) => c.correo === correo);
}

test('plantillas HTML/texto escapan contenido y mantienen enlace para recuperación', () => {
  const correo = plantilla('<Prueba>', 'Mensaje & claro', 'https://puntoax.online/restablecer?x=1&y=2');
  assert.match(correo.htmlContent, /&lt;Prueba&gt;/);
  assert.match(correo.htmlContent, /href="https:\/\/puntoax\.online\/restablecer\?x=1&amp;y=2"/);
  assert.match(correo.textContent, /x=1&y=2/);
  assert.equal(permitido('alguien@demo.puntoax.invalid'), false);
});

test('códigos: completar tras registro, consumo único, caducidad, intentos y límites de reenvío', async () => {
  const correo = `verificacion-${randomUUID()}@puntoax.online`;
  try {
    const alta = await api('registro-usuario', { correo, password });
    assert.equal(alta.status, 201);
    const { rows } = await pool.query('SELECT id_usuario, correo_verificado_en FROM usuarios WHERE correo=$1', [correo]);
    assert.equal(rows[0].correo_verificado_en, null);
    assert.equal((await api('login-usuario', { correo, password })).status, 403);
    const codigo = correoEnviado(correo).at(-1).textContent.match(/Código: (\d{6})/)[1];
    assert.equal(codigo.length, 6);
    assert.equal((await api('verificar-correo', { rol: 'usuario', correo, codigo: 'abcdef' })).status, 400);
    assert.equal((await api('verificar-correo', { rol: 'usuario', correo, codigo: codigo === '000000' ? '111111' : '000000' })).status, 400);
    assert.equal((await api('reenviar-verificacion', { rol: 'usuario', correo })).status, 200);
    assert.equal(correoEnviado(correo).length, 1);
    await pool.query(`UPDATE desafios_correo SET vence_en=now()-interval '1 second', ultimo_envio=now()-interval '61 seconds'
      WHERE rol='usuario' AND cuenta_id=$1`, [rows[0].id_usuario]);
    assert.equal((await api('verificar-correo', { rol: 'usuario', correo, codigo })).status, 400);
    await api('reenviar-verificacion', { rol: 'usuario', correo });
    assert.equal(correoEnviado(correo).length, 2);
    const nuevo = correoEnviado(correo).at(-1).textContent.match(/Código: (\d{6})/)[1];
    for (let i = 0; i < 5; i++) assert.equal((await api('verificar-correo', { rol: 'usuario', correo, codigo: 'abcdef' })).status, 400);
    for (let i = 0; i < 5; i++) await api('verificar-correo', { rol: 'usuario', correo, codigo: nuevo === '999999' ? '888888' : '999999' });
    assert.equal((await api('verificar-correo', { rol: 'usuario', correo, codigo: nuevo })).status, 400);
    await pool.query(`UPDATE desafios_correo SET ultimo_envio=now()-interval '61 seconds' WHERE cuenta_id=$1`, [rows[0].id_usuario]);
    await api('reenviar-verificacion', { rol: 'usuario', correo });
    const tercero = correoEnviado(correo).at(-1).textContent.match(/Código: (\d{6})/)[1];
    assert.equal((await api('verificar-correo', { rol: 'usuario', correo, codigo: tercero })).status, 200);
    assert.equal((await api('verificar-correo', { rol: 'usuario', correo, codigo: tercero })).status, 400);
    assert.equal((await api('login-usuario', { correo, password })).status, 200);
  } finally { await pool.end(); }
});

test('recuperación de tres roles, respuesta no enumeradora y revocación de JWT previos', async () => {
  const db = new Pool();
  try {
    for (const rol of ['usuario', 'clinica', 'administrador']) {
      const correo = `reset-${rol}-${randomUUID()}@puntoax.online`;
      const tabla = { usuario: 'usuarios', clinica: 'clinicas', administrador: 'administradores' }[rol];
      const campo = rol === 'clinica' ? 'correo_acceso' : 'correo';
      const hash = await bcrypt.hash(password, 10);
      if (rol === 'usuario') await db.query('INSERT INTO usuarios(correo,password_hash,correo_verificado_en) VALUES ($1,$2,now())', [correo, hash]);
      if (rol === 'clinica') await db.query("INSERT INTO clinicas(nombre,correo_acceso,password_hash,correo_verificado_en) VALUES ('Test', $1,$2,now())", [correo, hash]);
      if (rol === 'administrador') await db.query("INSERT INTO administradores(nombre,correo,password_hash) VALUES ('Test',$1,$2)", [correo, hash]);
      const sesion = await api(`login-${rol === 'administrador' ? 'admin' : rol}`, { correo, password });
      assert.equal(sesion.status, 200);
      const desconocido = await api('solicitar-recuperacion', { rol, correo: `sin-${randomUUID()}@puntoax.online` });
      const solicitud = await api('solicitar-recuperacion', { rol, correo });
      assert.deepEqual(solicitud, desconocido);
      const mail = correoEnviado(correo).at(-1);
      const enlace = mail.textContent.match(/https:\/\/puntoax\.online\/restablecer[^\s]+/)[0];
      const token = new URL(enlace).searchParams.get('token');
      const { rows: cuenta } = await db.query(`SELECT ${rol === 'clinica' ? 'id_clinica' : rol === 'usuario' ? 'id_usuario' : 'id_administrador'} AS id FROM ${tabla} WHERE ${campo}=$1`, [correo]);
      const { rows: desafio } = await db.query(`SELECT vence_en FROM desafios_correo WHERE rol=$1 AND cuenta_id=$2 AND tipo='recuperacion'`, [rol, cuenta[0].id]);
      assert.ok(new Date(desafio[0].vence_en).getTime() - Date.now() <= 600000);
      const invalido = await api('restablecer-password', { rol, correo, token: '0'.repeat(64), password: 'Nueva-Clave8!' });
      assert.equal(invalido.status, 400);
      const cambio = await api('restablecer-password', { rol, correo, token, password: 'Nueva-Clave8!' });
      assert.equal(cambio.status, 200);
      assert.equal((await api('restablecer-password', { rol, correo, token, password: 'Otra-Clave8!' })).status, 400);
      assert.equal((await api(`login-${rol === 'administrador' ? 'admin' : rol}`, { correo, password })).status, 401);
      assert.equal((await api(`login-${rol === 'administrador' ? 'admin' : rol}`, { correo, password: 'Nueva-Clave8!' })).status, 200);
      const perfil = await fetch(base + '/api/auth/perfil', { headers: { Authorization: `Bearer ${sesion.body.token}` } });
      assert.equal(perfil.status, 403);
      assert.equal((await db.query(`SELECT version_sesion FROM ${tabla} WHERE ${campo}=$1`, [correo])).rows[0].version_sesion, 1);
    }
  } finally { await db.end(); }
});

test('no se envía correo a cuentas demo y cada cuenta tiene máximo tres envíos por hora', async () => {
  const db = new Pool();
  try {
    const correo = `limites-${randomUUID()}@puntoax.online`;
    const correoDemo = `demo-${randomUUID()}@demo.puntoax.invalid`;
    const hash = await bcrypt.hash(password, 10);
    await db.query('INSERT INTO usuarios(correo,password_hash,correo_verificado_en) VALUES ($1,$2,now()),($3,$2,now())',
      [correo, hash, correoDemo]);
    const previo = correoEnviado(correo).length;
    assert.equal((await api('solicitar-recuperacion', { rol: 'usuario', correo: correoDemo })).status, 200);
    assert.equal(correoEnviado(correoDemo).length, 0);
    assert.equal((await api('registro-usuario', { correo: `nuevo-${randomUUID()}@demo.puntoax.invalid`, password })).status, 503);
    assert.equal((await api('solicitar-recuperacion', { rol: 'usuario', correo })).status, 200);
    assert.equal(correoEnviado(correo).length, previo + 1);
    const { rows } = await db.query('SELECT id_usuario FROM usuarios WHERE correo=$1', [correo]);
    for (let i = 0; i < 4; i++) {
      await db.query(`UPDATE desafios_correo SET ultimo_envio=now()-interval '61 seconds'
        WHERE rol='usuario' AND cuenta_id=$1 AND tipo='recuperacion'`, [rows[0].id_usuario]);
      await api('solicitar-recuperacion', { rol: 'usuario', correo });
    }
    assert.equal(correoEnviado(correo).length, previo + 3);
  } finally { await db.end(); }
});
