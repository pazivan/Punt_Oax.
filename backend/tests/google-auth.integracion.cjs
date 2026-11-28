const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { registrarRutasGoogle } = require('../googleAuth');
const { firmar, verificar, clientId } = require('./google-fixture.cjs');
const { crearSesionActiva, verificarPassword, hashearPassword } = require('../auth');

if (process.env.PUNTOAX_TEST_DB !== '1' || !process.env.PGDATABASE?.startsWith('puntoax_s4_test') ||
    !['127.0.0.1', 'localhost'].includes(process.env.PGHOST) ||
    ['5432', '55441'].includes(process.env.PGPORT)) throw new Error('Usa exclusivamente una BD local efímera puntoax_s4_test*.');
const pool = new Pool();
let servidor, base;
const apiReal = `http://127.0.0.1:${process.env.PUNTOAX_TEST_API_PORT}`;
const password = 'Google-Original9!';
const idGoogle = () => String(BigInt(`0x${randomBytes(10).toString('hex')}`));
const correo = () => `google-${randomUUID()}@puntoax.online`;
const digest = (v) => createHash('sha256').update(v).digest('hex');

before(async () => {
  const app = express();
  app.use(express.json());
  registrarRutasGoogle(app, {
    pool, crearSesionActiva, verificarPassword, verificar,
    // El límite real ya se prueba en rutas públicas y suites de correo.
    limiteIp: async () => true,
    env: { GOOGLE_CLIENT_ID: clientId, NODE_ENV: 'production', GOOGLE_ALLOWED_ORIGINS: 'https://puntoax.online' },
  });
  servidor = app.listen(0, '127.0.0.1');
  await new Promise((r) => servidor.once('listening', r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});
after(async () => { await new Promise((r) => servidor.close(r)); await pool.end(); });

async function pedir(ruta, datos, cookie, headers = {}) {
  const r = await fetch(base + '/api/auth/google' + ruta, {
    method: 'POST', headers: {
      Origin: 'https://puntoax.online', 'Content-Type': 'application/json', 'X-Puntoax-Google': '1',
      ...(cookie ? { Cookie: cookie } : {}), ...headers,
    }, body: JSON.stringify(datos),
  });
  return { status: r.status, body: await r.json(), cookie: r.headers.get('set-cookie'), cache: r.headers.get('cache-control') };
}
async function desafio() {
  const r = await pedir('/desafio', {});
  assert.equal(r.status, 200);
  assert.match(r.cookie, /HttpOnly/);
  assert.match(r.cookie, /Secure/);
  assert.match(r.cookie, /SameSite=Strict/);
  assert.match(r.cache, /no-store/);
  return { ...r.body, cookie: r.cookie.split(';')[0] };
}
async function acceso(datos, d) {
  d ||= await desafio();
  return pedir('', { ...d, credential: firmar({ ...datos, nonce: d.nonce }) }, d.cookie);
}
async function tradicional(ruta, datos, token, method = 'POST') {
  const r = await fetch(apiReal + ruta, { method, headers: {
    'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }, body: method === 'GET' ? undefined : JSON.stringify(datos) });
  return { status: r.status, body: await r.json() };
}
async function local(email) {
  const hash = await hashearPassword(password);
  return (await pool.query(`INSERT INTO usuarios(correo,password_hash,correo_verificado_en,nombre,apellidos)
    VALUES($1,$2,now(),'Paciente','Original') RETURNING *`, [email, hash])).rows[0];
}

test('nuevo paciente: JWT y sesión actuales, sin contraseña; perfil, citas y logout funcionan', async () => {
  const email = correo(), sub = idGoogle();
  const r = await acceso({ email, sub, given_name: 'María', family_name: 'Prueba', rol: 'administrador' });
  assert.equal(r.status, 201);
  const { usuario, token, sesion_politica } = r.body;
  assert.equal(usuario.rol, 'usuario');
  assert.equal(usuario.nombre, 'María');
  const claims = jwt.verify(token, process.env.JWT_SECRET);
  assert.equal(claims.rol, 'usuario');
  assert.ok(claims.jti);
  assert.ok(sesion_politica.expira_inactividad_en);
  const fila = (await pool.query('SELECT * FROM usuarios WHERE id_usuario=$1', [usuario.id])).rows[0];
  assert.equal(fila.password_hash, null);
  assert.equal(fila.google_sub, sub);
  assert.ok(fila.correo_verificado_en);
  assert.equal((await tradicional('/api/auth/login-usuario', { correo: email, password })).status, 401);
  assert.equal((await tradicional('/api/auth/registro-usuario', { correo: email, password })).status, 409);
  assert.equal((await tradicional('/api/auth/perfil', null, token, 'GET')).body.usuarioAutenticado.id, usuario.id);
  assert.equal((await tradicional('/api/admin/panel-prueba', null, token, 'GET')).status, 403);
  assert.equal((await tradicional('/api/auth/perfil', {
    nombre: 'María', apellidos: 'Prueba', telefono: '9511234567',
  }, token, 'PATCH')).status, 200);
  const { rows: [sede] } = await pool.query(`INSERT INTO clinicas(nombre,municipio_clave,estado_publicacion) VALUES('Google QA','20067','aprobada') RETURNING id_clinica`);
  const { rows: [servicio] } = await pool.query(`INSERT INTO servicios(nombre,categoria) VALUES($1,'its') RETURNING id_servicio`, [correo()]);
  const { rows: [cs] } = await pool.query(`INSERT INTO clinicas_servicios(id_clinica,id_servicio) VALUES($1,$2) RETURNING id_clinica_servicio`, [sede.id_clinica, servicio.id_servicio]);
  const { rows: [espacio] } = await pool.query(`INSERT INTO espacios_disponibles(id_clinica_servicio,fecha_hora_inicio) VALUES($1,now()+interval '10 days') RETURNING id_espacio`, [cs.id_clinica_servicio]);
  await pool.query('INSERT INTO citas(id_usuario,id_espacio) VALUES($1,$2)', [usuario.id, espacio.id_espacio]);
  const citas = await tradicional('/api/citas', null, token, 'GET');
  assert.equal(citas.status, 200);
  assert.match(JSON.stringify(citas.body), new RegExp(espacio.id_espacio));
  const segundo = await acceso({ email, sub });
  assert.equal(segundo.status, 200);
  assert.equal(segundo.body.usuario.id, usuario.id);
  assert.equal((await pool.query('SELECT * FROM usuarios WHERE correo=$1', [email])).rowCount, 1);
  await tradicional('/api/auth/cerrar-sesion', {}, token);
  assert.equal((await tradicional('/api/auth/perfil', null, segundo.body.token, 'GET')).status, 403);
  assert.equal((await acceso({ email, sub })).status, 200);
});

test('vinculación explícita: exige contraseña original y conserva ID, hash, perfil y relaciones', async () => {
  const email = correo(), sub = idGoogle(), cuenta = await local(email);
  const inicio = await tradicional('/api/auth/login-usuario', { correo: email, password });
  assert.equal(inicio.status, 200);
  const d = await desafio(), r = await acceso({ email, sub }, d);
  assert.equal(r.status, 409);
  assert.equal(r.body.codigo, 'GOOGLE_VINCULACION_REQUERIDA');
  assert.equal((await pool.query('SELECT google_sub FROM usuarios WHERE id_usuario=$1', [cuenta.id_usuario])).rows[0].google_sub, null);
  // Cancelar aquí (no enviar /vincular) no modifica ninguna cuenta.
  const otro = await desafio();
  const colision = await acceso({ email, sub }, otro);
  const vinculado = await pedir('/vincular', {
    vinculacion: colision.body.vinculacion, csrf: otro.csrf, password, confirmar: true,
  }, otro.cookie);
  assert.equal(vinculado.status, 200);
  assert.equal((await pedir('/vincular', {
    vinculacion: colision.body.vinculacion, csrf: otro.csrf, password, confirmar: true,
  }, otro.cookie)).status, 401);
  assert.equal(vinculado.body.usuario.id, cuenta.id_usuario);
  const actual = (await pool.query('SELECT * FROM usuarios WHERE id_usuario=$1', [cuenta.id_usuario])).rows[0];
  assert.equal(actual.password_hash, cuenta.password_hash);
  assert.equal(actual.nombre, cuenta.nombre);
  assert.equal(actual.google_sub, sub);
  assert.equal((await tradicional('/api/auth/perfil', null, inicio.body.token, 'GET')).status, 200);
  assert.equal((await tradicional('/api/auth/login-usuario', { correo: email, password })).status, 200);
  assert.equal((await acceso({ email, sub })).body.usuario.id, cuenta.id_usuario);
});

test('vinculación: contraseña incorrecta, sin consentimiento, cuenta no verificada, desactivada o cambiada', async () => {
  for (const modo of ['password', 'consentimiento', 'version', 'correo', 'inactiva', 'verificacion']) {
    const email = correo(), sub = idGoogle(), cuenta = await local(email);
    const d = await desafio(), r = await acceso({ email, sub }, d);
    assert.equal(r.status, 409);
    if (modo === 'version') await pool.query('UPDATE usuarios SET version_sesion=version_sesion+1 WHERE id_usuario=$1', [cuenta.id_usuario]);
    if (modo === 'correo') await pool.query('UPDATE usuarios SET correo=$2 WHERE id_usuario=$1', [cuenta.id_usuario, correo()]);
    if (modo === 'inactiva') await pool.query('UPDATE usuarios SET activo=false WHERE id_usuario=$1', [cuenta.id_usuario]);
    if (modo === 'verificacion') await pool.query('UPDATE usuarios SET correo_verificado_en=NULL WHERE id_usuario=$1', [cuenta.id_usuario]);
    const payload = { vinculacion: r.body.vinculacion, csrf: d.csrf,
      password: modo === 'password' ? 'incorrecta' : password, confirmar: modo !== 'consentimiento' };
    const fallo = await pedir('/vincular', payload, d.cookie);
    assert.ok([400, 401, 403].includes(fallo.status), `${modo}: ${fallo.status}`);
    assert.equal((await pool.query('SELECT google_sub FROM usuarios WHERE id_usuario=$1', [cuenta.id_usuario])).rows[0].google_sub, null);
    assert.equal((await pedir('/vincular', { ...payload, password, confirmar: true }, d.cookie)).status, 401);
  }
});

test('la prueba de vinculación está ligada al navegador y caduca, aunque la contraseña sea correcta', async () => {
  const email = correo(), sub = idGoogle(), cuenta = await local(email);
  const d = await desafio(), r = await acceso({ email, sub }, d);
  const otro = await desafio();
  const payload = { vinculacion: r.body.vinculacion, csrf: d.csrf, password, confirmar: true };
  assert.equal((await pedir('/vincular', payload, otro.cookie)).status, 401);
  await pool.query("UPDATE desafios_google SET vence_en=now()-interval '1 second' WHERE id_hash=$1", [digest(r.body.vinculacion)]);
  assert.equal((await pedir('/vincular', payload, d.cookie)).status, 401);
  assert.equal((await pool.query('SELECT google_sub FROM usuarios WHERE id_usuario=$1', [cuenta.id_usuario])).rows[0].google_sub, null);
});

test('CSRF, nonce ajeno, vencimiento, firma inválida y replay incluso entre solicitudes simultáneas', async () => {
  const d = await desafio(), email = correo(), sub = idGoogle();
  const payload = { ...d, credential: firmar({ email, sub, nonce: d.nonce }) };
  assert.equal((await pedir('', payload, d.cookie, { Origin: 'https://atacante.example' })).status, 403);
  assert.equal((await pedir('', payload)).status, 403);
  assert.equal((await pedir('', { ...payload, csrf: randomBytes(32).toString('hex') }, d.cookie)).status, 401);
  const simultaneos = await Promise.all([pedir('', payload, d.cookie), pedir('', payload, d.cookie)]);
  assert.deepEqual(simultaneos.map((r) => r.status).sort(), [201, 401]);
  assert.equal((await pool.query('SELECT * FROM usuarios WHERE google_sub=$1', [sub])).rowCount, 1);
  const ajeno = await desafio();
  assert.equal((await pedir('', { ...ajeno, credential: payload.credential }, ajeno.cookie)).body.codigo, 'GOOGLE_NONCE_INVALIDO');
  const vencido = await desafio();
  await pool.query("UPDATE desafios_google SET vence_en=now()-interval '1 second' WHERE id_hash=$1", [digest(vencido.desafio)]);
  assert.equal((await acceso({ email: correo(), sub: idGoogle() }, vencido)).status, 401);
  const invalido = await desafio();
  assert.equal((await pedir('', { ...invalido, credential: 'invalido' }, invalido.cookie)).status, 401);
  assert.equal((await acceso({ email: correo(), sub: idGoogle() }, invalido)).status, 401);
});

test('unicidad: accesos concurrentes, correo usado y otra identidad no crean duplicados', async () => {
  const email = correo(), sub = idGoogle();
  const resultados = await Promise.all([acceso({ email, sub }), acceso({ email, sub })]);
  assert.ok(resultados.some((r) => r.status === 201));
  assert.ok(resultados.every((r) => [200, 201, 409].includes(r.status)));
  assert.equal((await pool.query('SELECT * FROM usuarios WHERE correo=$1 OR google_sub=$2', [email, sub])).rowCount, 1);
  assert.equal((await acceso({ email, sub: idGoogle() })).body.codigo, 'GOOGLE_OTRA_IDENTIDAD');
  // Identidad estable aunque Google cambie el correo: no cambia correo local.
  const cambio = await acceso({ email: correo(), sub });
  assert.equal(cambio.status, 200);
  assert.equal(cambio.body.usuario.correo, email);
});

test('Google nunca inicia sesiones privilegiadas ni reactiva cuentas suspendidas', async () => {
  const hashPassword = await hashearPassword(password);
  for (const tipo of ['clinica', 'administrador']) {
    const email = correo();
    if (tipo === 'clinica') await pool.query('INSERT INTO clinicas(nombre,correo_acceso,password_hash) VALUES($1,$2,$3)', ['QA Google', email, hashPassword]);
    else await pool.query('INSERT INTO administradores(nombre,correo,password_hash) VALUES($1,$2,$3)', ['QA Google', email, hashPassword]);
    const r = await acceso({ email, sub: idGoogle() });
    assert.equal(r.status, 403);
    assert.equal(r.body.codigo, 'GOOGLE_SOLO_PACIENTES');
    assert.equal((await pool.query('SELECT * FROM usuarios WHERE correo=$1', [email])).rowCount, 0);
  }
  const email = correo(), sub = idGoogle();
  await acceso({ email, sub });
  await pool.query('UPDATE usuarios SET activo=false WHERE correo=$1', [email]);
  assert.equal((await acceso({ email, sub })).status, 403);
});
