/**
 * ============================================================================
 * PUNTOAX - PRUEBAS DE CONTROL DE ACCESO BASADO EN ROLES (RBAC)
 * Sprint 7 · Jonathan · Issue #69 · Punto relacionado: 4.7.4 (Backend y roles)
 *
 * Valida la protección estricta de las rutas de revisión y administración:
 *  - GET   /api/admin/solicitudes
 *  - GET   /api/admin/solicitudes/:id
 *  - GET   /api/admin/documentos/:id
 *  - PATCH /api/admin/solicitudes/:id
 *  - PATCH /api/admin/clinicas/:id/visibilidad
 *
 * Restricciones probadas:
 *  1. Sin token -> 401 Unauthorized
 *  2. Con rol 'usuario' -> 403 Forbidden
 *  3. Con rol 'clinica' -> 403 Forbidden
 *  4. Con rol 'administrador' -> Acceso autorizado (pasa al controlador)
 *  5. Con roles forjados / no autorizados -> 403 Forbidden
 * ============================================================================
 */

// auth.js exige JWT_SECRET al importarse. La suite solo firma/valida tokens en
// memoria, no toca la base ni producción, así que usa una clave local de prueba.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  process.env.JWT_SECRET = "clave-local-solo-pruebas-roles-admin-2026";
}

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { registrarRutasAdminClinicas, RUTAS_ADMIN_ACORDADAS } = require("../adminClinicas");
const { autenticarToken, requerirRol } = require("../auth");

/**
 * Helper para simular llamadas a middlewares de Express sin necesidad de servidor HTTP real.
 */
function simularMiddleware(middleware, reqMock) {
  return new Promise((resolve) => {
    const resMock = {
      status(codigo) {
        this.statusCode = codigo;
        return this;
      },
      json(cuerpo) {
        this.body = cuerpo;
        resolve({ finalizado: true, status: this.statusCode, body: this.body });
      },
    };
    const nextMock = (err) => {
      resolve({ finalizado: false, nextLlamado: true, error: err });
    };

    middleware(reqMock, resMock, nextMock);
  });
}

test("1. Todas las rutas de administración acordadas con Kelly tienen asignados los middlewares de autenticación y rol administrador", () => {
  const rutasRegistradas = {};
  const appFalsa = {
    get(ruta, ...middlewares) { rutasRegistradas[`GET ${ruta}`] = middlewares; },
    patch(ruta, ...middlewares) { rutasRegistradas[`PATCH ${ruta}`] = middlewares; },
    post(ruta, ...middlewares) { rutasRegistradas[`POST ${ruta}`] = middlewares; },
    delete(ruta, ...middlewares) { rutasRegistradas[`DELETE ${ruta}`] = middlewares; },
  };

  registrarRutasAdminClinicas(appFalsa, {
    pool: {},
    autenticarToken,
    requerirRol,
    prepararCarpetaDocumentos: async () => "/tmp",
  });

  for (const clave of RUTAS_ADMIN_ACORDADAS) {
    assert.ok(rutasRegistradas[clave], `La ruta ${clave} debe estar registrada.`);
    const handlers = rutasRegistradas[clave];
    assert.ok(handlers.length >= 3, `La ruta ${clave} debe tener al menos autenticarToken, requerirRol y el controlador.`);

    // El primer middleware debe ser autenticarToken
    assert.equal(handlers[0].name, "autenticarToken", `El primer middleware de ${clave} debe ser autenticarToken.`);

    // El middleware de rol debe configurarse con rol 'administrador'
    let resultado = null;
    const reqUsuario = { usuario: { rol: "usuario" } };
    const resUsuario = {
      status(c) { this.codigo = c; return this; },
      json(b) { resultado = { status: this.codigo, body: b }; },
    };
    handlers[1](reqUsuario, resUsuario, () => { resultado = { ok: true }; });
    assert.equal(resultado?.status, 403, `El segundo middleware de ${clave} debe rechazar al rol 'usuario' con 403.`);
  }
});

test("2. requerirRol(['administrador']) bloquea peticiones sin req.usuario o sin rol (403)", async () => {
  const middlewareAdmin = requerirRol(["administrador"]);

  // Caso: sin usuario en la request
  const res1 = await simularMiddleware(middlewareAdmin, {});
  assert.equal(res1.status, 403);
  assert.match(res1.body.error, /Acceso denegado/);
  assert.match(res1.body.error, /administrador/);

  // Caso: req.usuario es null o undefined
  const res2 = await simularMiddleware(middlewareAdmin, { usuario: null });
  assert.equal(res2.status, 403);

  // Caso: req.usuario no tiene rol
  const res3 = await simularMiddleware(middlewareAdmin, { usuario: { id: "123" } });
  assert.equal(res3.status, 403);
});

test("3. requerirRol(['administrador']) deniega el acceso con 403 a usuarios comunes y clínicas", async () => {
  const middlewareAdmin = requerirRol(["administrador"]);

  // Rol usuario (paciente)
  const reqUsuario = { usuario: { id: "11111111-1111-4111-8111-111111111111", rol: "usuario", correo: "paciente@puntoax.online" } };
  const resUsuario = await simularMiddleware(middlewareAdmin, reqUsuario);
  assert.equal(resUsuario.status, 403, "Debe rechazar al rol 'usuario' con 403");
  assert.match(resUsuario.body.error, /administrador/);

  // Rol clinica
  const reqClinica = { usuario: { id: "22222222-2222-4222-8222-222222222222", rol: "clinica", correo: "clinica@puntoax.online" } };
  const resClinica = await simularMiddleware(middlewareAdmin, reqClinica);
  assert.equal(resClinica.status, 403, "Debe rechazar al rol 'clinica' con 403");
  assert.match(resClinica.body.error, /administrador/);
});

test("4. requerirRol(['administrador']) deniega el acceso con 403 ante roles forjados o desconocidos", async () => {
  const middlewareAdmin = requerirRol(["administrador"]);
  const rolesInvalidos = ["superadmin", "admin", "moderador", "medico", "root", "guest", ""];

  for (const rolInvalido of rolesInvalidos) {
    const reqMock = { usuario: { id: "test", rol: rolInvalido } };
    const res = await simularMiddleware(middlewareAdmin, reqMock);
    assert.equal(res.status, 403, `Debe rechazar el rol '${rolInvalido}' con 403`);
  }
});

test("5. requerirRol(['administrador']) permite el acceso exclusivamente cuando el rol es 'administrador'", async () => {
  const middlewareAdmin = requerirRol(["administrador"]);
  const reqAdmin = {
    usuario: {
      id: "99999999-9999-4999-8999-999999999999",
      rol: "administrador",
      correo: "admin@puntoax.online",
    },
  };

  const res = await simularMiddleware(middlewareAdmin, reqAdmin);
  assert.equal(res.finalizado, false, "No debe responder error 403");
  assert.equal(res.nextLlamado, true, "Debe llamar a next() para dar paso al controlador");
});

test("6. Pipeline completo en Express: las rutas administrativas responden 403 a usuarios y clínicas", async () => {
  const app = express();
  app.use(express.json());

  // Middleware simulador de autenticación para inyectar req.usuario en pruebas
  let usuarioPrueba = null;
  const autenticarPrueba = (req, res, next) => {
    if (!usuarioPrueba) {
      return res.status(401).json({ error: "Acceso no autorizado: Se requiere un token de autenticación." });
    }
    req.usuario = usuarioPrueba;
    next();
  };

  // Registrar rutas admin
  registrarRutasAdminClinicas(app, {
    pool: { query: async () => ({ rows: [] }) },
    autenticarToken: autenticarPrueba,
    requerirRol,
    prepararCarpetaDocumentos: async () => "/tmp",
  });

  // Levantar servidor temporal en puerto dinámico
  const servidor = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const puerto = servidor.address().port;
  const baseUrl = `http://127.0.0.1:${puerto}`;

  try {
    // 6.1 Petición sin sesión -> 401 en todas las rutas administrativas
    usuarioPrueba = null;
    for (const clave of RUTAS_ADMIN_ACORDADAS) {
      const [metodo, path] = clave.split(" ");
      const url = `${baseUrl}${path.replace(":id", "00000000-0000-0000-0000-000000000000")}`;
      const resSinToken = await fetch(url, { method: metodo });
      assert.equal(resSinToken.status, 401, `Sin sesión debe responder 401 en ${clave}`);
      const body = await resSinToken.json();
      assert.match(body.error, /no autorizado|token/i, `El 401 de ${clave} debe explicar falta de token`);
    }

    // 6.2 Petición con rol 'usuario' -> 403
    usuarioPrueba = { id: "user-1", rol: "usuario" };
    for (const clave of RUTAS_ADMIN_ACORDADAS) {
      const [metodo, path] = clave.split(" ");
      const url = `${baseUrl}${path.replace(":id", "00000000-0000-0000-0000-000000000000")}`;
      const res = await fetch(url, { method: metodo });
      assert.equal(res.status, 403, `Rol usuario debe recibir 403 en ${clave}`);
      const body = await res.json();
      assert.match(body.error, /administrador/);
    }

    // 6.3 Petición con rol 'clinica' -> 403
    usuarioPrueba = { id: "clinica-1", rol: "clinica" };
    for (const clave of RUTAS_ADMIN_ACORDADAS) {
      const [metodo, path] = clave.split(" ");
      const url = `${baseUrl}${path.replace(":id", "00000000-0000-0000-0000-000000000000")}`;
      const res = await fetch(url, { method: metodo });
      assert.equal(res.status, 403, `Rol clinica debe recibir 403 en ${clave}`);
      const body = await res.json();
      assert.match(body.error, /administrador/);
    }

    // 6.4 Petición con rol 'administrador' -> Pasa autorización (200 o validación de negocio)
    usuarioPrueba = { id: "admin-1", rol: "administrador" };
    const resAdmin = await fetch(`${baseUrl}/api/admin/solicitudes`);
    assert.equal(resAdmin.status, 200, "Rol administrador debe pasar y recibir 200");
  } finally {
    await new Promise((resolve) => servidor.close(resolve));
  }
});
