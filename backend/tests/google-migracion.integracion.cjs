const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');

if (process.env.PUNTOAX_TEST_DB !== '1' || !process.env.PGDATABASE?.startsWith('puntoax_s4_test') ||
    !['127.0.0.1', 'localhost'].includes(process.env.PGHOST) ||
    ['5432', '55441'].includes(process.env.PGPORT)) throw new Error('Solo BD local efímera de pruebas.');

test('migración 015 up/down conserva usuarios, identidades heredadas, hashes y citas; unicidad real', async () => {
  const admin = new Pool({ database: 'postgres' });
  const nombre = `puntoax_s4_test_google_mig_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
  let db;
  try {
    await admin.query(`CREATE DATABASE ${nombre}`);
    db = new Pool({ database: nombre });
    const dir = path.resolve(__dirname, '../../db/migrations');
    for (const f of (await fs.readdir(dir)).filter((f) =>
      f.endsWith('.up.sql') && !f.startsWith('002') && !f.startsWith('015')).sort()) {
      await db.query(await fs.readFile(path.join(dir, f), 'utf8'));
    }
    const { rows: [usuario] } = await db.query(`INSERT INTO usuarios(correo,password_hash,nombre)
      VALUES('original@example.com',$1,'Paciente') RETURNING *`, ['x'.repeat(60)]);
    await db.query(`INSERT INTO usuarios(correo,google_sub) VALUES('demo@example.com','google_sub_oauth2_1048291048201')`);
    const { rows: [clinica] } = await db.query(`INSERT INTO clinicas(nombre) VALUES('Centro sintético') RETURNING id_clinica`);
    const { rows: [servicio] } = await db.query(`INSERT INTO servicios(nombre,categoria) VALUES('Sintético','ITS') RETURNING id_servicio`);
    const { rows: [cs] } = await db.query(`INSERT INTO clinicas_servicios(id_clinica,id_servicio) VALUES($1,$2)
      RETURNING id_clinica_servicio`, [clinica.id_clinica, servicio.id_servicio]);
    const { rows: [espacio] } = await db.query(`INSERT INTO espacios_disponibles(id_clinica_servicio,fecha_hora_inicio)
      VALUES($1,now()+interval '10 days') RETURNING id_espacio`, [cs.id_clinica_servicio]);
    await db.query('INSERT INTO citas(id_usuario,id_espacio) VALUES($1,$2)', [usuario.id_usuario, espacio.id_espacio]);
    const tablas = ['usuarios', 'clinicas', 'clinicas_servicios', 'espacios_disponibles', 'citas'];
    const antes = {};
    for (const tabla of tablas) antes[tabla] = (await db.query(`SELECT * FROM ${tabla} ORDER BY 1`)).rows;
    const up = await fs.readFile(path.join(dir, '015_google_auth.up.sql'), 'utf8');
    await db.query(up);
    for (const tabla of tablas) assert.deepEqual((await db.query(`SELECT * FROM ${tabla} ORDER BY 1`)).rows, antes[tabla]);
    await db.query(`INSERT INTO usuarios(correo,google_sub) VALUES('nuevo@example.com','10987654321098765')`);
    await assert.rejects(db.query(`INSERT INTO usuarios(correo,google_sub) VALUES('duplicado@example.com','10987654321098765')`), { code: '23505' });
    await assert.rejects(db.query(`INSERT INTO usuarios(correo,google_sub) VALUES('NUEVO@example.com','10987654321098766')`), { code: '23505' });
    await assert.rejects(db.query(`INSERT INTO usuarios(correo) VALUES('sin-identidad@example.com')`), { code: '23514' });
    await db.query(await fs.readFile(path.join(dir, '015_google_auth.down.sql'), 'utf8'));
    assert.equal((await db.query(`SELECT google_sub FROM usuarios WHERE correo='nuevo@example.com'`)).rows[0].google_sub, '10987654321098765');
    assert.deepEqual((await db.query('SELECT * FROM citas')).rows, antes.citas);
    await assert.rejects(db.query(`INSERT INTO usuarios(correo,google_sub) VALUES('duplicado2@example.com','10987654321098765')`), { code: '23505' });
    await db.query(up);
  } finally {
    if (db) await db.end();
    await admin.query(`DROP DATABASE IF EXISTS ${nombre}`);
    await admin.end();
  }
});
