/**
 * Coordinador ligero de paneles superpuestos en interfaz (menú móvil,
 * notificaciones, modales y asistente IA) y bloqueo seguro del scroll de fondo.
 */

const capasActivas = new Set()
const oyentes = new Set()
const oyentesCierre = new Map()
let bloqueosScroll = 0
let overflowOriginalBody = ''
let overflowOriginalHtml = ''

function emitirCambio() {
  const snapshot = new Set(capasActivas)
  for (const fn of oyentes) {
    try { fn(snapshot) } catch { /* aislar errores de suscriptores */ }
  }
}

export function establecerCapaActiva(nombre, abierta) {
  if (!nombre) return
  if (abierta) {
    capasActivas.add(nombre)
  } else {
    capasActivas.delete(nombre)
  }
  emitirCambio()
}

export function registrarCierreCapa(nombre, cerrarFn) {
  if (!nombre || typeof cerrarFn !== 'function') return () => {}
  oyentesCierre.set(nombre, cerrarFn)
  return () => {
    if (oyentesCierre.get(nombre) === cerrarFn) {
      oyentesCierre.delete(nombre)
    }
  }
}

export function cerrarOtrasCapas(exceptoNombre) {
  for (const [nombre, cerrarFn] of oyentesCierre.entries()) {
    if (nombre !== exceptoNombre && capasActivas.has(nombre)) {
      try { cerrarFn() } catch { /* ignorar */ }
    }
  }
}

export function hayCapaBloqueandoAsistente() {
  for (const capa of capasActivas) {
    if (capa !== 'asistente') return true
  }
  return false
}

export function suscribirCapasUI(listener) {
  if (typeof listener !== 'function') return () => {}
  oyentes.add(listener)
  return () => oyentes.delete(listener)
}

export function bloquearScrollFondo() {
  if (typeof document === 'undefined') return () => {}
  if (bloqueosScroll === 0) {
    overflowOriginalBody = document.body.style.overflow
    overflowOriginalHtml = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
  }
  bloqueosScroll += 1

  let liberado = false
  return () => {
    if (liberado) return
    liberado = true
    bloqueosScroll = Math.max(0, bloqueosScroll - 1)
    if (bloqueosScroll === 0) {
      document.body.style.overflow = overflowOriginalBody
      document.documentElement.style.overflow = overflowOriginalHtml
    }
  }
}
