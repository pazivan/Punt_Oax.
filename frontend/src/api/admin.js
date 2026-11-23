// Sprint 7 · Contratos acordados en backend/adminClinicas.js (Kelly).
import { cerrarSesion, enviarConSesion, leerSesion } from './auth.js'

export function consultarSolicitudesAdmin(estado = 'todas', { page, limit, q } = {}) {
  const params = new URLSearchParams({ estado })
  if (page !== undefined) params.set('page', String(page))
  if (limit !== undefined) params.set('limit', String(limit))
  if (typeof q === 'string' && q.trim()) params.set('q', q.trim())
  return enviarConSesion(`/api/admin/solicitudes?${params.toString()}`)
}

export function consultarSolicitudAdmin(idSolicitud) {
  return enviarConSesion(`/api/admin/solicitudes/${encodeURIComponent(idSolicitud)}`)
}

// Listado de solo lectura de las cuentas de usuario registradas.
export function consultarUsuariosAdmin({ page, limit, q } = {}) {
  const params = new URLSearchParams()
  if (page !== undefined) params.set('page', String(page))
  if (limit !== undefined) params.set('limit', String(limit))
  if (typeof q === 'string' && q.trim()) params.set('q', q.trim())
  const query = params.toString()
  return enviarConSesion(`/api/admin/usuarios${query ? `?${query}` : ''}`)
}

export function consultarUsuarioAdmin(idUsuario) {
  return enviarConSesion(`/api/admin/usuarios/${encodeURIComponent(idUsuario)}`)
}

export function cambiarEstadoUsuarioAdmin(idUsuario, activo) {
  return enviarConSesion(`/api/admin/usuarios/${encodeURIComponent(idUsuario)}/estado`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ activo }),
  })
}

export function consultarClinicasAdmin(estado = 'todas', { page, limit, q } = {}) {
  const params = new URLSearchParams({ estado })
  if (page !== undefined) params.set('page', String(page))
  if (limit !== undefined) params.set('limit', String(limit))
  if (typeof q === 'string' && q.trim()) params.set('q', q.trim())
  return enviarConSesion(`/api/admin/clinicas?${params.toString()}`)
}

export function consultarClinicaAdmin(idClinica) {
  return enviarConSesion(`/api/admin/clinicas/${encodeURIComponent(idClinica)}`)
}

export function consultarResumenAdmin() {
  return enviarConSesion('/api/admin/resumen')
}

export function consultarCitasAdmin({ estado = 'todas', idClinica = '', q = '', page, limit } = {}) {
  const params = new URLSearchParams({ estado })
  if (idClinica) params.set('id_clinica', idClinica)
  if (typeof q === 'string' && q.trim()) params.set('q', q.trim())
  if (page !== undefined) params.set('page', String(page))
  if (limit !== undefined) params.set('limit', String(limit))
  return enviarConSesion(`/api/admin/citas?${params.toString()}`)
}

export function consultarCalendarioAdmin(idClinica = '', { fecha, page, limit } = {}) {
  const params = new URLSearchParams()
  if (idClinica) params.set('id_clinica', idClinica)
  if (fecha) params.set('fecha', fecha)
  if (page !== undefined) params.set('page', String(page))
  if (limit !== undefined) params.set('limit', String(limit))
  const query = params.toString()
  return enviarConSesion(`/api/admin/calendarios${query ? `?${query}` : ''}`)
}

export function resolverSolicitudAdmin(idSolicitud, decision, observaciones = '') {
  return enviarConSesion(`/api/admin/solicitudes/${encodeURIComponent(idSolicitud)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision, observaciones: observaciones.trim() || null }),
  })
}

export function cambiarVisibilidadAdmin(idClinica, accion) {
  return enviarConSesion(`/api/admin/clinicas/${encodeURIComponent(idClinica)}/visibilidad`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accion }),
  })
}

// Los documentos son privados: no basta abrir una URL en una pestaña nueva,
// hay que enviarla con Authorization: Bearer (y descargar el blob recibido).
export async function descargarDocumentoAdmin(idDocumento) {
  const token = leerSesion()?.token
  if (!token) throw new Error('Inicia sesión para consultar documentos.')
  let respuesta
  try {
    respuesta = await fetch(`/api/admin/documentos/${encodeURIComponent(idDocumento)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch {
    throw new Error('No se pudo conectar con el servidor de documentos.')
  }
  if (!respuesta.ok) {
    if ((respuesta.status === 401 || respuesta.status === 403) && leerSesion()?.token === token) {
      cerrarSesion()
    }
    const datos = await respuesta.json().catch(() => null)
    throw new Error(datos?.error || `No se pudo descargar el documento (${respuesta.status}).`)
  }
  return respuesta.blob()
}
