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
    "GET /api/admin/clinicas",
    "GET /api/admin/clinicas/:id",
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

test("resolverSolicitud aprueba y rechaza solicitudes pendientes usando consultas compatibles con PostgreSQL", async () => {
  for (const decision of ["aprobar", "rechazar"]) {
    const consultas = [];
    const client = {
      async query(sql, params = []) {
        consultas.push({ sql, params });
        if (/FOR UPDATE OF sc, c/.test(sql)) {
          return {
            rows: [{
              estado: "pendiente",
              id_clinica: "44444444-4444-4444-8444-444444444444",
              datos_ficha: { clinica: { nombre: "Salud digna para todos" } },
              tipo_solicitud: "postulacion",
              estado_clinica: "pendiente",
            }],
          };
        }
        if (/UPDATE solicitudes_clinicas/.test(sql)) {
          return {
            rows: [{
              id_solicitud: "33333333-3333-4333-8333-333333333333",
              estado: decision === "aprobar" ? "aprobada" : "rechazada",
              fecha_solicitud: new Date(),
              fecha_resolucion: new Date(),
              observaciones: params[1],
            }],
          };
        }
        if (/UPDATE clinicas/.test(sql)) {
          assert.match(sql, /\$1::text/, "debe tipar explícitamente $1::text para evitar error 42P08 en PostgreSQL");
          return {
            rows: [{
              id_clinica: "44444444-4444-4444-8444-444444444444",
              nombre: "Salud digna para todos",
              estado_publicacion: decision === "aprobar" ? "aprobada" : "rechazada",
            }],
          };
        }
        return { rows: [] };
      },
      release() {},
    };
    const pool = { connect: async () => client };
    const cuerpo = decision === "aprobar"
      ? { decision }
      : { decision, observaciones: "Falta corregir la dirección registrada." };
    const res = await resolverSolicitud(pool, "33333333-3333-4333-8333-333333333333", cuerpo);
    assert.equal(res.status, 200);
    assert.equal(res.body.solicitud.estado, decision === "aprobar" ? "aprobada" : "rechazada");
    assert.equal(res.body.clinica.estado_publicacion, decision === "aprobar" ? "aprobada" : "rechazada");
  }
});

test("errores conocidos de PostgreSQL devuelven explicaciones útiles sin exponer SQL", async () => {
  const app = appFalsa();
  let codigoError = "23505";
  const pool = {
    connect: async () => {
      const err = new Error("duplicate key value violates unique constraint");
      err.code = codigoError;
      throw err;
    },
  };
  registrarRutasAdminClinicas(app, { pool, autenticarToken, requerirRol, prepararCarpetaDocumentos: async () => "/tmp" });
  const manejador = app.rutas["PATCH /api/admin/solicitudes/:id"].at(-1);
  const res = { status(c) { this.codigo = c; return this; }, json(b) { this.cuerpo = b; return this; } };
  const original = console.error; console.error = () => {};
  await manejador({ params: { id: "33333333-3333-4333-8333-333333333333" }, body: { decision: "aprobar" } }, res);
  assert.equal(res.codigo, 409);
  assert.equal(res.cuerpo.codigo, "CONFLICTO_REGISTRO");

  codigoError = "XX000";
  await manejador({ params: { id: "33333333-3333-4333-8333-333333333333" }, body: { decision: "aprobar" } }, res);
  console.error = original;
  assert.equal(res.codigo, 500);
  assert.equal(res.cuerpo.codigo, "ERROR_INTERNO");
  assert.match(res.cuerpo.error, /error interno del servidor/i);
});
