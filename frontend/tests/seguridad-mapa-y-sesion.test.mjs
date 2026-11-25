import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ROLES,
  RUTAS_PUBLICAS,
  obtenerDestinoPostLogin,
} from '../src/utils/permisos.js'
import {
  evaluarEstadoInactividad,
  obtenerConfiguracionSesionCliente,
} from '../src/utils/sesionInactividad.js'
import {
  cerrarOtrasCapas,
  establecerCapaActiva,
  hayCapaBloqueandoAsistente,
  registrarCierreCapa,
} from '../src/utils/uiOverlays.js'
import {
  cerrarSesion,
  consultarPerfil,
  guardarSesion,
  leerSesion,
} from '../src/api/auth.js'

const almacen = new Map()
const compartido = new Map()
globalThis.sessionStorage = {
  getItem: (k) => almacen.get(k) ?? null,
  setItem: (k, v) => almacen.set(k, v),
  removeItem: (k) => almacen.delete(k),
}
globalThis.localStorage = {
  getItem: (k) => compartido.get(k) ?? null,
  setItem: (k, v) => compartido.set(k, v),
  removeItem: (k) => compartido.delete(k),
}

test('/mapa no es ruta pública y obtenerDestinoPostLogin respeta roles y previene open redirects', () => {
  assert.equal(RUTAS_PUBLICAS.includes('/mapa'), false)
  assert.equal(RUTAS_PUBLICAS.includes('/conocenos'), true)
  assert.equal(RUTAS_PUBLICAS.includes('/informacion-util'), true)

  const sesionUsuario = { tipo: ROLES.USUARIO, cuenta: {} }
  const sesionClinica = { tipo: ROLES.CLINICA, cuenta: { estado_publicacion: 'aprobada' } }
  const sesionAdmin = { tipo: ROLES.ADMINISTRADOR, cuenta: {} }

  assert.equal(obtenerDestinoPostLogin('/mapa', null, sesionUsuario), '/mapa')
  assert.equal(obtenerDestinoPostLogin('/mapa?centro=abc-123', null, sesionUsuario), '/mapa?centro=abc-123')
  assert.equal(obtenerDestinoPostLogin('/mapa', null, sesionClinica), '/mapa')
  assert.equal(obtenerDestinoPostLogin('/mapa', null, sesionAdmin), '/admin/mapa')

  // Bloqueo de escalada de roles y open redirects
  assert.equal(obtenerDestinoPostLogin('/admin', null, sesionUsuario), '/inicio')
  assert.equal(obtenerDestinoPostLogin('/agendar-cita', null, sesionClinica), '/panel-clinica')
  assert.equal(obtenerDestinoPostLogin('//malicioso.test/phish', null, sesionUsuario), '/inicio')
  assert.equal(obtenerDestinoPostLogin('https://malicioso.test', null, sesionUsuario), '/inicio')
})

test('control de inactividad evalúa correctamente estado activo, advertencia de 60 s, 15 min y 8 h', () => {
  const cfg = obtenerConfiguracionSesionCliente(null, {})
  assert.equal(cfg.inactividadMs, 15 * 60 * 1000)
  assert.equal(cfg.advertenciaMs, 60 * 1000)
  assert.equal(cfg.absolutaMs, 8 * 60 * 60 * 1000)

  const base = 1_700_000_000_000
  // A los 10 minutos -> activa
  assert.equal(
    evaluarEstadoInactividad({
      ahoraMs: base + 10 * 60 * 1000,
      ultimaActividadMs: base,
      iniciadaEnMs: base,
      ...cfg,
    }).estado,
    'activa'
  )

  // A los 14 min 15 s -> advertencia (45 s restantes)
  const adv = evaluarEstadoInactividad({
    ahoraMs: base + 14 * 60 * 1000 + 15 * 1000,
    ultimaActividadMs: base,
    iniciadaEnMs: base,
    ...cfg,
  })
  assert.equal(adv.estado, 'advertencia')
  assert.equal(adv.segundosRestantes, 45)

  // A los 15 min exactos -> expirada_inactividad
  assert.equal(
    evaluarEstadoInactividad({
      ahoraMs: base + 15 * 60 * 1000,
      ultimaActividadMs: base,
      iniciadaEnMs: base,
      ...cfg,
    }).estado,
    'expirada_inactividad'
  )

  // A las 8 horas con actividad reciente -> expirada_absoluta
  assert.equal(
    evaluarEstadoInactividad({
      ahoraMs: base + 8 * 60 * 60 * 1000,
      ultimaActividadMs: base + 8 * 60 * 60 * 1000 - 10_000,
      iniciadaEnMs: base,
      ...cfg,
    }).estado,
    'expirada_absoluta'
  )
})

test('consultarPerfil en segundo plano envía cabecera X-Puntoax-Background y 401 limpia sesión', async () => {
  guardarSesion({ token: 'jwt-activo', usuario: { id: 'u1' } }, 'usuario')
  let cabeceraRecibida = null
  globalThis.fetch = async (_ruta, opciones) => {
    cabeceraRecibida = opciones.headers['X-Puntoax-Background']
    return {
      status: 200,
      ok: true,
      json: async () => ({ usuarioAutenticado: { rol: 'usuario' } }),
    }
  }
  await consultarPerfil({ segundoPlano: true })
  assert.equal(cabeceraRecibida, '1')

  globalThis.fetch = async () => ({
    status: 401,
    ok: false,
    json: async () => ({ error: 'Tu sesión expiró por inactividad.', codigo: 'SESION_EXPIRADA_INACTIVIDAD' }),
  })
  await assert.rejects(consultarPerfil({ segundoPlano: true }), /inactividad/)
  assert.equal(leerSesion(), null)
  cerrarSesion()
})

test('uiOverlays coordina ocultamiento del asistente y cierre exclusivo de paneles', () => {
  let cerroNotif = false
  const limpiarNotif = registrarCierreCapa('notificaciones', () => {
    cerroNotif = true
    establecerCapaActiva('notificaciones', false)
  })

  establecerCapaActiva('notificaciones', true)
  assert.equal(hayCapaBloqueandoAsistente(), true)

  establecerCapaActiva('menu-movil', true)
  cerrarOtrasCapas('menu-movil')
  assert.equal(cerroNotif, true)
  assert.equal(hayCapaBloqueandoAsistente(), true)

  establecerCapaActiva('menu-movil', false)
  assert.equal(hayCapaBloqueandoAsistente(), false)

  limpiarNotif()
})
