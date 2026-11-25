/**
 * ============================================================================
 * PUNTOAX - MÓDULO DE AUTENTICACIÓN Y AUTORIZACIÓN (RBAC)
 * Utilidades: Hashing con Bcrypt, JWT, expiración por inactividad/absoluta
 * y Middlewares de autenticación/autorización.
 * ============================================================================
 */

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { randomUUID } = require("node:crypto");
const pool = require("./db");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error("Configura JWT_SECRET (mínimo 32 caracteres) antes de iniciar el servidor.");
}
const BCRYPT_ROUNDS = 10;

const INACTIVIDAD_PREDETERMINADA_MS = 15 * 60 * 1000; // 15 minutos
const ADVERTENCIA_PREDETERMINADA_MS = 60 * 1000; // 60 segundos
const ABSOLUTA_PREDETERMINADA_MS = 8 * 60 * 60 * 1000; // 8 horas

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function leerNumeroPositivo(valor, fallback) {
  if (valor === undefined || valor === null || String(valor).trim() === "") return fallback;
  const num = Number(valor);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

/**
 * Lee los tiempos configurables de expiración de sesión desde variables de entorno.
 * Permite sobrescribirlos en milisegundos (pruebas) o en minutos/segundos/horas.
 */
function obtenerConfiguracionSesion(env = process.env) {
  const inactividadMs = env.SESSION_IDLE_TIMEOUT_MS !== undefined
    ? leerNumeroPositivo(env.SESSION_IDLE_TIMEOUT_MS, INACTIVIDAD_PREDETERMINADA_MS)
    : leerNumeroPositivo(env.SESSION_IDLE_TIMEOUT_MINUTES, 15) * 60 * 1000;

  const advertenciaRaw = env.SESSION_WARNING_MS !== undefined
    ? leerNumeroPositivo(env.SESSION_WARNING_MS, ADVERTENCIA_PREDETERMINADA_MS)
    : leerNumeroPositivo(env.SESSION_WARNING_SECONDS, 60) * 1000;

  const absolutaMs = env.SESSION_ABSOLUTE_TIMEOUT_MS !== undefined
    ? leerNumeroPositivo(env.SESSION_ABSOLUTE_TIMEOUT_MS, ABSOLUTA_PREDETERMINADA_MS)
    : leerNumeroPositivo(env.SESSION_ABSOLUTE_TIMEOUT_HOURS, 8) * 60 * 60 * 1000;

  // La advertencia nunca debe igualar ni superar el tiempo de inactividad.
  const advertenciaMs = Math.min(advertenciaRaw, Math.max(1000, Math.floor(inactividadMs * 0.5)));

  return {
    inactividad_ms: Math.round(inactividadMs),
    advertencia_ms: Math.round(advertenciaMs),
    absoluta_ms: Math.round(absolutaMs),
  };
}

function construirPoliticaRespuesta(config, ultimaActividadDate, expiraAbsolutaDate) {
  const ultimaMs = ultimaActividadDate instanceof Date
    ? ultimaActividadDate.getTime()
    : Date.parse(ultimaActividadDate) || Date.now();
  const absolutaMs = expiraAbsolutaDate instanceof Date
    ? expiraAbsolutaDate.getTime()
    : Date.parse(expiraAbsolutaDate) || (Date.now() + config.absoluta_ms);
  const expiraInactividadMs = Math.min(ultimaMs + config.inactividad_ms, absolutaMs);

  return {
    inactividad_ms: config.inactividad_ms,
    advertencia_ms: config.advertencia_ms,
    absoluta_ms: config.absoluta_ms,
    ultima_actividad_en: new Date(ultimaMs).toISOString(),
    expira_inactividad_en: new Date(expiraInactividadMs).toISOString(),
    expira_absoluta_en: new Date(absolutaMs).toISOString(),
  };
}

/**
 * 1. Hashea una contraseña usando bcrypt (coste 10)
 * Garantiza que nunca se almacenen contraseñas en texto plano.
 * @param {string} password - Contraseña en texto plano (mínimo 8 caracteres)
 * @returns {Promise<string>} Hash de 60 caracteres
 */
async function hashearPassword(password) {
  if (!password || typeof password !== "string" || password.length < 8) {
    throw new Error("La contraseña debe tener al menos 8 caracteres.");
  }
  return await bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * 2. Compara una contraseña en texto plano contra el hash guardado en BD
 * @param {string} password - Contraseña enviada por el usuario
 * @param {string} hash - Hash guardado en PostgreSQL
 * @returns {Promise<boolean>} True si coincide, False en caso contrario
 */
async function verificarPassword(password, hash) {
  if (!password || !hash) return false;
  return await bcrypt.compare(password, hash);
}

/**
 * 3. Genera un token JWT firmado según la matriz de roles.
 * Respeta la duración absoluta máxima configurada (8 horas por defecto).
 * @param {Object} payload
 * @param {string} payload.id - UUID de id_usuario, id_clinica o id_administrador
 * @param {string} payload.correo - Correo electrónico de la cuenta
 * @param {'usuario' | 'clinica' | 'administrador'} payload.rol - Rol autorizado
 * @param {number} [payload.version_sesion=0]
 * @param {string} [payload.jti]
 * @returns {string} Token JWT
 */
function generarToken({ id, correo, rol, version_sesion = 0, jti }) {
  if (!["usuario", "clinica", "administrador"].includes(rol)) {
    throw new Error(`Rol no válido para generación de token: ${rol}`);
  }

  const config = obtenerConfiguracionSesion();
  const expiresInSegundos = Math.max(1, Math.ceil(config.absoluta_ms / 1000));
  const claims = {
    id,
    correo,
    rol,
    version_sesion,
  };
  if (jti) claims.jti = jti;

  return jwt.sign(claims, JWT_SECRET, { expiresIn: expiresInSegundos });
}

/**
 * Crea un registro de sesión en BD y firma un JWT vinculado a ese jti.
 */
async function crearSesionActiva(db = pool, { id, correo, rol, version_sesion = 0 }) {
  const config = obtenerConfiguracionSesion();
  const jti = randomUUID();
  const ahora = new Date();
  const expiraAbsoluta = new Date(ahora.getTime() + config.absoluta_ms);

  await db.query(
    `INSERT INTO sesiones_activas
       (jti, rol, cuenta_id, version_sesion, creada_en, ultima_actividad_en, expira_absoluta_en)
     VALUES ($1, $2, $3, $4, $5, $5, $6)`,
    [jti, rol, id, version_sesion ?? 0, ahora.toISOString(), expiraAbsoluta.toISOString()]
  );

  const token = generarToken({ id, correo, rol, version_sesion, jti });
  return {
    token,
    jti,
    sesion_politica: construirPoliticaRespuesta(config, ahora, expiraAbsoluta),
  };
}

/**
 * Revoca sesiones activas en BD (una sesión específica o todas las de la cuenta).
 */
async function revocarSesionesCuenta(db = pool, { rol, id, jti = null }) {
  if (jti && UUID_RE.test(jti)) {
    await db.query(
      `UPDATE sesiones_activas
       SET revocada_en = NOW()
       WHERE jti = $1 AND rol = $2 AND cuenta_id = $3 AND revocada_en IS NULL`,
      [jti, rol, id]
    );
    return;
  }
  await db.query(
    `UPDATE sesiones_activas
     SET revocada_en = NOW()
     WHERE rol = $1 AND cuenta_id = $2 AND revocada_en IS NULL`,
    [rol, id]
  );
}

async function verificarTokenEnBD(token, { esActividadUsuario = true, db = pool, ahoraMs = Date.now() } = {}) {
  const usuarioDecodificado = await new Promise((resolve, reject) => {
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) reject(err);
      else resolve(decoded);
    });
  });

  const cuentas = {
    usuario: ["usuarios", "id_usuario"],
    clinica: ["clinicas", "id_clinica"],
    administrador: ["administradores", "id_administrador"],
  };
  const tipo = cuentas[usuarioDecodificado.rol];
  if (!tipo || !UUID_RE.test(usuarioDecodificado.id || "")) {
    const err = new Error("Token inválido o expirado.");
    err.status = 403;
    err.codigo = "TOKEN_INVALIDO";
    throw err;
  }

  const columnasExtra =
    usuarioDecodificado.rol === "administrador"
      ? ""
      : usuarioDecodificado.rol === "clinica"
        ? ", correo_verificado_en, estado_publicacion"
        : ", correo_verificado_en, activo";

  const { rows } = await db.query(
    `SELECT version_sesion${columnasExtra} FROM ${tipo[0]} WHERE ${tipo[1]}=$1`,
    [usuarioDecodificado.id]
  );

  if (!rows[0] || rows[0].version_sesion !== (usuarioDecodificado.version_sesion ?? 0)) {
    const err = new Error("Sesión inválida. Inicia sesión nuevamente.");
    err.status = 403;
    err.codigo = "SESION_INVALIDA";
    throw err;
  }
  if (usuarioDecodificado.rol === "usuario" && rows[0].activo === false) {
    const err = new Error("Tu cuenta está desactivada. Contacta al administrador.");
    err.status = 403;
    err.codigo = "CUENTA_DESACTIVADA";
    throw err;
  }
  if (usuarioDecodificado.rol !== "administrador" && !rows[0].correo_verificado_en) {
    const err = new Error("Verifica tu correo antes de continuar.");
    err.status = 403;
    err.codigo = "CORREO_NO_VERIFICADO";
    throw err;
  }

  const config = obtenerConfiguracionSesion();
  let sesionPolitica;

  if (usuarioDecodificado.jti) {
    if (!UUID_RE.test(usuarioDecodificado.jti)) {
      const err = new Error("Token inválido o expirado.");
      err.status = 401;
      err.codigo = "TOKEN_INVALIDO";
      throw err;
    }

    const { rows: sesiones } = await db.query(
      `SELECT jti, creada_en, ultima_actividad_en, expira_absoluta_en, revocada_en
       FROM sesiones_activas
       WHERE jti = $1 AND rol = $2 AND cuenta_id = $3`,
      [usuarioDecodificado.jti, usuarioDecodificado.rol, usuarioDecodificado.id]
    );

    const sesionBd = sesiones[0];
    if (!sesionBd || sesionBd.revocada_en) {
      const err = new Error("Tu sesión fue cerrada. Inicia sesión nuevamente.");
      err.status = 401;
      err.codigo = "SESION_REVOCADA";
      throw err;
    }

    const expiraAbsolutaMs = new Date(sesionBd.expira_absoluta_en).getTime();
    const ultimaActividadMs = new Date(sesionBd.ultima_actividad_en).getTime();

    if (ahoraMs >= expiraAbsolutaMs) {
      await db.query(
        "UPDATE sesiones_activas SET revocada_en = NOW() WHERE jti = $1 AND revocada_en IS NULL",
        [usuarioDecodificado.jti]
      ).catch(() => {});
      const err = new Error("Tu sesión alcanzó la duración máxima permitida. Inicia sesión nuevamente.");
      err.status = 401;
      err.codigo = "SESION_EXPIRADA_ABSOLUTA";
      throw err;
    }

    if (ahoraMs - ultimaActividadMs >= config.inactividad_ms) {
      await db.query(
        "UPDATE sesiones_activas SET revocada_en = NOW() WHERE jti = $1 AND revocada_en IS NULL",
        [usuarioDecodificado.jti]
      ).catch(() => {});
      const err = new Error("Tu sesión expiró por inactividad. Inicia sesión nuevamente.");
      err.status = 401;
      err.codigo = "SESION_EXPIRADA_INACTIVIDAD";
      throw err;
    }

    let ultimaActividadEfectiva = new Date(ultimaActividadMs);
    if (esActividadUsuario) {
      ultimaActividadEfectiva = new Date(ahoraMs);
      await db.query(
        `UPDATE sesiones_activas
         SET ultima_actividad_en = $2
         WHERE jti = $1 AND revocada_en IS NULL`,
        [usuarioDecodificado.jti, ultimaActividadEfectiva.toISOString()]
      );
    }

    sesionPolitica = construirPoliticaRespuesta(
      config,
      ultimaActividadEfectiva,
      new Date(expiraAbsolutaMs)
    );
  } else {
    // Compatibilidad con tokens previos sin jti: exige respetar la duración absoluta desde iat.
    const emitidoMs = typeof usuarioDecodificado.iat === "number"
      ? usuarioDecodificado.iat * 1000
      : ahoraMs;
    const expiraAbsolutaMs = emitidoMs + config.absoluta_ms;
    if (ahoraMs >= expiraAbsolutaMs) {
      const err = new Error("Tu sesión expiró. Inicia sesión nuevamente.");
      err.status = 401;
      err.codigo = "SESION_EXPIRADA_ABSOLUTA";
      throw err;
    }
    sesionPolitica = construirPoliticaRespuesta(
      config,
      new Date(ahoraMs),
      new Date(expiraAbsolutaMs)
    );
  }

  const usuarioResultado = usuarioDecodificado.rol === "clinica"
    ? { ...usuarioDecodificado, estado_publicacion: rows[0].estado_publicacion }
    : usuarioDecodificado;

  return { usuario: usuarioResultado, sesionPolitica };
}

function esSolicitudSegundoPlano(req) {
  const cabecera = req?.headers?.["x-puntoax-background"];
  return cabecera === "1" || cabecera === "true";
}

/**
 * 4. Middleware: Verifica y decodifica el token JWT de las cabeceras
 * Formato esperado: Authorization: Bearer <token>
 */
async function autenticarToken(req, res, next) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");

  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      error: "Acceso no autorizado: Se requiere un token de autenticación.",
      codigo: "SESION_REQUERIDA",
    });
  }

  try {
    const { usuario, sesionPolitica } = await verificarTokenEnBD(token, {
      esActividadUsuario: !esSolicitudSegundoPlano(req),
    });
    req.usuario = usuario;
    req.sesionPolitica = sesionPolitica;
    return next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({
        error: "Tu sesión expiró. Inicia sesión nuevamente.",
        codigo: "TOKEN_EXPIRADO",
      });
    }
    if (err.status) {
      return res.status(err.status).json({ error: err.message, codigo: err.codigo });
    }
    if (err.name === "JsonWebTokenError" || err.name === "NotBeforeError") {
      return res.status(403).json({
        error: "Token inválido o expirado. Inicie sesión nuevamente.",
        codigo: "TOKEN_INVALIDO",
      });
    }
    return res.status(503).json({
      error: "No se pudo verificar la sesión.",
      codigo: "ERROR_TEMPORAL_SERVIDOR",
    });
  }
}

/**
 * 4b. Middleware opcional para el asistente: identifica visitantes o pacientes validados.
 */
async function autenticarTokenOpcional(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    req.usuario = null;
    req.sesionAsistente = { autenticada: false, rol: "visitante", motivo: null };
    return next();
  }

  try {
    const { usuario, sesionPolitica } = await verificarTokenEnBD(token, {
      esActividadUsuario: !esSolicitudSegundoPlano(req),
    });
    if (usuario.rol === "clinica" || usuario.rol === "administrador") {
      return res.status(403).json({
        error: "El asistente de pacientes no está disponible para cuentas de clínica o administración.",
      });
    }
    req.usuario = usuario;
    req.sesionPolitica = sesionPolitica;
    req.sesionAsistente = { autenticada: true, rol: "usuario", motivo: null };
    return next();
  } catch (err) {
    req.usuario = null;
    const codigosExpirada = new Set([
      "SESION_INVALIDA",
      "SESION_REVOCADA",
      "SESION_EXPIRADA_INACTIVIDAD",
      "SESION_EXPIRADA_ABSOLUTA",
      "TOKEN_EXPIRADO",
    ]);
    const expirada = err?.name === "TokenExpiredError" || codigosExpirada.has(err?.codigo);
    req.sesionAsistente = {
      autenticada: false,
      rol: "visitante",
      motivo: expirada ? "expirada" : "invalida",
    };
    return next();
  }
}

/**
 * 5. Middleware: Autorización basada en roles (RBAC)
 * @param {Array<'usuario' | 'clinica' | 'administrador'>} rolesPermitidos
 */
function requerirRol(rolesPermitidos = []) {
  return (req, res, next) => {
    if (!req.usuario || !rolesPermitidos.includes(req.usuario.rol)) {
      return res.status(403).json({
        error: `Acceso denegado: Se requiere uno de los siguientes roles: ${rolesPermitidos.join(", ")}`,
      });
    }
    next();
  };
}

module.exports = {
  hashearPassword,
  verificarPassword,
  generarToken,
  crearSesionActiva,
  revocarSesionesCuenta,
  verificarTokenEnBD,
  obtenerConfiguracionSesion,
  autenticarToken,
  autenticarTokenOpcional,
  requerirRol,
};
