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
    throw new Error(typeof contenido?.error === 'string' && contenido.error.trim()
      ? contenido.error
      : mensajeError(respuesta.status))
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

export function iniciarSesion(correo, password) {
  return enviarAuth('/api/auth/login-usuario', { correo, password })
}

export function iniciarSesionClinica(correo, password) {
  return enviarAuth('/api/auth/login-clinica', { correo, password })
}

// El almacenamiento de la sesión queda concentrado aquí para poder sustituirlo.
const CLAVE_SESION = 'puntoax-sesion'

export function leerSesion() {
  try {
    const sesion = JSON.parse(sessionStorage.getItem(CLAVE_SESION))
    return sesion && typeof sesion.token === 'string' && sesion.token &&
      (sesion.tipo === 'usuario' || sesion.tipo === 'clinica') &&
      sesion.cuenta && typeof sesion.cuenta === 'object' && !Array.isArray(sesion.cuenta)
      ? sesion
      : null
  } catch {
    return null
  }
}

export function guardarSesion(respuesta, tipo) {
  if (!respuesta || (tipo !== 'usuario' && tipo !== 'clinica')) {
    throw new Error('La respuesta de inicio de sesión no es válida.')
  }
  const cuenta = tipo === 'clinica' ? respuesta.clinica : respuesta.usuario
  if (typeof respuesta.token !== 'string' || !respuesta.token || !cuenta ||
      typeof cuenta !== 'object' || Array.isArray(cuenta)) {
    throw new Error('La respuesta de inicio de sesión no es válida.')
  }
  const sesion = { token: respuesta.token, cuenta, tipo }
  try {
    sessionStorage.setItem(CLAVE_SESION, JSON.stringify(sesion))
  } catch {
    throw new Error('No se pudo guardar la sesión en este navegador.')
  }
  return sesion
}

export function cerrarSesion() {
  sessionStorage.removeItem(CLAVE_SESION)
}

export async function consultarPerfil() {
  const token = leerSesion()?.token
  if (!token) throw new Error('Inicia sesión para consultar tu perfil.')

  let respuesta
  try {
    respuesta = await fetch('/api/auth/perfil', {
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch {
    throw new Error('No se pudo conectar con el servidor.')
  }

  if ((respuesta.status === 401 || respuesta.status === 403) && leerSesion()?.token === token) {
    cerrarSesion()
  }
  return leerRespuesta(respuesta)
}
