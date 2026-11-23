/**
 * ============================================================================
 * PUNTOAX - MÓDULO DE AUTENTICACIÓN Y AUTORIZACIÓN (RBAC)
 * Utilidades para Kelly y Jonathan: Hashing con Bcrypt, JWT y Middlewares
 * ============================================================================
 */

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("./db");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error("Configura JWT_SECRET (mínimo 32 caracteres) antes de iniciar el servidor.");
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const BCRYPT_ROUNDS = 10;

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
 * 3. Genera un token JWT firmado según la matriz de roles
 * @param {Object} payload
 * @param {string} payload.id - UUID de id_usuario, id_clinica o id_administrador
 * @param {string} payload.correo - Correo electrónico de la cuenta
 * @param {'usuario' | 'clinica' | 'administrador'} payload.rol - Rol autorizado
 * @returns {string} Token JWT
 */
function generarToken({ id, correo, rol, version_sesion = 0 }) {
  if (!["usuario", "clinica", "administrador"].includes(rol)) {
    throw new Error(`Rol no válido para generación de token: ${rol}`);
  }

  return jwt.sign(
    {
      id,
      correo,
      rol,
      version_sesion,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

async function verificarTokenEnBD(token) {
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
  if (!tipo || !/^[0-9a-f-]{36}$/i.test(usuarioDecodificado.id || "")) {
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

  const { rows } = await pool.query(
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

  return usuarioDecodificado.rol === "clinica"
    ? { ...usuarioDecodificado, estado_publicacion: rows[0].estado_publicacion }
    : usuarioDecodificado;
}

/**
 * 4. Middleware: Verifica y decodifica el token JWT de las cabeceras
 * Formato esperado: Authorization: Bearer <token>
 */
async function autenticarToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      error: "Acceso no autorizado: Se requiere un token de autenticación.",
    });
  }

  try {
    req.usuario = await verificarTokenEnBD(token);
    return next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(403).json({
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
    const usuario = await verificarTokenEnBD(token);
    if (usuario.rol === "clinica" || usuario.rol === "administrador") {
      return res.status(403).json({
        error: "El asistente de pacientes no está disponible para cuentas de clínica o administración.",
      });
    }
    req.usuario = usuario;
    req.sesionAsistente = { autenticada: true, rol: "usuario", motivo: null };
    return next();
  } catch (err) {
    req.usuario = null;
    const expirada = err?.name === "TokenExpiredError" || err?.codigo === "SESION_INVALIDA";
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
  autenticarToken,
  autenticarTokenOpcional,
  requerirRol,
};
