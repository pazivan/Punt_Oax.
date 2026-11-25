// Mensajes para consultas de lectura: nunca mostrar detalles internos del servidor.
export function describirErrorConsulta(error, recurso = 'la información') {
  const codigo = error?.codigo
  const estado = error?.status

  if (codigo === 'ERROR_CONEXION' || error?.esRed) {
    return {
      titulo: 'Sin conexión con el servidor',
      mensaje: 'No pudimos conectarnos. Comprueba tu conexión e inténtalo de nuevo.',
      reintentar: true,
    }
  }
  if (codigo === 'ESQUEMA_INCOMPATIBLE') {
    return {
      titulo: 'Configuración del servidor no disponible',
      mensaje: 'Hay un problema de configuración en el servidor. Contacta al equipo de PuntOax.',
      reintentar: false,
    }
  }
  if (codigo === 'CUENTA_DESACTIVADA') {
    return {
      titulo: 'Cuenta desactivada',
      mensaje: 'Tu cuenta está desactivada. Contacta al equipo de PuntOax.',
      reintentar: false,
    }
  }
  if (codigo === 'CORREO_NO_VERIFICADO') {
    return {
      titulo: 'Correo sin verificar',
      mensaje: 'Verifica tu correo antes de continuar.',
      reintentar: false,
    }
  }
  if (['TOKEN_EXPIRADO', 'TOKEN_INVALIDO', 'SESION_INVALIDA', 'SESION_REVOCADA',
      'SESION_EXPIRADA_INACTIVIDAD', 'SESION_EXPIRADA_ABSOLUTA', 'SESION_REQUERIDA'].includes(codigo) ||
      estado === 401) {
    return {
      titulo: 'Tu sesión ya no está disponible',
      mensaje: codigo === 'SESION_EXPIRADA_INACTIVIDAD'
        ? 'Tu sesión expiró por inactividad. Inicia sesión de nuevo para continuar.'
        : codigo === 'SESION_EXPIRADA_ABSOLUTA'
          ? 'Tu sesión alcanzó la duración máxima permitida. Inicia sesión de nuevo.'
          : 'Inicia sesión de nuevo para continuar.',
      reintentar: false,
    }
  }
  if (estado === 403) {
    return {
      titulo: 'No tienes acceso a esta información',
      mensaje: codigo === 'CLINICA_NO_APROBADA'
        ? 'Tu clínica aún no tiene acceso a esta sección. Consulta el estado de tu ficha.'
        : 'Tu cuenta no tiene permisos para consultar esta sección.',
      reintentar: false,
    }
  }
  if (estado === 404) {
    return {
      titulo: 'Datos no encontrados',
      mensaje: `No encontramos ${recurso}. Puede que ya no esté disponible.`,
      reintentar: false,
    }
  }
  if (estado >= 500 || error?.esTemporal) {
    return {
      titulo: 'Problema temporal del servidor',
      mensaje: 'El servidor no pudo completar la consulta. Inténtalo de nuevo en unos momentos.',
      reintentar: true,
    }
  }
  return {
    titulo: 'No se pudo completar la consulta',
    mensaje: `No pudimos consultar ${recurso}. Contacta al equipo de PuntOax si el problema continúa.`,
    reintentar: false,
  }
}
