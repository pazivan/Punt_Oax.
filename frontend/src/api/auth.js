function mensajeError(estado) {
  if (estado === 400) return 'Revisa los datos enviados e inténtalo de nuevo.'
  if (estado === 401) return 'Correo o contraseña incorrectos.'
  if (estado === 403) return 'Acceso denegado o sesión caducada.'
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
    if (contenido && typeof contenido === 'object') {
      error.campos = contenido.campos
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
    throw new Error('No se pudo conectar con el servidor.')
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
  const sesion = { token: respuesta.token, cuenta, tipo }
  try {
    localStorage.setItem(CLAVE_MIGRACION, '1')
    localStorage.setItem(CLAVE_SESION, JSON.stringify(sesion))
    sessionStorage.removeItem(CLAVE_SESION)
  } catch {
    throw new Error('No se pudo guardar la sesión en este navegador.')
  }
  return sesion
}

export function cerrarSesion() {
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

export async function enviarConSesion(ruta, opciones = {}) {
  const token = leerSesion()?.token
  if (!token) throw new Error('Inicia sesión para continuar.')

  let respuesta
  try {
    respuesta = await fetch(ruta, {
      ...opciones,
      method: opciones.method || 'GET',
      headers: {
        ...(opciones.headers || {}),
        Authorization: `Bearer ${token}`,
      },
    })
  } catch {
    throw new Error('No se pudo conectar con el servidor.')
  }

  if ((respuesta.status === 401 || respuesta.status === 403) && leerSesion()?.token === token) {
    cerrarSesion()
  }
  return leerRespuesta(respuesta)
}

export async function consultarPerfil() {
  return enviarConSesion('/api/auth/perfil')
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
export function consultarCitasUsuario() {
  return enviarConSesion('/api/citas')
}

export function cancelarCitaUsuario(idCita) {
  return enviarConSesion(`/api/citas/${encodeURIComponent(idCita)}/cancelar`, {
    method: 'PATCH',
  })
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
export function consultarEspaciosClinica(idClinica, { desde, hasta } = {}) {  const parametros = new URLSearchParams()
  if (desde) parametros.set('desde', desde)
  if (hasta) parametros.set('hasta', hasta)
  const consulta = parametros.toString()
  return enviarConSesion(
    `/api/clinicas/${encodeURIComponent(idClinica)}/espacios${consulta ? `?${consulta}` : ''}`
  )
}

export function solicitarCita(idEspacio) {
  return enviarConSesion('/api/citas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id_espacio: idEspacio }),
  })
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
