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

export const RUTAS_PUBLICAS = [
  '/',
  '/conocenos',
  '/mapa',
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
