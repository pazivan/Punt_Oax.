const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { Pool } = require("pg");

if (process.env.PUNTOAX_TEST_DB !== "1" ||
    !process.env.PGDATABASE?.startsWith("puntoax_s4_test") ||
    !["127.0.0.1", "localhost"].includes(process.env.PGHOST) ||
    ["5432", "55441"].includes(process.env.PGPORT)) throw new Error("Solo BD aislada local de QA.");

test("migración real: conserva relaciones, coordenadas y textos; concilia sin adivinar", async () => {
  const pool = new Pool();
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const schema = `qa_${randomUUID().replaceAll("-", "")}`;
    await db.query(`CREATE SCHEMA ${schema}`);
    await db.query(`SET LOCAL search_path TO ${schema}, public`);
    const dir = path.resolve(__dirname, "../../db/migrations");
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".up.sql") && !f.startsWith("002") && Number(f.slice(0, 3)) < 14).sort()) {
      await db.query(fs.readFileSync(path.join(dir, f), "utf8"));
    }
    const originales = [" OAXACA  DE JUAREZ ", "Oxaca de Juárez", "Juchitán de Zaragoza", "Oaxaca", null, "San Juan Mixtepec", "San Pedro Mixtepec"];
    const ids = [];
    for (const municipio of originales) {
      const { rows } = await db.query(`INSERT INTO clinicas(nombre,municipio,direccion,ubicacion_geo)
        VALUES('Centro QA',$1,'Dirección conservada',ST_SetSRID(ST_MakePoint(-96.72,17.06),4326)::geography)
        RETURNING id_clinica`, [municipio]);
      ids.push(rows[0].id_clinica);
    }
    const usuario = (await db.query(`INSERT INTO usuarios(correo,google_sub,telefono)
      VALUES('qa@local.mx',$1,'1234567890') RETURNING id_usuario`, [randomUUID()])).rows[0].id_usuario;
    const servicio = (await db.query("INSERT INTO servicios(nombre,categoria) VALUES('QA ITS','its') RETURNING id_servicio")).rows[0].id_servicio;
    const cs = (await db.query("INSERT INTO clinicas_servicios(id_clinica,id_servicio) VALUES($1,$2) RETURNING id_clinica_servicio", [ids[0], servicio])).rows[0].id_clinica_servicio;
    const espacio = (await db.query(`INSERT INTO espacios_disponibles(id_clinica_servicio,fecha_hora_inicio)
      VALUES($1,now()+interval '5 days') RETURNING id_espacio`, [cs])).rows[0].id_espacio;
    await db.query("INSERT INTO citas(id_usuario,id_espacio) VALUES($1,$2)", [usuario, espacio]);
    const antes = (await db.query("SELECT id_cita,id_usuario,id_espacio,estado FROM citas")).rows;
    const geo = (await db.query("SELECT id_clinica,ST_AsText(ubicacion_geo::geometry) AS geo,direccion FROM clinicas ORDER BY id_clinica")).rows;
    await db.query(fs.readFileSync(path.join(dir, "014_municipios_oaxaca.up.sql"), "utf8"));
    assert.equal((await db.query("SELECT count(*)::int n FROM municipios")).rows[0].n, 570);
    assert.deepEqual((await db.query("SELECT id_cita,id_usuario,id_espacio,estado FROM citas")).rows, antes);
    assert.deepEqual((await db.query("SELECT id_clinica,ST_AsText(ubicacion_geo::geometry) AS geo,direccion FROM clinicas ORDER BY id_clinica")).rows, geo);
    assert.equal((await db.query("SELECT telefono FROM usuarios WHERE id_usuario=$1", [usuario])).rows[0].telefono, "1234567890");
    const rows = (await db.query("SELECT municipio,municipio_clave FROM clinicas WHERE id_clinica=ANY($1) ORDER BY array_position($1::uuid[],id_clinica)", [ids])).rows;
    assert.deepEqual(rows.map((r) => r.municipio_clave), ["20067", "20067", "20043", null, null, null, null]);
    assert.equal(rows[3].municipio, "Oaxaca");
    const reporte = (await db.query("SELECT municipio_original FROM migracion_municipios_reporte ORDER BY array_position($1::uuid[],id_clinica)", [ids])).rows;
    assert.deepEqual(reporte.map((r) => r.municipio_original), originales);
    await db.query("UPDATE clinicas SET telefono='9511234567' WHERE id_clinica=$1", [ids[3]]);
    await db.query("UPDATE clinicas SET municipio_clave='20001' WHERE id_clinica=$1", [ids[0]]);
    assert.equal((await db.query("SELECT municipio FROM clinicas WHERE id_clinica=$1", [ids[0]])).rows[0].municipio, "Abejones");
    await db.query("INSERT INTO clinicas(nombre,municipio,municipio_clave) VALUES('Homónimo QA','San Juan Mixtepec','20208'),('Homónimo QA','San Juan Mixtepec','20209')");
    assert.deepEqual((await db.query("SELECT municipio_clave FROM clinicas WHERE nombre='Homónimo QA' ORDER BY municipio_clave")).rows.map((r) => r.municipio_clave), ["20208", "20209"]);
    for (const sql of [
      "UPDATE clinicas SET municipio='Inventado'",
      "UPDATE clinicas SET municipio_clave='20999'",
      "UPDATE clinicas SET municipio=NULL,municipio_clave=NULL",
      "INSERT INTO clinicas(nombre,municipio) VALUES('Ambiguo','San Juan Mixtepec')",
      "INSERT INTO municipios SELECT * FROM municipios LIMIT 1",
    ]) {
      await db.query("SAVEPOINT invalido");
      await assert.rejects(db.query(sql));
      await db.query("ROLLBACK TO SAVEPOINT invalido");
    }
  } finally {
    await db.query("ROLLBACK");
    db.release();
    await pool.end();
  }
});
