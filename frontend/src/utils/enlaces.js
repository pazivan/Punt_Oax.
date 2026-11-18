/**
 * Devuelve una URL externa utilizable en un enlace, o null si no lo es.
 * Acepta enlaces ya absolutos y completa con https:// los que vienen sin
 * protocolo (por ejemplo "www.ejemplo.com" o "ejemplo.com/ruta"), para que el
 * usuario pueda abrirlos con un clic en lugar de copiarlos y pegarlos.
 */
export function normalizarUrlExterna(valor) {
  if (typeof valor !== 'string') return null
  const limpio = valor.trim()
  if (!limpio || /\s/.test(limpio)) return null
  if (/^[a-z][a-z\d+.-]*:/i.test(limpio) && !/^https?:\/\//i.test(limpio)) return null
  const completa = /^https?:\/\//i.test(limpio) ? limpio : `https://${limpio}`
  try {
    const url = new URL(completa)
    if (!['https:', 'http:'].includes(url.protocol) || !url.hostname ||
        !url.hostname.includes('.') || url.username || url.password) return null
    return completa
  } catch {
    return null
  }
}

// Algunos registros importados guardan el nombre de la fuente junto a la URL.
export function urlEnTexto(valor) {
  const directa = normalizarUrlExterna(valor)
  if (directa) return directa
  if (typeof valor !== 'string') return null
  const posible = valor.match(/https?:\/\/[^\s<>"()]+|www\.[^\s<>"()]+/i)?.[0]
  return normalizarUrlExterna(posible?.replace(/[.,;:]+$/, ''))
}
