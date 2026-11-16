/**
 * Devuelve una URL externa utilizable en un enlace, o null si no lo es.
 * Acepta enlaces ya absolutos y completa con https:// los que vienen sin
 * protocolo (por ejemplo "www.ejemplo.com" o "ejemplo.com/ruta"), para que el
 * usuario pueda abrirlos con un clic en lugar de copiarlos y pegarlos.
 */
export function normalizarUrlExterna(valor) {
  if (typeof valor !== 'string') return null
  const limpio = valor.trim()
  if (!limpio) return null
  if (/^https?:\/\//i.test(limpio)) return limpio
  if (/^[a-z][a-z\d+.-]*:/i.test(limpio)) return null
  if (!/^[\w-]+(\.[\w-]+)+(\/|$|\?|#)/i.test(limpio)) return null
  return `https://${limpio}`
}
