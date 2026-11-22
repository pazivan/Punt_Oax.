import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock3,
  FileText,
  MapPin,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react'
import {
  consultarMiFicha,
  eliminarDocumentoClinica,
  enviarPostulacionClinica,
  guardarBorradorClinica,
  subirDocumentosClinica,
} from '../../api/auth'
import {
  construirPayloadFicha,
  listarPendientes,
  primerCampoConError,
  validarCoordenadas,
  validarFichaCompleta,
  validarFormatoFicha,
} from '../../utils/validacionFicha'
import './FichaClinica.css'
import EncabezadoClinica from './EncabezadoClinica.jsx'
import PanelClinica from './PanelClinica.jsx'
import SelectorUbicacionMapa from './SelectorUbicacionMapa.jsx'
import EditorHorarios from './EditorHorarios.jsx'
import HistorialSolicitudesClinica from './HistorialSolicitudesClinica.jsx'

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

const MAX_DOCUMENTOS = 5
const MAX_BYTES = 5 * 1024 * 1024
const TIPOS_ARCHIVO = ['application/pdf', 'image/png', 'image/jpeg']

function numeroUbicacion(valor) {
  if (valor == null || valor === '') return null
  const numero = Number(valor)
  return Number.isFinite(numero) ? numero : null
}

function estadoInicialDesdeFicha(ficha) {
  const servicios = { its: { seleccionado: false, detalle: '' }, ile: { seleccionado: false, detalle: '' } }
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

function formatearBytes(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatearFecha(fecha) {
  if (!fecha) return ''
  const valor = new Date(fecha)
  return Number.isNaN(valor.getTime())
    ? ''
    : valor.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })
}

function idError(campo) {
  return `error-${String(campo).replace(/:/g, '-')}`
}

function ErrorCampo({ errores, campo }) {
  if (!errores[campo]) return null
  return (
    <p className="ficha-field-error" id={idError(campo)} role="alert">
      {errores[campo]}
    </p>
  )
}

function CabeceraClinica({ sesion, onSalir, estadoPublicacion }) {
  return (
    <EncabezadoClinica
      sesion={sesion}
      onSalir={onSalir}
      modoPostulacion
      estadoPublicacion={estadoPublicacion}
    />
  )
}

export default function FichaClinica({ sesion, onSalir }) {
  const [ficha, setFicha] = useState(null)
  const [form, setForm] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState('')
  const [error, setError] = useState('')
  const [resumen, setResumen] = useState('')
  const [errores, setErrores] = useState({})
  const [mensaje, setMensaje] = useState('')
  const [faltantes, setFaltantes] = useState([])
  const [guardando, setGuardando] = useState(false)
  const [subiendo, setSubiendo] = useState(false)
  const [postulando, setPostulando] = useState(false)
  const [archivosPendientes, setArchivosPendientes] = useState([])
  const [confirmacionAbierta, setConfirmacionAbierta] = useState(false)
  const entradaArchivos = useRef(null)
  const enviandoPostulacion = useRef(false)

  function aplicarFicha(datos) {
    setFicha(datos)
    setForm(estadoInicialDesdeFicha(datos))
    setFaltantes(Array.isArray(datos.faltantes) ? datos.faltantes : [])
    setErrores({})
    setResumen('')
    if (datos?.clinica?.estado_publicacion !== 'aprobada') {
      sessionStorage.removeItem('puntoax_panel_aprobado')
    }
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
        if (activo) aplicarFicha(datos)
      })
      .catch((err) => {
        if (activo) setErrorCarga(err.message)
      })
      .finally(() => {
        if (activo) setCargando(false)
      })
    return () => { activo = false }
  }, [])

  const faltantesActuales = useMemo(
    () => (form ? listarPendientes(form, ficha?.documentos || [], form.ubicacion) : []),
    [form, ficha]
  )

  if (cargando) {
    return (
      <div className="ficha-page">
        <CabeceraClinica sesion={sesion} onSalir={onSalir} />
        <main className="ficha-loading" role="status">
          <span className="ficha-spinner" aria-hidden="true" />
          <p>Cargando la ficha de tu clínica…</p>
        </main>
      </div>
    )
  }

  if (errorCarga) {
    return (
      <div className="ficha-page">
        <CabeceraClinica sesion={sesion} onSalir={onSalir} />
        <main className="ficha-state-card" role="alert">
          <AlertTriangle size={30} aria-hidden="true" />
          <h1>No pudimos cargar tu ficha</h1>
          <p>{errorCarga}</p>
          <button type="button" className="ficha-btn-primary" onClick={cargarFicha}>
            Reintentar
          </button>
          <Link to="/mi-perfil" className="ficha-inline-link">Ir a mi perfil</Link>
        </main>
      </div>
    )
  }

  // Las sedes aprobadas ya tienen ficha publicada: abren el PanelClinica.
  if (ficha?.clinica?.estado_publicacion === 'aprobada') {
    return <PanelClinica sesion={sesion} onSalir={onSalir} />
  }

  const pendiente = ficha?.postulacion?.estado === 'pendiente' || ficha?.clinica?.estado_ficha === 'pendiente_revision'

  if (pendiente) {
    return (
      <div className="ficha-page">
        <CabeceraClinica
          sesion={sesion}
          onSalir={onSalir}
          estadoPublicacion={ficha?.clinica?.estado_publicacion}
        />
        <main className="ficha-pending" id="postulacion">
          <div className="ficha-pending-icon" aria-hidden="true">
            <CheckCircle2 size={40} />
          </div>
          <span className="ficha-eyebrow">POSTULACIÓN ENVIADA</span>
          <h1>Tu postulación fue enviada correctamente</h1>
          <p className="ficha-pending-copy">
            La ficha de <strong>{ficha.clinica?.nombre}</strong> está pendiente de revisión.
            No necesitas enviarla de nuevo.
          </p>
          <dl className="ficha-pending-details">
            <div>
              <dt>Estado</dt>
              <dd>Pendiente de revisión</dd>
            </div>
            <div>
              <dt>Fecha de envío</dt>
              <dd>{formatearFecha(ficha.postulacion?.fecha_solicitud) || 'Registrada'}</dd>
            </div>
            <div>
              <dt>Publicación</dt>
              <dd>No aparece en el mapa ni en el directorio hasta ser aprobada.</dd>
            </div>
          </dl>
          <p className="ficha-pending-note">
            La revisión administrativa, las notificaciones y la edición autorizada
            se habilitarán en una etapa posterior.
          </p>
          <div className="ficha-pending-actions">
            <Link to="/mi-perfil" className="ficha-btn-secondary">Mi perfil</Link>
            <button type="button" className="ficha-btn-primary" onClick={onSalir}>Cerrar sesión</button>
          </div>
          <div style={{ marginTop: '24px', width: '100%', textAlign: 'left' }}>
            <HistorialSolicitudesClinica />
          </div>
        </main>
      </div>
    )
  }

  if (!ficha?.clinica?.puede_editar) {
    const suspendida = ficha?.clinica?.estado_publicacion === 'suspendida'
    const rechazada = ficha?.clinica?.estado_publicacion === 'rechazada'
    return (
      <div className="ficha-page">
        <CabeceraClinica
          sesion={sesion}
          onSalir={onSalir}
          estadoPublicacion={ficha?.clinica?.estado_publicacion}
        />
        <main className="ficha-state-card">
          <ShieldCheck size={30} aria-hidden="true" />
          <h1>
            {suspendida
              ? 'Tu clínica está suspendida'
              : rechazada
                ? 'Tu postulación fue rechazada'
                : 'La ficha no está disponible para edición'}
          </h1>
          <p>
            {suspendida
              ? 'La clínica no aparece en el directorio público mientras permanezca suspendida. Contacta al equipo de PuntOax para más información.'
              : rechazada
                ? 'Revisa las observaciones de la revisión administrativa y vuelve a enviar tu postulación.'
                : 'La clínica ya no puede modificarse desde este flujo en su estado actual.'}
          </p>
          <Link to="/mi-perfil" className="ficha-btn-secondary">Ir a mi perfil</Link>
        </main>
      </div>
    )
  }

  if (!form) return null

  const limpiarError = (campo) => {
    setErrores((actual) => {
      if (!actual[campo]) return actual
      const copia = { ...actual }
      delete copia[campo]
      return copia
    })
    setResumen('')
    setError('')
  }

  const limpiarErrores = (campos) => {
    setErrores((actual) => {
      let copia = actual
      for (const campo of campos) {
        if (!(campo in copia)) continue
        if (copia === actual) copia = { ...actual }
        delete copia[campo]
      }
      return copia
    })
    setResumen('')
    setError('')
  }

  const enfocarCampo = (campo) => {
    const id = {
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
    }[campo] || (campo.startsWith('horario:') ? `ficha-apertura-${campo.split(':')[1]}` : null)
    const elemento = id ? document.getElementById(id) : null
    const objetivo = campo === 'ubicacion'
      ? elemento?.querySelector('.ficha-mapa-acciones button')
      : elemento?.matches('input, select, textarea, button')
        ? elemento
        : elemento?.querySelector('input, select, textarea, button')
    if (!objetivo) return
    objetivo.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setTimeout(() => objetivo.focus({ preventScroll: true }), 260)
  }

  const mostrarErrores = (nuevos, textoResumen) => {
    setErrores(nuevos)
    setError('')
    setResumen(textoResumen || 'Revisa los campos marcados antes de continuar.')
    const primero = primerCampoConError(nuevos)
    if (primero) enfocarCampo(primero)
  }

  const actualizarCampo = (campo, valor) => {
    setForm((actual) => ({ ...actual, [campo]: valor }))
    limpiarError(campo)
    setMensaje('')
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
    limpiarErrores(['servicios', `servicio_${categoria}`])
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
    limpiarErrores([`servicio_${categoria}`, 'servicios'])
    setMensaje('')
  }

  const limpiarErroresHorario = () => {
    setErrores((actual) => {
      const copia = { ...actual }
      delete copia.horarios
      for (const campo of Object.keys(copia)) {
        if (campo.startsWith('horario:')) delete copia[campo]
      }
      return copia
    })
    setResumen('')
    setError('')
  }

  const confirmarUbicacion = ({ latitud, longitud }) => {
    const coordenadas = validarCoordenadas(latitud, longitud)
    if (coordenadas.error) {
      setErrores((actual) => ({ ...actual, ubicacion: coordenadas.error }))
      return
    }
    setForm((actual) => ({
      ...actual,
      ubicacion: {
        latitud: coordenadas.latitud,
        longitud: coordenadas.longitud,
        confirmada: true,
      },
    }))
    limpiarError('ubicacion')
    setMensaje('Ubicación confirmada. Guarda el borrador para conservarla.')
  }

  const corregirUbicacion = () => {
    setForm((actual) => ({
      ...actual,
      ubicacion: { ...actual.ubicacion, confirmada: false },
    }))
    setMensaje('Mueve el mapa y confirma la nueva ubicación. Aún no se ha guardado.')
  }

  async function persistirBorrador() {
    const respuesta = await guardarBorradorClinica(construirPayloadFicha(form))
    setFicha(respuesta)
    setFaltantes(Array.isArray(respuesta.faltantes) ? respuesta.faltantes : [])
    return respuesta
  }

  const guardarBorrador = async () => {
    if (guardando || postulando) return
    setError('')
    setMensaje('')
    const invalidos = validarFormatoFicha(form)
    if (Object.keys(invalidos).length) {
      mostrarErrores(invalidos, 'Corrige los datos marcados para guardar el borrador.')
      return
    }
    setGuardando(true)
    try {
      await persistirBorrador()
      setErrores({})
      setResumen('')
      setMensaje('Borrador guardado correctamente. Puedes cerrar sesión y continuar después.')
    } catch (err) {
      if (err.campos && typeof err.campos === 'object') {
        mostrarErrores(err.campos, 'Corrige los datos marcados por el servidor.')
      }
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  const seleccionarArchivos = (evento) => {
    const archivos = Array.from(evento.target.files || [])
    setError('')
    setMensaje('')
    if (!archivos.length) {
      setArchivosPendientes([])
      return
    }
    const disponibles = MAX_DOCUMENTOS - (ficha.documentos?.length || 0)
    if (archivos.length > disponibles) {
      setErrores((actual) => ({
        ...actual,
        documentos: `Solo puedes adjuntar ${disponibles} documento(s) más; el máximo total es ${MAX_DOCUMENTOS}.`,
      }))
      setArchivosPendientes([])
      evento.target.value = ''
      return
    }
    const invalido = archivos.find((archivo) =>
      !TIPOS_ARCHIVO.includes(archivo.type) || archivo.size === 0 || archivo.size > MAX_BYTES)
    if (invalido) {
      setErrores((actual) => ({
        ...actual,
        documentos: 'Cada documento debe ser PDF, PNG o JPG de hasta 5 MB.',
      }))
      setArchivosPendientes([])
      evento.target.value = ''
      return
    }
    limpiarError('documentos')
    setArchivosPendientes(archivos)
  }

  const subirArchivos = async () => {
    if (!archivosPendientes.length || subiendo || postulando) return
    setError('')
    setMensaje('')
    setSubiendo(true)
    try {
      const respuesta = await subirDocumentosClinica(archivosPendientes)
      setFicha(respuesta)
      setFaltantes(Array.isArray(respuesta.faltantes) ? respuesta.faltantes : [])
      setArchivosPendientes([])
      if (entradaArchivos.current) entradaArchivos.current.value = ''
      limpiarError('documentos')
      setMensaje('Documentos guardados correctamente. Permanecen privados.')
    } catch (err) {
      setErrores((actual) => ({ ...actual, documentos: err.message }))
    } finally {
      setSubiendo(false)
    }
  }

  const eliminarDocumento = async (idDocumento) => {
    if (subiendo || postulando) return
    if (!window.confirm('¿Eliminar este documento de respaldo? Esta acción no se puede deshacer.')) return
    setError('')
    setMensaje('')
    setSubiendo(true)
    try {
      await eliminarDocumentoClinica(idDocumento)
      setFicha((actual) => ({
        ...actual,
        documentos: actual.documentos.filter((documento) => documento.id_documento !== idDocumento),
      }))
      limpiarError('documentos')
      setMensaje('Documento eliminado correctamente.')
    } catch (err) {
      setError(err.message)
    } finally {
      setSubiendo(false)
    }
  }

  const abrirConfirmacion = () => {
    setError('')
    setMensaje('')
    setFaltantes([])
    const invalidos = validarFichaCompleta(form, ficha.documentos || [], form.ubicacion)
    if (Object.keys(invalidos).length) {
      mostrarErrores(invalidos, 'Completa los campos marcados antes de enviar tu postulación.')
      return
    }
    setErrores({})
    setResumen('')
    setConfirmacionAbierta(true)
  }

  const confirmarPostulacion = async () => {
    if (enviandoPostulacion.current || postulando) return
    enviandoPostulacion.current = true
    setPostulando(true)
    setError('')
    try {
      await persistirBorrador()
      const respuesta = await enviarPostulacionClinica()
      setConfirmacionAbierta(false)
      setMensaje(respuesta.mensaje)
      const actualizada = await consultarMiFicha()
      setFicha(actualizada)
      setFaltantes(Array.isArray(actualizada.faltantes) ? actualizada.faltantes : [])
    } catch (err) {
      if (err.campos && typeof err.campos === 'object') {
        mostrarErrores(err.campos, 'Corrige los datos marcados por el servidor.')
      }
      if (Array.isArray(err.faltantes) && err.faltantes.length) setFaltantes(err.faltantes)
      setError(err.message)
      setConfirmacionAbierta(false)
      if (/pendiente de revisión/i.test(err.message)) {
        try {
          const actualizada = await consultarMiFicha()
          setFicha(actualizada)
        } catch {
          // Conservar el mensaje original del servidor.
        }
      }
    } finally {
      enviandoPostulacion.current = false
      setPostulando(false)
    }
  }

  const restantesDocumentos = MAX_DOCUMENTOS - (ficha.documentos?.length || 0)
  const rechazada = ficha.postulacion?.estado === 'rechazada' || ficha.clinica?.estado_publicacion === 'rechazada'

  return (
    <div className="ficha-page">
      <CabeceraClinica
        sesion={sesion}
        onSalir={onSalir}
        estadoPublicacion={ficha.clinica?.estado_publicacion}
      />

      <main className="ficha-main" id="postulacion">
        <section className="ficha-hero">
          <div>
            <span className="ficha-eyebrow">
              FICHA INSTITUCIONAL · {rechazada ? 'CORRECCIONES SOLICITADAS' : 'BORRADOR'}
            </span>
            <h1>Completa los datos de tu clínica</h1>
            <p>
              Guarda tu avance las veces que necesites. Cuando la información esté completa,
              podrás enviarla para revisión. Tu clínica no se publica automáticamente.
            </p>
          </div>
          <div className="ficha-hero-badge">
            <Building2 size={18} aria-hidden="true" />
            <span>{ficha.clinica?.correo_acceso}</span>
          </div>
        </section>

        {rechazada && (
          <div className="ficha-alert ficha-alert-warning" role="status">
            <AlertTriangle size={18} aria-hidden="true" />
            <div>
              <strong>La postulación requiere correcciones</strong>
              <p>
                {ficha.postulacion?.observaciones
                  || 'Revisa la información, corrige lo necesario y vuelve a enviar tu postulación.'}
              </p>
            </div>
          </div>
        )}

        {(error || resumen) && (
          <div className="ficha-alert ficha-alert-error" role="alert">
            <AlertTriangle size={18} aria-hidden="true" />
            <div>
              <strong>{error ? 'No se pudo completar la acción' : 'Revisa la información'}</strong>
              <p>{error || resumen}</p>
              {faltantes.length > 0 && !Object.keys(errores).length && (
                <ul className="ficha-alert-list">
                  {faltantes.map((faltante) => <li key={faltante}>{faltante}</li>)}
                </ul>
              )}
            </div>
          </div>
        )}

        {mensaje && (
          <div className="ficha-alert ficha-alert-success" role="status">
            <CheckCircle2 size={18} aria-hidden="true" />
            <p>{mensaje}</p>
          </div>
        )}

        <div className="ficha-layout">
          <form className="ficha-form" onSubmit={(evento) => evento.preventDefault()} noValidate>
            <section className="ficha-section" aria-labelledby="ficha-general">
              <div className="ficha-section-heading">
                <span className="ficha-step">A</span>
                <div>
                  <h2 id="ficha-general">Información general</h2>
                  <p>Datos de contacto y presentación de la institución.</p>
                </div>
              </div>
              <div className="ficha-grid">
                <div className={`ficha-field ficha-field-full ${errores.nombre ? 'has-error' : ''}`}>
                  <label htmlFor="ficha-nombre">Nombre de la clínica *</label>
                  <input
                    id="ficha-nombre"
                    className={`ficha-input ${errores.nombre ? 'is-invalid' : ''}`}
                    type="text"
                    maxLength={255}
                    value={form.nombre}
                    aria-invalid={Boolean(errores.nombre)}
                    aria-describedby={errores.nombre ? idError('nombre') : undefined}
                    onChange={(evento) => actualizarCampo('nombre', evento.target.value)}
                  />
                  <ErrorCampo errores={errores} campo="nombre" />
                </div>
                <div className={`ficha-field ${errores.tipo_institucion ? 'has-error' : ''}`}>
                  <label htmlFor="ficha-tipo">Tipo de institución *</label>
                  <select
                    id="ficha-tipo"
                    className={`ficha-input ${errores.tipo_institucion ? 'is-invalid' : ''}`}
                    value={form.tipo_institucion}
                    aria-invalid={Boolean(errores.tipo_institucion)}
                    aria-describedby={errores.tipo_institucion ? idError('tipo_institucion') : undefined}
                    onChange={(evento) => actualizarCampo('tipo_institucion', evento.target.value)}
                  >
                    <option value="">Selecciona una opción</option>
                    <option value="publica">Pública</option>
                    <option value="privada">Privada</option>
                    <option value="ong">Organización social</option>
                    <option value="otra">Otra</option>
                  </select>
                  <ErrorCampo errores={errores} campo="tipo_institucion" />
                </div>
                <div className={`ficha-field ${errores.telefono ? 'has-error' : ''}`}>
                  <label htmlFor="ficha-telefono">Teléfono *</label>
                  <input
                    id="ficha-telefono"
                    className={`ficha-input ${errores.telefono ? 'is-invalid' : ''}`}
                    type="tel"
                    maxLength={20}
                    value={form.telefono}
                    aria-invalid={Boolean(errores.telefono)}
                    aria-describedby={errores.telefono ? idError('telefono') : undefined}
                    onChange={(evento) => actualizarCampo('telefono', evento.target.value)}
                    placeholder="951 123 4567"
                  />
                  <ErrorCampo errores={errores} campo="telefono" />
                </div>
                <div className={`ficha-field ${errores.correo_contacto ? 'has-error' : ''}`}>
                  <label htmlFor="ficha-correo">Correo de contacto *</label>
                  <input
                    id="ficha-correo"
                    className={`ficha-input ${errores.correo_contacto ? 'is-invalid' : ''}`}
                    type="email"
                    maxLength={255}
                    value={form.correo_contacto}
                    aria-invalid={Boolean(errores.correo_contacto)}
                    aria-describedby={errores.correo_contacto ? idError('correo_contacto') : undefined}
                    onChange={(evento) => actualizarCampo('correo_contacto', evento.target.value)}
                    placeholder="contacto@clinica.ejemplo"
                  />
                  <small>Es independiente del correo con el que inicias sesión.</small>
                  <ErrorCampo errores={errores} campo="correo_contacto" />
                </div>
                <div className={`ficha-field ${errores.sitio_web ? 'has-error' : ''}`}>
                  <label htmlFor="ficha-sitio">Sitio web (opcional)</label>
                  <input
                    id="ficha-sitio"
                    className={`ficha-input ${errores.sitio_web ? 'is-invalid' : ''}`}
                    type="url"
                    maxLength={1000}
                    value={form.sitio_web}
                    aria-invalid={Boolean(errores.sitio_web)}
                    aria-describedby={errores.sitio_web ? idError('sitio_web') : undefined}
                    onChange={(evento) => actualizarCampo('sitio_web', evento.target.value)}
                    placeholder="https://clinica.ejemplo"
                  />
                  <ErrorCampo errores={errores} campo="sitio_web" />
                </div>
                <div className={`ficha-field ficha-field-full ${errores.descripcion ? 'has-error' : ''}`}>
                  <label htmlFor="ficha-descripcion">Descripción *</label>
                  <textarea
                    id="ficha-descripcion"
                    className={`ficha-input ficha-textarea ${errores.descripcion ? 'is-invalid' : ''}`}
                    maxLength={2000}
                    rows={4}
                    value={form.descripcion}
                    aria-invalid={Boolean(errores.descripcion)}
                    aria-describedby={errores.descripcion ? idError('descripcion') : undefined}
                    onChange={(evento) => actualizarCampo('descripcion', evento.target.value)}
                    placeholder="Describe brevemente a tu institución y la atención que ofrece."
                  />
                  <small>{form.descripcion.length}/2000 caracteres</small>
                  <ErrorCampo errores={errores} campo="descripcion" />
                </div>
              </div>
            </section>

            <section className="ficha-section" aria-labelledby="ficha-ubicacion">
              <div className="ficha-section-heading">
                <span className="ficha-step">B</span>
                <div>
                  <h2 id="ficha-ubicacion">Ubicación</h2>
                  <p>Dirección de la sede, referencias y punto exacto en el mapa.</p>
                </div>
              </div>
              <div className="ficha-grid">
                <div className={`ficha-field ${errores.municipio ? 'has-error' : ''}`}>
                  <label htmlFor="ficha-municipio">Municipio *</label>
                  <input
                    id="ficha-municipio"
                    className={`ficha-input ${errores.municipio ? 'is-invalid' : ''}`}
                    type="text"
                    maxLength={100}
                    value={form.municipio}
                    aria-invalid={Boolean(errores.municipio)}
                    aria-describedby={errores.municipio ? idError('municipio') : undefined}
                    onChange={(evento) => actualizarCampo('municipio', evento.target.value)}
                    placeholder="Oaxaca de Juárez"
                  />
                  <ErrorCampo errores={errores} campo="municipio" />
                </div>
                <div className={`ficha-field ${errores.codigo_postal ? 'has-error' : ''}`}>
                  <label htmlFor="ficha-cp">Código postal (opcional)</label>
                  <input
                    id="ficha-cp"
                    className={`ficha-input ${errores.codigo_postal ? 'is-invalid' : ''}`}
                    type="text"
                    inputMode="numeric"
                    maxLength={5}
                    value={form.codigo_postal}
                    aria-invalid={Boolean(errores.codigo_postal)}
                    aria-describedby={errores.codigo_postal ? idError('codigo_postal') : undefined}
                    onChange={(evento) => actualizarCampo('codigo_postal', evento.target.value)}
                    placeholder="68000"
                  />
                  <ErrorCampo errores={errores} campo="codigo_postal" />
                </div>
                <div className={`ficha-field ficha-field-full ${errores.direccion ? 'has-error' : ''}`}>
                  <label htmlFor="ficha-direccion">Dirección *</label>
                  <input
                    id="ficha-direccion"
                    className={`ficha-input ${errores.direccion ? 'is-invalid' : ''}`}
                    type="text"
                    maxLength={500}
                    value={form.direccion}
                    aria-invalid={Boolean(errores.direccion)}
                    aria-describedby={errores.direccion ? idError('direccion') : undefined}
                    onChange={(evento) => actualizarCampo('direccion', evento.target.value)}
                    placeholder="Calle, número, colonia"
                  />
                  <ErrorCampo errores={errores} campo="direccion" />
                </div>
                <div className={`ficha-field ficha-field-full ${errores.ubicacion_maps_url ? 'has-error' : ''}`}>
                  <label htmlFor="ficha-maps">Enlace de Google Maps (opcional)</label>
                  <input
                    id="ficha-maps"
                    className={`ficha-input ${errores.ubicacion_maps_url ? 'is-invalid' : ''}`}
                    type="url"
                    maxLength={1000}
                    value={form.ubicacion_maps_url}
                    aria-invalid={Boolean(errores.ubicacion_maps_url)}
                    aria-describedby={errores.ubicacion_maps_url ? idError('ubicacion_maps_url') : undefined}
                    onChange={(evento) => actualizarCampo('ubicacion_maps_url', evento.target.value)}
                    placeholder="https://maps.google.com/..."
                  />
                  <ErrorCampo errores={errores} campo="ubicacion_maps_url" />
                </div>
                <div className="ficha-field ficha-field-full">
                  <SelectorUbicacionMapa
                    latitud={form.ubicacion?.latitud}
                    longitud={form.ubicacion?.longitud}
                    confirmada={form.ubicacion?.confirmada === true}
                    error={errores.ubicacion || ''}
                    deshabilitado={guardando || postulando}
                    onConfirmar={confirmarUbicacion}
                    onCorregir={corregirUbicacion}
                  />
                </div>
              </div>
            </section>

            <section className={`ficha-section ${errores.servicios ? 'has-error' : ''}`} aria-labelledby="ficha-servicios">
              <div className="ficha-section-heading">
                <span className="ficha-step">C</span>
                <div>
                  <h2 id="ficha-servicios">Servicios disponibles</h2>
                  <p>Selecciona una o ambas áreas y describe lo que ofrece tu clínica.</p>
                </div>
              </div>
              <div className="ficha-area-list">
                {AREAS.map((area) => {
                  const valor = form.servicios[area.categoria]
                  return (
                    <div className={`ficha-area-card ${valor.seleccionado ? 'is-selected' : ''} ${errores.servicios || errores[`servicio_${area.categoria}`] ? 'has-error' : ''}`} key={area.categoria}>
                      <label className="ficha-check-row">
                        <input
                          id={`ficha-servicio-${area.categoria}`}
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
                        <div className={`ficha-field ${errores[`servicio_${area.categoria}`] ? 'has-error' : ''}`}>
                          <label htmlFor={`ficha-detalle-${area.categoria}`}>
                            Servicios específicos que ofrece tu clínica *
                          </label>
                          <textarea
                            id={`ficha-detalle-${area.categoria}`}
                            className={`ficha-input ficha-textarea ${errores[`servicio_${area.categoria}`] ? 'is-invalid' : ''}`}
                            maxLength={2000}
                            rows={3}
                            value={valor.detalle}
                            aria-invalid={Boolean(errores[`servicio_${area.categoria}`])}
                            aria-describedby={errores[`servicio_${area.categoria}`] ? idError(`servicio_${area.categoria}`) : undefined}
                            onChange={(evento) => actualizarDetalleServicio(area.categoria, evento.target.value)}
                            placeholder={area.ayuda}
                          />
                          <ErrorCampo errores={errores} campo={`servicio_${area.categoria}`} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              <ErrorCampo errores={errores} campo="servicios" />
              <p className="ficha-help">
                Se usa el catálogo existente de PuntOax; no se crean categorías nuevas desde este formulario.
              </p>
            </section>

            <section className={`ficha-section ${errores.horarios ? 'has-error' : ''}`} aria-labelledby="ficha-horarios">
              <div className="ficha-section-heading">
                <span className="ficha-step">D</span>
                <div>
                  <h2 id="ficha-horarios">Horarios de atención</h2>
                  <p>Marca los días de servicio y define una o más franjas por día.</p>
                </div>
              </div>
              <EditorHorarios
                horarios={form.horarios}
                errores={errores}
                idPrefijo="ficha"
                disabled={guardando || postulando}
                onChange={(nuevosHorarios) => {
                  setForm((actual) => ({ ...actual, horarios: nuevosHorarios }))
                  limpiarErroresHorario()
                  setMensaje('')
                }}
              />
              <ErrorCampo errores={errores} campo="horarios" />
              <p className="ficha-help">
                <Clock3 size={14} aria-hidden="true" /> Puedes usar las flechas o escribir directamente la hora.
                También puedes marcar atención de 24 horas o turno nocturno.
              </p>
            </section>

            <section className={`ficha-section ${errores.documentos ? 'has-error' : ''}`} aria-labelledby="ficha-documentos">
              <div className="ficha-section-heading">
                <span className="ficha-step">E</span>
                <div>
                  <h2 id="ficha-documentos">Documentación</h2>
                  <p>Respalda la información de tu clínica con archivos privados.</p>
                </div>
              </div>
              <div className="ficha-doc-note">
                <ShieldCheck size={18} aria-hidden="true" />
                <p>
                  Los documentos no se publican: solo los revisará el equipo de PuntOax.
                  No se exige una licencia sanitaria universal; adjunta el respaldo que
                  corresponda a la actividad de tu institución.
                </p>
              </div>
              <div className={`ficha-upload ${errores.documentos ? 'is-invalid' : ''}`}>
                <input
                  ref={entradaArchivos}
                  id="ficha-archivos"
                  className="ficha-file-input"
                  type="file"
                  aria-label="Documentos de respaldo"
                  aria-invalid={Boolean(errores.documentos)}
                  aria-describedby={errores.documentos ? idError('documentos') : undefined}
                  accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                  multiple
                  onChange={seleccionarArchivos}
                  disabled={subiendo || postulando || restantesDocumentos === 0}
                />
                <div className="ficha-upload-actions">
                  <button
                    type="button"
                    className="ficha-btn-secondary"
                    onClick={subirArchivos}
                    disabled={!archivosPendientes.length || subiendo || postulando}
                  >
                    <Upload size={16} aria-hidden="true" />
                    {subiendo ? 'Subiendo…' : 'Subir archivos'}
                  </button>
                  <span>
                    PDF, PNG o JPG · hasta 5 MB cada uno · {restantesDocumentos} de {MAX_DOCUMENTOS} disponibles
                  </span>
                </div>
              </div>
              <ErrorCampo errores={errores} campo="documentos" />
              {ficha.documentos?.length ? (
                <ul className="ficha-doc-list">
                  {ficha.documentos.map((documento) => (
                    <li key={documento.id_documento}>
                      <span className="ficha-doc-icon" aria-hidden="true"><FileText size={18} /></span>
                      <div>
                        <strong>{documento.nombre_original}</strong>
                        <small>
                          {formatearBytes(documento.tamano_bytes)} · Privado · {formatearFecha(documento.fecha_carga)}
                        </small>
                      </div>
                      <button
                        type="button"
                        className="ficha-icon-button"
                        onClick={() => eliminarDocumento(documento.id_documento)}
                        disabled={subiendo || postulando}
                        aria-label={`Eliminar ${documento.nombre_original}`}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="ficha-empty-docs">Todavía no has adjuntado documentos de respaldo.</p>
              )}
            </section>

            <div className="ficha-form-actions">
              <button
                type="button"
                className="ficha-btn-secondary ficha-btn-save"
                onClick={guardarBorrador}
                disabled={guardando || postulando}
              >
                <Save size={16} aria-hidden="true" />
                {guardando ? 'Guardando…' : 'Guardar borrador'}
              </button>
              <button
                type="button"
                className="ficha-btn-primary"
                onClick={abrirConfirmacion}
                disabled={guardando || postulando}
              >
                <Send size={16} aria-hidden="true" />
                {postulando ? 'Enviando…' : 'Enviar postulación'}
              </button>
            </div>
          </form>

          <aside className="ficha-sidebar">
            <div className="ficha-summary">
              <span className="ficha-eyebrow">ESTADO DEL BORRADOR</span>
              <h2>{faltantesActuales.length ? 'Ficha incompleta' : 'Ficha lista para postular'}</h2>
              <p>
                {faltantesActuales.length
                  ? 'Puedes guardar tu avance aunque falten datos. Estos son los pendientes:'
                  : 'La información obligatoria está completa. Puedes revisarla y enviar tu postulación.'}
              </p>
              {faltantesActuales.length > 0 && (
                <ul className="ficha-missing-list">
                  {faltantesActuales.map((faltante) => <li key={faltante}>{faltante}</li>)}
                </ul>
              )}
              <div className="ficha-summary-state">
                <span className="ficha-status-dot" aria-hidden="true" />
                <span>Borrador privado · no visible en el mapa</span>
              </div>
            </div>
            <div className="ficha-summary ficha-summary-info">
              <MapPin size={18} aria-hidden="true" />
              <h2>Tu clínica, paso a paso</h2>
              <ol>
                <li>Completa la ficha y guarda tu borrador.</li>
                <li>Adjunta los documentos de respaldo.</li>
                <li>Confirma la ubicación en el mapa.</li>
                <li>Envía la postulación para revisión.</li>
              </ol>
              <p>La publicación solo ocurre después de una aprobación administrativa.</p>
            </div>
          </aside>
        </div>
      </main>

      {confirmacionAbierta && (
        <div className="ficha-modal-backdrop" role="presentation">
          <div className="ficha-modal" role="dialog" aria-modal="true" aria-labelledby="ficha-confirm-title">
            <span className="ficha-eyebrow">CONFIRMAR POSTULACIÓN</span>
            <h2 id="ficha-confirm-title">Revisa el resumen antes de enviar</h2>
            <dl className="ficha-modal-summary">
              <div><dt>Clínica</dt><dd>{form.nombre}</dd></div>
              <div><dt>Municipio</dt><dd>{form.municipio}</dd></div>
              <div>
                <dt>Servicios</dt>
                <dd>
                  {Object.entries(form.servicios)
                    .filter(([, valor]) => valor.seleccionado)
                    .map(([categoria]) => AREAS.find((area) => area.categoria === categoria)?.nombre)
                    .join(', ')}
                </dd>
              </div>
              <div><dt>Franjas horarias</dt><dd>{form.horarios.length}</dd></div>
              <div><dt>Documentos privados</dt><dd>{ficha.documentos?.length || 0}</dd></div>
              <div>
                <dt>Ubicación</dt>
                <dd>
                  {form.ubicacion?.confirmada
                    ? `${Number(form.ubicacion.latitud).toFixed(6)}, ${Number(form.ubicacion.longitud).toFixed(6)}`
                    : 'Sin confirmar'}
                </dd>
              </div>
            </dl>
            <p className="ficha-modal-note">
              Al enviar, la ficha quedará pendiente de revisión y no podrás modificarla
              mientras dure el proceso. Enviarla no aprueba ni publica tu clínica.
            </p>
            <div className="ficha-modal-actions">
              <button
                type="button"
                className="ficha-btn-secondary"
                onClick={() => setConfirmacionAbierta(false)}
                disabled={postulando}
              >
                Seguir editando
              </button>
              <button
                type="button"
                className="ficha-btn-primary"
                onClick={confirmarPostulacion}
                disabled={postulando}
              >
                {postulando ? 'Enviando…' : 'Sí, enviar postulación'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
