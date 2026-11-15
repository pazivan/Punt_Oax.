const test = require("node:test");
const assert = require("node:assert/strict");
const { registrarRutasAdminClinicas, resolverSolicitud, cambiarVisibilidad, listarSolicitudes } = require("../adminClinicas");

const autenticarToken = function autenticarToken() {};
const requerirRol = (roles) => Object.assign(function rol() {}, { roles });

function appFalsa() {
  const rutas = {};
  const agregar = (metodo) => (ruta, ...manejadores) => { rutas[`${metodo} ${ruta}`] = manejadores; };
  return { rutas, get: agregar("GET"), post: agregar("POST"), patch: agregar("PATCH") };
}

test("todas las rutas de revisión exigen sesión y rol administrador", () => {
  const app = appFalsa();
  registrarRutasAdminClinicas(app, { pool: {}, autenticarToken, requerirRol, prepararCarpetaDocumentos: async () => "/tmp" });
  const esperadas = [
    "GET /api/admin/solicitudes",
    "GET /api/admin/solicitudes/:id",
    "PATCH /api/admin/solicitudes/:id",
    "PATCH /api/admin/clinicas/:id/visibilidad",
    "GET /api/admin/documentos/:id",
  ];
  assert.deepEqual(Object.keys(app.rutas).sort(), esperadas.sort());
  for (const ruta of esperadas) {
    const [primero, segundo] = app.rutas[ruta];
    assert.equal(primero, autenticarToken, `${ruta} debe pedir token`);
    assert.deepEqual(segundo.roles, ["administrador"], `${ruta} debe pedir rol administrador`);
  }
});

test("validaciones sin tocar la base de datos", async () => {
  const pool = { connect: async () => { throw new Error("no debería conectarse"); }, query: async () => { throw new Error("no debería consultar"); } };
  const id = "33333333-3333-4333-8333-333333333333";
  assert.equal((await resolverSolicitud(pool, "x", { decision: "aprobar" })).status, 400);
  assert.equal((await resolverSolicitud(pool, id, { decision: "borrar" })).status, 400);
  assert.equal((await resolverSolicitud(pool, id, { decision: "rechazar" })).status, 400);
  assert.equal((await resolverSolicitud(pool, id, { decision: "rechazar", observaciones: "x".repeat(1001) })).status, 400);
  assert.equal((await cambiarVisibilidad(pool, id, { accion: "borrar" })).status, 400);
  assert.equal((await listarSolicitudes(pool, { estado: "otra" })).status, 400);
});

test("un error de base de datos responde 500 sin mostrar detalles internos", async () => {
  const app = appFalsa();
  const pool = { query: async () => { throw new Error('relation "solicitudes_clinicas" does not exist'); } };
  registrarRutasAdminClinicas(app, { pool, autenticarToken, requerirRol, prepararCarpetaDocumentos: async () => "/tmp" });
  const res = { status(c) { this.codigo = c; return this; }, json(b) { this.cuerpo = b; return this; } };
  const original = console.error; console.error = () => {};
  await app.rutas["GET /api/admin/solicitudes"].at(-1)({ query: {} }, res);
  console.error = original;
  assert.equal(res.codigo, 500);
  assert.doesNotMatch(JSON.stringify(res.cuerpo), /relation/);
});
