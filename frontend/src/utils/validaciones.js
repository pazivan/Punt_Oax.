// Adaptación de `frontend/src/Validaciones.js` de Citlalli
// (rama `citlalli/validaciones-auntenticaciones`).
// Se conservan las ideas de validación reutilizable y los mensajes claros;
// los límites se alinean con el esquema PostgreSQL y con el backend real.
// No se incorporan sus sesiones simuladas, tokens de ejemplo ni setTimeout.

export const NOMBRE_MAX = 255
export const CORREO_MAX = 255
export const PASSWORD_MIN = 8
export const PASSWORD_MAX_BYTES = 72
export const TELEFONO_MIN_DIGITOS = 10

export const PASSWORD_REQUISITOS =
  'Mínimo 8 caracteres, con al menos una mayúscula, un número y un símbolo.'

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
    new TextEncoder().encode(password).length <= PASSWORD_MAX_BYTES &&
    /[A-ZÁÉÍÓÚÜÑ]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ\s]/.test(password)
}

export function contarDigitosTelefono(valor) {
  return typeof valor === 'string' ? (valor.match(/\d/g) || []).length : 0
}

/**
 * Valida un teléfono con el mismo criterio que el backend: solo números,
 * espacios y los signos + ( ) . - , y al menos 10 dígitos.
 */
export function validarTelefono(valor, { requerido = false } = {}) {
  if (typeof valor !== 'string') return false
  const limpio = valor.trim()
  if (!limpio) return !requerido
  if (limpio.length > 20) return false
  if (!/^[+\d()\s.-]+$/.test(limpio)) return false
  return contarDigitosTelefono(limpio) >= TELEFONO_MIN_DIGITOS
}

export function validarNombreClinica(nombre) {
  return validarRequerido(nombre) && nombre.trim().length <= NOMBRE_MAX
}
