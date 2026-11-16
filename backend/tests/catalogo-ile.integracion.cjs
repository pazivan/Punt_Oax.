// Base efímera separada de la preview y de producción. Ejecutar explícitamente.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { leerRegistros, procesarImportacion } = require('../scripts/importar-filtracion');

if (process.env.PUNTOAX_TEST_DB !== '1' || process.env.PGHOST !== '127.0.0.1' ||
    process.env.PGPORT !== '55483') throw Error('Usa la BD aislada ILE: PUNTOAX_TEST_DB=1 PGHOST=127.0.0.1 PGPORT=55483');

test('importación real dos veces: reutiliza ID/CLUES, conserva ITS, horarios, cupos, cuenta y cita; bloquea conflictos', async () => {
  const admin = new Pool({ database: 'postgres' });
  const nombre = `ile_regresion_${randomUUID().replaceAll('-', '')}`;
  let db;
  try {
    await admin.query(`CREATE DATABASE ${nombre}`);
    db = new Pool({ database: nombre });
    const dir = path.join(__dirname, '../../db/migrations');
    for (const archivo of fs.readdirSync(dir).filter((f) => f.endsWith('.up.sql') && !f.startsWith('002')).sort()) {
      await db.query(fs.readFileSync(path.join(dir, archivo), 'utf8'));
    }
    const registros = leerRegistros(fs.readFileSync(path.join(__dirname, '../data/aborto-coordenadas.csv'), 'utf8'));
    // Una sede antigua identificada por ID decimal; otra por CLUES sin ID de hoja.
    const demetrio = registros[14], benito = registros[16];
    const { rows: [existente] } = await db.query(`INSERT INTO clinicas
      (nombre, id_origen, municipio, direccion, correo_acceso, password_hash, horario_texto)
      VALUES ($1, '34.0', $2, $3, 'sede@ejemplo.invalid', $4, 'Lunes 08:00-17:00') RETURNING *`,
    [demetrio.nombre, demetrio.municipio, demetrio.direccion_identidad, 'x'.repeat(60)]);
    const { rows: [regional] } = await db.query(`INSERT INTO clinicas (nombre, clues, municipio, direccion)
      VALUES ($1, $2, $3, $4) RETURNING *`, [benito.nombre, benito.clues, benito.municipio, benito.direccion]);
    const { rows: [servicio] } = await db.query(`INSERT INTO clinicas_servicios
      (id_clinica, id_servicio, requisitos, requiere_cita)
      SELECT $1, id_servicio, 'Requisitos originales ITS', TRUE FROM servicios WHERE categoria='ITS' RETURNING *`,
    [existente.id_clinica]);
    await db.query(`INSERT INTO horarios_atencion (id_clinica, dia_semana, hora_apertura, hora_cierre)
      VALUES ($1, 1, '08:00', '17:00')`, [existente.id_clinica]);
    const { rows: [espacio] } = await db.query(`INSERT INTO espacios_disponibles (id_clinica_servicio, fecha_hora_inicio)
      VALUES ($1, '2027-01-05 15:00:00+00') RETURNING *`, [servicio.id_clinica_servicio]);
    const { rows: [usuario] } = await db.query(`INSERT INTO usuarios (correo, password_hash)
      VALUES ('regresion@ejemplo.invalid', $1) RETURNING *`, ['x'.repeat(60)]);
    await db.query('INSERT INTO citas (id_usuario, id_espacio) VALUES ($1, $2)', [usuario.id_usuario, espacio.id_espacio]);
    const antes = {};
    for (const tabla of ['clinicas_servicios', 'horarios_atencion', 'espacios_disponibles', 'citas']) {
      antes[tabla] = (await db.query(`SELECT * FROM ${tabla}`)).rows;
    }
    const simulacion = await procesarImportacion(registros, db, { catalogoIle: true });
    assert.equal(simulacion.resumen.nuevos, 15);
    assert.equal((await db.query('SELECT * FROM clinicas')).rowCount, 2);
    const primera = await procesarImportacion(registros, db, { aplicar: true, catalogoIle: true });
    assert.equal(primera.resumen.nuevos, 15);
    assert.equal(primera.resumen.actualizados, 2);
    assert.deepEqual(primera.omitidos, []);
    const ids = primera.unidades.map((u) => u.id_clinica).sort();
    const segunda = await procesarImportacion(registros, db, { aplicar: true, catalogoIle: true });
    assert.equal(segunda.resumen.nuevos, 0);
    assert.equal(segunda.resumen.actualizados, 17);
    assert.deepEqual(segunda.unidades.map((u) => u.id_clinica).sort(), ids);
    assert.equal(new Set(ids).size, 17);
    assert.equal((await db.query('SELECT * FROM clinicas')).rowCount, 17);
    assert.equal((await db.query('SELECT * FROM clinicas_servicios')).rowCount, 18);
    for (const [tabla, filas] of Object.entries(antes)) {
      const actuales = (await db.query(`SELECT * FROM ${tabla}`)).rows;
      filas.forEach((fila) => assert.ok(actuales.some((a) => JSON.stringify(a) === JSON.stringify(fila)), tabla));
    }
    assert.equal((await db.query('SELECT correo_acceso FROM clinicas WHERE id_clinica=$1',
      [existente.id_clinica])).rows[0].correo_acceso, existente.correo_acceso);
    assert.equal((await db.query('SELECT horario_texto FROM clinicas WHERE id_clinica=$1',
      [existente.id_clinica])).rows[0].horario_texto, existente.horario_texto);
    const { rows: [hospital] } = await db.query('SELECT id_clinica, id_origen FROM clinicas WHERE clues=$1', [benito.clues]);
    assert.equal(hospital.id_clinica, regional.id_clinica);
    assert.equal(hospital.id_origen, null);
    const geo = (await db.query(`SELECT clues, ST_SRID(ubicacion_geo::geometry) srid,
      ST_Y(ubicacion_geo::geometry) lat, ST_X(ubicacion_geo::geometry) lng FROM clinicas`)).rows;
    for (const r of registros) {
      const punto = geo.find((g) => g.clues === r.clues);
      assert.equal(punto.srid, 4326);
      assert.equal(punto.lat, Number(r.latitud));
      assert.equal(punto.lng, Number(r.longitud));
    }
    // Un conflicto bloquea solo esa fila, sin duplicarla ni impedir las demás.
    await db.query("UPDATE clinicas SET direccion='Otra calle 99' WHERE id_clinica=$1", [existente.id_clinica]);
    const conflicto = await procesarImportacion(registros, db, { aplicar: true, catalogoIle: true });
    assert.equal(conflicto.resumen.ambiguos, 1);
    assert.equal(conflicto.resumen.actualizados, 16);
    assert.equal(conflicto.omitidos[0].linea, 16);
    assert.equal((await db.query('SELECT * FROM clinicas')).rowCount, 17);
  } finally {
    await db?.end();
    await admin.query(`DROP DATABASE IF EXISTS ${nombre}`);
    await admin.end();
  }
});
