const test = require("node:test");
const assert = require("node:assert/strict");
const { registrarRutasCitas, solicitarCita, actualizarEstadoCitaClinica } = require("../citas");

const autenticarToken = function autenticarToken() {};
const requerirRol = (roles) => Object.assign(function rol() {}, { roles });

function appFalsa() {
  const rutas = {};
  const agregar = (metodo) => (ruta, ...manejadores) => { rutas[`${metodo} ${ruta}`] = manejadores; };
  return { rutas, get: agregar("GET"), post: agregar("POST"), patch: agregar("PATCH") };
}

test("todas las rutas de citas exigen sesión y el rol correcto", () => {
  const app = appFalsa();
  registrarRutasCitas(app, { pool: {}, autenticarToken, requerirRol });
  const esperado = {
    "GET /api/clinicas/:id/espacios": null,
    "POST /api/citas": ["usuario"],
    "GET /api/citas": ["usuario"],
    "GET /api/citas/:id": ["usuario"],
    "PATCH /api/citas/:id/cancelar": ["usuario"],
    "PATCH /api/citas/:id/estado": ["clinica"],
  };
  assert.deepEqual(Object.keys(app.rutas).sort(), Object.keys(esperado).sort());
  for (const [ruta, roles] of Object.entries(esperado)) {
    const [primero, segundo] = app.rutas[ruta];
    assert.equal(primero, autenticarToken, `${ruta} debe pedir token`);
    if (roles) assert.deepEqual(segundo.roles, roles, `${ruta} debe pedir rol ${roles}`);
  }
});

test("al solicitar, el id_usuario sale del token aunque el cuerpo traiga otro", async () => {
  const app = appFalsa();
  const usados = [];
  const cliente = {
    async query(sql, params = []) {
      usados.push(params);
      if (/FOR UPDATE OF ed/.test(sql)) return { rows: [{ fecha_hora_inicio: new Date(), reservable: true, es_futuro: true }] };
      if (/RETURNING id_cita/.test(sql)) return { rows: [{ id_cita: "c1" }] };
      if (/WHERE ci\.id_cita = \$1 AND ci\.id_usuario = \$2/.test(sql)) return { rows: [{ id_cita: "c1", estado: "confirmada" }] };
      return { rows: [] };
    },
    release() {},
  };
  const pool = { connect: async () => cliente };
  registrarRutasCitas(app, { pool, autenticarToken, requerirRol });
  const manejador = app.rutas["POST /api/citas"].at(-1);
  const res = { status(c) { this.codigo = c; return this; }, json(b) { this.cuerpo = b; return this; } };
  const otro = "11111111-1111-4111-8111-111111111111";
  await manejador(
    { usuario: { id: "22222222-2222-4222-8222-222222222222", rol: "usuario" },
      body: { id_usuario: otro, id_espacio: "33333333-3333-4333-8333-333333333333" } },
    res
  );
  assert.equal(res.codigo, 201);
  assert.ok(!usados.flat().includes(otro), "nunca se usa el id_usuario del cuerpo");
});

test("validaciones sin tocar la base de datos", async () => {
  const pool = { connect: async () => { throw new Error("no debería conectarse"); } };
  assert.equal((await solicitarCita(pool, "u", { id_espacio: "abc" })).status, 400);
  const id = "33333333-3333-4333-8333-333333333333";
  assert.equal((await actualizarEstadoCitaClinica(pool, "c", id, { estado: "confirmada" })).status, 400);
  assert.equal((await actualizarEstadoCitaClinica(pool, "c", "x", { estado: "cancelada" })).status, 400);
});

test("un error de base de datos responde 500 sin mostrar detalles internos", async () => {
  const app = appFalsa();
  const pool = { query: async () => { throw new Error("relation \"citas\" does not exist"); } };
  registrarRutasCitas(app, { pool, autenticarToken, requerirRol });
  const res = { status(c) { this.codigo = c; return this; }, json(b) { this.cuerpo = b; return this; } };
  const original = console.error; console.error = () => {};
  await app.rutas["GET /api/citas"].at(-1)({ usuario: { id: "u" }, query: {} }, res);
  console.error = original;
  assert.equal(res.codigo, 500);
  assert.doesNotMatch(JSON.stringify(res.cuerpo), /relation/);
});
