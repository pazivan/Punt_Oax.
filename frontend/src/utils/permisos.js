export const ROLES = {
  USUARIO: 'usuario',
  CLINICA: 'clinica',
  ADMINISTRADOR: 'administrador',
}

export const ESTADOS_CLINICA = {
  BORRADOR: 'borrador',
  PENDIENTE: 'pendiente',
  APROBADA: 'aprobada',
  RECHAZADA: 'rechazada',
  SUSPENDIDA: 'suspendida',
}

// /mapa ya no es público: requiere cuenta registrada y sesión válida.
export const RUTAS_PUBLICAS = [
  '/',
  '/conocenos',
  '/informacion-util',
  '/login',
  '/registro',
  '/verificar-correo',
  '/recuperar',
  '/restablecer',
]

/**
 * Determina si la clínica está aprobada usando primero el perfil verificado en el servidor.
 */
export function esClinicaAprobada(perfil, sesion) {
  if (perfil?.estado_publicacion) {
    return perfil.estado_publicacion === ESTADOS_CLINICA.APROBADA
  }
  return sesion?.cuenta?.estado_publicacion === ESTADOS_CLINICA.APROBADA
}

/**
 * Obtiene la ruta de inicio autorizada según el rol y estado de la cuenta.
 */
export function obtenerDestinoPorRol(perfil, sesion) {
  const rol = perfil?.rol || sesion?.tipo
  if (!rol) return '/login'
  if (rol === ROLES.ADMINISTRADOR) return '/admin'
  if (rol === ROLES.CLINICA) {
    return esClinicaAprobada(perfil, sesion) ? '/panel-clinica' : '/mi-clinica'
  }
  if (rol === ROLES.USUARIO) return '/inicio'
  return '/login'
}

/**
 * Valida que una ruta de retorno post-login sea interna, segura y permitida para el rol.
 */
export function obtenerDestinoPostLogin(destinoSolicitado, perfil, sesion) {
  const porDefecto = obtenerDestinoPorRol(perfil, sesion)
  if (typeof destinoSolicitado !== 'string') return porDefecto
  const limpia = destinoSolicitado.trim()
  if (!limpia.startsWith('/') || limpia.startsWith('//') || limpia.startsWith('/\\')) {
    return porDefecto
  }

  const [pathname] = limpia.split('?')
  const rol = perfil?.rol || sesion?.tipo
  if (!rol) return porDefecto

  if (pathname === '/mapa') {
    if (rol === ROLES.ADMINISTRADOR) return '/admin/mapa'
    return limpia
  }

  if (rol === ROLES.USUARIO) {
    if (['/inicio', '/agendar-cita', '/mis-citas', '/mi-perfil', '/informacion-util', '/conocenos'].includes(pathname)) {
      return limpia
    }
    return porDefecto
  }

  if (rol === ROLES.CLINICA) {
    const permitidas = esClinicaAprobada(perfil, sesion)
      ? ['/panel-clinica', '/mi-clinica', '/mi-clinica/citas', '/mi-clinica/agenda', '/mi-perfil', '/informacion-util', '/conocenos']
      : ['/mi-clinica', '/mi-perfil', '/informacion-util', '/conocenos']
    return permitidas.includes(pathname) ? limpia : porDefecto
  }

  if (rol === ROLES.ADMINISTRADOR) {
    if (pathname === '/admin' || pathname.startsWith('/admin/')) return limpia
    return porDefecto
  }

  return porDefecto
}
