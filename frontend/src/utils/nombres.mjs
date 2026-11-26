export const NOMBRE_MIN = 2
export const NOMBRE_MAX = 60
export const APELLIDOS_MAX = 80
export const REGEX_NOMBRE = /^[\p{L}\p{M}]+(?:[ '-][\p{L}\p{M}]+)*$/u
export function limpiarTextoNombre(valor, maxLen) {
  return String(valor || '').replace(/[^\p{L}\p{M} '-]/gu, '').replace(/\s{2,}/g, ' ').slice(0, maxLen)
}

export function errorNombre(valor, { apellidos = false } = {}) {
  if (valor === undefined || valor === null || valor === '') return null
  const campo = apellidos ? 'Los apellidos' : 'El nombre'
  if (typeof valor !== 'string') return `${campo} deben enviarse como texto.`
  const texto = valor.trim()
  if (!texto) return null
  const max = apellidos ? APELLIDOS_MAX : NOMBRE_MAX
  if (texto.length < NOMBRE_MIN || texto.length > max)
    return `${campo} debe${apellidos ? 'n' : ''} tener entre ${NOMBRE_MIN} y ${max} caracteres.`
  return REGEX_NOMBRE.test(texto) ? null : `${campo} solo puede${apellidos ? 'n' : ''} contener letras, espacios, apóstrofos o guiones.`
}
