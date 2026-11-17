const CLAVE = 'puntoax-verificacion-pendiente'
const VIGENCIA = 24 * 60 * 60 * 1000

export function borrarVerificacionPendiente() {
  try { sessionStorage.removeItem(CLAVE) } catch { /* almacenamiento deshabilitado */ }
}

export function leerVerificacionPendiente() {
  try {
    const datos = JSON.parse(sessionStorage.getItem(CLAVE))
    if (['usuario', 'clinica'].includes(datos?.rol) &&
        typeof datos.correo === 'string' && datos.correo.length <= 255 &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.correo) &&
        Number.isFinite(datos.creadaEn) && datos.creadaEn <= Date.now() &&
        Date.now() - datos.creadaEn < VIGENCIA) {
      return { rol: datos.rol, correo: datos.correo }
    }
  } catch { /* datos ausentes o inválidos */ }
  borrarVerificacionPendiente()
  return null
}

export function guardarVerificacionPendiente(rol, correo) {
  const normalizado = typeof correo === 'string' ? correo.trim().toLowerCase() : ''
  if (!['usuario', 'clinica'].includes(rol) || typeof correo !== 'string' ||
      normalizado.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizado)) return false
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify({ rol, correo: normalizado, creadaEn: Date.now() }))
    return true
  } catch { return false }
}
