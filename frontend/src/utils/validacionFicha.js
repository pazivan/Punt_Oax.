import { validarEmail, validarTelefono } from './validaciones.js'

/**
 * Validación de la ficha institucional.
 *
 * Se separa del componente para poder probarla sin DOM y para mantener una
 * única fuente de verdad entre el guardado de borrador y el envío final.
 *
 * Regla de producto:
 *  - El borrador puede estar incompleto, pero no puede contener formatos inválidos.
 *  - La postulación exige todos los datos obligatorios, documentos y ubicación confirmada.
 */

export const CAMPOS_ORDEN = [
  'nombre',
  'tipo_institucion',
  'telefono',
  'correo_contacto',
  'sitio_web',
  'descripcion',
  'municipio',
  'codigo_postal',
  'direccion',
  'ubicacion_maps_url',
  'ubicacion',
  'servicios',
  'servicio_its',
  'servicio_ile',
  'horarios',
  'documentos',
]

const IDS_CAMPO = {
  nombre: 'ficha-nombre',
  tipo_institucion: 'ficha-tipo',
  telefono: 'ficha-telefono',
  correo_contacto: 'ficha-correo',
  sitio_web: 'ficha-sitio',
  descripcion: 'ficha-descripcion',
  municipio: 'ficha-municipio',
  codigo_postal: 'ficha-cp',
  direccion: 'ficha-direccion',
  ubicacion_maps_url: 'ficha-maps',
  ubicacion: 'ficha-ubicacion-mapa',
  servicios: 'ficha-servicio-its',
  servicio_its: 'ficha-detalle-its',
  servicio_ile: 'ficha-detalle-ile',
  horarios: 'ficha-dia-0',
  documentos: 'ficha-archivos',
}

export function idCampoError(campo) {
  if (IDS_CAMPO[campo]) return IDS_CAMPO[campo]
  if (campo.startsWith('servicio_')) return `ficha-detalle-${campo.slice('servicio_'.length)}`
  if (campo.startsWith('horario:')) return `ficha-apertura-${campo.split(':')[1]}`
  return null
}

export function primerCampoConError(errores) {
  for (const campo of CAMPOS_ORDEN) {
    if (errores[campo]) return campo
  }
  const horarios = Object.keys(errores)
    .filter((campo) => campo.startsWith('horario:'))
    .sort((a, b) => Number(a.split(':')[1]) - Number(b.split(':')[1]))
  if (horarios.length) return horarios[0]
  return Object.keys(errores)[0] || null
}

function numero(valor) {
  if (typeof valor === 'number') return valor
  if (typeof valor === 'string' && valor.trim()) return Number(valor)
  return Number.NaN
}

export function validarCoordenadas(latitud, longitud) {
  const lat = numero(latitud)
  const lng = numero(longitud)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { error: 'Indica una latitud y una longitud válidas.' }
  }
  if (lat < -90 || lat > 90) return { error: 'La latitud debe estar entre -90 y 90.' }
  if (lng < -180 || lng > 180) return { error: 'La longitud debe estar entre -180 y 180.' }
  return {
    latitud: Math.round(lat * 1e6) / 1e6,
    longitud: Math.round(lng * 1e6) / 1e6,
  }
}

function esUrlValida(valor) {
  try {
    return ['http:', 'https:'].includes(new URL(valor.trim()).protocol)
  } catch {
    return false
  }
}

function validarHorarios(horarios) {
  const errores = {}
  const filas = Array.isArray(horarios) ? horarios : []
  filas.forEach((horario, indice) => {
    const clave = `horario:${indice}`
    if (!horario.apertura || !horario.cierre) {
      errores[clave] = 'Completa la apertura y el cierre.'
      return
    }
    if (horario.apertura >= horario.cierre) {
      errores[clave] = 'La apertura debe ser anterior al cierre. Los turnos nocturnos aún no están disponibles.'
    }
  })

  const ordenados = filas
    .map((horario, indice) => ({ ...horario, indice }))
    .filter((horario) => horario.apertura && horario.cierre)
    .sort((a, b) => a.dia_semana - b.dia_semana || a.apertura.localeCompare(b.apertura))

  for (let i = 1; i < ordenados.length; i += 1) {
    const anterior = ordenados[i - 1]
    const actual = ordenados[i]
    if (anterior.dia_semana === actual.dia_semana && actual.apertura < anterior.cierre) {
      errores[`horario:${anterior.indice}`] ||= 'Esta franja se cruza con otra del mismo día.'
      errores[`horario:${actual.indice}`] ||= 'Esta franja se cruza con otra del mismo día.'
    }
  }
  return errores
}

function validarFormatos(form) {
  const errores = {}

  if (form.telefono.trim() && !validarTelefono(form.telefono)) {
    errores.telefono = 'El teléfono debe tener al menos 10 dígitos y solo puede incluir números, espacios y los signos + ( ) . -'
  }
  if (form.correo_contacto.trim() && !validarEmail(form.correo_contacto)) {
    errores.correo_contacto = 'El correo de contacto no es válido.'
  }
  if (form.codigo_postal.trim() && !/^\d{5}$/.test(form.codigo_postal.trim())) {
    errores.codigo_postal = 'El código postal debe tener 5 dígitos.'
  }
  if (form.sitio_web.trim() && !esUrlValida(form.sitio_web)) {
    errores.sitio_web = 'El sitio web debe iniciar con http:// o https://.'
  }
  if (form.ubicacion_maps_url.trim() && !esUrlValida(form.ubicacion_maps_url)) {
    errores.ubicacion_maps_url = 'El enlace de Google Maps debe iniciar con http:// o https://.'
  }

  Object.assign(errores, validarHorarios(form.horarios))

  if (form.ubicacion?.confirmada) {
    const coordenadas = validarCoordenadas(form.ubicacion.latitud, form.ubicacion.longitud)
    if (coordenadas.error) errores.ubicacion = coordenadas.error
  }

  return errores
}

/** Errores que impiden incluso guardar un borrador (formatos, no campos vacíos). */
export function validarFormatoFicha(form) {
  return validarFormatos(form)
}

/** Errores que impiden enviar la postulación completa. */
export function validarFichaCompleta(form, documentos = [], ubicacion = form.ubicacion) {
  const errores = validarFormatos(form)

  if (!form.nombre.trim()) errores.nombre = 'Escribe el nombre de la clínica.'
  if (!form.tipo_institucion) errores.tipo_institucion = 'Selecciona el tipo de institución.'
  if (!form.descripcion.trim()) errores.descripcion = 'Describe brevemente tu institución.'
  if (!form.telefono.trim()) errores.telefono = 'Escribe un teléfono de contacto.'
  if (!form.correo_contacto.trim()) errores.correo_contacto = 'Escribe un correo de contacto.'
  if (!form.municipio.trim()) errores.municipio = 'Indica el municipio.'
  if (!form.direccion.trim()) errores.direccion = 'Indica la dirección de la sede.'

  const seleccionados = Object.entries(form.servicios || {})
    .filter(([, valor]) => valor.seleccionado)
  if (seleccionados.length === 0) {
    errores.servicios = 'Selecciona al menos un área de atención (ITS o ILE).'
  } else {
    for (const [categoria, valor] of seleccionados) {
      if (!valor.detalle.trim()) {
        errores[`servicio_${categoria}`] = 'Describe los servicios de esta área.'
      }
    }
  }

  if (!Array.isArray(form.horarios) || form.horarios.length === 0) {
    errores.horarios = 'Selecciona al menos un día con horario de atención.'
  }

  if (!documentos.length) {
    errores.documentos = 'Adjunta al menos un documento de respaldo.'
  }

  const confirmada = ubicacion?.confirmada === true
  if (!confirmada) {
    errores.ubicacion = 'Confirma la ubicación de la clínica en el mapa.'
  } else {
    const coordenadas = validarCoordenadas(ubicacion.latitud, ubicacion.longitud)
    if (coordenadas.error) errores.ubicacion = coordenadas.error
  }

  return errores
}

const ETIQUETAS_PENDIENTES = {
  nombre: 'Nombre de la clínica',
  tipo_institucion: 'Tipo de institución',
  descripcion: 'Descripción de la clínica',
  telefono: 'Teléfono de contacto',
  correo_contacto: 'Correo de contacto',
  municipio: 'Municipio',
  direccion: 'Dirección',
  ubicacion: 'Ubicación confirmada en el mapa',
  servicios: 'Al menos un área de atención (ITS o ILE)',
  horarios: 'Al menos una franja horaria',
  documentos: 'Al menos un documento de respaldo',
}

export function listarPendientes(form, documentos = [], ubicacion = form.ubicacion) {
  const errores = validarFichaCompleta(form, documentos, ubicacion)
  const vistos = new Set()
  const pendientes = []
  for (const campo of Object.keys(errores)) {
    const etiqueta = campo.startsWith('servicio_')
      ? 'Descripción de cada servicio seleccionado'
      : campo.startsWith('horario:')
        ? 'Franjas horarias completas y sin cruces'
        : ETIQUETAS_PENDIENTES[campo] || errores[campo]
    if (vistos.has(etiqueta)) continue
    vistos.add(etiqueta)
    pendientes.push(etiqueta)
  }
  return pendientes
}

export function construirPayloadFicha(form) {
  const payload = {
    tipo_institucion: form.tipo_institucion || null,
    descripcion: form.descripcion.trim() || null,
    telefono: form.telefono.trim() || null,
    correo_contacto: form.correo_contacto.trim() || null,
    sitio_web: form.sitio_web.trim() || null,
    municipio: form.municipio.trim() || null,
    direccion: form.direccion.trim() || null,
    codigo_postal: form.codigo_postal.trim() || null,
    ubicacion_maps_url: form.ubicacion_maps_url.trim() || null,
    servicios: Object.entries(form.servicios || {})
      .filter(([, valor]) => valor.seleccionado)
      .map(([categoria, valor]) => ({ categoria, detalle: valor.detalle.trim() })),
    horarios: (form.horarios || []).map((horario) => ({
      dia_semana: horario.dia_semana,
      apertura: horario.apertura,
      cierre: horario.cierre,
    })),
  }

  // El backend exige nombre no vacío si se envía. Un borrador sin nombre se
  // guarda omitiendo el campo para no perder el resto del avance.
  if (form.nombre.trim()) payload.nombre = form.nombre.trim()

  // Solo se persisten coordenadas confirmadas explícitamente en el mapa.
  if (form.ubicacion?.confirmada) {
    const coordenadas = validarCoordenadas(form.ubicacion.latitud, form.ubicacion.longitud)
    if (!coordenadas.error) {
      payload.latitud = coordenadas.latitud
      payload.longitud = coordenadas.longitud
    }
  }

  return payload
}
