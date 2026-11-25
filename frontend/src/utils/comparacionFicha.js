/**
 * Comparación normalizada de la ficha institucional para detectar cambios reales
 * entre la versión aprobada/guardada y los datos editados en el formulario.
 */

const ETIQUETAS_TIPO = {
  publica: 'Institución pública',
  privada: 'Clínica privada',
  ong: 'Organización social (ONG)',
  otra: 'Otra institución',
}

const ETIQUETAS_AREA = {
  its: 'Detección de ITS',
  ile: 'Interrupción Legal del Embarazo (ILE)',
}

const DIAS_NOMBRE = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

export function normalizarTexto(valor) {
  if (typeof valor !== 'string') return ''
  return valor.trim().replace(/\s+/g, ' ')
}

function normalizarCoord(valor) {
  if (valor === null || valor === undefined || valor === '') return null
  const n = Number(valor)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 1e6) / 1e6
}

function normalizarHorarios(horarios) {
  if (!Array.isArray(horarios)) return []
  return horarios
    .map((h) => ({
      dia_semana: Number(h.dia_semana),
      apertura: h.es_24_horas ? '00:00' : normalizarTexto(h.apertura),
      cierre: h.es_24_horas ? '00:00' : normalizarTexto(h.cierre),
      es_24_horas: Boolean(h.es_24_horas),
      cruza_medianoche: Boolean(h.cruza_medianoche) && !h.es_24_horas,
    }))
    .sort((a, b) => a.dia_semana - b.dia_semana || a.apertura.localeCompare(b.apertura) || a.cierre.localeCompare(b.cierre))
}

export function formatearHorariosResumen(horarios) {
  const lista = normalizarHorarios(horarios)
  if (!lista.length) return 'Sin horarios'
  return lista
    .map((h) => {
      const dia = DIAS_NOMBRE[h.dia_semana] || `Día ${h.dia_semana}`
      if (h.es_24_horas) return `${dia}: 24 horas`
      if (h.cruza_medianoche) return `${dia}: ${h.apertura}–${h.cierre} (nocturno)`
      return `${dia}: ${h.apertura}–${h.cierre}`
    })
    .join(' · ')
}

function extraerAreasDesdeFicha(ficha) {
  const mapa = { its: { seleccionado: false, detalle: '' }, ile: { seleccionado: false, detalle: '' } }
  for (const s of ficha?.servicios || []) {
    if (s.categoria in mapa) {
      mapa[s.categoria] = {
        seleccionado: true,
        detalle: normalizarTexto(s.detalle_servicio || s.detalle || ''),
      }
    }
  }
  return mapa
}

function formatearAreas(areasMapa) {
  const activas = ['its', 'ile']
    .filter((cat) => areasMapa?.[cat]?.seleccionado)
    .map((cat) => ETIQUETAS_AREA[cat])
  return activas.length ? activas.join(', ') : 'Sin áreas seleccionadas'
}

/**
 * Compara la ficha aprobada actual contra los datos editados en `form`.
 * Separa cambios de publicación inmediata (`cambiosDirectos`) de cambios que
 * requieren revisión administrativa (`cambiosRevision`).
 */
export function compararFichaConFormulario(ficha, form) {
  if (!ficha?.clinica || !form) {
    return { cambiosDirectos: [], cambiosRevision: [], hayCambiosDirectos: false, hayCambiosRevision: false }
  }

  const clinicaBase = ficha.clinica
  const cambiosDirectos = []
  const cambiosRevision = []

  const revisarTexto = (lista, campo, etiqueta, valBase, valNuevo, formateador = (v) => v || 'No especificado') => {
    const a = normalizarTexto(valBase)
    const b = normalizarTexto(valNuevo)
    if (a !== b) {
      lista.push({
        campo,
        etiqueta,
        valor_anterior: formateador(a),
        valor_nuevo: formateador(b),
        raw_anterior: a || null,
        raw_nuevo: b || null,
      })
    }
  }

  // 1. Campos que requieren revisión administrativa
  revisarTexto(cambiosRevision, 'nombre', 'Nombre institucional', clinicaBase.nombre, form.nombre)
  revisarTexto(
    cambiosRevision,
    'tipo_institucion',
    'Tipo de institución',
    clinicaBase.tipo_institucion,
    form.tipo_institucion,
    (v) => ETIQUETAS_TIPO[v] || v || 'No especificado'
  )
  revisarTexto(cambiosRevision, 'municipio', 'Municipio', clinicaBase.municipio, form.municipio)
  if (form.municipio_clave && form.municipio_clave !== clinicaBase.municipio_clave &&
      normalizarTexto(clinicaBase.municipio) === normalizarTexto(form.municipio)) {
    revisarTexto(cambiosRevision, 'municipio_clave', 'Clave de municipio INEGI', clinicaBase.municipio_clave, form.municipio_clave)
  }
  revisarTexto(cambiosRevision, 'codigo_postal', 'Código postal', clinicaBase.codigo_postal, form.codigo_postal)
  revisarTexto(cambiosRevision, 'direccion', 'Dirección', clinicaBase.direccion, form.direccion)

  const latBase = normalizarCoord(clinicaBase.latitud)
  const lngBase = normalizarCoord(clinicaBase.longitud)
  const latNuevo = form.ubicacion?.confirmada ? normalizarCoord(form.ubicacion.latitud) : latBase
  const lngNuevo = form.ubicacion?.confirmada ? normalizarCoord(form.ubicacion.longitud) : lngBase
  if (latNuevo !== null && lngNuevo !== null && (latBase !== latNuevo || lngBase !== lngNuevo)) {
    cambiosRevision.push({
      campo: 'ubicacion',
      etiqueta: 'Ubicación geográfica (coordenadas)',
      valor_anterior: latBase !== null && lngBase !== null ? `${latBase.toFixed(6)}, ${lngBase.toFixed(6)}` : 'Sin ubicación previa',
      valor_nuevo: `${latNuevo.toFixed(6)}, ${lngNuevo.toFixed(6)}`,
      raw_anterior: latBase !== null && lngBase !== null ? { latitud: latBase, longitud: lngBase } : null,
      raw_nuevo: { latitud: latNuevo, longitud: lngNuevo },
    })
  }

  const areasBase = extraerAreasDesdeFicha(ficha)
  const areasForm = {
    its: { seleccionado: Boolean(form.servicios?.its?.seleccionado), detalle: normalizarTexto(form.servicios?.its?.detalle || '') },
    ile: { seleccionado: Boolean(form.servicios?.ile?.seleccionado), detalle: normalizarTexto(form.servicios?.ile?.detalle || '') },
  }
  if (areasBase.its.seleccionado !== areasForm.its.seleccionado || areasBase.ile.seleccionado !== areasForm.ile.seleccionado) {
    cambiosRevision.push({
      campo: 'areas_servicio',
      etiqueta: 'Áreas de atención (ITS / ILE)',
      valor_anterior: formatearAreas(areasBase),
      valor_nuevo: formatearAreas(areasForm),
      raw_anterior: ['its', 'ile'].filter((c) => areasBase[c].seleccionado),
      raw_nuevo: ['its', 'ile'].filter((c) => areasForm[c].seleccionado),
    })
  }

  // 2. Campos de publicación directa (sin revisión administrativa)
  revisarTexto(cambiosDirectos, 'telefono', 'Teléfono de contacto', clinicaBase.telefono, form.telefono)
  revisarTexto(cambiosDirectos, 'correo_contacto', 'Correo de contacto', clinicaBase.correo_contacto, form.correo_contacto)
  revisarTexto(cambiosDirectos, 'sitio_web', 'Sitio web', clinicaBase.sitio_web, form.sitio_web)
  revisarTexto(cambiosDirectos, 'descripcion', 'Descripción', clinicaBase.descripcion, form.descripcion)

  for (const cat of ['its', 'ile']) {
    if (areasBase[cat].seleccionado && areasForm[cat].seleccionado && areasBase[cat].detalle !== areasForm[cat].detalle) {
      cambiosDirectos.push({
        campo: `detalle_${cat}`,
        etiqueta: `Detalle de ${ETIQUETAS_AREA[cat]}`,
        valor_anterior: areasBase[cat].detalle || 'Sin detalle',
        valor_nuevo: areasForm[cat].detalle || 'Sin detalle',
        raw_anterior: areasBase[cat].detalle || null,
        raw_nuevo: areasForm[cat].detalle || null,
      })
    }
  }

  const horariosBase = normalizarHorarios(ficha.horarios)
  const horariosForm = normalizarHorarios(form.horarios)
  if (JSON.stringify(horariosBase) !== JSON.stringify(horariosForm)) {
    cambiosDirectos.push({
      campo: 'horarios',
      etiqueta: 'Horarios de atención',
      valor_anterior: formatearHorariosResumen(horariosBase),
      valor_nuevo: formatearHorariosResumen(horariosForm),
      raw_anterior: horariosBase,
      raw_nuevo: horariosForm,
    })
  }

  return {
    cambiosDirectos,
    cambiosRevision,
    hayCambiosDirectos: cambiosDirectos.length > 0,
    hayCambiosRevision: cambiosRevision.length > 0,
  }
}
