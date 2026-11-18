import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Edit3,
  ExternalLink,
  Globe,
  Mail,
  MapPin,
  Phone,
  Save,
  Trash2,
} from 'lucide-react'
import {
  consultarCitasClinica,
  consultarMiFicha,
  guardarBorradorClinica,
  leerSesion,
} from '../../api/auth'
import EncabezadoClinica from './EncabezadoClinica.jsx'
import MapaLeaflet from '../Inicio/MapaLeaflet.jsx'
import { CLINICAS_DEMO, normalizarYUnificarClinicas } from '../../data/clinicasDemo.js'
import { OAXACA, coordenadas } from '../../utils/centros.js'
import { filtrarCitas } from '../../utils/citasClinica'
import { validarEmail, validarTelefono } from '../../utils/validaciones'
import '../../styles/Inicio.css'
import '../../css/PanelClinica.css'

const DIAS = [
  { numero: 0, nombre: 'Domingo' },
  { numero: 1, nombre: 'Lunes' },
  { numero: 2, nombre: 'Martes' },
  { numero: 3, nombre: 'Miércoles' },
  { numero: 4, nombre: 'Jueves' },
  { numero: 5, nombre: 'Viernes' },
  { numero: 6, nombre: 'Sábado' },
]

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
    servicios,
    horarios: (ficha.horarios || []).map((horario) => ({
      dia_semana: horario.dia_semana,
      apertura: horario.apertura,
      cierre: horario.cierre,
    })),
  }
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
      apertura: horario.apertura,
      cierre: horario.cierre,
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
  const ordenados = [...form.horarios].sort(
    (a, b) => a.dia_semana - b.dia_semana || a.apertura.localeCompare(b.apertura)
  )
  for (let i = 0; i < ordenados.length; i += 1) {
    const horario = ordenados[i]
    if (!horario.apertura || !horario.cierre) {
      return 'Completa la apertura y el cierre de cada horario.'
    }
    if (horario.apertura >= horario.cierre) {
      return 'La apertura debe ser anterior al cierre. Los turnos nocturnos aún no están disponibles.'
    }
    if (
      i > 0 &&
      ordenados[i - 1].dia_semana === horario.dia_semana &&
      horario.apertura < ordenados[i - 1].cierre
    ) {
      return 'Las franjas de un mismo día no deben solaparse.'
    }
  }
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
  const [catalogoClinicas, setCatalogoClinicas] = useState([])
  const [clinicaMapaSeleccionada, setClinicaMapaSeleccionada] = useState(null)
  const vistaActiva = searchParams.get('vista') === 'editar' ? 'editar' : 'inicio'
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState('')
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    sessionStorage.setItem('puntoax_panel_aprobado', '1')
  }, [])

  function setVistaActiva(nuevaVista) {
    if (nuevaVista === 'editar') {
      setSearchParams({ vista: 'editar' }, { replace: true })
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
    setErrorCarga('')
    try {
      aplicarFicha(await consultarMiFicha())
    } catch (err) {
      setErrorCarga(err.message)
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
        if (activo) setErrorCarga(err.message)
      })
      .finally(() => {
        if (activo) setCargando(false)
      })

    consultarCitasClinica()
      .then((res) => {
        if (!activo) return
        setCitasClinica(Array.isArray(res?.citas) ? res.citas : [])
      })
      .catch(() => {
        if (activo) setCitasClinica([])
      })

    fetch('/api/clinicas')
      .then((r) => (r.ok ? r.json() : []))
      .then((lista) => {
        if (!activo) return
        setCatalogoClinicas(Array.isArray(lista) ? lista : [])
      })
      .catch(() => {
        if (activo) setCatalogoClinicas([])
      })

    return () => {
      activo = false
    }
  }, [])

  const citasProximasCount = useMemo(
    () => filtrarCitas(citasClinica, 'proximas').length,
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

  const centrosParaMapa = useMemo(() => {
    const base =
      catalogoClinicas.length > 0
        ? catalogoClinicas
        : normalizarYUnificarClinicas(CLINICAS_DEMO)

    if (!ficha?.clinica || !form) return base

    const idPropio = ficha.clinica.id_clinica
    const existente = base.find(
      (c) =>
        c.id_clinica === idPropio ||
        (c.nombre &&
          form.nombre &&
          c.nombre.trim().toLowerCase() === form.nombre.trim().toLowerCase())
    )

    const coordsExistentes = coordenadas(existente || ficha.clinica)
    const [lat, lng] = coordsExistentes || OAXACA

    const miCentroEnMapa = {
      ...(existente || {}),
      id_clinica: idPropio || 'mi-clinica-actual',
      nombre: form.nombre.trim() || ficha.clinica.nombre || 'Mi clínica',
      municipio: form.municipio.trim() || ficha.clinica.municipio || 'Oaxaca de Juárez',
      direccion: form.direccion.trim() || ficha.clinica.direccion || 'Dirección registrada',
      telefono: form.telefono.trim() || ficha.clinica.telefono || '',
      servicios: areasSeleccionadas.map((a) => a.nombre),
      horarios: form.horarios,
      latitud: lat,
      longitud: lng,
      ubicacion_confirmada: true,
      esMiCentro: true,
    }

    const resto = base.filter(
      (c) =>
        c.id_clinica !== idPropio &&
        (!existente || c.id_clinica !== existente.id_clinica)
    )

    return [miCentroEnMapa, ...resto]
  }, [catalogoClinicas, ficha, form, areasSeleccionadas])

  const centroActivoEnMapa =
    clinicaMapaSeleccionada || centrosParaMapa[0] || null

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
          <h1>No pudimos cargar los datos de tu clínica</h1>
          <p>{errorCarga}</p>
          <button type="button" className="ficha-btn-primary" onClick={cargarFicha}>
            Reintentar
          </button>
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

  const franjasDelDia = (dia) =>
    form.horarios
      .map((horario, indice) => ({ ...horario, indice }))
      .filter((horario) => horario.dia_semana === dia)

  const alternarDia = (dia) => {
    const franjas = franjasDelDia(dia)
    setForm((actual) => ({
      ...actual,
      horarios: franjas.length
        ? actual.horarios.filter((horario) => horario.dia_semana !== dia)
        : [...actual.horarios, { dia_semana: dia, apertura: '09:00', cierre: '17:00' }],
    }))
    setMensaje('')
  }

  const agregarFranja = (dia) => {
    setForm((actual) => ({
      ...actual,
      horarios: [...actual.horarios, { dia_semana: dia, apertura: '18:00', cierre: '20:00' }],
    }))
    setMensaje('')
  }

  const actualizarHorario = (indice, campo, valor) => {
    setForm((actual) => ({
      ...actual,
      horarios: actual.horarios.map((horario, posicion) =>
        posicion === indice ? { ...horario, [campo]: valor } : horario
      ),
    }))
    setMensaje('')
  }

  const eliminarFranja = (indice) => {
    setForm((actual) => ({
      ...actual,
      horarios: actual.horarios.filter((_, posicion) => posicion !== indice),
    }))
    setMensaje('')
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

      if (respuestaHttp.ok) {
        const actualizada = await consultarMiFicha()
        setFicha(actualizada)
        return actualizada
      }
      const errJson = await respuestaHttp.json().catch(() => null)
      throw new Error(errJson?.error || 'No se pudieron actualizar los datos publicados.')
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
                      ACTIVO
                    </span>
                    <span className="panel-clinica-center-meta">
                      {nombreCentroMostrado} • {municipioMostrado}
                    </span>
                  </div>
                  <h2 className="panel-clinica-welcome-title">
                    ¡Bienvenido, equipo!
                  </h2>
                  <div className="panel-clinica-welcome-actions">
                    {vistaActiva === 'inicio' ? (
                      <button
                        type="button"
                        className="panel-clinica-edit-shortcut"
                        onClick={() => setVistaActiva('editar')}
                      >
                        <Edit3 size={14} color="#FFFFFF" aria-hidden="true" />
                        <span>Actualizar información</span>
                      </button>
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

                {/* Indicador compacto */}
                <div className="panel-clinica-top-overview-right">
                  <div className="panel-clinica-stats-row">
                    <div className="panel-clinica-stat-card">
                      <span className="panel-clinica-stat-value">
                        {citasProximasCount}
                      </span>
                      <span className="panel-clinica-stat-label">
                        Citas próximas
                      </span>
                    </div>
                  </div>
                </div>
              </div>

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
                                const nombreDia =
                                  DIAS.find((d) => d.numero === Number(h.dia_semana))?.nombre ||
                                  'Día'
                                return (
                                  <li key={`${h.dia_semana}-${idx}`}>
                                    <strong>{nombreDia}:</strong> {h.apertura} - {h.cierre}
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

                  {/* Columna derecha: Mapa integrado al lado de los datos */}
                  <section
                    className="panel-clinica-summary-block"
                    aria-labelledby="resumen-mapa-clinica"
                  >
                    <div className="panel-clinica-summary-header">
                      <div>
                        <h3 id="resumen-mapa-clinica" className="panel-clinica-section-title">
                          Mapa de tu centro y red de clínicas
                        </h3>
                      </div>

                      <button
                        type="button"
                        className="panel-clinica-focus-btn"
                        onClick={() => setClinicaMapaSeleccionada(centrosParaMapa[0] || null)}
                      >
                        <MapPin size={13} color="#FFFFFF" aria-hidden="true" />
                        <span>Mi centro</span>
                      </button>
                    </div>

                    <div className="panel-clinica-map-vertical">
                      <div className="panel-clinica-map-canvas">
                        <MapaLeaflet
                          clinicas={centrosParaMapa}
                          clinicaSeleccionada={centroActivoEnMapa}
                          onSeleccionarClinica={(c) => setClinicaMapaSeleccionada(c)}
                          onVerDetallesClinica={(c) => setClinicaMapaSeleccionada(c)}
                        />
                      </div>

                      <div className="panel-clinica-map-chips" aria-label="Centros en el mapa">
                        {centrosParaMapa.slice(0, 4).map((centro) => {
                          const activo =
                            centroActivoEnMapa?.id_clinica === centro.id_clinica
                          return (
                            <button
                              key={centro.id_clinica}
                              type="button"
                              className={`panel-clinica-map-item ${activo ? 'is-selected' : ''
                                }`}
                              onClick={() => setClinicaMapaSeleccionada(centro)}
                            >
                              <span
                                className={`panel-clinica-map-badge ${centro.esMiCentro ? 'is-own' : ''
                                  }`}
                              >
                                {centro.esMiCentro ? 'TU CENTRO' : centro.municipio || 'Oaxaca'}
                              </span>
                              <strong className="panel-clinica-map-item-name">
                                {centro.nombre}
                              </strong>
                            </button>
                          )
                        })}
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

                  <div className="ficha-days" style={{ width: '100%' }}>
                    {DIAS.map((dia) => {
                      const franjas = franjasDelDia(dia.numero)
                      return (
                        <div
                          className={`ficha-day-card ${franjas.length ? 'is-selected' : ''}`}
                          key={dia.numero}
                        >
                          <div className="ficha-day-header">
                            <label className="ficha-check-row">
                              <input
                                type="checkbox"
                                checked={franjas.length > 0}
                                onChange={() => alternarDia(dia.numero)}
                              />
                              <span>
                                <strong>{dia.nombre}</strong>
                              </span>
                            </label>
                            {franjas.length > 0 && (
                              <button
                                type="button"
                                className="ficha-link-button"
                                onClick={() => agregarFranja(dia.numero)}
                              >
                                + Agregar franja
                              </button>
                            )}
                          </div>
                          {franjas.map((franja) => (
                            <div className="ficha-time-row" key={franja.indice}>
                              <div className="ficha-field">
                                <label htmlFor={`ficha-apertura-${franja.indice}`}>Apertura</label>
                                <input
                                  id={`ficha-apertura-${franja.indice}`}
                                  className="ficha-input"
                                  type="time"
                                  value={franja.apertura}
                                  onChange={(evento) =>
                                    actualizarHorario(franja.indice, 'apertura', evento.target.value)
                                  }
                                />
                              </div>
                              <div className="ficha-field">
                                <label htmlFor={`ficha-cierre-${franja.indice}`}>Cierre</label>
                                <input
                                  id={`ficha-cierre-${franja.indice}`}
                                  className="ficha-input"
                                  type="time"
                                  value={franja.cierre}
                                  onChange={(evento) =>
                                    actualizarHorario(franja.indice, 'cierre', evento.target.value)
                                  }
                                />
                              </div>
                              {franjas.length > 1 && (
                                <button
                                  type="button"
                                  className="ficha-icon-button"
                                  onClick={() => eliminarFranja(franja.indice)}
                                  aria-label={`Eliminar franja del ${dia.nombre}`}
                                >
                                  <Trash2 size={16} aria-hidden="true" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )
                    })}
                  </div>

                  <div className="panel-clinica-actions-row">
                    <button
                      type="button"
                      className="panel-clinica-btn-secondary"
                      onClick={restaurarDatos}
                      disabled={guardando}
                    >
                      Restaurar
                    </button>

                    <div className="panel-clinica-actions-right">
                      <button
                        type="submit"
                        className="panel-clinica-btn-primary"
                        disabled={guardando}
                      >
                        <Save size={15} color="#FFFFFF" aria-hidden="true" />
                        <span>{guardando ? 'Guardando…' : 'Guardar cambios'}</span>
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>

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
