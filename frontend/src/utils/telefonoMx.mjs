// Política única; el parser se inyecta desde libphonenumber-js/max en cada runtime.
export const MENSAJE_TELEFONO = 'Ingresa un teléfono mexicano válido de 10 dígitos; puedes incluir +52, espacios, paréntesis o guiones.'

export function crearValidadorTelefono(parsePhoneNumberFromString) {
  function normalizarTelefono(valor) {
    if (typeof valor !== 'string') return null
    const limpio = valor.trim()
    if (!limpio || limpio.length > 64 || !/^\+?[\d ()\t.-]+$/.test(limpio)) return null
    const compacto = limpio.replace(/[ ()\t.-]/g, '')
    if (!/^(?:\+52)?\d{10}$/.test(compacto)) return null
    const nacional = compacto.replace(/^\+52/, '')
    if (/^(\d)\1{9}$/.test(nacional) || ['1234567890', '0123456789', '9876543210', '0987654321'].includes(nacional)) return null
    const numero = parsePhoneNumberFromString(`+52${nacional}`)
    return numero?.country === 'MX' && numero.isValid() ? numero.number : null
  }
  function validarTelefono(valor, { requerido = false } = {}) {
    if (valor == null || (typeof valor === 'string' && !valor.trim())) return !requerido
    return normalizarTelefono(valor) !== null
  }
  return { normalizarTelefono, validarTelefono }
}
