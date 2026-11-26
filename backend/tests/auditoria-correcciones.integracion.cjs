const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
if (process.env.PUNTOAX_TEST_DB !== "1" || !process.env.PGDATABASE?.startsWith("puntoax_s4_test") ||
    !["127.0.0.1", "localhost"].includes(process.env.PGHOST) || process.env.PGPORT !== "55474")
  throw new Error("Solo BD aislada de correcciones en puerto 55474.");
const pool = require("../db");
const app = require("../servidor");
const { solicitarCita, listarEspaciosDisponibles } = require("../citas");
const { resolverSolicitud } = require("../adminClinicas");
const { enHorarioSql, fechaValida } = require("../horarios");
const { validarEnHorarioAtencion } = require("../validacionesCitas");
const handler = (ruta) => app.router.stack.find((s) => s.route?.path === ruta).route.stack.at(-1).handle;
const res = () => ({ statusCode: 200, status(n) { this.statusCode = n; return this; }, json(body) { this.body = body; return this; } });
async function clinica(estado = "borrador") {
  return (await pool.query("INSERT INTO clinicas(nombre,estado_publicacion,municipio_clave) VALUES('Centro sintético regresión',$1,'20067') RETURNING id_clinica", [estado])).rows[0].id_clinica;
}
after(() => pool.end());

test("H01: rollback de lectura previa y conservación tras COMMIT y confirmación perdida", async () => {
  const carpeta = await fs.mkdtemp("/tmp/puntoax-auditoria-20261125/documentos-regresion-");
  const anterior = process.env.DOCUMENTS_PRIVATE_DIR;
  process.env.DOCUMENTS_PRIVATE_DIR = carpeta;
  const conectar = pool.connect.bind(pool);
  try {
    for (const fallo of ["lectura", "commit-incierto", "respuesta", "ninguno"]) {
      const id = await clinica();
      let commit = false;
      pool.connect = async () => {
        const db = await conectar();
        return { release: (descartar) => db.release(descartar), query: async (...args) => {
          const sql = args[0];
          if (fallo === "lectura" && sql.includes("SELECT c.id_clinica")) throw new Error("Fallo local lectura");
          const result = await db.query(...args);
          if (sql === "COMMIT") { commit = true; if (fallo === "commit-incierto") throw new Error("Confirmación perdida local"); }
          return result;
        } };
      };
      const respuesta = res();
      if (fallo === "respuesta") {
        const json = respuesta.json;
        respuesta.json = function (body) { if (this.statusCode === 201) throw new Error("Fallo local respuesta"); return json.call(this, body); };
      }
      await handler("/api/clinicas/mi-ficha/documentos")({
        usuario: { id }, files: [{ buffer: Buffer.from("%PDF-1.4\nregresion\n%%EOF"), originalname: "respaldo.pdf", mimetype: "application/pdf", size: 29 }],
      }, respuesta);
      pool.connect = conectar;
      const docs = (await pool.query("SELECT clave_almacenamiento FROM clinicas_documentos WHERE id_clinica=$1", [id])).rows;
      assert.equal(commit, fallo !== "lectura");
      assert.equal(docs.length, fallo === "lectura" ? 0 : 1);
      for (const doc of docs) assert.ok((await fs.stat(path.join(carpeta, doc.clave_almacenamiento))).size > 0);
      assert.equal(respuesta.statusCode, fallo === "ninguno" ? 201 : 500);
      assert.equal((await fs.readdir(carpeta)).length, fallo === "lectura" ? 0 : ["commit-incierto", "respuesta", "ninguno"].indexOf(fallo) + 1);
    }
  } finally { pool.connect = conectar; process.env.DOCUMENTS_PRIVATE_DIR = anterior; }
});

test("H03/H04: carreras reales, intervalos, cancelación e independencia entre servicios", async () => {
  const id = await clinica("aprobada");
  const servicios = [];
  for (const categoria of ["ITS", "ILE"]) {
    const s = (await pool.query("INSERT INTO servicios(nombre,categoria) VALUES($1,$2) RETURNING id_servicio", [`Regresión ${randomUUID()}`, categoria])).rows[0].id_servicio;
    servicios.push((await pool.query("INSERT INTO clinicas_servicios(id_clinica,id_servicio) VALUES($1,$2) RETURNING id_clinica_servicio", [id, s])).rows[0].id_clinica_servicio);
  }
  const usuarios = [];
  const hash = await require("bcryptjs").hash("Regresion-Sintetica2026!", 4);
  for (let i = 0; i < 3; i++) usuarios.push((await pool.query("INSERT INTO usuarios(correo,password_hash) VALUES($1,$2) RETURNING id_usuario", [`test-${randomUUID()}@example.invalid`, hash])).rows[0].id_usuario);
  const fecha = (await pool.query("SELECT ((now() AT TIME ZONE 'America/Mexico_City')::date + 3)::text f")).rows[0].f;
  const espacio = async (cs, hora) => (await pool.query("INSERT INTO espacios_disponibles(id_clinica_servicio,fecha_hora_inicio) VALUES($1,($2::date+$3::time) AT TIME ZONE 'America/Mexico_City') RETURNING id_espacio", [cs, fecha, hora])).rows[0].id_espacio;
  const a = await espacio(servicios[0], "10:00"), b = await espacio(servicios[1], "10:00");
  const reservar = (usuario, cupo) => solicitarCita(pool, usuario, { id_espacio: cupo, telefono: "+529511234567" });
  const carrera = await Promise.all([reservar(usuarios[0], a), reservar(usuarios[0], b)]);
  assert.deepEqual(carrera.map((r) => r.status).sort(), [201, 409]);
  const libre = carrera[0].status === 201 ? b : a;
  assert.equal((await reservar(usuarios[1], libre)).status, 201, "otro paciente puede usar el otro servicio simultáneo");
  const media = await espacio(servicios[1], "10:30");
  assert.equal((await reservar(usuarios[2], media)).status, 409, "el mismo servicio no admite citas solapadas");
  assert.ok(!(await listarEspaciosDisponibles(pool, id)).body.espacios.some((s) => s.id_espacio === media), "no se ofrece disponibilidad solapada con una reserva");
  const siguiente = await espacio(servicios[1], "11:00");
  assert.equal((await reservar(usuarios[0], siguiente)).status, 201, "intervalos contiguos permitidos");
  await pool.query("UPDATE citas SET estado='cancelada' WHERE id_usuario=$1", [usuarios[0]]);
  assert.equal((await reservar(usuarios[2], siguiente)).status, 201, "la cancelación libera el intervalo");
  const c = await espacio(servicios[0], "13:00"), d = await espacio(servicios[1], "13:30");
  assert.deepEqual((await Promise.all([reservar(usuarios[0], c), reservar(usuarios[0], d)])).map((r) => r.status).sort(), [201, 409], "choque del paciente entre servicios diferentes");
  const unico = await espacio(servicios[0], "16:00");
  assert.deepEqual((await Promise.all([reservar(usuarios[1], unico), reservar(usuarios[2], unico)])).map((r) => r.status).sort(), [201, 409], "dos pacientes compiten por el mismo espacio");
});

test("H05: SQL y regla JS concuerdan en turno nocturno, día previo y cierre completo", async () => {
  const id = await clinica("aprobada");
  await pool.query("INSERT INTO horarios_atencion(id_clinica,dia_semana,hora_apertura,hora_cierre,cruza_medianoche) VALUES($1,1,'22:00','06:00',true)", [id]);
  const franjas = [{ dia_semana: 1, hora_apertura: "22:00", hora_cierre: "06:00", cruza_medianoche: true }];
  for (const [local, esperado] of [["2026-11-30 23:00", true], ["2026-12-01 02:00", true], ["2026-11-30 02:00", false], ["2026-12-01 05:00", true], ["2026-12-01 05:30", false], ["2026-12-01 06:00", false]]) {
    const { rows } = await pool.query(`SELECT ${enHorarioSql("($1::timestamp AT TIME ZONE 'America/Mexico_City')", "$2")} AS valido`, [local, id]);
    assert.equal(rows[0].valido, esperado, local);
    assert.equal(validarEnHorarioAtencion(new Date(local.replace(" ", "T") + ":00-06:00"), franjas, "America/Mexico_City", 60), esperado);
  }
  await pool.query("UPDATE horarios_atencion SET dia_semana=0 WHERE id_clinica=$1", [id]);
  assert.equal((await pool.query(`SELECT ${enHorarioSql("('2026-11-30 02:00'::timestamp AT TIME ZONE 'America/Mexico_City')", "$1")} AS valido`, [id])).rows[0].valido, true, "domingo a lunes");
  await pool.query("UPDATE horarios_atencion SET es_24_horas=true,cruza_medianoche=false,hora_apertura='00:00',hora_cierre='00:00' WHERE id_clinica=$1", [id]);
  for (const [hora, esperado] of [["00:00", true], ["23:00", true], ["23:30", false]]) {
    assert.equal((await pool.query(`SELECT ${enHorarioSql("($1::timestamp AT TIME ZONE 'America/Mexico_City')", "$2")} AS valido`, [`2026-11-29 ${hora}`, id])).rows[0].valido, esperado, "24 h y cierre de intervalo");
  }
});

test("H08: rechazar solicitud histórica de ubicación conserva clínica aprobada", async () => {
  const id = await clinica("aprobada");
  const solicitud = (await pool.query("INSERT INTO solicitudes_clinicas(id_clinica,datos_ficha) VALUES($1,$2) RETURNING id_solicitud", [id, { tipo_solicitud: "actualizacion_ubicacion", ubicacion_solicitada: { latitud: 17.06, longitud: -96.72 } }])).rows[0].id_solicitud;
  const resultado = await resolverSolicitud(pool, solicitud, { decision: "rechazar", observaciones: "Rechazo sintético de regresión" });
  assert.equal(resultado.status, 200, JSON.stringify(resultado.body));
  assert.equal((await pool.query("SELECT estado_publicacion FROM clinicas WHERE id_clinica=$1", [id])).rows[0].estado_publicacion, "aprobada");
  const nueva = res();
  await handler("/api/clinicas/mi-ficha/ubicacion")({ usuario: { id }, body: { latitud: 17.06, longitud: -96.72 } }, nueva);
  assert.equal(nueva.statusCode, 201);
  const fila = (await pool.query("SELECT id_solicitud,tipo_solicitud FROM solicitudes_clinicas WHERE id_clinica=$1 AND estado='pendiente'", [id])).rows[0];
  assert.equal(fila.tipo_solicitud, "actualizacion_ubicacion");
  assert.equal((await resolverSolicitud(pool, fila.id_solicitud, { decision: "aprobar" })).status, 200);
  assert.equal((await pool.query("SELECT ST_Y(ubicacion_geo::geometry) AS latitud FROM clinicas WHERE id_clinica=$1", [id])).rows[0].latitud, 17.06);
});

test("H04/H05: controladores reales de agenda publican nocturno y rechazan solapamiento", async () => {
  const rutas = {};
  const fakeApp = Object.fromEntries(["get", "post", "put", "patch", "delete"].map((metodo) => [metodo, (ruta, ...handlers) => { rutas[`${metodo} ${ruta}`] = handlers.at(-1); }]));
  require("../agendaClinica").registrarRutasAgendaClinica(fakeApp, { pool, autenticarToken() {}, requerirRol: () => () => {} });
  const id = await clinica("aprobada");
  const sid = (await pool.query("SELECT id_servicio FROM servicios WHERE categoria='ITS' LIMIT 1")).rows[0].id_servicio;
  const cs = (await pool.query("INSERT INTO clinicas_servicios(id_clinica,id_servicio) VALUES($1,$2) RETURNING id_clinica_servicio", [id, sid])).rows[0].id_clinica_servicio;
  const horarios = res();
  await rutas["put /api/clinicas/mi-agenda/horarios"]({ usuario: { id }, body: { horarios: Array.from({ length: 7 }, (_, dia_semana) => ({ dia_semana, apertura: "22:00", cierre: "06:00", cruza_medianoche: true })) } }, horarios);
  assert.equal(horarios.statusCode, 200, JSON.stringify(horarios.body));
  const fecha = (await pool.query("SELECT ((now() AT TIME ZONE 'America/Mexico_City')::date+2)::text f")).rows[0].f;
  const publicar = async (hora) => {
    const r = res();
    await rutas["post /api/clinicas/mi-agenda/espacios"]({ usuario: { id }, body: { id_clinica_servicio: cs, fecha, hora } }, r);
    return r;
  };
  const valido = await publicar("23:00");
  assert.equal(valido.statusCode, 201, JSON.stringify(valido.body));
  assert.equal((await publicar("23:30")).statusCode, 409);
  assert.equal((await publicar("05:00")).statusCode, 201, "madrugada del turno anterior");
  assert.equal((await publicar("05:30")).statusCode, 409, "la hora completa excede cierre");
  assert.equal((await publicar("12:00")).statusCode, 409);
  const lista = await listarEspaciosDisponibles(pool, id);
  assert.equal(lista.status, 200);
  assert.ok(lista.body.espacios.some((s) => s.id_espacio === valido.body.id_espacio));
  const habilitado = res();
  await pool.query("UPDATE espacios_disponibles SET habilitado=false WHERE id_espacio=$1", [valido.body.id_espacio]);
  await rutas["patch /api/clinicas/mi-agenda/espacios/:id"]({ usuario: { id }, params: { id: valido.body.id_espacio }, body: { habilitado: true } }, habilitado);
  assert.equal(habilitado.statusCode, 200, "reactivar cupo nocturno");
  const festivo = (await pool.query("INSERT INTO espacios_disponibles(id_clinica_servicio,fecha_hora_inicio,habilitado) VALUES($1,((EXTRACT(YEAR FROM now())::int+1)::text||'-12-25 23:00')::timestamp AT TIME ZONE 'America/Mexico_City',false) RETURNING id_espacio", [cs])).rows[0].id_espacio;
  const rechazo = res();
  await rutas["patch /api/clinicas/mi-agenda/espacios/:id"]({ usuario: { id }, params: { id: festivo }, body: { habilitado: true } }, rechazo);
  assert.equal(rechazo.statusCode, 409, "A02: no reactivar festivos");
});

test("H16: fechas imposibles se rechazan antes de consultar PostgreSQL", async () => {
  assert.equal(fechaValida("2026-02-30"), false);
  assert.equal(fechaValida("2028-02-29"), true);
  assert.equal(fechaValida("2026-02-29"), false);
  const r = await listarEspaciosDisponibles({ query() { throw new Error("No debe consultar"); } }, randomUUID(), { desde: "2026-02-30" });
  assert.equal(r.status, 400);
});
