const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

process.env.JWT_SECRET = process.env.JWT_SECRET || "clave-pruebas-unitarias-puntoax-32-caracteres-minimo";

const {
  crearSesionActiva,
  verificarTokenEnBD,
  obtenerConfiguracionSesion,
  autenticarToken,
} = require("../auth");
const { registrarRutasCercania } = require("../cercania");

function crearMockDb(estadoInicial = {}) {
  const sesiones = new Map();
  const llamadas = [];
  const cuenta = {
    version_sesion: 0,
    correo_verificado_en: new Date().toISOString(),
    activo: true,
    estado_publicacion: "aprobada",
    ...estadoInicial,
  };

  return {
    sesiones,
    llamadas,
    async query(sql, params = []) {
      llamadas.push({ sql, params });
      if (/INSERT INTO sesiones_activas/i.test(sql)) {
        const [jti, rol, cuenta_id, version_sesion, creada_en, expira_absoluta_en] = params;
        sesiones.set(jti, {
          jti,
          rol,
          cuenta_id,
          version_sesion,
          creada_en,
          ultima_actividad_en: creada_en,
          expira_absoluta_en,
          revocada_en: null,
        });
        return { rows: [], rowCount: 1 };
      }
      if (/SELECT version_sesion/i.test(sql)) {
        return { rows: [cuenta], rowCount: 1 };
      }
      if (/SELECT jti, creada_en, ultima_actividad_en/i.test(sql)) {
        const [jti, rol, cuenta_id] = params;
        const fila = sesiones.get(jti);
        if (!fila || fila.rol !== rol || fila.cuenta_id !== cuenta_id) {
          return { rows: [], rowCount: 0 };
        }
        return { rows: [fila], rowCount: 1 };
      }
      if (/UPDATE sesiones_activas[\s\S]*SET ultima_actividad_en/i.test(sql)) {
        const [jti, nuevaFecha] = params;
        const fila = sesiones.get(jti);
        if (fila && !fila.revocada_en) {
          fila.ultima_actividad_en = nuevaFecha;
        }
        return { rows: [], rowCount: fila ? 1 : 0 };
      }
      if (/UPDATE sesiones_activas[\s\S]*SET revocada_en/i.test(sql)) {
        const [jti] = params;
        const fila = sesiones.get(jti);
        if (fila && !fila.revocada_en) {
          fila.revocada_en = new Date().toISOString();
        }
        return { rows: [], rowCount: fila ? 1 : 0 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
}

test("obtenerConfiguracionSesion usa 15 min inactividad, 60 s advertencia y 8 h absoluta por defecto", () => {
  const cfg = obtenerConfiguracionSesion({});
  assert.equal(cfg.inactividad_ms, 15 * 60 * 1000);
  assert.equal(cfg.advertencia_ms, 60 * 1000);
  assert.equal(cfg.absoluta_ms, 8 * 60 * 60 * 1000);

  const custom = obtenerConfiguracionSesion({
    SESSION_IDLE_TIMEOUT_MINUTES: "10",
    SESSION_WARNING_SECONDS: "45",
    SESSION_ABSOLUTE_TIMEOUT_HOURS: "4",
  });
  assert.equal(custom.inactividad_ms, 10 * 60 * 1000);
  assert.equal(custom.advertencia_ms, 45 * 1000);
  assert.equal(custom.absoluta_ms, 4 * 60 * 60 * 1000);
});

test("crearSesionActiva y verificarTokenEnBD validan inactividad, límite absoluto y peticiones en segundo plano", async () => {
  const db = crearMockDb();
  const id = randomUUID();
  const { token, jti, sesion_politica } = await crearSesionActiva(db, {
    id,
    correo: "paciente@ejemplo.mx",
    rol: "usuario",
    version_sesion: 0,
  });

  assert.ok(token);
  assert.ok(db.sesiones.has(jti));
  assert.equal(sesion_politica.inactividad_ms, 15 * 60 * 1000);

  const inicial = db.sesiones.get(jti).ultima_actividad_en;
  const cincoMinDespues = Date.parse(inicial) + 5 * 60 * 1000;

  // Solicitud en segundo plano NO debe reiniciar la última actividad
  await verificarTokenEnBD(token, {
    esActividadUsuario: false,
    db,
    ahoraMs: cincoMinDespues,
  });
  assert.equal(
    db.sesiones.get(jti).ultima_actividad_en,
    inicial,
    "una petición automática en segundo plano no debe extender la inactividad"
  );

  // Solicitud iniciada por usuario SÍ actualiza ultima_actividad_en
  await verificarTokenEnBD(token, {
    esActividadUsuario: true,
    db,
    ahoraMs: cincoMinDespues,
  });
  assert.equal(
    Date.parse(db.sesiones.get(jti).ultima_actividad_en),
    cincoMinDespues
  );

  // Tras 15 minutos sin actividad desde el último evento real -> 401 SESION_EXPIRADA_INACTIVIDAD
  const dieciseisMinDespues = cincoMinDespues + 16 * 60 * 1000;
  await assert.rejects(
    verificarTokenEnBD(token, {
      esActividadUsuario: true,
      db,
      ahoraMs: dieciseisMinDespues,
    }),
    (err) => err.status === 401 && err.codigo === "SESION_EXPIRADA_INACTIVIDAD"
  );
  assert.ok(db.sesiones.get(jti).revocada_en, "la sesión expirada debe marcarse revocada en BD");

  // Reintentar con el mismo token ya revocado -> 401 SESION_REVOCADA
  await assert.rejects(
    verificarTokenEnBD(token, {
      esActividadUsuario: true,
      db,
      ahoraMs: cincoMinDespues + 1000,
    }),
    (err) => err.status === 401 && err.codigo === "SESION_REVOCADA"
  );
});

test("verificarTokenEnBD rechaza sesiones que exceden la duración absoluta de 8 horas aunque tengan actividad", async () => {
  const db = crearMockDb();
  const id = randomUUID();
  const { token, jti } = await crearSesionActiva(db, {
    id,
    correo: "clinica@ejemplo.mx",
    rol: "clinica",
    version_sesion: 0,
  });

  const inicio = Date.parse(db.sesiones.get(jti).creada_en);
  // Simulamos actividad reciente, pero a las 8h + 1s del inicio
  db.sesiones.get(jti).ultima_actividad_en = new Date(inicio + 8 * 60 * 60 * 1000 - 1000).toISOString();
  // Ajustamos expira_absoluta_en para probar antes de que jwt.verify expire por exp
  db.sesiones.get(jti).expira_absoluta_en = new Date(inicio + 60 * 1000).toISOString();

  await assert.rejects(
    verificarTokenEnBD(token, {
      esActividadUsuario: true,
      db,
      ahoraMs: inicio + 61 * 1000,
    }),
    (err) => err.status === 401 && err.codigo === "SESION_EXPIRADA_ABSOLUTA"
  );
});

test("autenticarToken responde 401 y cabeceras no-store sin token", async () => {
  const headers = {};
  const res = {
    setHeader(k, v) { headers[k.toLowerCase()] = v; },
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
  await autenticarToken({ headers: {} }, res, () => {
    throw new Error("no debía llamar next");
  });
  assert.equal(res.statusCode, 401);
  assert.match(headers["cache-control"], /no-store/);
});

test("rutas exclusivas del mapa exigen autenticarToken en backend", () => {
  const servidorSrc = fs.readFileSync(path.resolve(__dirname, "../servidor.js"), "utf8");
  assert.match(servidorSrc, /app\.get\("\/api\/clinicas",\s*autenticarToken,/);
  assert.match(servidorSrc, /app\.get\("\/api\/clinicas\/:id",\s*autenticarToken,/);
  assert.match(servidorSrc, /registrarRutasCercania\(app,\s*\{\s*pool,\s*autenticarToken\s*\}\)/);
  assert.match(servidorSrc, /app\.post\("\/api\/auth\/actividad",\s*autenticarToken,/);

  const registradas = {};
  registrarRutasCercania(
    { get: (ruta, ...handlers) => { registradas[ruta] = handlers; } },
    { pool: {}, autenticarToken }
  );
  assert.equal(registradas["/api/clinicas/cercanas"][0], autenticarToken);
});

test("la migración 013 define sesiones_activas con .up.sql y .down.sql", () => {
  const up = fs.readFileSync(
    path.resolve(__dirname, "../../db/migrations/013_sesiones_expiracion_inactividad.up.sql"),
    "utf8"
  );
  const down = fs.readFileSync(
    path.resolve(__dirname, "../../db/migrations/013_sesiones_expiracion_inactividad.down.sql"),
    "utf8"
  );
  assert.match(up, /CREATE TABLE IF NOT EXISTS sesiones_activas/i);
  assert.match(up, /ultima_actividad_en/i);
  assert.match(up, /expira_absoluta_en/i);
  assert.match(down, /DROP TABLE IF EXISTS sesiones_activas/i);
});
