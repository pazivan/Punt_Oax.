import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeft,
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
import { validarEmail } from '../../utils/validaciones'
import './FichaClinica.css'

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

const MAX_DOCUMENTOS = 5
const MAX_BYTES = 5 * 1024 * 1024
const TIPOS_ARCHIVO = ['application/pdf', 'image/png', 'image/jpeg']

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

function faltantesLocales(form, documentos) {
  const faltantes = []
  if (!form.nombre.trim()) faltantes.push('Nombre de la clínica')
  if (!form.tipo_institucion) faltantes.push('Tipo de institución')
  if (!form.descripcion.trim()) faltantes.push('Descripción de la clínica')
  if (!form.telefono.trim()) faltantes.push('Teléfono de contacto')
  if (!form.correo_contacto.trim()) faltantes.push('Correo de contacto')
  if (!form.municipio.trim()) faltantes.push('Municipio')
  if (!form.direccion.trim()) faltantes.push('Dirección')
  const seleccionados = Object.entries(form.servicios).filter(([, valor]) => valor.seleccionado)
  if (seleccionados.length === 0) faltantes.push('Al menos un área de atención (ITS o ILE)')
  else if (seleccionados.some(([, valor]) => !valor.detalle.trim())) {
    faltantes.push('La descripción de cada servicio seleccionado')
  }
  if (form.horarios.length === 0) faltantes.push('Al menos una franja horaria')
  if (documentos.length === 0) faltantes.push('Al menos un documento de respaldo')
  return faltantes
}

function validarInformacion(form) {
  if (form.telefono.trim() && !/^[+\d()\s.-]+$/.test(form.telefono.trim())) {
    return 'El teléfono solo puede incluir números, espacios y los signos + ( ) . -'
  }
  if (form.correo_contacto.trim() && !validarEmail(form.correo_contacto)) {
    return 'El correo de contacto no es válido.'
  }
  if (form.codigo_postal.trim() && !/^\d{5}$/.test(form.codigo_postal.trim())) {
    return 'El código postal debe tener 5 dígitos.'
  }
  for (const [campo, valor] of [['sitio web', form.sitio_web], ['enlace de Google Maps', form.ubicacion_maps_url]]) {
    if (!valor.trim()) continue
    try {
      const url = new URL(valor.trim())
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocolo')
    } catch {
      return `El ${campo} debe iniciar con http:// o https://.`
    }
  }
  const ordenados = [...form.horarios].sort((a, b) => a.dia_semana - b.dia_semana ||
    a.apertura.localeCompare(b.apertura))
  for (let i = 0; i < ordenados.length; i += 1) {
    const horario = ordenados[i]
    if (!horario.apertura || !horario.cierre) return 'Completa la apertura y el cierre de cada horario.'
    if (horario.apertura >= horario.cierre) {
      return 'La apertura debe ser anterior al cierre. Los turnos nocturnos aún no están disponibles.'
    }
    if (i > 0 && ordenados[i - 1].dia_semana === horario.dia_semana &&
        horario.apertura < ordenados[i - 1].cierre) {
      return 'Las franjas de un mismo día no deben solaparse.'
    }
  }
  return ''
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

function CabeceraClinica({ onSalir }) {
  return (
    <header className="ficha-header">
      <div className="ficha-header-inner">
        <div className="ficha-brand-group">
          <Link to="/mi-clinica" className="ficha-brand">PuntOax</Link>
          <span className="ficha-area-label">Área de clínicas</span>
        </div>
        <div className="ficha-header-actions">
          <Link to="/directorio" className="ficha-header-link">Directorio</Link>
          <button type="button" className="ficha-header-outline" onClick={onSalir}>Cerrar sesión</button>
        </div>
      </div>
    </header>
  )
}

export default function FichaClinica({ onSalir }) {
  const [ficha, setFicha] = useState(null)
  const [form, setForm] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState('')
  const [error, setError] = useState('')
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
        setFaltantes(Array.isArray(datos.faltantes) ? datos.faltantes : [])
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
    () => (form ? faltantesLocales(form, ficha?.documentos || []) : []),
    [form, ficha]
  )

  if (cargando) {
    return (
      <div className="ficha-page">
        <CabeceraClinica onSalir={onSalir} />
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
        <CabeceraClinica onSalir={onSalir} />
        <main className="ficha-state-card" role="alert">
          <AlertTriangle size={30} aria-hidden="true" />
          <h1>No pudimos cargar tu ficha</h1>
          <p>{errorCarga}</p>
          <button type="button" className="ficha-btn-primary" onClick={cargarFicha}>
            Reintentar
          </button>
          <Link to="/directorio" className="ficha-inline-link">Volver al directorio</Link>
        </main>
      </div>
    )
  }

  const pendiente = ficha?.postulacion?.estado === 'pendiente' || ficha?.clinica?.estado_ficha === 'pendiente_revision'

  if (pendiente) {
    return (
      <div className="ficha-page">
        <CabeceraClinica onSalir={onSalir} />
        <main className="ficha-pending">
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
            <Link to="/directorio" className="ficha-btn-secondary">Ver directorio</Link>
            <button type="button" className="ficha-btn-primary" onClick={onSalir}>Cerrar sesión</button>
          </div>
        </main>
      </div>
    )
  }

  if (!ficha?.clinica?.puede_editar) {
    return (
      <div className="ficha-page">
        <CabeceraClinica onSalir={onSalir} />
        <main className="ficha-state-card">
          <ShieldCheck size={30} aria-hidden="true" />
          <h1>La ficha no está disponible para edición</h1>
          <p>La clínica ya no puede modificarse desde este flujo en su estado actual.</p>
          <Link to="/directorio" className="ficha-inline-link">Volver al directorio</Link>
        </main>
      </div>
    )
  }

  if (!form) return null

  const actualizarCampo = (campo, valor) => {
    setForm((actual) => ({ ...actual, [campo]: valor }))
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

  const franjasDelDia = (dia) => form.horarios
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
        posicion === indice ? { ...horario, [campo]: valor } : horario),
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

  async function persistirBorrador() {
    const respuesta = await guardarBorradorClinica(construirPayload(form))
    setFicha(respuesta)
    setFaltantes(Array.isArray(respuesta.faltantes) ? respuesta.faltantes : [])
    return respuesta
  }

  const guardarBorrador = async () => {
    if (guardando || postulando) return
    setError('')
    setMensaje('')
    const invalido = validarInformacion(form)
    if (invalido) {
      setError(invalido)
      return
    }
    setGuardando(true)
    try {
      await persistirBorrador()
      setMensaje('Borrador guardado correctamente. Puedes cerrar sesión y continuar después.')
    } catch (err) {
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
      setError(`Solo puedes adjuntar ${disponibles} documento(s) más; el máximo total es ${MAX_DOCUMENTOS}.`)
      setArchivosPendientes([])
      evento.target.value = ''
      return
    }
    const invalido = archivos.find((archivo) =>
      !TIPOS_ARCHIVO.includes(archivo.type) || archivo.size === 0 || archivo.size > MAX_BYTES)
    if (invalido) {
      setError('Cada documento debe ser PDF, PNG o JPG de hasta 5 MB.')
      setArchivosPendientes([])
      evento.target.value = ''
      return
    }
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
      setMensaje('Documentos guardados correctamente. Permanecen privados.')
    } catch (err) {
      setError(err.message)
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
    const invalido = validarInformacion(form)
    if (invalido) {
      setError(invalido)
      return
    }
    const pendientesFicha = faltantesLocales(form, ficha.documentos || [])
    if (pendientesFicha.length) {
      setFaltantes(pendientesFicha)
      setError('Aún faltan datos obligatorios para enviar la postulación.')
      return
    }
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

  return (
    <div className="ficha-page">
      <CabeceraClinica onSalir={onSalir} />

      <main className="ficha-main">
        <section className="ficha-hero">
          <div>
            <Link to="/directorio" className="ficha-back-link">
              <ArrowLeft size={15} aria-hidden="true" /> Volver al directorio
            </Link>
            <span className="ficha-eyebrow">FICHA INSTITUCIONAL · BORRADOR</span>
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

        {error && (
          <div className="ficha-alert ficha-alert-error" role="alert">
            <AlertTriangle size={18} aria-hidden="true" />
            <div>
              <strong>Revisa la información</strong>
              <p>{error}</p>
              {faltantes.length > 0 && (
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
                <div className="ficha-field ficha-field-full">
                  <label htmlFor="ficha-nombre">Nombre de la clínica *</label>
                  <input
                    id="ficha-nombre"
                    className="ficha-input"
                    type="text"
                    maxLength={255}
                    value={form.nombre}
                    onChange={(evento) => actualizarCampo('nombre', evento.target.value)}
                  />
                </div>
                <div className="ficha-field">
                  <label htmlFor="ficha-tipo">Tipo de institución *</label>
                  <select
                    id="ficha-tipo"
                    className="ficha-input"
                    value={form.tipo_institucion}
                    onChange={(evento) => actualizarCampo('tipo_institucion', evento.target.value)}
                  >
                    <option value="">Selecciona una opción</option>
                    <option value="publica">Pública</option>
                    <option value="privada">Privada</option>
                    <option value="ong">Organización social</option>
                    <option value="otra">Otra</option>
                  </select>
                </div>
                <div className="ficha-field">
                  <label htmlFor="ficha-telefono">Teléfono *</label>
                  <input
                    id="ficha-telefono"
                    className="ficha-input"
                    type="tel"
                    maxLength={20}
                    value={form.telefono}
                    onChange={(evento) => actualizarCampo('telefono', evento.target.value)}
                    placeholder="951 123 4567"
                  />
                </div>
                <div className="ficha-field">
                  <label htmlFor="ficha-correo">Correo de contacto *</label>
                  <input
                    id="ficha-correo"
                    className="ficha-input"
                    type="email"
                    maxLength={255}
                    value={form.correo_contacto}
                    onChange={(evento) => actualizarCampo('correo_contacto', evento.target.value)}
                    placeholder="contacto@clinica.ejemplo"
                  />
                  <small>Es independiente del correo con el que inicias sesión.</small>
                </div>
                <div className="ficha-field">
                  <label htmlFor="ficha-sitio">Sitio web (opcional)</label>
                  <input
                    id="ficha-sitio"
                    className="ficha-input"
                    type="url"
                    maxLength={1000}
                    value={form.sitio_web}
                    onChange={(evento) => actualizarCampo('sitio_web', evento.target.value)}
                    placeholder="https://clinica.ejemplo"
                  />
                </div>
                <div className="ficha-field ficha-field-full">
                  <label htmlFor="ficha-descripcion">Descripción *</label>
                  <textarea
                    id="ficha-descripcion"
                    className="ficha-input ficha-textarea"
                    maxLength={2000}
                    rows={4}
                    value={form.descripcion}
                    onChange={(evento) => actualizarCampo('descripcion', evento.target.value)}
                    placeholder="Describe brevemente a tu institución y la atención que ofrece."
                  />
                  <small>{form.descripcion.length}/2000 caracteres</small>
                </div>
              </div>
            </section>

            <section className="ficha-section" aria-labelledby="ficha-ubicacion">
              <div className="ficha-section-heading">
                <span className="ficha-step">B</span>
                <div>
                  <h2 id="ficha-ubicacion">Ubicación</h2>
                  <p>Dirección de la sede y referencias para llegar.</p>
                </div>
              </div>
              <div className="ficha-grid">
                <div className="ficha-field">
                  <label htmlFor="ficha-municipio">Municipio *</label>
                  <input
                    id="ficha-municipio"
                    className="ficha-input"
                    type="text"
                    maxLength={100}
                    value={form.municipio}
                    onChange={(evento) => actualizarCampo('municipio', evento.target.value)}
                    placeholder="Oaxaca de Juárez"
                  />
                </div>
                <div className="ficha-field">
                  <label htmlFor="ficha-cp">Código postal (opcional)</label>
                  <input
                    id="ficha-cp"
                    className="ficha-input"
                    type="text"
                    inputMode="numeric"
                    maxLength={5}
                    value={form.codigo_postal}
                    onChange={(evento) => actualizarCampo('codigo_postal', evento.target.value)}
                    placeholder="68000"
                  />
                </div>
                <div className="ficha-field ficha-field-full">
                  <label htmlFor="ficha-direccion">Dirección *</label>
                  <input
                    id="ficha-direccion"
                    className="ficha-input"
                    type="text"
                    maxLength={500}
                    value={form.direccion}
                    onChange={(evento) => actualizarCampo('direccion', evento.target.value)}
                    placeholder="Calle, número, colonia"
                  />
                </div>
                <div className="ficha-field ficha-field-full">
                  <label htmlFor="ficha-maps">Enlace de Google Maps (opcional)</label>
                  <input
                    id="ficha-maps"
                    className="ficha-input"
                    type="url"
                    maxLength={1000}
                    value={form.ubicacion_maps_url}
                    onChange={(evento) => actualizarCampo('ubicacion_maps_url', evento.target.value)}
                    placeholder="https://maps.google.com/..."
                  />
                </div>
              </div>
            </section>

            <section className="ficha-section" aria-labelledby="ficha-servicios">
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
                    <div className={`ficha-area-card ${valor.seleccionado ? 'is-selected' : ''}`} key={area.categoria}>
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
                            Servicios específicos que ofrece tu clínica *
                          </label>
                          <textarea
                            id={`ficha-detalle-${area.categoria}`}
                            className="ficha-input ficha-textarea"
                            maxLength={2000}
                            rows={3}
                            value={valor.detalle}
                            onChange={(evento) => actualizarDetalleServicio(area.categoria, evento.target.value)}
                            placeholder={area.ayuda}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              <p className="ficha-help">
                Se usa el catálogo existente de PuntOax; no se crean categorías nuevas desde este formulario.
              </p>
            </section>

            <section className="ficha-section" aria-labelledby="ficha-horarios">
              <div className="ficha-section-heading">
                <span className="ficha-step">D</span>
                <div>
                  <h2 id="ficha-horarios">Horarios de atención</h2>
                  <p>Marca los días de servicio y define una o más franjas por día.</p>
                </div>
              </div>
              <div className="ficha-days">
                {DIAS.map((dia) => {
                  const franjas = franjasDelDia(dia.numero)
                  return (
                    <div className={`ficha-day-card ${franjas.length ? 'is-selected' : ''}`} key={dia.numero}>
                      <div className="ficha-day-header">
                        <label className="ficha-check-row">
                          <input
                            type="checkbox"
                            checked={franjas.length > 0}
                            onChange={() => alternarDia(dia.numero)}
                          />
                          <span><strong>{dia.nombre}</strong></span>
                        </label>
                        {franjas.length > 0 && (
                          <button type="button" className="ficha-link-button" onClick={() => agregarFranja(dia.numero)}>
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
                              onChange={(evento) => actualizarHorario(franja.indice, 'apertura', evento.target.value)}
                            />
                          </div>
                          <div className="ficha-field">
                            <label htmlFor={`ficha-cierre-${franja.indice}`}>Cierre</label>
                            <input
                              id={`ficha-cierre-${franja.indice}`}
                              className="ficha-input"
                              type="time"
                              value={franja.cierre}
                              onChange={(evento) => actualizarHorario(franja.indice, 'cierre', evento.target.value)}
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
              <p className="ficha-help">
                <Clock3 size={14} aria-hidden="true" /> Por ahora se admiten horarios dentro del mismo día;
                no turnos nocturnos ni de 24 horas.
              </p>
            </section>

            <section className="ficha-section" aria-labelledby="ficha-documentos">
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
              <div className="ficha-upload">
                <input
                  ref={entradaArchivos}
                  id="ficha-archivos"
                  className="ficha-file-input"
                  type="file"
                  aria-label="Documentos de respaldo"
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
