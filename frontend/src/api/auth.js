import {
  emitirEventoSesionExpirada,
  limpiarActividadLocal,
  registrarActividadLocal,
} from '../utils/sesionInactividad.js'

function mensajeError(estado) {
  if (estado === 400) return 'Revisa los datos enviados e inténtalo de nuevo.'
  if (estado === 401) return 'Correo o contraseña incorrectos.'
  if (estado === 403) return 'No tienes permisos para realizar esta acción.'
  if (estado === 409) return 'Este correo ya está registrado.'
  return `Error del servidor (${estado}). Inténtalo más tarde.`
}

async function leerRespuesta(respuesta) {
  let contenido
  try {
    contenido = await respuesta.json()
  } catch {
    contenido = null
  }

  if (!respuesta.ok) {
    const error = new Error(typeof contenido?.error === 'string' && contenido.error.trim()
      ? contenido.error
      : mensajeError(respuesta.status))
    error.status = respuesta.status
    error.esTemporal = respuesta.status >= 500
    if (contenido && typeof contenido === 'object') {
      error.campos = contenido.campos
      error.codigo = contenido.codigo
      error.requiere_verificacion = contenido.requiere_verificacion
      error.faltantes = contenido.faltantes
    }
    throw error
  }
  if (!contenido || typeof contenido !== 'object' || Array.isArray(contenido)) {
    throw new Error('El servidor devolvió una respuesta no válida. Inténtalo de nuevo.')
  }
  return contenido
}

async function enviarAuth(ruta, datos) {
  let respuesta

  try {
    respuesta = await fetch(ruta, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
    })
  } catch {
    const error = new Error('No se pudo conectar con el servidor.')
    error.esRed = true
    error.esTemporal = true
    error.codigo = 'ERROR_CONEXION'
    throw error
  }

  return leerRespuesta(respuesta)
}

export function registrarUsuario(correo, password) {
  return enviarAuth('/api/auth/registro-usuario', { correo, password })
}

// El registro de clínica solo crea la cuenta de acceso.
// Los datos institucionales se capturan después en /mi-clinica.
export function registrarClinica(datos) {
  return enviarAuth('/api/auth/registro-clinica', datos)
}

export function iniciarSesion(correo, password) {
  return enviarAuth('/api/auth/login-usuario', { correo, password })
}

export function iniciarSesionClinica(correo, password) {
  return enviarAuth('/api/auth/login-clinica', { correo, password })
}

export function iniciarSesionAdmin(correo, password) {
  return enviarAuth('/api/auth/login-admin', { correo, password })
}
export const verificarCorreo = (rol, correo, codigo) => enviarAuth('/api/auth/verificar-correo', { rol, correo, codigo })
export const reenviarVerificacion = (rol, correo) => enviarAuth('/api/auth/reenviar-verificacion', { rol, correo })
export const solicitarRecuperacion = (rol, correo) => enviarAuth('/api/auth/solicitar-recuperacion', { rol, correo })
export const restablecerPassword = (rol, correo, token, password) =>
  enviarAuth('/api/auth/restablecer-password', { rol, correo, token, password })

// El almacenamiento de la sesión queda concentrado aquí para poder sustituirlo.
const CLAVE_SESION = 'puntoax-sesion'
const CLAVE_MIGRACION = 'puntoax-sesion-compartida'

export function leerSesion() {
  try {
    let valor = localStorage.getItem(CLAVE_SESION)
    // Migración de las sesiones existentes. La marca evita resucitar una copia
    // vieja de sessionStorage después de cerrar sesión en otra pestaña.
    if (!valor && !localStorage.getItem(CLAVE_MIGRACION)) {
      const anterior = sessionStorage.getItem(CLAVE_SESION)
      const sesionAnterior = validarSesion(anterior)
      if (sesionAnterior) {
        localStorage.setItem(CLAVE_SESION, JSON.stringify(sesionAnterior))
        valor = localStorage.getItem(CLAVE_SESION)
        localStorage.setItem(CLAVE_MIGRACION, '1')
      }
    }
    sessionStorage.removeItem(CLAVE_SESION)
    return validarSesion(valor)
  } catch {
    return null
  }
}

function validarSesion(valor) {
  try {
    const sesion = JSON.parse(valor)
    return sesion && typeof sesion.token === 'string' && sesion.token &&
      ['usuario', 'clinica', 'administrador'].includes(sesion.tipo) &&
      sesion.cuenta && typeof sesion.cuenta === 'object' && !Array.isArray(sesion.cuenta)
      ? sesion : null
  } catch { return null }
}

export function guardarSesion(respuesta, tipo) {
  if (!respuesta || !['usuario', 'clinica', 'administrador'].includes(tipo)) {
    throw new Error('La respuesta de inicio de sesión no es válida.')
  }
  const cuenta = tipo === 'clinica' ? respuesta.clinica : tipo === 'administrador' ? respuesta.admin : respuesta.usuario
  if (typeof respuesta.token !== 'string' || !respuesta.token || !cuenta ||
      typeof cuenta !== 'object' || Array.isArray(cuenta)) {
    throw new Error('La respuesta de inicio de sesión no es válida.')
  }
  const ahora = Date.now()
  const sesion = {
    token: respuesta.token,
    cuenta,
    tipo,
    iniciada_en: ahora,
    ...(respuesta.sesion_politica ? { politica: respuesta.sesion_politica } : {}),
  }
  try {
    localStorage.setItem(CLAVE_MIGRACION, '1')
    localStorage.setItem(CLAVE_SESION, JSON.stringify(sesion))
    sessionStorage.removeItem(CLAVE_SESION)
    registrarActividadLocal(ahora)
  } catch {
    throw new Error('No se pudo guardar la sesión en este navegador.')
  }
  return sesion
}

export function actualizarPoliticaSesionLocal(politica) {
  if (!politica || typeof politica !== 'object') return
  try {
    const sesion = leerSesion()
    if (!sesion) return
    localStorage.setItem(CLAVE_SESION, JSON.stringify({ ...sesion, politica }))
  } catch { /* ignorar error de almacenamiento local */ }
}

let cacheCitas = { token: null, ts: 0, promesa: null, resultado: null }
const TTL_CITAS_MS = 10000

export function invalidarCacheCitas() {
  cacheCitas = { token: null, ts: 0, promesa: null, resultado: null }
}

export function cerrarSesion() {
  invalidarCacheCitas()
  limpiarActividadLocal()
  try {
    localStorage.setItem(CLAVE_MIGRACION, '1')
    localStorage.removeItem(CLAVE_SESION)
  } finally {
    sessionStorage.removeItem(CLAVE_SESION)
  }
}

export async function revocarSesion(token = leerSesion()?.token) {
  if (!token) return true
  const controlador = new AbortController()
  const plazo = setTimeout(() => controlador.abort(), 8000)
  try {
    const respuesta = await fetch('/api/auth/cerrar-sesion', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal: controlador.signal,
    })
    return respuesta.ok || respuesta.status === 401 || respuesta.status === 403
  } catch { return false }
  finally { clearTimeout(plazo) }
}

const CODIGOS_SESION_INVALIDA = [
  'TOKEN_EXPIRADO',
  'TOKEN_INVALIDO',
  'SESION_INVALIDA',
  'SESION_REVOCADA',
  'SESION_EXPIRADA_INACTIVIDAD',
  'SESION_EXPIRADA_ABSOLUTA',
  'CUENTA_DESACTIVADA',
]

export async function enviarConSesion(ruta, opciones = {}) {
  const token = leerSesion()?.token
  if (!token) {
    const error = new Error('Inicia sesión para continuar.')
    error.status = 401
    error.codigo = 'SESION_REQUERIDA'
    throw error
  }

  const { segundoPlano = false, ...opcionesFetch } = opciones || {}

  let respuesta
  try {
    respuesta = await fetch(ruta, {
      ...opcionesFetch,
      method: opcionesFetch.method || 'GET',
      headers: {
        ...(opcionesFetch.headers || {}),
        ...(segundoPlano ? { 'X-Puntoax-Background': '1' } : {}),
        Authorization: `Bearer ${token}`,
      },
    })
  } catch {
    const error = new Error('No se pudo conectar con el servidor.')
    error.esRed = true
    error.esTemporal = true
    error.codigo = 'ERROR_CONEXION'
    throw error
  }

  try {
    const datos = await leerRespuesta(respuesta)
    if (!segundoPlano) registrarActividadLocal(Date.now())
    if (datos?.sesion_politica) actualizarPoliticaSesionLocal(datos.sesion_politica)
    return datos
  } catch (error) {
    // La falta de permisos o el estado de la clínica no invalidan la sesión.
    // Solo las respuestas que indican credenciales inválidas o expiradas la cierran.
    if ((respuesta.status === 401 ||
        (respuesta.status === 403 && CODIGOS_SESION_INVALIDA.includes(error.codigo))) &&
        leerSesion()?.token === token) {
      cerrarSesion()
      emitirEventoSesionExpirada(error.codigo || 'SESION_EXPIRADA', error.message)
    }
    throw error
  }
}

export async function consultarPerfil({ segundoPlano = false } = {}) {
  return enviarConSesion('/api/auth/perfil', segundoPlano ? { segundoPlano: true } : undefined)
}

export async function registrarActividadSesion() {
  return enviarConSesion('/api/auth/actividad', { method: 'POST' })
}

export async function consultarClinicasCatalogo({ signal } = {}) {
  const token = leerSesion()?.token
  if (!token) {
    const error = new Error('Inicia sesión para consultar el mapa de centros.')
    error.status = 401
    error.codigo = 'SESION_REQUERIDA'
    throw error
  }

  let respuesta
  try {
    respuesta = await fetch('/api/clinicas', {
      method: 'GET',
      signal,
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch (err) {
    if (err?.name === 'AbortError') throw err
    const error = new Error('No se pudieron cargar las clínicas. Revisa que el servidor Node esté activo.')
    error.esRed = true
    error.esTemporal = true
    error.codigo = 'ERROR_CONEXION'
    throw error
  }

  if (!respuesta.ok) {
    let contenido
    try { contenido = await respuesta.json() } catch { contenido = null }
    const error = new Error(
      typeof contenido?.error === 'string' && contenido.error.trim()
        ? contenido.error
        : `El servidor respondió con estado ${respuesta.status}`
    )
    error.status = respuesta.status
    error.codigo = contenido?.codigo
    error.esTemporal = respuesta.status >= 500
    if ((respuesta.status === 401 ||
        (respuesta.status === 403 && CODIGOS_SESION_INVALIDA.includes(error.codigo))) &&
        leerSesion()?.token === token) {
      cerrarSesion()
      emitirEventoSesionExpirada(error.codigo || 'SESION_EXPIRADA', error.message)
    }
    throw error
  }

  const datos = await respuesta.json()
  registrarActividadLocal(Date.now())
  return Array.isArray(datos) ? datos : []
}

export async function actualizarPerfilUsuario({ nombre, apellidos, telefono } = {}) {
  const respuesta = await enviarConSesion('/api/auth/perfil', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre, apellidos, telefono }),
  })
  if (respuesta?.usuario) {
    try {
      const sesion = leerSesion()
      if (sesion?.tipo === 'usuario') {
        localStorage.setItem(CLAVE_SESION, JSON.stringify({
          ...sesion,
          cuenta: { ...sesion.cuenta, ...respuesta.usuario },
        }))
      }
    } catch { /* ignorar error de almacenamiento local */ }
  }
  return respuesta
}

// Las citas se filtran en el servidor con el id de la clínica autenticada.
export function consultarCitasClinica() {
  return enviarConSesion('/api/clinicas/mi-citas')
}

export const consultarAgendaClinica = () => enviarConSesion('/api/clinicas/mi-agenda')
export const guardarHorariosAgenda = (horarios) => enviarConSesion('/api/clinicas/mi-agenda/horarios', {
  method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ horarios }),
})
export const crearCupoClinica = (datos) => enviarConSesion('/api/clinicas/mi-agenda/espacios', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos),
})
export const cambiarCupoClinica = (id, habilitado) => enviarConSesion(`/api/clinicas/mi-agenda/espacios/${encodeURIComponent(id)}`, {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ habilitado }),
})
export const bloquearDiaClinica = (fecha) => enviarConSesion('/api/clinicas/mi-agenda/bloqueos', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fecha }),
})

// Citas del paciente autenticado: el servidor filtra por su JWT.
// Deduplica solicitudes simultáneas y reutiliza respuesta reciente para acelerar Inicio/Campana.
export function consultarCitasUsuario({ forzar = false, segundoPlano = false } = {}) {
  const token = leerSesion()?.token || null
  const ahora = Date.now()
  if (!forzar && token && cacheCitas.token === token) {
    if (cacheCitas.promesa) return cacheCitas.promesa
    if (cacheCitas.resultado && ahora - cacheCitas.ts < TTL_CITAS_MS) {
      return Promise.resolve(cacheCitas.resultado)
    }
  }
  const promesa = enviarConSesion('/api/citas', segundoPlano ? { segundoPlano: true } : undefined)
    .then((datos) => {
      cacheCitas = { token, ts: Date.now(), promesa: null, resultado: datos }
      return datos
    })
    .catch((err) => {
      if (cacheCitas.promesa === promesa) cacheCitas.promesa = null
      throw err
    })
  cacheCitas = { token, ts: ahora, promesa, resultado: null }
  return promesa
}

export async function cancelarCitaUsuario(idCita) {
  const respuesta = await enviarConSesion(`/api/citas/${encodeURIComponent(idCita)}/cancelar`, {
    method: 'PATCH',
  })
  invalidarCacheCitas()
  return respuesta
}

// La clínica solo puede operar sobre citas de sus propios servicios (lo valida el servidor).
export function actualizarEstadoCitaClinica(idCita, estado) {
  return enviarConSesion(`/api/citas/${encodeURIComponent(idCita)}/estado`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ estado }),
  })
}

// Horarios reservables de una sede y confirmación de la cita (Sprint 6).
export function consultarEspaciosClinica(idClinica, { desde, hasta, incluirEstado = false } = {}) {
  const parametros = new URLSearchParams()
  if (desde) parametros.set('desde', desde)
  if (hasta) parametros.set('hasta', hasta)
  if (incluirEstado) parametros.set('incluir_estado', '1')
  const consulta = parametros.toString()
  return enviarConSesion(
    `/api/clinicas/${encodeURIComponent(idClinica)}/espacios${consulta ? `?${consulta}` : ''}`
  )
}

export async function solicitarCita(idEspacio, datosContacto = {}) {
  const cuerpo = { id_espacio: idEspacio }
  if (typeof datosContacto?.telefono === 'string' && datosContacto.telefono.trim()) {
    cuerpo.telefono = datosContacto.telefono.trim()
  }
  if (typeof datosContacto?.nombre === 'string' && datosContacto.nombre.trim()) {
    cuerpo.nombre = datosContacto.nombre.trim()
  }
  if (typeof datosContacto?.apellidos === 'string' && datosContacto.apellidos.trim()) {
    cuerpo.apellidos = datosContacto.apellidos.trim()
  }
  const respuesta = await enviarConSesion('/api/citas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  })
  invalidarCacheCitas()
  return respuesta
}

export function consultarMiFicha() {
  return enviarConSesion('/api/clinicas/mi-ficha')
}

export function guardarBorradorClinica(datos) {
  return enviarConSesion('/api/clinicas/mi-ficha', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
  })
}

export function guardarEnlacesInformacion(enlaces) {
  return enviarConSesion('/api/clinicas/mi-ficha/enlaces', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enlaces }),
  })
}

export function solicitarCambioUbicacionClinica({ latitud, longitud }) {
  return enviarConSesion('/api/clinicas/mi-ficha/ubicacion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latitud, longitud }),
  })
}

export function solicitarActualizacionClinica(datos) {
  return enviarConSesion('/api/clinicas/mi-ficha/solicitud-actualizacion', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
  })
}

export function consultarMisSolicitudesClinica() {
  return enviarConSesion('/api/clinicas/mi-ficha/solicitudes')
}

export async function subirDocumentosClinica(archivos) {
  const formulario = new FormData()
  for (const archivo of archivos) formulario.append('documentos', archivo)
  return enviarConSesion('/api/clinicas/mi-ficha/documentos', {
    method: 'POST',
    body: formulario,
  })
}

export function eliminarDocumentoClinica(idDocumento) {
  return enviarConSesion(`/api/clinicas/mi-ficha/documentos/${idDocumento}`, {
    method: 'DELETE',
  })
}

export function enviarPostulacionClinica() {
  return enviarConSesion('/api/clinicas/mi-ficha/postulacion', { method: 'POST' })
}

export function consultarMiPostulacion() {
  return enviarConSesion('/api/clinicas/mi-postulacion')
}
