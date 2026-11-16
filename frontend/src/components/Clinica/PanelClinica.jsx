import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Edit3,
  ExternalLink,
  FileText,
  Globe,
  LayoutDashboard,
  Mail,
  MapPin,
  Phone,
  Save,
  Send,
  Trash2,
  Upload,
  User,
} from 'lucide-react'
import {
  consultarCitasClinica,
  consultarMiFicha,
  eliminarDocumentoClinica,
  enviarPostulacionClinica,
  guardarBorradorClinica,
  subirDocumentosClinica,
} from '../../api/auth'
import MapaLeaflet from '../Inicio/MapaLeaflet.jsx'
import { CLINICAS_DEMO, normalizarYUnificarClinicas } from '../../data/clinicasDemo.js'
import { OAXACA, coordenadas } from '../../utils/centros.js'
import { filtrarCitas } from '../../utils/citasClinica'
import { validarEmail } from '../../utils/validaciones'
import '../../styles/Inicio.css'
import './PanelClinica.css'

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

const ETIQUETA_ESTADO_PANEL = {
  aprobada: 'CLÍNICA APROBADA · PUBLICADA EN MAPA',
  completa: 'FICHA COMPLETA · LISTA PARA PUBLICACIÓN',
  pendiente_revision: 'POSTULACIÓN EN REVISIÓN',
  rechazada: 'CON OBSERVACIONES',
  incompleta: 'EN CONFIGURACIÓN',
}

const MAX_DOCUMENTOS = 5
const MAX_BYTES = 5 * 1024 * 1024
const TIPOS_ARCHIVO = ['application/pdf', 'image/png', 'image/jpeg']

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
  if (!form.nombre.trim()) {
    return 'El nombre de la clínica es obligatorio.'
  }
  if (form.telefono.trim() && !/^[+\d()\s.-]+$/.test(form.telefono.trim())) {
    return 'El teléfono solo puede incluir números, espacios y los signos + ( ) . -'
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

function CabeceraClinica({ vistaActiva, onCambiarVista, onSalir, nombreClinica }) {
  return (
    <header className="panel-clinica-header">
      <div className="panel-clinica-header-container">
        <div className="panel-clinica-header-left">
          <button
            type="button"
            className="panel-clinica-brand-btn"
            onClick={() => onCambiarVista('inicio')}
          >
            <img
              src="/logo-puntoax.svg"
              alt=""
              className="inicio-brand-logo"
              aria-hidden="true"
            />
            <span>PuntOax</span>
            <span className="panel-clinica-brand-tag">Clínicas</span>
          </button>

          <nav className="panel-clinica-top-nav" aria-label="Navegación de clínica">
            <button
              type="button"
              className={`panel-clinica-top-tab ${vistaActiva === 'inicio' ? 'is-active' : ''}`}
              onClick={() => onCambiarVista('inicio')}
            >
              Inicio y resumen
            </button>
            <button
              type="button"
              className={`panel-clinica-top-tab ${vistaActiva === 'editar' ? 'is-active' : ''}`}
              onClick={() => onCambiarVista('editar')}
            >
              Actualizar datos
            </button>
            <Link to="/mi-clinica/citas" className="panel-clinica-top-link">
              Solicitudes de citas
            </Link>
            <Link to="/mi-clinica/agenda" className="panel-clinica-top-link">
              Mi agenda y cupos
            </Link>
          </nav>
        </div>

        <div className="panel-clinica-header-right">
          <span className="panel-clinica-account-pill" title={nombreClinica || 'Área clínica'}>
            <span className="panel-clinica-avatar" aria-hidden="true">
              <User size={14} color="#FFFFFF" />
            </span>
            <span className="panel-clinica-account-text">
              {nombreClinica || 'Mi clínica'}
            </span>
          </span>

          <button
            type="button"
            className="panel-clinica-logout-btn"
            onClick={onSalir}
          >
            Salir
          </button>
        </div>
      </div>
    </header>
  )
}

/**
 * PanelClinica - Pantalla nueva de Panel de clínica - PuntoOax (Sprint 7)
 * donde la clínica consulta el resumen completo de los datos registrados en su solicitud,
 * visualiza su centro junto con los demás en el mapa y actualiza su información principal.
 */
export default function PanelClinica({ onSalir }) {
  const [ficha, setFicha] = useState(null)
  const [form, setForm] = useState(null)
  const [citasClinica, setCitasClinica] = useState([])
  const [catalogoClinicas, setCatalogoClinicas] = useState([])
  const [clinicaMapaSeleccionada, setClinicaMapaSeleccionada] = useState(null)
  const [vistaActiva, setVistaActiva] = useState('inicio')
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

  const faltantesActuales = useMemo(
    () => (form ? faltantesLocales(form, ficha?.documentos || []) : []),
    [form, ficha]
  )

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
        <CabeceraClinica
          vistaActiva={vistaActiva}
          onCambiarVista={setVistaActiva}
          onSalir={onSalir}
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
        <CabeceraClinica
          vistaActiva={vistaActiva}
          onCambiarVista={setVistaActiva}
          onSalir={onSalir}
        />
        <main className="ficha-state-card" role="alert">
          <AlertTriangle size={30} aria-hidden="true" />
          <h1>No pudimos cargar tu ficha</h1>
          <p>{errorCarga}</p>
          <button type="button" className="ficha-btn-primary" onClick={cargarFicha}>
            Reintentar
          </button>
        </main>
      </div>
    )
  }

  if (!form) return null

  const estadoFichaClave = ficha?.clinica?.estado_ficha || 'incompleta'
  const etiquetaBadgeEstado =
    ETIQUETA_ESTADO_PANEL[estadoFichaClave] || 'CLÍNICA REGISTRADA'

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
      setMensaje('Los datos de tu clínica se actualizaron correctamente.')
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
      setError(
        `Solo puedes adjuntar ${disponibles} documento(s) más; el máximo total es ${MAX_DOCUMENTOS}.`
      )
      setArchivosPendientes([])
      evento.target.value = ''
      return
    }
    const invalido = archivos.find(
      (archivo) =>
        !TIPOS_ARCHIVO.includes(archivo.type) ||
        archivo.size === 0 ||
        archivo.size > MAX_BYTES
    )
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
    if (
      !window.confirm(
        '¿Eliminar este documento de respaldo? Esta acción no se puede deshacer.'
      )
    )
      return
    setError('')
    setMensaje('')
    setSubiendo(true)
    try {
      await eliminarDocumentoClinica(idDocumento)
      setFicha((actual) => ({
        ...actual,
        documentos: actual.documentos.filter(
          (documento) => documento.id_documento !== idDocumento
        ),
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
      if (Array.isArray(err.faltantes) && err.faltantes.length) {
        setFaltantes(err.faltantes)
      }
      setError(err.message)
      setConfirmacionAbierta(false)
    } finally {
      enviandoPostulacion.current = false
      setPostulando(false)
    }
  }

  const restantesDocumentos = MAX_DOCUMENTOS - (ficha.documentos?.length || 0)
  const nombreCentroMostrado =
    form.nombre.trim() || ficha.clinica?.nombre || 'Centro de Atención PuntoOax'
  const municipioMostrado =
    form.municipio.trim() || ficha.clinica?.municipio || 'Oaxaca de Juárez'
  const tipoInstitucionTexto =
    ETIQUETA_TIPO_INSTITUCION[form.tipo_institucion] || 'Sin tipo especificado'

  return (
    <div className="panel-clinica-page">
      <CabeceraClinica
        vistaActiva={vistaActiva}
        onCambiarVista={setVistaActiva}
        onSalir={onSalir}
        nombreClinica={nombreCentroMostrado}
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
                Consulta el resumen de los datos registrados en tu solicitud, visualiza tu centro en el mapa y actualiza tu información principal.
              </p>
            </div>
          </section>

          <div className="panel-clinica-workspace">
            <aside className="panel-clinica-sidebar" aria-label="Menú del área clínica">
              <h2 className="panel-clinica-sidebar-title">Área clínica</h2>

              <nav className="panel-clinica-sidebar-nav">
                <button
                  type="button"
                  className={`panel-clinica-sidebar-link ${
                    vistaActiva === 'inicio' ? 'is-active' : ''
                  }`}
                  onClick={() => setVistaActiva('inicio')}
                >
                  <LayoutDashboard size={15} color="#FFFFFF" aria-hidden="true" />
                  <span>Resumen y mapa</span>
                </button>

                <button
                  type="button"
                  className={`panel-clinica-sidebar-link ${
                    vistaActiva === 'editar' ? 'is-active' : ''
                  }`}
                  onClick={() => setVistaActiva('editar')}
                >
                  <Edit3 size={15} color="#FFFFFF" aria-hidden="true" />
                  <span>Actualizar datos</span>
                </button>

                <Link
                  to="/mi-clinica/citas"
                  className="panel-clinica-sidebar-link"
                >
                  <ClipboardList size={15} color="#FFFFFF" aria-hidden="true" />
                  <span>Solicitudes</span>
                </Link>

                <Link
                  to="/mi-clinica/agenda"
                  className="panel-clinica-sidebar-link"
                >
                  <CalendarDays size={16} color="#FFFFFF" aria-hidden="true" />
                  <span>Horarios y cupos</span>
                </Link>
              </nav>
            </aside>

            <div className="panel-clinica-card">
              <div className="panel-clinica-badge-row">
                <span className="panel-clinica-status-pill">
                  {etiquetaBadgeEstado}
                </span>

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
                    <span>← Volver al resumen y mapa</span>
                  </button>
                )}
              </div>

              <div className="panel-clinica-welcome-wrap">
                <h2 className="panel-clinica-welcome-title">
                  {nombreCentroMostrado}
                </h2>
              </div>

              <div className="panel-clinica-center-meta-wrap">
                <p className="panel-clinica-center-meta">
                  {tipoInstitucionTexto} • {municipioMostrado}
                  {ficha.clinica?.correo_acceso
                    ? ` • Cuenta: ${ficha.clinica.correo_acceso}`
                    : ''}
                </p>
              </div>

              <div className="panel-clinica-stats-row">
                <div className="panel-clinica-stat-card">
                  <span className="panel-clinica-stat-value">
                    {citasProximasCount}
                  </span>
                  <span className="panel-clinica-stat-label">
                    Citas próximas confirmadas
                  </span>
                </div>

                <div className="panel-clinica-stat-card">
                  <span className="panel-clinica-stat-value">
                    {areasSeleccionadas.length}
                  </span>
                  <span className="panel-clinica-stat-label">
                    Áreas de atención (ITS / ILE)
                  </span>
                </div>

                <div className="panel-clinica-stat-card">
                  <span className="panel-clinica-stat-value">
                    {form.horarios.length}
                  </span>
                  <span className="panel-clinica-stat-label">
                    Franjas de horario activas
                  </span>
                </div>
              </div>

              {error && (
                <div
                  className="ficha-alert ficha-alert-error"
                  role="alert"
                  style={{ marginTop: '20px', width: '100%', boxSizing: 'border-box' }}
                >
                  <AlertTriangle size={18} aria-hidden="true" />
                  <div>
                    <strong>Revisa la información</strong>
                    <p>{error}</p>
                    {faltantes.length > 0 && (
                      <ul className="ficha-alert-list">
                        {faltantes.map((faltante) => (
                          <li key={faltante}>{faltante}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              {mensaje && (
                <div
                  className="ficha-alert ficha-alert-success"
                  role="status"
                  style={{ marginTop: '20px', width: '100%', boxSizing: 'border-box' }}
                >
                  <CheckCircle2 size={18} aria-hidden="true" />
                  <p>{mensaje}</p>
                </div>
              )}

              {vistaActiva === 'inicio' && (
                <div className="panel-clinica-summary-view">
                  <section
                    className="panel-clinica-summary-block"
                    aria-labelledby="resumen-datos-generales"
                  >
                    <div className="panel-clinica-summary-header">
                      <h3 id="resumen-datos-generales" className="panel-clinica-section-title">
                        1. Datos generales y de contacto registrados
                      </h3>
                      <span className="panel-clinica-summary-tag">Datos de tu solicitud</span>
                    </div>

                    <div className="panel-clinica-summary-grid">
                      <div className="panel-clinica-summary-item">
                        <span className="panel-clinica-summary-label">Nombre de la clínica</span>
                        <p className="panel-clinica-summary-value">
                          {form.nombre.trim() || 'Por registrar'}
                        </p>
                      </div>

                      <div className="panel-clinica-summary-item">
                        <span className="panel-clinica-summary-label">Tipo de institución</span>
                        <p className="panel-clinica-summary-value">{tipoInstitucionTexto}</p>
                      </div>

                      <div className="panel-clinica-summary-item">
                        <span className="panel-clinica-summary-label">
                          <Phone size={12} aria-hidden="true" /> Teléfono de atención
                        </span>
                        <p className="panel-clinica-summary-value">
                          {form.telefono.trim() || 'Por registrar'}
                        </p>
                      </div>

                      <div className="panel-clinica-summary-item">
                        <span className="panel-clinica-summary-label">
                          <Mail size={12} aria-hidden="true" /> Correo de contacto público
                        </span>
                        <p className="panel-clinica-summary-value">
                          {form.correo_contacto.trim() || 'Por registrar'}
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

                      <div className="panel-clinica-summary-item">
                        <span className="panel-clinica-summary-label">
                          Documentos de respaldo
                        </span>
                        <p className="panel-clinica-summary-value">
                          {(ficha.documentos || []).length} archivo(s) privado(s)
                        </p>
                      </div>

                      <div className="panel-clinica-summary-item is-full">
                        <span className="panel-clinica-summary-label">
                          Descripción de la institución
                        </span>
                        <p className="panel-clinica-summary-value">
                          {form.descripcion.trim() || 'Sin descripción registrada.'}
                        </p>
                      </div>
                    </div>
                  </section>

                  <section
                    className="panel-clinica-summary-block"
                    aria-labelledby="resumen-servicios-horarios"
                  >
                    <div className="panel-clinica-summary-header">
                      <h3 id="resumen-servicios-horarios" className="panel-clinica-section-title">
                        2. Ubicación, servicios y horarios de atención
                      </h3>
                    </div>

                    <div className="panel-clinica-summary-grid">
                      <div className="panel-clinica-summary-item">
                        <span className="panel-clinica-summary-label">
                          <MapPin size={12} aria-hidden="true" /> Municipio y localidad
                        </span>
                        <p className="panel-clinica-summary-value">
                          {[form.municipio.trim(), form.localidad?.trim()]
                            .filter(Boolean)
                            .join(', ') || 'Por registrar'}
                        </p>
                      </div>

                      <div className="panel-clinica-summary-item">
                        <span className="panel-clinica-summary-label">
                          Dirección y Código Postal
                        </span>
                        <p className="panel-clinica-summary-value">
                          {form.direccion.trim() || 'Por registrar'}
                          {form.codigo_postal.trim()
                            ? ` · C.P. ${form.codigo_postal.trim()}`
                            : ''}
                        </p>
                      </div>

                      <div className="panel-clinica-summary-item">
                        <span className="panel-clinica-summary-label">
                          Áreas y servicios que ofrece tu centro
                        </span>
                        {areasSeleccionadas.length > 0 ? (
                          <div className="panel-clinica-services-tags">
                            {areasSeleccionadas.map((area) => (
                              <div key={area.categoria} className="panel-clinica-service-box">
                                <strong>{area.nombre}</strong>
                                <span>{area.detalle || 'Sin detalle especificado'}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="panel-clinica-summary-value">
                            Aún no se han seleccionado áreas de atención (ITS o ILE).
                          </p>
                        )}
                      </div>

                      <div className="panel-clinica-summary-item">
                        <span className="panel-clinica-summary-label">
                          <Clock3 size={12} aria-hidden="true" /> Horario semanal registrado
                        </span>
                        {form.horarios.length > 0 ? (
                          <ul className="panel-clinica-schedule-list">
                            {form.horarios.map((h, idx) => {
                              const nombreDia =
                                DIAS.find((d) => d.numero === Number(h.dia_semana))?.nombre ||
                                'Día'
                              return (
                                <li key={`${h.dia_semana}-${idx}`}>
                                  <strong>{nombreDia}:</strong> {h.apertura} a {h.cierre} h
                                </li>
                              )
                            })}
                          </ul>
                        ) : (
                          <p className="panel-clinica-summary-value">
                            Sin franjas horarias registradas.
                          </p>
                        )}
                      </div>
                    </div>
                  </section>

                  <section
                    className="panel-clinica-summary-block"
                    aria-labelledby="resumen-mapa-clinica"
                  >
                    <div className="panel-clinica-summary-header">
                      <div>
                        <h3 id="resumen-mapa-clinica" className="panel-clinica-section-title">
                          3. Tu centro y la red de clínicas en el mapa de Oaxaca
                        </h3>
                        <p className="panel-clinica-map-lead">
                          Visualiza la ubicación de tu unidad junto con los demás centros verificados del directorio.
                        </p>
                      </div>

                      <button
                        type="button"
                        className="panel-clinica-focus-btn"
                        onClick={() => setClinicaMapaSeleccionada(centrosParaMapa[0] || null)}
                      >
                        <MapPin size={14} color="#FFFFFF" aria-hidden="true" />
                        <span>Enfocar mi centro</span>
                      </button>
                    </div>

                    <div className="panel-clinica-map-grid">
                      <div className="panel-clinica-map-list" aria-label="Centros en el mapa">
                        {centrosParaMapa.slice(0, 6).map((centro) => {
                          const activo =
                            centroActivoEnMapa?.id_clinica === centro.id_clinica
                          return (
                            <button
                              key={centro.id_clinica}
                              type="button"
                              className={`panel-clinica-map-item ${
                                activo ? 'is-selected' : ''
                              }`}
                              onClick={() => setClinicaMapaSeleccionada(centro)}
                            >
                              <div className="panel-clinica-map-item-top">
                                <span
                                  className={`panel-clinica-map-badge ${
                                    centro.esMiCentro ? 'is-own' : ''
                                  }`}
                                >
                                  {centro.esMiCentro ? 'TU CENTRO' : centro.municipio || 'Oaxaca'}
                                </span>
                              </div>
                              <strong className="panel-clinica-map-item-name">
                                {centro.nombre}
                              </strong>
                              <span className="panel-clinica-map-item-addr">
                                {centro.direccion || centro.municipio || 'Oaxaca'}
                              </span>
                            </button>
                          )
                        })}
                      </div>

                      <div className="panel-clinica-map-canvas">
                        <MapaLeaflet
                          clinicas={centrosParaMapa}
                          clinicaSeleccionada={centroActivoEnMapa}
                          onSeleccionarClinica={(c) => setClinicaMapaSeleccionada(c)}
                          onVerDetallesClinica={(c) => setClinicaMapaSeleccionada(c)}
                        />
                      </div>
                    </div>
                  </section>
                </div>
              )}

              {vistaActiva === 'editar' && (
                <form
                  className="panel-clinica-info-form"
                  onSubmit={(e) => {
                    e.preventDefault()
                    guardarBorrador()
                  }}
                  noValidate
                >
                  <div className="panel-clinica-section-title-wrap">
                    <h3 className="panel-clinica-section-title">
                      Información principal del centro
                    </h3>
                  </div>

                  {faltantesActuales.length > 0 && (
                    <div className="panel-clinica-pending-banner">
                      <strong>Campos pendientes para completar toda tu ficha:</strong>{' '}
                      {faltantesActuales.join(' · ')}
                    </div>
                  )}

                  <div className="panel-clinica-fields-row">
                    <div className="panel-clinica-field-col">
                      <label htmlFor="panel-nombre" className="panel-clinica-label">
                        Nombre de la clínica *
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
                        Municipio *
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
                        Tipo de institución *
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
                        Teléfono de contacto *
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
                        Correo electrónico de contacto *
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
                      <label htmlFor="panel-localidad" className="panel-clinica-label">
                        Localidad (opcional)
                      </label>
                      <input
                        id="panel-localidad"
                        type="text"
                        maxLength={100}
                        className="panel-clinica-input"
                        value={form.localidad || ''}
                        onChange={(e) => actualizarCampo('localidad', e.target.value)}
                        placeholder="Col. Centro"
                      />
                    </div>
                  </div>

                  <div className="panel-clinica-fields-row">
                    <div className="panel-clinica-field-col">
                      <label htmlFor="panel-direccion" className="panel-clinica-label">
                        Dirección completa *
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

                  <div className="panel-clinica-fields-row">
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

                    <div className="panel-clinica-field-col">
                      <label htmlFor="panel-maps" className="panel-clinica-label">
                        Enlace de Google Maps (opcional)
                      </label>
                      <input
                        id="panel-maps"
                        type="url"
                        maxLength={1000}
                        className="panel-clinica-input"
                        value={form.ubicacion_maps_url}
                        onChange={(e) => actualizarCampo('ubicacion_maps_url', e.target.value)}
                        placeholder="https://maps.google.com/..."
                      />
                    </div>
                  </div>

                  <div className="panel-clinica-field-full">
                    <label htmlFor="panel-descripcion" className="panel-clinica-label">
                      Descripción de la clínica *
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
                      Áreas de atención y servicios específicos
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
                                Servicios específicos que ofrece tu clínica *
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
                      Horarios semanales de atención
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

                  <div className="panel-clinica-section-title-wrap" style={{ paddingTop: '28px' }}>
                    <h3 className="panel-clinica-section-title">
                      Documentación de respaldo ({ficha.documentos?.length || 0}/{MAX_DOCUMENTOS})
                    </h3>
                  </div>

                  <div className="ficha-upload" style={{ width: '100%', boxSizing: 'border-box' }}>
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
                        PDF, PNG o JPG · hasta 5 MB cada uno · {restantesDocumentos} disponibles
                      </span>
                    </div>
                  </div>

                  {ficha.documentos?.length > 0 && (
                    <ul className="ficha-doc-list" style={{ width: '100%' }}>
                      {ficha.documentos.map((documento) => (
                        <li key={documento.id_documento}>
                          <span className="ficha-doc-icon" aria-hidden="true">
                            <FileText size={18} />
                          </span>
                          <div>
                            <strong>{documento.nombre_original}</strong>
                            <small>
                              {formatearBytes(documento.tamano_bytes)} · Privado ·{' '}
                              {formatearFecha(documento.fecha_carga)}
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
                  )}

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
                        disabled={guardando || postulando}
                      >
                        <Save size={15} color="#FFFFFF" aria-hidden="true" />
                        <span>{guardando ? 'Guardando…' : 'Guardar cambios'}</span>
                      </button>

                      {ficha?.clinica?.estado_publicacion !== 'aprobada' && (
                        <button
                          type="button"
                          className="panel-clinica-btn-primary"
                          onClick={abrirConfirmacion}
                          disabled={guardando || postulando}
                        >
                          <Send size={15} color="#FFFFFF" aria-hidden="true" />
                          <span>{postulando ? 'Enviando…' : 'Enviar postulación'}</span>
                        </button>
                      )}
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

      {confirmacionAbierta && (
        <div className="ficha-modal-backdrop" role="presentation">
          <div
            className="ficha-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ficha-confirm-title"
          >
            <span className="ficha-eyebrow">CONFIRMAR POSTULACIÓN</span>
            <h2 id="ficha-confirm-title">Revisa el resumen antes de enviar</h2>
            <dl className="ficha-modal-summary">
              <div>
                <dt>Clínica</dt>
                <dd>{form.nombre}</dd>
              </div>
              <div>
                <dt>Municipio</dt>
                <dd>{form.municipio}</dd>
              </div>
              <div>
                <dt>Servicios</dt>
                <dd>
                  {Object.entries(form.servicios)
                    .filter(([, valor]) => valor.seleccionado)
                    .map(
                      ([categoria]) =>
                        AREAS.find((area) => area.categoria === categoria)?.nombre
                    )
                    .join(', ') || 'Por especificar'}
                </dd>
              </div>
              <div>
                <dt>Franjas horarias</dt>
                <dd>{form.horarios.length}</dd>
              </div>
              <div>
                <dt>Documentos privados</dt>
                <dd>{ficha.documentos?.length || 0}</dd>
              </div>
            </dl>
            <p className="ficha-modal-note">
              Al enviar, la ficha quedará pendiente de revisión administrativa.
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

