/**
 * Control de expiración por inactividad y duración absoluta en cliente.
 * Complementa la validación obligatoria en el backend y sincroniza actividad entre pestañas.
 */

export const CLAVE_ULTIMA_ACTIVIDAD = 'puntoax-ultima-actividad'
export const EVENTO_SESION_EXPIRADA = 'puntoax:sesion-expirada'

const INACTIVIDAD_DEFAULT_MS = 15 * 60 * 1000 // 15 minutos
const ADVERTENCIA_DEFAULT_MS = 60 * 1000 // 60 segundos
const ABSOLUTA_DEFAULT_MS = 8 * 60 * 60 * 1000 // 8 horas

function leerPositivo(valor, fallback) {
  if (valor === undefined || valor === null || String(valor).trim() === '') return fallback
  const n = Number(valor)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function leerEnvVite() {
  try {
    return (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {}
  } catch {
    return {}
  }
}

export function obtenerConfiguracionSesionCliente(politicaServidor = null, envOverride = null) {
  const env = envOverride || leerEnvVite()

  const inactividadEnv = env.VITE_SESSION_IDLE_MS !== undefined
    ? leerPositivo(env.VITE_SESSION_IDLE_MS, INACTIVIDAD_DEFAULT_MS)
    : leerPositivo(env.VITE_SESSION_IDLE_MINUTES, 15) * 60 * 1000

  const advertenciaEnv = env.VITE_SESSION_WARNING_MS !== undefined
    ? leerPositivo(env.VITE_SESSION_WARNING_MS, ADVERTENCIA_DEFAULT_MS)
    : leerPositivo(env.VITE_SESSION_WARNING_SECONDS, 60) * 1000

  const absolutaEnv = env.VITE_SESSION_ABSOLUTE_MS !== undefined
    ? leerPositivo(env.VITE_SESSION_ABSOLUTE_MS, ABSOLUTA_DEFAULT_MS)
    : leerPositivo(env.VITE_SESSION_ABSOLUTE_HOURS, 8) * 60 * 60 * 1000

  const inactividadMs = leerPositivo(politicaServidor?.inactividad_ms, inactividadEnv)
  const advertenciaRaw = leerPositivo(politicaServidor?.advertencia_ms, advertenciaEnv)
  const absolutaMs = leerPositivo(politicaServidor?.absoluta_ms, absolutaEnv)
  const advertenciaMs = Math.min(advertenciaRaw, Math.max(1000, Math.floor(inactividadMs * 0.5)))

  const expiraAbsolutaMs = politicaServidor?.expira_absoluta_en
    ? Date.parse(politicaServidor.expira_absoluta_en)
    : null

  return {
    inactividadMs: Math.round(inactividadMs),
    advertenciaMs: Math.round(advertenciaMs),
    absolutaMs: Math.round(absolutaMs),
    expiraAbsolutaMs: Number.isFinite(expiraAbsolutaMs) ? expiraAbsolutaMs : null,
  }
}

export function leerUltimaActividad(almacenamiento = globalThis.localStorage) {
  try {
    const raw = almacenamiento?.getItem?.(CLAVE_ULTIMA_ACTIVIDAD)
    const num = Number(raw)
    return Number.isFinite(num) && num > 0 ? num : null
  } catch {
    return null
  }
}

export function registrarActividadLocal(ahoraMs = Date.now(), almacenamiento = globalThis.localStorage) {
  try {
    almacenamiento?.setItem?.(CLAVE_ULTIMA_ACTIVIDAD, String(Math.round(ahoraMs)))
  } catch {
    // Ignorar restricciones de almacenamiento
  }
  return Math.round(ahoraMs)
}

export function limpiarActividadLocal(almacenamiento = globalThis.localStorage) {
  try {
    almacenamiento?.removeItem?.(CLAVE_ULTIMA_ACTIVIDAD)
  } catch {
    // Ignorar
  }
}

export function evaluarEstadoInactividad({
  ahoraMs = Date.now(),
  ultimaActividadMs,
  iniciadaEnMs,
  expiraAbsolutaMs = null,
  inactividadMs = INACTIVIDAD_DEFAULT_MS,
  advertenciaMs = ADVERTENCIA_DEFAULT_MS,
  absolutaMs = ABSOLUTA_DEFAULT_MS,
}) {
  const limiteAbsoluto = Number.isFinite(expiraAbsolutaMs) && expiraAbsolutaMs > 0
    ? expiraAbsolutaMs
    : (Number.isFinite(iniciadaEnMs) && iniciadaEnMs > 0 ? iniciadaEnMs + absolutaMs : ahoraMs + absolutaMs)

  if (ahoraMs >= limiteAbsoluto) {
    return { estado: 'expirada_absoluta', segundosRestantes: 0 }
  }

  const baseActividad = Number.isFinite(ultimaActividadMs) && ultimaActividadMs > 0
    ? ultimaActividadMs
    : ahoraMs
  const limiteInactividad = Math.min(baseActividad + inactividadMs, limiteAbsoluto)
  const restanteMs = limiteInactividad - ahoraMs

  if (restanteMs <= 0) {
    return { estado: 'expirada_inactividad', segundosRestantes: 0 }
  }

  if (restanteMs <= advertenciaMs) {
    return {
      estado: 'advertencia',
      segundosRestantes: Math.max(1, Math.ceil(restanteMs / 1000)),
    }
  }

  return {
    estado: 'activa',
    segundosRestantes: Math.ceil(restanteMs / 1000),
  }
}

export function emitirEventoSesionExpirada(codigo, mensaje) {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_SESION_EXPIRADA, {
      detail: { codigo: codigo || 'SESION_EXPIRADA', mensaje: mensaje || '' },
    }))
  } catch {
    // Ignorar entornos sin CustomEvent
  }
}
