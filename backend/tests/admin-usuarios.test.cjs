const test = require("node:test");
const assert = require("node:assert/strict");
const { registrarRutasAdminUsuarios, listarUsuarios } = require("../adminUsuarios");

const autenticarToken = function autenticarToken() {};
const requerirRol = (roles) => Object.assign(function rol() {}, { roles });

function appFalsa() {
  const rutas = {};
  const agregar = (metodo) => (ruta, ...manejadores) => { rutas[`${metodo} ${ruta}`] = manejadores; };
  return { rutas, get: agregar("GET"), patch: agregar("PATCH") };
}

test("todas las rutas de usuarios exigen sesión y rol administrador", () => {
  const app = appFalsa();
  registrarRutasAdminUsuarios(app, { pool: {}, autenticarToken, requerirRol });
  for (const ruta of [
    "GET /api/admin/usuarios",
    "GET /api/admin/usuarios/:id",
    "PATCH /api/admin/usuarios/:id/estado",
  ]) {
    const manejadores = app.rutas[ruta];
    assert.ok(manejadores, `debe registrar ${ruta}`);
    assert.equal(manejadores[0], autenticarToken);
    assert.deepEqual(manejadores[1].roles, ["administrador"]);
  }
});

test("la consulta devuelve datos públicos y nunca el hash ni google_sub", async () => {
  const consultas = [];
  const pool = {
    query: async (sql, parametros) => {
      consultas.push({ sql, parametros });
      if (/COUNT/i.test(sql)) return { rows: [{ total: 2 }] };
      return {
        rows: [{
          id_usuario: "11111111-1111-4111-8111-111111111111",
          nombre: null,
          apellidos: null,
          correo: "persona@ejemplo.com",
          telefono: null,
          fecha_registro: "2026-11-17T00:00:00.000Z",
          correo_verificado: true,
          acceso_password: true,
          acceso_google: false,
        }],
      };
    },
  };

  const resultado = await listarUsuarios(pool);
  assert.equal(resultado.status, 200);
  assert.equal(resultado.body.total, 2);
  assert.equal(resultado.body.usuarios.length, 1);
  assert.equal(resultado.body.usuarios[0].correo, "persona@ejemplo.com");

  const [consultaUsuarios] = consultas;
  assert.doesNotMatch(consultaUsuarios.sql, /SELECT\s+\*/i);
  assert.doesNotMatch(consultaUsuarios.sql, /password_hash\s*,/i);
  assert.doesNotMatch(consultaUsuarios.sql, /google_sub\s*,/i);
  assert.match(consultaUsuarios.sql, /\(password_hash IS NOT NULL\) AS acceso_password/);
  assert.match(consultaUsuarios.sql, /\(google_sub IS NOT NULL\) AS acceso_google/);
  assert.deepEqual(consultaUsuarios.parametros, [200]);

  const serializado = JSON.stringify(resultado.body);
  assert.doesNotMatch(serializado, /password_hash/);
  assert.doesNotMatch(serializado, /google_sub/);
});

test("un error de base de datos responde 500 sin mostrar detalles internos", async () => {
  const app = appFalsa();
  const pool = { query: async () => { throw new Error('relation "usuarios" does not exist'); } };
  registrarRutasAdminUsuarios(app, { pool, autenticarToken, requerirRol });
  const res = { status(c) { this.codigo = c; return this; }, json(b) { this.cuerpo = b; return this; } };
  const original = console.error;
  console.error = () => {};
  await app.rutas["GET /api/admin/usuarios"].at(-1)({}, res);
  console.error = original;
  assert.equal(res.codigo, 500);
  assert.doesNotMatch(JSON.stringify(res.cuerpo), /relation|usuarios"/);
});
