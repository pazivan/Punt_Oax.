const test = require("node:test");
const assert = require("node:assert/strict");
const { registrarRutasDatosClinica, actualizarDatosPublicados, validarCambios } = require("../datosClinica");

const autenticarToken = function autenticarToken() {};
const requerirRol = (roles) => Object.assign(function rol() {}, { roles });

function appFalsa() {
  const rutas = {};
  const agregar = (metodo) => (ruta, ...manejadores) => { rutas[`${metodo} ${ruta}`] = manejadores; };
  return { rutas, get: agregar("GET"), post: agregar("POST"), patch: agregar("PATCH") };
}

test("las rutas exigen sesión y rol clínica", () => {
  const app = appFalsa();
  registrarRutasDatosClinica(app, { pool: {}, autenticarToken, requerirRol });
  const esperadas = ["GET /api/clinicas/mi-ficha/datos-publicados", "PATCH /api/clinicas/mi-ficha/datos-publicados"];
  assert.deepEqual(Object.keys(app.rutas).sort(), esperadas.sort());
  for (const ruta of esperadas) {
    const [primero, segundo] = app.rutas[ruta];
    assert.equal(primero, autenticarToken);
    assert.deepEqual(segundo.roles, ["clinica"]);
  }
});

test("solo se aceptan los campos permitidos", () => {
  const { errores } = validarCambios({ nombre: "x", estado_publicacion: "aprobada", telefono: "951 000 0000" });
  assert.ok(errores.nombre);
  assert.ok(errores.estado_publicacion);
  assert.ok(!errores.telefono);
  assert.ok(validarCambios({}).errores.cuerpo);
  assert.ok(validarCambios({ servicios: [{ id_servicio: "abc" }] }).errores["servicios[0]"]);
});

test("la clínica sale del token y no se toca la base si los datos son inválidos", async () => {
  const pool = { connect: async () => { throw new Error("no debería conectarse"); } };
  const r = await actualizarDatosPublicados(pool, "id-del-token", { correo_contacto: "malo" });
  assert.equal(r.status, 400);
  assert.ok(r.body.campos.correo_contacto);
});

test("un error de base de datos responde 500 sin mostrar detalles internos", async () => {
  const app = appFalsa();
  const pool = { query: async () => { throw new Error('relation "clinicas" does not exist'); } };
  registrarRutasDatosClinica(app, { pool, autenticarToken, requerirRol });
  const res = { status(c) { this.codigo = c; return this; }, json(b) { this.cuerpo = b; return this; } };
  const original = console.error; console.error = () => {};
  await app.rutas["GET /api/clinicas/mi-ficha/datos-publicados"].at(-1)({ usuario: { id: "c" } }, res);
  console.error = original;
  assert.equal(res.codigo, 500);
  assert.doesNotMatch(JSON.stringify(res.cuerpo), /relation/);
});
