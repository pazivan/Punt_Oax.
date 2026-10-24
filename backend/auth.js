/**
 * ============================================================================
 * PUNTOAX - MÓDULO DE AUTENTICACIÓN Y AUTORIZACIÓN (RBAC)
 * Utilidades para Kelly y Jonathan: Hashing con Bcrypt, JWT y Middlewares
 * ============================================================================
 */

const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

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
function generarToken({ id, correo, rol }) {
  if (!["usuario", "clinica", "administrador"].includes(rol)) {
    throw new Error(`Rol no válido para generación de token: ${rol}`);
  }

  return jwt.sign(
    {
      id,
      correo,
      rol,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * 4. Middleware: Verifica y decodifica el token JWT de las cabeceras
 * Formato esperado: Authorization: Bearer <token>
 */
function autenticarToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      error: "Acceso no autorizado: Se requiere un token de autenticación.",
    });
  }

  jwt.verify(token, JWT_SECRET, (err, usuarioDecodificado) => {
    if (err) {
      return res.status(403).json({
        error: "Token inválido o expirado. Inicie sesión nuevamente.",
      });
    }

    req.usuario = usuarioDecodificado;
    next();
  });
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
  requerirRol,
};
