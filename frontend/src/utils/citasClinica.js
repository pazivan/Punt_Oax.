export const ZONA_HORARIA = 'America/Mexico_City'

export function nombrePaciente(cita) {
  const nombre = [cita?.paciente_nombre, cita?.paciente_apellidos]
    .filter((parte) => typeof parte === 'string' && parte.trim())
    .join(' ').trim()
  return nombre || 'Paciente sin nombre registrado'
}

export function formatearFechaCita(fecha) {
  if (!fecha) return 'Fecha no registrada'
  const valor = new Date(fecha)
  if (Number.isNaN(valor.getTime())) return 'Fecha no registrada'
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: ZONA_HORARIA,
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(valor)
}

export function folioCita(cita) {
  const id = typeof cita?.id_cita === 'string' ? cita.id_cita : ''
  return id ? id.slice(0, 8).toUpperCase() : 'Sin folio'
}

export const ETIQUETAS_ESTADO = {
  confirmada: 'Confirmada',
  cancelada: 'Cancelada',
  completada: 'Completada',
  no_asistio: 'No asistió',
}

export function esProxima(cita, ahora = Date.now()) {
  const fecha = new Date(cita.fecha_hora_inicio).getTime()
  return cita.estado === 'confirmada' && Number.isFinite(fecha) && fecha >= ahora
}

export function filtrarCitas(citas, filtro, ahora = Date.now()) {
  const lista = Array.isArray(citas) ? citas : []
  const resultado = lista.filter((cita) => {
    if (filtro === 'proximas') return esProxima(cita, ahora)
    if (filtro === 'historial') return !esProxima(cita, ahora)
    return true
  })
  return [...resultado].sort((a, b) => {
    const aFecha = new Date(a.fecha_hora_inicio).getTime()
    const bFecha = new Date(b.fecha_hora_inicio).getTime()
    const aValid = Number.isFinite(aFecha) ? aFecha : 0
    const bValid = Number.isFinite(bFecha) ? bFecha : 0
    // Próximas: la más cercana primero. Historial: la más reciente primero.
    return filtro === 'proximas' ? aValid - bValid : bValid - aValid
  })
}
