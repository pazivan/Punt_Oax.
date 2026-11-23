// Funciones compartidas de la vista mapa/listado y la ficha.
export const OAXACA = [17.0654, -96.7236]

export function coordenadas(centro) {
  const lat = Number(centro?.latitud)
  const lng = Number(centro?.longitud)
  return centro?.latitud != null && centro?.longitud != null &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 ? [lat, lng] : null
}

// Solo se dibuja un marcador cuando la API confirma la ubicación fija y verificada.
export function ubicacionConfirmada(centro) {
  return centro?.ubicacion_confirmada === true && coordenadas(centro) !== null
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

/**
 * Normaliza un nombre de municipio para agrupar variantes con distinta capitalización o tildes
 * (por ejemplo, "Oaxaca de Juárez" y "Oaxaca de juarez") sin alterar los datos originales.
 */
export function claveMunicipioNormalizada(municipio) {
  if (typeof municipio !== 'string') return ''
  return municipio
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('es')
}

/**
 * Clasifica el tipo de servicio real registrado de un centro para los marcadores del mapa:
 * 'its' | 'ile' | 'ambos'. No inventa servicios no presentes.
 */
export function clasificarServicioCentro(centro) {
  const categorias = Array.isArray(centro?.categorias) ? centro.categorias : []
  const servicios = Array.isArray(centro?.servicios) ? centro.servicios : []
  const textoServicios = typeof centro?.servicios_texto === 'string' ? centro.servicios_texto : ''

  const tieneAmbosExplicitos = categorias.some((cat) => String(cat).toLowerCase() === 'ambos')
  const tieneIts =
    categorias.some((cat) => String(cat).toLowerCase() === 'its') ||
    servicios.some((srv) => /\b(its|vih|s[ií]filis|vhc|vph|clamidia|gonorrea)\b/i.test(String(srv))) ||
    /\b(its|vih|s[ií]filis|vhc|vph)\b/i.test(textoServicios)
  const tieneIle =
    categorias.some((cat) => ['aborto', 'ile'].includes(String(cat).toLowerCase())) ||
    servicios.some((srv) => /\b(ile|aborto|ameu)\b|interrupci[oó]n/i.test(String(srv))) ||
    /\b(ile|aborto|ameu)\b|interrupci[oó]n/i.test(textoServicios)

  if (tieneAmbosExplicitos || (tieneIts && tieneIle)) return 'ambos'
  if (tieneIle) return 'ile'
  return 'its'
}
