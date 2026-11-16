// Sprint 7 · Contratos acordados en backend/adminClinicas.js (Kelly).
import { cerrarSesion, enviarConSesion, leerSesion } from './auth.js'

export function consultarSolicitudesAdmin(estado = 'todas') {
  return enviarConSesion(`/api/admin/solicitudes?estado=${encodeURIComponent(estado)}`)
}

export function consultarSolicitudAdmin(idSolicitud) {
  return enviarConSesion(`/api/admin/solicitudes/${encodeURIComponent(idSolicitud)}`)
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
