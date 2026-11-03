// Funciones compartidas de la vista mapa/listado y la ficha.
export const OAXACA = [17.0654, -96.7236]

export function coordenadas(centro) {
  const lat = Number(centro?.latitud)
  const lng = Number(centro?.longitud)
  return centro?.latitud != null && centro?.longitud != null &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 ? [lat, lng] : null
}

export function textoPendiente(valor, texto = 'Por confirmar con el centro') {
  return typeof valor === 'string' && valor.trim() ? valor.trim() : texto
}

export function direccionCompleta(centro) {
  return [centro?.direccion, centro?.localidad, centro?.municipio,
    centro?.codigo_postal ? `C.P. ${centro.codigo_postal}` : null]
    .filter(Boolean).join(', ')
}

export function enlaceComoLlegar(centro) {
  const ubicacion = coordenadas(centro)
  const destino = ubicacion ? ubicacion.join(',') : (centro?.direccion ? direccionCompleta(centro) : '')
  return destino ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destino)}` : null
}

export const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
export function horarioTexto(horarios) {
  if (!Array.isArray(horarios) || horarios.length === 0) return 'Horario por confirmar'
  return horarios.map(h => `${DIAS[Number(h.dia_semana)] ?? 'Día por confirmar'} ${h.apertura}–${h.cierre}`).join(' · ')
}

export function filtrarCentros(centros, { busqueda = '', municipio = '', servicio = '' } = {}) {
  const q = busqueda.trim().toLocaleLowerCase('es')
  return centros.filter(centro => {
    const servicioNombres = Array.isArray(centro.servicios) ? centro.servicios : []
    const coincideTexto = !q || [centro.nombre, centro.municipio, centro.localidad,
      centro.direccion, ...servicioNombres].some(texto => String(texto || '').toLocaleLowerCase('es').includes(q))
    return coincideTexto && (!municipio || centro.municipio === municipio) &&
      (!servicio || servicioNombres.includes(servicio))
  })
}
