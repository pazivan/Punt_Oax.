import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Edit3,
  ExternalLink,
  FileText,
  Globe,
  Mail,
  MapPin,
  Phone,
  Save,
  Send,
} from 'lucide-react'
import {
  consultarCitasClinica,
  consultarMiFicha,
  guardarBorradorClinica,
  guardarHorariosAgenda,
  leerSesion,
  solicitarActualizacionClinica,
} from '../../api/auth'
import EncabezadoClinica from './EncabezadoClinica.jsx'
import FuentesInformacion from './FuentesInformacion.jsx'
import EditorHorarios from './EditorHorarios.jsx'
import SelectorUbicacionMapa from './SelectorUbicacionMapa.jsx'
import ModalSolicitudActualizacion from './ModalSolicitudActualizacion.jsx'
import HistorialSolicitudesClinica from './HistorialSolicitudesClinica.jsx'
import MapaLeaflet from '../Inicio/MapaLeaflet.jsx'
import { DIAS, coordenadas } from '../../utils/centros.js'
import { ZONA_HORARIA, filtrarCitas } from '../../utils/citasClinica'
import { compararFichaConFormulario } from '../../utils/comparacionFicha'
import { validarCoordenadas, validarHorarios } from '../../utils/validacionFicha'
import { validarEmail, validarTelefono } from '../../utils/validaciones'
import { describirErrorConsulta } from '../../utils/erroresConsulta.js'
import '../../styles/Inicio.css'
import '../../css/PanelClinica.css'

function numeroUbicacion(valor) {
  if (valor == null || valor === '') return null
  const numero = Number(valor)
  return Number.isFinite(numero) ? numero : null
}

function obtenerClaveFechaMexico(fechaIso) {
  if (!fechaIso) return ''
  const fecha = new Date(fechaIso)
  if (Number.isNaN(fecha.getTime())) return ''
  const partes = new Intl.DateTimeFormat('es-MX', {
    timeZone: ZONA_HORARIA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(fecha)
  const obtener = (tipo) => partes.find((p) => p.type === tipo)?.value || ''
  return `${obtener('year')}-${obtener('month')}-${obtener('day')}`
}

const ETIQUETA_ESTADO_PUBLICACION = {
  aprobada: 'PUBLICADA',
  pendiente: 'PENDIENTE DE REVISIÓN',
  suspendida: 'SUSPENDIDA',
  rechazada: 'REQUIERE CORRECCIONES',
  borrador: 'BORRADOR',
}

function estadoInicialDesdeFicha(ficha) {
  const servicios = {
    its: { seleccionado: false, detalle: '' },
    ile: { seleccionado: false, detalle: '' },
  }
  for (const servicio of ficha.servicios || []) {
    if (servicio.categoria in servicios) {
      servicios[servicio.categoria] = {
        seleccionado: true,
        detalle: servicio.detalle_servicio || '',
      }
    }
  }
  const latitud = numeroUbicacion(ficha.clinica?.latitud)
  const longitud = numeroUbicacion(ficha.clinica?.longitud)
  return {
    nombre: ficha.clinica?.nombre || '',
    tipo_institucion: ficha.clinica?.tipo_institucion || '',
    descripcion: ficha.clinica?.descripcion || '',
    telefono: ficha.clinica?.telefono || '',
    correo_contacto: ficha.clinica?.correo_contacto || '',
    sitio_web: ficha.clinica?.sitio_web || '',
    municipio: ficha.clinica?.municipio || '',
    localidad: ficha.clinica?.localidad || '',
    direccion: ficha.clinica?.direccion || '',
    codigo_postal: ficha.clinica?.codigo_postal || '',
    ubicacion_maps_url: ficha.clinica?.ubicacion_maps_url || '',
    ubicacion: {
      latitud,
      longitud,
      confirmada: latitud !== null && longitud !== null,
    },
    servicios,
    horarios: (ficha.horarios || []).map((horario) => ({
      dia_semana: horario.dia_semana,
      apertura: horario.apertura,
      cierre: horario.cierre,
      es_24_horas: Boolean(horario.es_24_horas),
      cruza_medianoche: Boolean(horario.cruza_medianoche),
    })),
  }
}

const AREAS = [
  {
    categoria: 'its',
    nombre: 'Detección de ITS',
    ayuda: 'Ej. pruebas de VIH, sífilis, orientación y seguimiento.',
  },
  {
    categoria: 'ile',
    nombre: 'Interrupción Legal del Embarazo (ILE)',
    ayuda: 'Ej. orientación, valoración y acompañamiento.',
  },
]

const ETIQUETA_TIPO_INSTITUCION = {
  publica: 'Institución pública',
  privada: 'Clínica privada',
  ong: 'Organización social (ONG)',
  otra: 'Otra institución',
}

function construirPayload(form) {
  return {
    nombre: form.nombre.trim(),
    tipo_institucion: form.tipo_institucion || null,
    descripcion: form.descripcion.trim() || null,
    telefono: form.telefono.trim() || null,
    correo_contacto: form.correo_contacto.trim() || null,
    sitio_web: form.sitio_web.trim() || null,
    municipio: form.municipio.trim() || null,
    localidad: form.localidad?.trim() || null,
    direccion: form.direccion.trim() || null,
    codigo_postal: form.codigo_postal.trim() || null,
    ubicacion_maps_url: form.ubicacion_maps_url.trim() || null,
    servicios: Object.entries(form.servicios)
      .filter(([, valor]) => valor.seleccionado)
      .map(([categoria, valor]) => ({ categoria, detalle: valor.detalle.trim() })),
    horarios: form.horarios.map((horario) => ({
      dia_semana: horario.dia_semana,
      apertura: horario.es_24_horas ? '00:00' : horario.apertura,
      cierre: horario.es_24_horas ? '00:00' : horario.cierre,
      es_24_horas: Boolean(horario.es_24_horas),
      cruza_medianoche: Boolean(horario.cruza_medianoche) && !horario.es_24_horas,
    })),
  }
}

function validarInformacion(form) {
  if (!form.nombre.trim()) {
    return 'El nombre de la clínica es obligatorio.'
  }
  if (form.telefono.trim() && !validarTelefono(form.telefono)) {
    return 'El teléfono debe tener al menos 10 dígitos y solo puede incluir números, espacios y los signos + ( ) . -'
  }
  if (form.correo_contacto.trim() && !validarEmail(form.correo_contacto)) {
    return 'El correo de contacto no es válido.'
  }
  if (form.codigo_postal.trim() && !/^\d{5}$/.test(form.codigo_postal.trim())) {
    return 'El código postal debe tener 5 dígitos.'
  }
  for (const [campo, valor] of [
    ['sitio web', form.sitio_web],
    ['enlace de Google Maps', form.ubicacion_maps_url],
  ]) {
    if (!valor.trim()) continue
    try {
      const url = new URL(valor.trim())
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocolo')
    } catch {
      return `El ${campo} debe iniciar con http:// o https://.`
    }
  }
  const erroresHorarios = validarHorarios(form.horarios)
  const primerErrorHorario = Object.values(erroresHorarios)[0]
  if (primerErrorHorario) return primerErrorHorario
  return ''
}

/**
 * PanelClinica - Pantalla de inicio y administración para la clínica ya aprobada.
 * - Muestra el resumen de todos sus datos registrados e integra el mapa.
 * - Permite actualizar su información principal desde "Editar información".
 */
export default function PanelClinica({ sesion, onSalir }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [ficha, setFicha] = useState(null)
  const [form, setForm] = useState(null)
  const [citasClinica, setCitasClinica] = useState([])
  const [estadoCitas, setEstadoCitas] = useState('cargando')
  const [centrarMapaTrigger, setCentrarMapaTrigger] = useState(0)
  const vistaQuery = searchParams.get('vista')
  const vistaActiva =
    vistaQuery === 'editar' ? 'editar' : vistaQuery === 'solicitudes' ? 'solicitudes' : 'inicio'
  const solicitudQueryId = searchParams.get('solicitud')
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState(null)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [modalSolicitudAbierto, setModalSolicitudAbierto] = useState(false)
  const [enviandoSolicitud, setEnviandoSolicitud] = useState(false)
  const [errorSolicitud, setErrorSolicitud] = useState('')
  const [errorUbicacion, setErrorUbicacion] = useState('')
  const [recargaSolicitudes, setRecargaSolicitudes] = useState(0)

  useEffect(() => {
    sessionStorage.setItem('puntoax_panel_aprobado', '1')
  }, [])

  function setVistaActiva(nuevaVista) {
    if (nuevaVista === 'editar') {
      setSearchParams({ vista: 'editar' }, { replace: true })
    } else if (nuevaVista === 'solicitudes') {
      setSearchParams({ vista: 'solicitudes' }, { replace: true })
    } else {
      setSearchParams({}, { replace: true })
    }
  }

  function aplicarFicha(datos) {
    setFicha(datos)
    setForm(estadoInicialDesdeFicha(datos))
  }

  async function cargarFicha() {
    setCargando(true)
    setErrorCarga(null)
    try {
      aplicarFicha(await consultarMiFicha())
    } catch (err) {
      setErrorCarga(err)
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    let activo = true
    consultarMiFicha()
      .then((datos) => {
        if (!activo) return
        setFicha(datos)
        setForm(estadoInicialDesdeFicha(datos))
      })
      .catch((err) => {
        if (activo) setErrorCarga(err)
      })
      .finally(() => {
        if (activo) setCargando(false)
      })

    consultarCitasClinica()
      .then((res) => {
        if (!activo) return
        setCitasClinica(Array.isArray(res?.citas) ? res.citas : [])
        setEstadoCitas('listo')
      })
      .catch(() => {
        if (!activo) return
        setCitasClinica([])
        setEstadoCitas('error')
      })

    return () => {
      activo = false
    }
  }, [])

  const citasProximasCount = useMemo(
    () => filtrarCitas(citasClinica, 'proximas').length,
    [citasClinica]
  )

  const claveHoy = useMemo(() => obtenerClaveFechaMexico(new Date().toISOString()), [])
  const citasHoyCount = useMemo(
    () =>
      citasClinica.filter(
        (c) => c.estado === 'confirmada' && obtenerClaveFechaMexico(c.fecha_hora_inicio) === claveHoy
      ).length,
    [citasClinica, claveHoy]
  )
  const citasPendientesCierreCount = useMemo(
    () => citasClinica.filter((c) => c.estado === 'confirmada').length,
    [citasClinica]
  )

  const areasSeleccionadas = useMemo(() => {
    if (!form?.servicios) return []
    return AREAS.filter((area) => form.servicios[area.categoria]?.seleccionado).map(
      (area) => ({
        ...area,
        detalle: form.servicios[area.categoria]?.detalle || '',
      })
    )
  }, [form])

  const miCentroEnMapa = useMemo(() => {
    if (!ficha?.clinica) return null
    const coordsExistentes = coordenadas(ficha.clinica)
    if (!coordsExistentes) return null
    return {
      ...ficha.clinica,
      id_clinica: ficha.clinica.id_clinica,
      nombre: ficha.clinica.nombre || 'Mi clínica',
      municipio: ficha.clinica.municipio || 'Oaxaca',
      direccion: ficha.clinica.direccion || 'Dirección registrada',
      telefono: ficha.clinica.telefono || '',
      servicios: (ficha.servicios || []).map((s) => s.nombre || s.categoria),
      horarios: ficha.horarios || [],
      latitud: coordsExistentes[0],
      longitud: coordsExistentes[1],
      ubicacion_confirmada: true,
      esMiCentro: true,
    }
  }, [ficha])

  const comparacionCambios = useMemo(
    () => compararFichaConFormulario(ficha, form),
    [ficha, form]
  )
  const haySolicitudPendiente = ficha?.postulacion?.estado === 'pendiente'

  if (cargando) {
    return (
      <div className="panel-clinica-page">
        <EncabezadoClinica
          sesion={sesion || leerSesion()}
          onSalir={onSalir}
          modoPostulacion={false}
          vistaPanel={vistaActiva}
          onSeleccionarVistaPanel={setVistaActiva}
        />
        <main className="ficha-loading" role="status">
          <span className="ficha-spinner" aria-hidden="true" />
          <p>Cargando los datos de tu clínica…</p>
        </main>
      </div>
    )
  }

  if (errorCarga) {
    const aviso = describirErrorConsulta(errorCarga, 'los datos de tu clínica')
    return (
      <div className="panel-clinica-page">
        <EncabezadoClinica
          sesion={sesion || leerSesion()}
          onSalir={onSalir}
          modoPostulacion={false}
          vistaPanel={vistaActiva}
          onSeleccionarVistaPanel={setVistaActiva}
        />
        <main className="ficha-state-card" role="alert">
          <AlertTriangle size={30} aria-hidden="true" />
          <h1>{aviso.titulo}</h1>
          <p>{aviso.mensaje}</p>
          {aviso.reintentar && <button type="button" className="ficha-btn-primary" onClick={cargarFicha}>
            Reintentar
          </button>}
        </main>
      </div>
    )
  }

  if (!form) return null

  const actualizarCampo = (campo, valor) => {
    setForm((actual) => ({ ...actual, [campo]: valor }))
    setMensaje('')
    setError('')
  }

  const restaurarDatos = () => {
    if (!ficha) return
    setForm(estadoInicialDesdeFicha(ficha))
    setError('')
    setMensaje('Se restauraron los datos guardados originalmente.')
  }

  const alternarServicio = (categoria) => {
    setForm((actual) => ({
      ...actual,
      servicios: {
        ...actual.servicios,
        [categoria]: {
          ...actual.servicios[categoria],
          seleccionado: !actual.servicios[categoria].seleccionado,
          detalle: actual.servicios[categoria].seleccionado
            ? ''
            : actual.servicios[categoria].detalle,
        },
      },
    }))
    setMensaje('')
  }

  const actualizarDetalleServicio = (categoria, detalle) => {
    setForm((actual) => ({
      ...actual,
      servicios: {
        ...actual.servicios,
        [categoria]: { ...actual.servicios[categoria], detalle },
      },
    }))
    setMensaje('')
  }

  const confirmarUbicacion = ({ latitud, longitud }) => {
    const coords = validarCoordenadas(latitud, longitud)
    if (coords.error) {
      setErrorUbicacion(coords.error)
      return
    }
    setForm((actual) => ({
      ...actual,
      ubicacion: {
        latitud: coords.latitud,
        longitud: coords.longitud,
        confirmada: true,
      },
    }))
    setErrorUbicacion('')
    setMensaje('')
  }

  const corregirUbicacion = () => {
    setForm((actual) => ({
      ...actual,
      ubicacion: {
        ...actual.ubicacion,
        confirmada: false,
      },
    }))
    setErrorUbicacion('')
    setMensaje('')
  }

  const abrirModalSolicitud = () => {
    if (haySolicitudPendiente || !comparacionCambios.hayCambiosRevision) return
    setError('')
    setMensaje('')
    setErrorSolicitud('')
    if (!form.nombre.trim()) {
      setError('El nombre institucional es obligatorio.')
      return
    }
    if (form.codigo_postal.trim() && !/^\d{5}$/.test(form.codigo_postal.trim())) {
      setError('El código postal debe tener 5 dígitos.')
      return
    }
    const areasSeleccionadasIds = Object.entries(form.servicios)
      .filter(([, valor]) => valor.seleccionado)
      .map(([categoria]) => categoria)
    if (areasSeleccionadasIds.length === 0) {
      setError('Selecciona al menos un área de atención (ITS o ILE).')
      return
    }
    setModalSolicitudAbierto(true)
  }

  const confirmarEnvioSolicitud = async (motivo) => {
    if (enviandoSolicitud || haySolicitudPendiente) return
    setEnviandoSolicitud(true)
    setErrorSolicitud('')
    try {
      const payload = {
        motivo,
        nombre: form.nombre.trim(),
        tipo_institucion: form.tipo_institucion || null,
        municipio: form.municipio.trim() || null,
        codigo_postal: form.codigo_postal.trim() || null,
        direccion: form.direccion.trim() || null,
        areas_servicio: Object.entries(form.servicios)
          .filter(([, valor]) => valor.seleccionado)
          .map(([categoria]) => categoria),
      }
      if (form.ubicacion?.confirmada) {
        const coords = validarCoordenadas(form.ubicacion.latitud, form.ubicacion.longitud)
        if (!coords.error) {
          payload.latitud = coords.latitud
          payload.longitud = coords.longitud
        }
      }
      const resp = await solicitarActualizacionClinica(payload)
      const actualizada = await consultarMiFicha()
      setFicha(actualizada)
      setForm(estadoInicialDesdeFicha(actualizada))
      setModalSolicitudAbierto(false)
      setRecargaSolicitudes((v) => v + 1)
      setMensaje(
        resp.mensaje ||
          'Solicitud de actualización enviada para revisión administrativa. Tus datos publicados se mantienen visibles hasta su aprobación.'
      )
    } catch (err) {
      setErrorSolicitud(err.message || 'No se pudo enviar la solicitud de actualización.')
    } finally {
      setEnviandoSolicitud(false)
    }
  }

  async function persistirCambios() {
    if (
      ficha?.clinica?.estado_publicacion === 'aprobada' ||
      ficha?.clinica?.estado_publicacion === 'suspendida'
    ) {
      const token = leerSesion()?.token
      const serviciosExistentes = Array.isArray(ficha?.servicios) ? ficha.servicios : []
      const serviciosPatch = serviciosExistentes
        .filter((s) => s.id_servicio && form.servicios[s.categoria]?.seleccionado)
        .map((s) => ({
          id_servicio: s.id_servicio,
          detalle_servicio: form.servicios[s.categoria]?.detalle?.trim() || null,
        }))

      const respuestaHttp = await fetch('/api/clinicas/mi-ficha/datos-publicados', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          telefono: form.telefono.trim() || null,
          correo_contacto: form.correo_contacto.trim() || null,
          sitio_web: form.sitio_web.trim() || null,
          descripcion: form.descripcion.trim() || null,
          ...(serviciosPatch.length > 0 ? { servicios: serviciosPatch } : {}),
        }),
      })

      if (!respuestaHttp.ok) {
        const errJson = await respuestaHttp.json().catch(() => null)
        throw new Error(errJson?.error || 'No se pudieron actualizar los datos publicados.')
      }

      if (ficha?.clinica?.estado_publicacion === 'aprobada') {
        await guardarHorariosAgenda(
          form.horarios.map((h) => ({
            dia_semana: h.dia_semana,
            apertura: h.es_24_horas ? '00:00' : h.apertura,
            cierre: h.es_24_horas ? '00:00' : h.cierre,
            es_24_horas: Boolean(h.es_24_horas),
            cruza_medianoche: Boolean(h.cruza_medianoche) && !h.es_24_horas,
          }))
        )
      }

      const actualizada = await consultarMiFicha()
      setFicha(actualizada)
      return actualizada
    }

    const respuesta = await guardarBorradorClinica(construirPayload(form))
    setFicha(respuesta)
    return respuesta
  }

  const guardarCambios = async () => {
    if (guardando) return
    setError('')
    setMensaje('')
    const invalido = validarInformacion(form)
    if (invalido) {
      setError(invalido)
      return
    }
    setGuardando(true)
    try {
      await persistirCambios()
      setMensaje('Los datos de tu clínica se actualizaron correctamente.')
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  const nombreCentroMostrado =
    form.nombre.trim() || ficha.clinica?.nombre || 'Centro de Atención PuntoOax'
  const municipioMostrado =
    form.municipio.trim() || ficha.clinica?.municipio || 'Oaxaca de Juárez'
  const tipoInstitucionTexto =
    ETIQUETA_TIPO_INSTITUCION[form.tipo_institucion] || 'Institución de salud'

  return (
    <div className="panel-clinica-page">
      <EncabezadoClinica
        sesion={sesion || leerSesion()}
        onSalir={onSalir}
        modoPostulacion={false}
        vistaPanel={vistaActiva}
        onSeleccionarVistaPanel={setVistaActiva}
      />

      <main className="panel-clinica-main">
        <div className="panel-clinica-container">
          <section
            className="panel-clinica-heading-block"
            aria-labelledby="panel-clinica-h1"
          >
            <div className="panel-clinica-eyebrow-wrap">
              <span className="panel-clinica-eyebrow">PORTAL DE CLÍNICAS</span>
            </div>
            <div className="panel-clinica-title-wrap">
              <h1 id="panel-clinica-h1" className="panel-clinica-title">
                Panel de clínica
              </h1>
            </div>
            <div className="panel-clinica-subtitle-wrap">
              <p className="panel-clinica-subtitle">
                Administra los datos de tu centro y consulta tus citas agendadas.
              </p>
            </div>
          </section>

          <div className="panel-clinica-workspace">
            {/* Tarjeta blanca principal de ancho completo */}
            <div className="panel-clinica-card">
              <div className="panel-clinica-top-overview">
                <div className="panel-clinica-top-overview-left">
                  <div className="panel-clinica-badge-row">
                    <span className="panel-clinica-status-pill">
                      {ETIQUETA_ESTADO_PUBLICACION[ficha?.clinica?.estado_publicacion] || 'ACTIVA'}
                    </span>
                    <span className="panel-clinica-center-meta">
                      {nombreCentroMostrado} • {municipioMostrado}
                    </span>
                  </div>
                  <h2 className="panel-clinica-welcome-title">
                    {nombreCentroMostrado}
                  </h2>
                  <div className="panel-clinica-welcome-actions" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {vistaActiva === 'inicio' ? (
                      <>
                        <button
                          type="button"
                          className="panel-clinica-edit-shortcut"
                          onClick={() => setVistaActiva('editar')}
                        >
                          <Edit3 size={14} color="#FFFFFF" aria-hidden="true" />
                          <span>Actualizar información</span>
                        </button>
                        <Link to="/mi-clinica/citas" className="panel-clinica-back-shortcut" style={{ textDecoration: 'none' }}>
                          <CalendarDays size={14} aria-hidden="true" />
                          <span>Mis citas</span>
                        </Link>
                        <Link to="/mi-clinica/agenda" className="panel-clinica-back-shortcut" style={{ textDecoration: 'none' }}>
                          <Clock3 size={14} aria-hidden="true" />
                          <span>Gestionar agenda</span>
                        </Link>
                        <button
                          type="button"
                          className="panel-clinica-back-shortcut"
                          onClick={() => setVistaActiva('solicitudes')}
                        >
                          <FileText size={14} aria-hidden="true" />
                          <span>Mis solicitudes</span>
                        </button>
                        <Link to="/mapa" className="panel-clinica-back-shortcut" style={{ textDecoration: 'none' }}>
                          <MapPin size={14} aria-hidden="true" />
                          <span>Ver mapa</span>
                        </Link>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="panel-clinica-back-shortcut"
                        onClick={() => setVistaActiva('inicio')}
                      >
                        <span>← Volver a Inicio</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Indicadores reales de citas */}
                <div className="panel-clinica-top-overview-right">
                  <div className="panel-clinica-stats-row">
                    <div className="panel-clinica-stat-card">
                      <span className="panel-clinica-stat-value">
                        {estadoCitas === 'cargando' ? '—' : citasHoyCount}
                      </span>
                      <span className="panel-clinica-stat-label">
                        Citas de hoy
                      </span>
                    </div>
                    <div className="panel-clinica-stat-card">
                      <span className="panel-clinica-stat-value">
                        {estadoCitas === 'cargando' ? '—' : citasProximasCount}
                      </span>
                      <span className="panel-clinica-stat-label">
                        Próximas citas
                      </span>
                    </div>
                    <div className="panel-clinica-stat-card">
                      <span className="panel-clinica-stat-value">
                        {estadoCitas === 'cargando' ? '—' : citasPendientesCierreCount}
                      </span>
                      <span className="panel-clinica-stat-label">
                        Citas pendientes
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {vistaActiva === 'inicio' && estadoCitas === 'listo' && citasClinica.length === 0 && (
                <div
                  className="ficha-doc-note"
                  role="status"
                  style={{ marginTop: '14px', width: '100%', boxSizing: 'border-box' }}
                >
                  <CalendarDays size={18} aria-hidden="true" />
                  <p>
                    <strong>Sin citas agendadas todavía.</strong> Cuando los pacientes reserven horarios en tu centro aparecerán aquí y en{' '}
                    <Link to="/mi-clinica/citas" style={{ color: '#103328', fontWeight: 700 }}>Mis citas</Link>.
                    {' '}Puedes publicar cupos desde <Link to="/mi-clinica/agenda" style={{ color: '#103328', fontWeight: 700 }}>Gestionar agenda</Link>.
                  </p>
                </div>
              )}

              {vistaActiva === 'inicio' && estadoCitas === 'error' && (
                <div
                  className="ficha-alert ficha-alert-error"
                  role="alert"
                  style={{ marginTop: '14px', width: '100%', boxSizing: 'border-box' }}
                >
                  <AlertTriangle size={18} aria-hidden="true" />
                  <p>No se pudieron consultar las citas reales de tu clínica en este momento.</p>
                </div>
              )}

              {error && (
                <div
                  className="ficha-alert ficha-alert-error"
                  role="alert"
                  style={{ marginTop: '12px', width: '100%', boxSizing: 'border-box' }}
                >
                  <AlertTriangle size={18} aria-hidden="true" />
                  <div>
                    <strong>Revisa la información</strong>
                    <p>{error}</p>
                  </div>
                </div>
              )}

              {mensaje && (
                <div
                  className="ficha-alert ficha-alert-success"
                  role="status"
                  style={{ marginTop: '12px', width: '100%', boxSizing: 'border-box' }}
                >
                  <CheckCircle2 size={18} aria-hidden="true" />
                  <p>{mensaje}</p>
                </div>
              )}

              {/* =================================================================
                  VISTA 1: INICIO (Diseño amplio en pantalla sin tener que bajar mucho)
                  ================================================================= */}
              {vistaActiva === 'inicio' && (
                <div className="panel-clinica-summary-view">
                  <section
                    className="panel-clinica-summary-block"
                    aria-labelledby="resumen-datos-vertical"
                  >
                    <div className="panel-clinica-summary-header">
                      <h3 id="resumen-datos-vertical" className="panel-clinica-section-title">
                        Información registrada de tu centro
                      </h3>
                    </div>

                    <div className="panel-clinica-summary-grid">
                      <div className="panel-clinica-summary-item">
                        <span className="panel-clinica-summary-label">
                          Nombre de la clínica
                        </span>
                        <p className="panel-clinica-summary-value">
                          {form.nombre.trim() || 'Por registrar'}
                        </p>
                      </div>

                      <div className="panel-clinica-summary-item">
                        <span className="panel-clinica-summary-label">
                          Tipo de institución
                        </span>
                        <p className="panel-clinica-summary-value">
                          {tipoInstitucionTexto}
                        </p>
                      </div>

                      <div className="panel-clinica-summary-item">
                        <span className="panel-clinica-summary-label">
                          <Phone size={12} aria-hidden="true" /> Teléfono
                        </span>
                        <p className="panel-clinica-summary-value">
                          {form.telefono.trim() || 'Por registrar'}
                        </p>
                      </div>

                      <div className="panel-clinica-summary-item">
                        <span className="panel-clinica-summary-label">
                          <Mail size={12} aria-hidden="true" /> Correo público
                        </span>
                        <p className="panel-clinica-summary-value">
                          {form.correo_contacto.trim() || 'Por registrar'}
                        </p>
                      </div>

                      <div className="panel-clinica-summary-item">
                        <span className="panel-clinica-summary-label">
                          <MapPin size={12} aria-hidden="true" /> Dirección
                        </span>
                        <p className="panel-clinica-summary-value">
                          {[
                            form.direccion.trim(),
                            form.municipio.trim(),
                            form.codigo_postal.trim()
                              ? `C.P. ${form.codigo_postal.trim()}`
                              : '',
                          ]
                            .filter(Boolean)
                            .join(', ') || 'Por registrar'}
                        </p>
                      </div>

                      <div className="panel-clinica-summary-item">
                        <span className="panel-clinica-summary-label">
                          <Globe size={12} aria-hidden="true" /> Sitio web
                        </span>
                        <p className="panel-clinica-summary-value">
                          {form.sitio_web.trim() ? (
                            <a
                              href={form.sitio_web.trim()}
                              target="_blank"
                              rel="noreferrer"
                              className="panel-clinica-ext-link"
                            >
                              {form.sitio_web.trim()} <ExternalLink size={12} aria-hidden="true" />
                            </a>
                          ) : (
                            'No especificado'
                          )}
                        </p>
                      </div>

                      <div className="panel-clinica-summary-item is-full">
                        <span className="panel-clinica-summary-label">
                          Descripción del centro
                        </span>
                        <p className="panel-clinica-summary-value">
                          {form.descripcion.trim() || 'Sin descripción registrada.'}
                        </p>
                      </div>

                      <div className="panel-clinica-summary-item">
                        <span className="panel-clinica-summary-label">
                          Áreas y servicios
                        </span>
                        <div className="panel-clinica-summary-value">
                          {areasSeleccionadas.length > 0 ? (
                            <div className="panel-clinica-services-tags">
                              {areasSeleccionadas.map((area) => (
                                <div key={area.categoria} className="panel-clinica-service-box">
                                  <strong>{area.nombre}</strong>
                                  {area.detalle && <span>{area.detalle}</span>}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span>Sin áreas registradas.</span>
                          )}
                        </div>
                      </div>

                      <div className="panel-clinica-summary-item">
                        <span className="panel-clinica-summary-label">
                          <Clock3 size={12} aria-hidden="true" /> Horario de atención
                        </span>
                        <div className="panel-clinica-summary-value">
                          {form.horarios.length > 0 ? (
                            <ul className="panel-clinica-schedule-list">
                              {form.horarios.map((h, idx) => {
                                const nombreDia = DIAS[Number(h.dia_semana)] || 'Día'
                                const textoFranja = h.es_24_horas
                                  ? '24 horas'
                                  : h.cruza_medianoche
                                    ? `${h.apertura} - ${h.cierre} (nocturno)`
                                    : `${h.apertura} - ${h.cierre}`
                                return (
                                  <li key={`${h.dia_semana}-${idx}`}>
                                    <strong>{nombreDia}:</strong> {textoFranja}
                                  </li>
                                )
                              })}
                            </ul>
                          ) : (
                            <span>Sin horarios registrados.</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Columna derecha: Mapa exclusivo de la clínica autenticada */}
                  <section
                    className="panel-clinica-summary-block"
                    aria-labelledby="resumen-mapa-clinica"
                  >
                    <div className="panel-clinica-summary-header">
                      <div>
                        <h3 id="resumen-mapa-clinica" className="panel-clinica-section-title">
                          Ubicación de mi clínica
                        </h3>
                      </div>

                      {miCentroEnMapa && (
                        <button
                          type="button"
                          className="panel-clinica-focus-btn"
                          onClick={() => setCentrarMapaTrigger((v) => v + 1)}
                        >
                          <MapPin size={13} color="#FFFFFF" aria-hidden="true" />
                          <span>Mi centro</span>
                        </button>
                      )}
                    </div>

                    <div className="panel-clinica-map-vertical">
                      <div className="panel-clinica-map-canvas">
                        {miCentroEnMapa ? (
                          <MapaLeaflet
                            clinicas={[miCentroEnMapa]}
                            clinicaSeleccionada={miCentroEnMapa}
                            clinicaAutenticadaId={ficha?.clinica?.id_clinica}
                            mostrarLeyenda={false}
                            zoomInicial={15}
                            centrarTrigger={centrarMapaTrigger}
                          />
                        ) : (
                          <div className="ficha-doc-note" role="status" style={{ margin: '16px' }}>
                            <MapPin size={18} aria-hidden="true" />
                            <p>
                              <strong>Sin coordenadas publicadas.</strong> Puedes proponer la ubicación de tu clínica desde{' '}
                              <button
                                type="button"
                                className="ficha-link-button"
                                onClick={() => setVistaActiva('editar')}
                              >
                                Actualizar información
                              </button>.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </section>
                </div>
              )}

              {/* =================================================================
                  VISTA 2: ACTUALIZAR DATOS PRINCIPALES (En disposición vertical limpia)
                  ================================================================= */}
              {vistaActiva === 'editar' && (
                <form
                  className="panel-clinica-info-form"
                  onSubmit={(e) => {
                    e.preventDefault()
                    guardarCambios()
                  }}
                  noValidate
                >
                  <div className="panel-clinica-section-title-wrap">
                    <h3 className="panel-clinica-section-title">
                      Actualizar información del centro
                    </h3>
                  </div>

                  <div className="ficha-doc-note" style={{ width: '100%', boxSizing: 'border-box', marginBottom: '12px' }}>
                    <AlertTriangle size={18} aria-hidden="true" />
                    <p>
                      <strong>¿Cómo se actualizan tus datos?</strong>{' '}
                      Los datos de contacto, descripción, detalle de servicios y horarios se publican de inmediato con{' '}
                      <strong>Guardar cambios directos</strong>.{' '}
                      En cambio, el nombre institucional, tipo de institución, domicilio, áreas de servicio y ubicación geográfica requieren revisión administrativa mediante{' '}
                      <strong>Solicitar actualización</strong> (sin afectar tus datos publicados mientras se revisan).
                    </p>
                  </div>

                  {haySolicitudPendiente && (
                    <div className="ficha-ubicacion-pendiente-banner" role="status" style={{ width: '100%', boxSizing: 'border-box' }}>
                      <Clock3 size={18} aria-hidden="true" />
                      <div>
                        <strong>Tienes una solicitud pendiente de revisión administrativa</strong>
                        <p style={{ margin: '4px 0 0' }}>
                          No puedes enviar otra solicitud de actualización hasta que el administrador resuelva la actual.{' '}
                          <button
                            type="button"
                            className="ficha-link-button"
                            onClick={() => setVistaActiva('solicitudes')}
                          >
                            Ver en Mis solicitudes
                          </button>
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="panel-clinica-fields-row">
                    <div className="panel-clinica-field-col">
                      <label htmlFor="panel-nombre" className="panel-clinica-label">
                        Nombre de la clínica
                      </label>
                      <input
                        id="panel-nombre"
                        type="text"
                        maxLength={255}
                        className="panel-clinica-input"
                        value={form.nombre}
                        onChange={(e) => actualizarCampo('nombre', e.target.value)}
                        placeholder="Centro de Atención PuntoOax"
                      />
                    </div>

                    <div className="panel-clinica-field-col">
                      <label htmlFor="panel-municipio" className="panel-clinica-label">
                        Municipio
                      </label>
                      <input
                        id="panel-municipio"
                        type="text"
                        maxLength={100}
                        className="panel-clinica-input"
                        value={form.municipio}
                        onChange={(e) => actualizarCampo('municipio', e.target.value)}
                        placeholder="Oaxaca de Juárez"
                      />
                    </div>
                  </div>

                  <div className="panel-clinica-fields-row">
                    <div className="panel-clinica-field-col">
                      <label htmlFor="panel-tipo" className="panel-clinica-label">
                        Tipo de institución
                      </label>
                      <select
                        id="panel-tipo"
                        className="panel-clinica-input"
                        value={form.tipo_institucion}
                        onChange={(e) => actualizarCampo('tipo_institucion', e.target.value)}
                      >
                        <option value="">Selecciona una opción</option>
                        <option value="publica">Pública</option>
                        <option value="privada">Privada</option>
                        <option value="ong">Organización social (ONG)</option>
                        <option value="otra">Otra</option>
                      </select>
                    </div>

                    <div className="panel-clinica-field-col">
                      <label htmlFor="panel-telefono" className="panel-clinica-label">
                        Teléfono de contacto
                      </label>
                      <input
                        id="panel-telefono"
                        type="tel"
                        maxLength={20}
                        className="panel-clinica-input"
                        value={form.telefono}
                        onChange={(e) => actualizarCampo('telefono', e.target.value)}
                        placeholder="951 123 4567"
                      />
                    </div>
                  </div>

                  <div className="panel-clinica-fields-row">
                    <div className="panel-clinica-field-col">
                      <label htmlFor="panel-correo" className="panel-clinica-label">
                        Correo electrónico de contacto
                      </label>
                      <input
                        id="panel-correo"
                        type="email"
                        maxLength={255}
                        className="panel-clinica-input"
                        value={form.correo_contacto}
                        onChange={(e) => actualizarCampo('correo_contacto', e.target.value)}
                        placeholder="contacto@clinica.ejemplo"
                      />
                    </div>

                    <div className="panel-clinica-field-col">
                      <label htmlFor="panel-sitio" className="panel-clinica-label">
                        Sitio web (opcional)
                      </label>
                      <input
                        id="panel-sitio"
                        type="url"
                        maxLength={1000}
                        className="panel-clinica-input"
                        value={form.sitio_web}
                        onChange={(e) => actualizarCampo('sitio_web', e.target.value)}
                        placeholder="https://clinica.ejemplo"
                      />
                    </div>
                  </div>

                  <div className="panel-clinica-fields-row">
                    <div className="panel-clinica-field-col">
                      <label htmlFor="panel-direccion" className="panel-clinica-label">
                        Dirección
                      </label>
                      <input
                        id="panel-direccion"
                        type="text"
                        maxLength={500}
                        className="panel-clinica-input"
                        value={form.direccion}
                        onChange={(e) => actualizarCampo('direccion', e.target.value)}
                        placeholder="Calle, número y colonia"
                      />
                    </div>

                    <div className="panel-clinica-field-col">
                      <label htmlFor="panel-cp" className="panel-clinica-label">
                        Código postal
                      </label>
                      <input
                        id="panel-cp"
                        type="text"
                        inputMode="numeric"
                        maxLength={5}
                        className="panel-clinica-input"
                        value={form.codigo_postal}
                        onChange={(e) => actualizarCampo('codigo_postal', e.target.value)}
                        placeholder="68000"
                      />
                    </div>
                  </div>

                  <div className="panel-clinica-field-full">
                    <label htmlFor="panel-descripcion" className="panel-clinica-label">
                      Descripción de la clínica
                    </label>
                    <textarea
                      id="panel-descripcion"
                      rows={3}
                      maxLength={2000}
                      className="panel-clinica-textarea"
                      value={form.descripcion}
                      onChange={(e) => actualizarCampo('descripcion', e.target.value)}
                      placeholder="Describe brevemente a tu institución y la atención que ofrece."
                    />
                  </div>

                  <div className="panel-clinica-section-title-wrap" style={{ paddingTop: '28px' }}>
                    <h3 className="panel-clinica-section-title">
                      Servicios específicos del centro
                    </h3>
                  </div>

                  <div className="ficha-area-list" style={{ width: '100%' }}>
                    {AREAS.map((area) => {
                      const valor = form.servicios[area.categoria]
                      return (
                        <div
                          className={`ficha-area-card ${valor.seleccionado ? 'is-selected' : ''}`}
                          key={area.categoria}
                        >
                          <label className="ficha-check-row">
                            <input
                              type="checkbox"
                              checked={valor.seleccionado}
                              onChange={() => alternarServicio(area.categoria)}
                            />
                            <span>
                              <strong>{area.nombre}</strong>
                              <small>{area.ayuda}</small>
                            </span>
                          </label>
                          {valor.seleccionado && (
                            <div className="ficha-field">
                              <label htmlFor={`ficha-detalle-${area.categoria}`}>
                                Detalle de los servicios que brinda tu clínica
                              </label>
                              <textarea
                                id={`ficha-detalle-${area.categoria}`}
                                className="ficha-input ficha-textarea"
                                maxLength={2000}
                                rows={3}
                                value={valor.detalle}
                                onChange={(evento) =>
                                  actualizarDetalleServicio(area.categoria, evento.target.value)
                                }
                                placeholder={area.ayuda}
                              />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  <div className="panel-clinica-section-title-wrap" style={{ paddingTop: '28px' }}>
                    <h3 className="panel-clinica-section-title">
                      Horarios de atención
                    </h3>
                  </div>

                  <EditorHorarios
                    horarios={form.horarios}
                    idPrefijo="panel"
                    disabled={guardando}
                    onChange={(nuevosHorarios) => {
                      setForm((actual) => ({ ...actual, horarios: nuevosHorarios }))
                      setMensaje('')
                      setError('')
                    }}
                  />

                  <div className="panel-clinica-section-title-wrap" style={{ paddingTop: '28px' }}>
                    <h3 className="panel-clinica-section-title">
                      Ubicación geográfica del centro
                    </h3>
                  </div>

                  <div style={{ width: '100%' }}>
                    {ficha?.ubicacion_pendiente && (
                      <div className="ficha-ubicacion-pendiente-banner" role="status">
                        <AlertTriangle size={18} aria-hidden="true" />
                        <div>
                          <strong>Cambio de ubicación pendiente de revisión</strong>
                          <p style={{ margin: '4px 0 0' }}>
                            Solicitaste actualizar la ubicación a ({Number(ficha.ubicacion_pendiente.latitud).toFixed(6)}, {Number(ficha.ubicacion_pendiente.longitud).toFixed(6)}).
                            Tu ubicación pública aprobada permanece visible en el mapa hasta que el administrador apruebe el cambio.
                          </p>
                        </div>
                      </div>
                    )}

                    <SelectorUbicacionMapa
                      latitud={form.ubicacion?.latitud}
                      longitud={form.ubicacion?.longitud}
                      confirmada={form.ubicacion?.confirmada === true}
                      error={errorUbicacion}
                      deshabilitado={guardando || enviandoSolicitud || haySolicitudPendiente}
                      onConfirmar={confirmarUbicacion}
                      onCorregir={corregirUbicacion}
                    />
                  </div>

                  {(comparacionCambios.hayCambiosDirectos || comparacionCambios.hayCambiosRevision) && (
                    <div className="ficha-doc-note" role="status" style={{ width: '100%', boxSizing: 'border-box', marginTop: '14px' }}>
                      <CheckCircle2 size={18} aria-hidden="true" />
                      <p>
                        {comparacionCambios.hayCambiosDirectos && (
                          <span>
                            <strong>Cambios directos detectados ({comparacionCambios.cambiosDirectos.length}):</strong>{' '}
                            {comparacionCambios.cambiosDirectos.map((c) => c.etiqueta).join(', ')}.{' '}
                          </span>
                        )}
                        {comparacionCambios.hayCambiosRevision && (
                          <span>
                            <strong>Cambios que requieren revisión ({comparacionCambios.cambiosRevision.length}):</strong>{' '}
                            {comparacionCambios.cambiosRevision.map((c) => c.etiqueta).join(', ')}.
                          </span>
                        )}
                      </p>
                    </div>
                  )}

                  <div className="panel-clinica-actions-row">
                    <button
                      type="button"
                      className="panel-clinica-btn-secondary"
                      onClick={restaurarDatos}
                      disabled={guardando || enviandoSolicitud}
                    >
                      Restaurar
                    </button>

                    <div className="panel-clinica-actions-right">
                      <button
                        type="submit"
                        className="panel-clinica-btn-primary"
                        disabled={guardando || !comparacionCambios.hayCambiosDirectos}
                        title={
                          comparacionCambios.hayCambiosDirectos
                            ? 'Publicar cambios de contacto, descripción, detalles o horarios'
                            : 'No hay cambios directos pendientes por guardar'
                        }
                      >
                        <Save size={15} color="#FFFFFF" aria-hidden="true" />
                        <span>{guardando ? 'Guardando…' : 'Guardar cambios directos'}</span>
                      </button>

                      <button
                        type="button"
                        className="panel-clinica-btn-primary"
                        style={{ background: '#1F4E3D' }}
                        disabled={
                          guardando ||
                          enviandoSolicitud ||
                          haySolicitudPendiente ||
                          !comparacionCambios.hayCambiosRevision
                        }
                        onClick={abrirModalSolicitud}
                        title={
                          haySolicitudPendiente
                            ? 'Ya existe una solicitud pendiente de revisión'
                            : comparacionCambios.hayCambiosRevision
                              ? 'Enviar modificaciones institucionales o de ubicación a revisión administrativa'
                              : 'No hay cambios que requieran revisión administrativa'
                        }
                      >
                        <Send size={15} color="#FFFFFF" aria-hidden="true" />
                        <span>Solicitar actualización</span>
                      </button>
                    </div>
                  </div>
                </form>
              )}

              {vistaActiva === 'solicitudes' && (
                <HistorialSolicitudesClinica
                  solicitudSeleccionadaId={solicitudQueryId}
                  recargaTrigger={recargaSolicitudes}
                />
              )}
              <FuentesInformacion iniciales={ficha?.clinica?.enlaces_informacion} />
            </div>
          </div>
        </div>
      </main>

      <ModalSolicitudActualizacion
        abierto={modalSolicitudAbierto}
        cambios={comparacionCambios.cambiosRevision}
        enviando={enviandoSolicitud}
        errorServidor={errorSolicitud}
        onCancelar={() => setModalSolicitudAbierto(false)}
        onConfirmar={confirmarEnvioSolicitud}
      />

      <footer className="panel-clinica-footer">
        <div className="panel-clinica-footer-container">
          <p className="panel-clinica-footer-text">
            © 2026 PuntOax · Portal de Clínicas · Salud, bienestar y orientación en Oaxaca.
          </p>
        </div>
      </footer>
    </div>
  )
}
