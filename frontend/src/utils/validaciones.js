// Adaptación de `frontend/src/Validaciones.js` de Citlalli
// (rama `citlalli/validaciones-auntenticaciones`).
// Se conservan las ideas de validación reutilizable y los mensajes claros;
// los límites se alinean con el esquema PostgreSQL y con el backend real.
// No se incorporan sus sesiones simuladas, tokens de ejemplo ni setTimeout.

export const NOMBRE_MAX = 255
export const CORREO_MAX = 255
export const PASSWORD_MIN = 8
export const PASSWORD_MAX_BYTES = 72

export function validarRequerido(valor) {
  return typeof valor === 'string' && valor.trim().length > 0
}

export function normalizarCorreo(correo) {
  return typeof correo === 'string' ? correo.trim().toLowerCase() : ''
}

export function validarEmail(correo) {
  const limpio = normalizarCorreo(correo)
  return limpio.length > 0 &&
    limpio.length <= CORREO_MAX &&
    /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(limpio)
}

export function validarPassword(password) {
  if (typeof password !== 'string') return false
  return password.length >= PASSWORD_MIN &&
    new TextEncoder().encode(password).length <= PASSWORD_MAX_BYTES
}

export function validarNombreClinica(nombre) {
  return validarRequerido(nombre) && nombre.trim().length <= NOMBRE_MAX
}
