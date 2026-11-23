const test = require("node:test");
const assert = require("node:assert/strict");
const { buscarCentrosCercanos, validarParametros, registrarRutasCercania } = require("../cercania");

const dbFalsa = (filas = [], registro = []) => ({
  async query(sql, params) { registro.push({ sql, params }); return { rows: filas }; },
});

const fila = (extra = {}) => ({
  id_clinica: "a1", nombre: "Centro Uno", municipio: "Oaxaca de Juárez", direccion: "Calle 1",
  telefono: "9510000000", horario: "L-V 8 a 15", revision_catalogo: null,
  latitud: "17.0601", longitud: "-96.7253", distancia_km: "0.62",
  categorias: ["its"], servicios: ["Detección de ITS"], ...extra,
});

test("valores predeterminados y redondeo a 4 decimales", () => {
  const { valores } = validarParametros({ lat: "17.06061234", lng: "-96.72539999" });
  assert.deepEqual(valores, { lat: 17.0606, lng: -96.7254, radio_km: 10, limite: 10, servicios: null });
});

test("errores de validación del contrato (400 con campos)", async () => {
  const casos = [
    [{}, "lat"],
    [{ lat: "17" }, "lng"],
    [{ lat: "200", lng: "-96" }, "lat"],
    [{ lat: "17", lng: "-181" }, "lng"],
    [{ lat: "17,06", lng: "-96" }, "lat"],
    [{ lat: "abc", lng: "-96" }, "lat"],
    [{ lat: "17", lng: "-96", radio_km: "0.1" }, "radio_km"],
    [{ lat: "17", lng: "-96", radio_km: "150" }, "radio_km"],
    [{ lat: "17", lng: "-96", limite: "10.5" }, "limite"],
    [{ lat: "17", lng: "-96", limite: "0" }, "limite"],
    [{ lat: "17", lng: "-96", servicios: "rayos" }, "servicios"],
    [{ lat: ["17", "18"], lng: "-96" }, "lat"],
  ];
  for (const [query, campo] of casos) {
    const r = await buscarCentrosCercanos(dbFalsa(), query);
    assert.equal(r.status, 400, JSON.stringify(query));
    assert.ok(r.body.campos[campo], `debe marcar ${campo} para ${JSON.stringify(query)}`);
  }
});

test("los datos inválidos no llegan a la base de datos", async () => {
  const registro = [];
  await buscarCentrosCercanos(dbFalsa([], registro), { lat: "999", lng: "0" });
  assert.equal(registro.length, 0);
});

test("respuesta con centros: formato del contrato y números (no texto)", async () => {
  const registro = [];
  const r = await buscarCentrosCercanos(dbFalsa([fila()], registro),
    { lat: "17.0606", lng: "-96.7253", radio_km: "5", limite: "3", servicios: "ITS,ile" });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.origen, { lat: 17.0606, lng: -96.7253 });
  assert.equal(r.body.radio_km, 5);
  assert.equal(r.body.total, 1);
  const c = r.body.centros[0];
  for (const campo of ["categorias", "direccion", "distancia_km", "horario", "id_clinica",
    "latitud", "longitud", "municipio", "nombre", "servicios", "telefono"]) {
    assert.ok(campo in c, `falta el campo ${campo}`);
  }
  assert.equal(c.distancia_km, 0.62);
  assert.equal(typeof c.latitud, "number");
  assert.ok(!("revision_catalogo" in c));
  // Parámetros a SQL: lat, lng, radio en metros, servicios en minúsculas, límite.
  assert.deepEqual(registro[0].params, [17.0606, -96.7253, 5000, ["its", "ile"], 3]);
  assert.match(registro[0].sql, /verificacion_datos = 'verificado'/);
  assert.match(registro[0].sql, /estado_publicacion = 'aprobada'/);
});

test("teléfono y horario pendientes de confirmar se ocultan", async () => {
  const pendiente = fila({ revision_catalogo: { campos_no_publicar: ["telefono", "horario"] } });
  const r = await buscarCentrosCercanos(dbFalsa([pendiente]), { lat: "17", lng: "-96" });
  assert.equal(r.body.centros[0].telefono, null);
  assert.equal(r.body.centros[0].horario, null);
});

test("sin resultados: 200 con lista vacía y mensaje", async () => {
  const r = await buscarCentrosCercanos(dbFalsa([]), { lat: "19.4326", lng: "-99.1332", radio_km: "25" });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.centros, []);
  assert.equal(r.body.total, 0);
  assert.match(r.body.mensaje, /25 km/);
});

test("error de base de datos: 500 sin detalles ni coordenadas en el log", async () => {
  let ruta;
  registrarRutasCercania({ get: (p, h) => { ruta = h; } }, {
    pool: { query: async () => { throw new Error('relation "clinicas" does not exist'); } },
  });
  const res = { status(c) { this.codigo = c; return this; }, json(b) { this.cuerpo = b; return this; } };
  const logs = [];
  const original = console.error; console.error = (...a) => logs.push(a.join(" "));
  await ruta({ query: { lat: "17.0606", lng: "-96.7253" } }, res);
  console.error = original;
  assert.equal(res.codigo, 500);
  assert.doesNotMatch(JSON.stringify(res.cuerpo), /relation/);
  assert.ok(logs.every((l) => !l.includes("17.06") && !l.includes("96.72")), "no registrar coordenadas");
});
