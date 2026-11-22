import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertCircle, ArrowLeft, ArrowRight, Building2, CalendarDays, Check,
  CheckCircle2, ChevronLeft, ChevronRight, CircleHelp, ClipboardList, Clock3,
  Download, ExternalLink, Eye, EyeOff, FileText, Globe, LayoutDashboard, LoaderCircle,
  LogOut, Mail, Map as MapIcon, MapPin, Maximize2, Minimize2, Phone, RefreshCw, Search, ShieldCheck,
  SlidersHorizontal, User, Users, X, XCircle,
} from 'lucide-react'
import {
  cambiarEstadoUsuarioAdmin, cambiarVisibilidadAdmin, consultarCalendarioAdmin,
  consultarCitasAdmin, consultarClinicaAdmin, consultarClinicasAdmin,
  consultarResumenAdmin, consultarSolicitudAdmin, consultarSolicitudesAdmin,
  consultarUsuarioAdmin, consultarUsuariosAdmin, descargarDocumentoAdmin,
  resolverSolicitudAdmin,
} from '../../api/admin.js'
import Paginacion from './Paginacion.jsx'
import MapaCentros from '../Inicio/MapaCentros.jsx'
import '../Clinica/AgendaClinica.css'
import { describirErrorConsulta } from '../../utils/erroresConsulta.js'
import L from 'leaflet'
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import './Administracion.css'

const ETIQUETAS_TIPO_SOLICITUD = {
  postulacion: 'Postulación inicial',
  actualizacion_informacion: 'Actualización de información',
  actualizacion_ubicacion: 'Actualización de ubicación',
}

function crearPinAdmin(color) {
  return L.divIcon({
    className: 'mapa-custom-div-icon',
    html: `<span style="display:inline-flex;width:24px;height:24px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);"></span>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  })
}

const FILTROS = [
  { valor: 'pendiente', nombre: 'Pendientes' },
  { valor: 'aprobada', nombre: 'Aprobadas' },
  { valor: 'rechazada', nombre: 'Rechazadas' },
  { valor: 'suspendida', nombre: 'Ocultas' },
  { valor: 'todas', nombre: 'Todas' },
]
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const TIPO = { publica: 'Pública', privada: 'Privada', ong: 'Organización civil', otra: 'Otra' }
const NOMBRE_ACCION = { aprobar: 'Aprobar solicitud', rechazar: 'Rechazar solicitud', ocultar: 'Ocultar clínica', mostrar: 'Volver a mostrar clínica' }
const INFO_ACCION = {
  aprobar: 'Se aprobará la postulación y la clínica podrá aparecer en el directorio público.',
  rechazar: 'La postulación será rechazada. La clínica podrá corregir su ficha y volver a postular.',
  ocultar: 'La clínica dejará de aparecer en el directorio público, pero su información se conservará.',
  mostrar: 'La clínica volverá a estar visible en el directorio público.',
}

function fecha(valor) {
  if (!valor) return 'Sin fecha'
  const d = new Date(valor)
  return Number.isNaN(d.getTime()) ? 'Sin fecha' : new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeZone: 'America/Mexico_City' }).format(d)
}
function texto(valor) {
  return typeof valor === 'string' && valor.trim() ? valor : 'No especificado'
}
function urlSegura(valor) {
  try {
    const url = new URL(valor)
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null
  } catch { return null }
}
function claseEstado(estado) {
  return ['pendiente', 'aprobada', 'rechazada', 'suspendida'].includes(estado) ? estado : 'neutro'
}
function etiquetaEstado(estado) {
  return { borrador: 'Borrador', pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada', suspendida: 'Oculta' }[estado] || texto(estado)
}
function Estado({ estado }) {
  return <span className={`admin-estado admin-estado--${claseEstado(estado)}`}>
    <span aria-hidden="true" className="admin-estado-punto" />{etiquetaEstado(estado)}
  </span>
}
function EstadoVerificacion({ verificado }) {
  return <span className={`admin-estado admin-estado--${verificado ? 'aprobada' : 'pendiente'}`}>
    <span aria-hidden="true" className="admin-estado-punto" />{verificado ? 'Verificado' : 'Sin verificar'}
  </span>
}
function EstadoCuenta({ activo }) {
  return <span className={`admin-estado admin-estado--${activo !== false ? 'aprobada' : 'rechazada'}`}>
    <span aria-hidden="true" className="admin-estado-punto" />{activo !== false ? 'Activa' : 'Desactivada'}
  </span>
}
function nombreCompleto(usuario) {
  return [usuario.nombre, usuario.apellidos].filter((v) => typeof v === 'string' && v.trim()).join(' ').trim()
}
function estadoEfectivo(solicitud) {
  return solicitud.estado === 'aprobada' && solicitud.estado_publicacion === 'suspendida'
    ? 'suspendida' : solicitud.estado
}
function ErrorCarga({ error, reintentar, recurso }) {
  const aviso = describirErrorConsulta(error, recurso)
  return <div className="admin-aviso admin-aviso--error" role="alert">
    <AlertCircle size={19} aria-hidden="true" />
    <div><strong>{aviso.titulo}</strong><p>{aviso.mensaje}</p></div>
    {aviso.reintentar && reintentar && <button className="admin-btn admin-btn--outline" onClick={reintentar} type="button">Reintentar</button>}
  </div>
}
function Cargando({ mensaje = 'Consultando solicitudes…' }) {
  return <div className="admin-cargando" role="status"><LoaderCircle className="admin-girar" size={24} />{mensaje}</div>
}

function Lateral({ perfil, onSalir, detalle }) {
  const nombre = perfil?.cuenta?.nombre || perfil?.cuenta?.correo || 'Administrador'
  const location = useLocation()
  const estado = new URLSearchParams(location.search).get('estado')
  const enUsuarios = location.pathname === '/admin/usuarios'
  const enClinicas = location.pathname === '/admin/clinicas'
  const enCitas = location.pathname === '/admin/citas'
  const enCalendarios = location.pathname === '/admin/calendarios'
  const enMapa = location.pathname === '/admin/mapa'
  const seccionActiva = detalle ? ''
    : enUsuarios ? 'usuarios'
    : enClinicas ? 'clinicas'
    : enCitas ? 'citas'
    : enCalendarios ? 'calendarios'
    : enMapa ? 'mapa'
    : (estado || 'resumen')
  const grupos = [
    {
      titulo: 'RESUMEN',
      opciones: [
        { valor: 'resumen', destino: '/admin', titulo: 'Resumen general', Icono: LayoutDashboard },
      ],
    },
    {
      titulo: 'SOLICITUDES Y CLÍNICAS',
      opciones: [
        { valor: 'clinicas', destino: '/admin/clinicas', titulo: 'Clínicas registradas', Icono: Building2 },
        { valor: 'pendiente', destino: '/admin?estado=pendiente', titulo: 'Pendientes de revisión', Icono: Clock3 },
        { valor: 'aprobada', destino: '/admin?estado=aprobada', titulo: 'Solicitudes aprobadas', Icono: CheckCircle2 },
        { valor: 'suspendida', destino: '/admin?estado=suspendida', titulo: 'Clínicas ocultas', Icono: EyeOff },
      ],
    },
    {
      titulo: 'SUPERVISIÓN',
      opciones: [
        { valor: 'citas', destino: '/admin/citas', titulo: 'Citas registradas', Icono: CalendarDays },
        { valor: 'calendarios', destino: '/admin/calendarios', titulo: 'Calendarios y cupos', Icono: Clock3 },
        { valor: 'mapa', destino: '/admin/mapa', titulo: 'Mapa de centros', Icono: MapIcon },
      ],
    },
    {
      titulo: 'CUENTAS',
      opciones: [
        { valor: 'usuarios', destino: '/admin/usuarios', titulo: 'Usuarios registrados', Icono: Users },
      ],
    },
  ]
  return <aside className="admin-aside">
    <Link to="/admin" className="admin-logo"><span className="admin-logo-icon"><ShieldCheck size={22} /></span><span>PuntOax<small>PANEL DE ADMINISTRACIÓN</small></span></Link>
    <nav className="admin-aside-nav" aria-label="Menú de administración">
      {grupos.map((grupo) => (
        <div key={grupo.titulo}>
          <div className="admin-aside-grupo">{grupo.titulo}</div>
          {grupo.opciones.map(({ valor, destino, titulo, Icono }) =>
            <Link key={valor} to={destino} aria-current={seccionActiva === valor ? 'page' : undefined}
              className={`admin-aside-enlace ${seccionActiva === valor ? 'activo' : ''}`}>
              <Icono size={18} />{titulo}
            </Link>
          )}
        </div>
      ))}
    </nav>
    <div className="admin-aside-pie">
      <div className="admin-aside-perfil"><span className="admin-perfil-icon">{nombre.slice(0, 1).toUpperCase()}</span><div><strong title={nombre}>{nombre}</strong><small>Administración</small></div></div>
      <button type="button" className="admin-aside-enlace admin-aside-salir" onClick={onSalir}><LogOut size={18} />Cerrar sesión</button>
    </div>
  </aside>
}
function Encabezado({ titulo, descripcion, onSalir, acciones }) {
  return <header className="admin-header">
    <div><div className="admin-header-marca">ADMINISTRACIÓN / PUNTOAX</div><h1>{titulo}</h1><p>{descripcion}</p></div>
    <div className="admin-header-acciones">{acciones}<button onClick={onSalir} type="button" className="admin-salir-movil" aria-label="Cerrar sesión" title="Cerrar sesión"><LogOut size={19} /></button><span className="admin-avatar" aria-hidden="true"><ShieldCheck size={19} /></span></div>
  </header>
}
function Resumen({ resumenGeneral, resumenSolicitudes }) {
  const clinicas = resumenGeneral?.clinicas || {}
  const usuarios = resumenGeneral?.usuarios || {}
  const citas = resumenGeneral?.citas || {}
  const estadisticas = [
    { titulo: 'Clínicas registradas', valor: clinicas.total ?? 0, icono: Building2, estilo: 'neutro' },
    { titulo: 'Clínicas aprobadas', valor: clinicas.aprobadas ?? 0, icono: CheckCircle2, estilo: 'verde' },
    { titulo: 'Pendientes de revisión', valor: clinicas.pendientes ?? resumenSolicitudes?.pendientes ?? 0, icono: Clock3, estilo: 'ambar' },
    { titulo: 'Clínicas ocultas', valor: clinicas.ocultas ?? 0, icono: EyeOff, estilo: 'rojo' },
    { titulo: 'Usuarios registrados', valor: usuarios.total ?? 0, icono: Users, estilo: 'neutro' },
    { titulo: 'Citas programadas', valor: citas.programadas ?? 0, icono: CalendarDays, estilo: 'ambar' },
    { titulo: 'Citas completadas', valor: citas.completadas ?? 0, icono: Check, estilo: 'verde' },
    { titulo: 'Citas canceladas', valor: citas.canceladas ?? 0, icono: XCircle, estilo: 'rojo' },
  ]
  return <section className="admin-resumen" aria-label="Resumen general de la plataforma">
    {estadisticas.map(({ titulo, valor, icono: Icono, estilo }) => <article className="admin-metrica" key={titulo}>
      <div className={`admin-metrica-icon admin-metrica-icon--${estilo}`}><Icono size={20} /></div>
      <span>{titulo}</span><strong>{valor}</strong>
    </article>)}
  </section>
}
function ListaSolicitudes({ onSalir }) {
  const [parametros, setParametros] = useSearchParams()
  const solicitado = parametros.get('estado') || 'todas'
  const filtro = FILTROS.some((f) => f.valor === solicitado) ? solicitado : 'todas'
  const [busqueda, setBusqueda] = useState('')
  const [busquedaAplicada, setBusquedaAplicada] = useState('')
  const [estadoPaginacion, setEstadoPaginacion] = useState({ filtro, pagina: 1 })
  const [limite, setLimite] = useState(10)
  const [solicitudes, setSolicitudes] = useState([])
  const [total, setTotal] = useState(0)
  const [totalPaginas, setTotalPaginas] = useState(1)
  const [resumen, setResumen] = useState({ total: 0, pendientes: 0, aprobadas: 0, rechazadas: 0 })
  const [resumenGeneral, setResumenGeneral] = useState(null)
  const [errorResumen, setErrorResumen] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [recarga, setRecarga] = useState(0)
  const pagina = estadoPaginacion.filtro === filtro ? estadoPaginacion.pagina : 1
  const esResumen = !parametros.has('estado')

  useEffect(() => {
    if (!esResumen) return undefined
    let activo = true
    consultarResumenAdmin()
      .then((datos) => { if (activo) { setResumenGeneral(datos); setErrorResumen(null) } })
      .catch((err) => { if (activo) { setResumenGeneral(null); setErrorResumen(err) } })
    return () => { activo = false }
  }, [esResumen, recarga])

  useEffect(() => {
    const temporizador = setTimeout(() => {
      const limpia = busqueda.trim()
      if (limpia !== busquedaAplicada) {
        setCargando(true)
        setBusquedaAplicada(limpia)
        setEstadoPaginacion({ filtro, pagina: 1 })
      }
    }, 250)
    return () => clearTimeout(temporizador)
  }, [busqueda, busquedaAplicada, filtro])

  useEffect(() => {
    let activo = true
    consultarSolicitudesAdmin(filtro, { page: pagina, limit: limite, q: busquedaAplicada })
      .then((datos) => {
        if (activo) {
          if (!Array.isArray(datos.solicitudes)) throw new Error('La lista recibida no tiene el formato esperado.')
          setSolicitudes(datos.solicitudes)
          setTotal(Number.isInteger(datos.total) ? datos.total : datos.solicitudes.length)
          setTotalPaginas(Number.isInteger(datos.total_paginas) ? datos.total_paginas : 1)
          if (datos.resumen) setResumen(datos.resumen)
          setError('')
        }
      })
      .catch((err) => { if (activo) setError(err) })
      .finally(() => { if (activo) setCargando(false) })
    return () => { activo = false }
  }, [filtro, pagina, limite, busquedaAplicada, recarga])

  const pendientes = resumen.pendientes ?? 0

  function cambiarPagina(nuevaPagina) {
    setCargando(true)
    setEstadoPaginacion({ filtro, pagina: nuevaPagina })
  }
  function cambiarLimite(nuevoLimite) {
    setCargando(true)
    setLimite(nuevoLimite)
    setEstadoPaginacion({ filtro, pagina: 1 })
  }
  function seleccionarFiltro(valor) {
    setCargando(true)
    setParametros({ estado: valor })
    setEstadoPaginacion({ filtro: valor, pagina: 1 })
  }
  function recargar() { setCargando(true); setRecarga((v) => v + 1) }

  const contenidoSeccion = {
    pendiente: { titulo: 'Pendientes de revisión', descripcion: 'Solicitudes que todavía necesitan una decisión.', introduccion: 'Revisa la información de cada clínica antes de aprobarla o rechazarla.' },
    aprobada: { titulo: 'Clínicas aprobadas', descripcion: 'Solicitudes que ya fueron autorizadas.', introduccion: 'Consulta las clínicas aprobadas y administra su visibilidad.' },
    rechazada: { titulo: 'Solicitudes rechazadas', descripcion: 'Solicitudes que no fueron autorizadas.', introduccion: 'Consulta sus detalles y los motivos de rechazo.' },
    suspendida: { titulo: 'Clínicas ocultas', descripcion: 'Clínicas aprobadas que no están visibles en el catálogo.', introduccion: 'Revisa las clínicas ocultas y vuelve a mostrarlas cuando corresponda.' },
    todas: { titulo: 'Todas las solicitudes', descripcion: 'Listado completo de solicitudes.', introduccion: 'Consulta el historial de las solicitudes registradas.' },
  }
  const seccion = esResumen
    ? { titulo: 'Resumen de administración', descripcion: 'Consulta y revisa las solicitudes enviadas por los centros de salud.', introduccion: 'Revisa los datos y documentos antes de autorizar la publicación de una clínica.' }
    : contenidoSeccion[filtro]

  return <>
    <Encabezado titulo={seccion.titulo} descripcion={seccion.descripcion} onSalir={onSalir}
      acciones={<button type="button" className="admin-btn admin-btn--outline" onClick={recargar} disabled={cargando}><RefreshCw size={17} />Actualizar</button>} />
    <div className="admin-cuerpo">
      {esResumen && <div className="admin-bienvenida"><div><span className="admin-eyebrow">GESTIÓN DE CLÍNICAS</span><h2>Solicitudes de incorporación</h2><p>{seccion.introduccion}</p></div><span className="admin-bienvenida-icon"><Building2 size={38} /></span></div>}
      {error && <ErrorCarga error={error} reintentar={recargar} recurso="las solicitudes" />}
      {esResumen && !error && errorResumen && <ErrorCarga error={errorResumen} reintentar={recargar} recurso="el resumen administrativo" />}
      {esResumen && !error && !errorResumen && resumenGeneral && <Resumen resumenGeneral={resumenGeneral} resumenSolicitudes={resumen} />}
      {!error && (
        <section className="admin-panel" aria-labelledby="admin-tabla-titulo">
          <div className="admin-panel-header"><div><span className="admin-eyebrow">BANDEJA DE REVISIÓN</span><h2 id="admin-tabla-titulo">{esResumen ? 'Clínicas y solicitudes' : seccion.titulo} <span className="admin-contador">{total}</span></h2><p>{esResumen ? (pendientes ? `${pendientes} solicitud${pendientes === 1 ? '' : 'es'} pendiente${pendientes === 1 ? '' : 's'} de respuesta.` : 'No hay solicitudes pendientes de revisión.') : seccion.introduccion}</p></div></div>
          <div className="admin-herramientas">
            <div className="admin-filtros" role="group" aria-label="Filtrar por estado">{FILTROS.map((item) => <button key={item.valor} type="button" className={`admin-filtro ${filtro === item.valor ? 'activo' : ''}`} aria-pressed={filtro === item.valor} onClick={() => seleccionarFiltro(item.valor)}>{item.nombre}</button>)}</div>
            <label className="admin-buscador"><Search size={17} aria-hidden="true" /><span className="admin-solo-lectores">Buscar por nombre, municipio o institución</span><input type="search" value={busqueda} placeholder="Buscar clínica o municipio" onChange={(e) => setBusqueda(e.target.value)} /></label>
          </div>
          {cargando ? <Cargando /> : solicitudes.length ? <>
            <div className="admin-tabla-wrap"><table className="admin-tabla"><thead><tr><th>Clínica</th><th>Municipio</th><th>Solicitud</th><th>Estado</th><th className="admin-tabla-accion">Acción</th></tr></thead><tbody>
              {solicitudes.map((s) => <tr key={s.id_solicitud}>
                <td data-label="Clínica"><div className="admin-fila-clinica"><span className="admin-fila-icon"><Building2 size={19} /></span><div><strong>{texto(s.nombre_clinica)}</strong><small>{ETIQUETAS_TIPO_SOLICITUD[s.tipo_solicitud] || TIPO[s.tipo_institucion] || texto(s.tipo_institucion)}</small></div></div></td>
                <td data-label="Municipio"><span className="admin-celda-icon"><MapPin size={15} />{texto(s.municipio)}</span></td>
                <td data-label="Solicitud"><span className="admin-celda-icon"><CalendarDays size={15} />{fecha(s.fecha_solicitud)}</span></td>
                <td data-label="Estado"><Estado estado={estadoEfectivo(s)} /></td>
                <td className="admin-tabla-accion"><Link to={`/admin/solicitudes/${s.id_solicitud}`} className="admin-revisar">{s.estado === 'pendiente' ? 'Revisar' : 'Ver detalle'}<ChevronRight size={17} /></Link></td>
              </tr>)}</tbody></table></div>
            <Paginacion
              paginaActual={pagina}
              totalPaginas={totalPaginas}
              totalRegistros={total}
              limite={limite}
              mostrando={solicitudes.length}
              onCambiarPagina={cambiarPagina}
              onCambiarLimite={cambiarLimite}
              etiquetaRegistros="solicitudes"
            />
          </> : <div className="admin-sin-datos"><SlidersHorizontal size={30} /><strong>No hay solicitudes con estos filtros</strong><p>{busquedaAplicada ? 'Prueba con otro nombre o elimina el texto de búsqueda.' : 'Selecciona otro estado para consultar solicitudes existentes.'}</p></div>}
        </section>
      )}
      <p className="admin-nota"><CircleHelp size={16} />Los registros provienen del API de administración. Solo las clínicas aprobadas y visibles aparecen en el catálogo público.</p>
    </div>
  </>
}

function ListaUsuarios({ onSalir }) {
  const [usuarios, setUsuarios] = useState([])
  const [total, setTotal] = useState(0)
  const [totalVerificados, setTotalVerificados] = useState(0)
  const [totalPaginas, setTotalPaginas] = useState(1)
  const [pagina, setPagina] = useState(1)
  const [limite, setLimite] = useState(10)
  const [busqueda, setBusqueda] = useState('')
  const [busquedaAplicada, setBusquedaAplicada] = useState('')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    const temporizador = setTimeout(() => {
      const limpia = busqueda.trim()
      if (limpia !== busquedaAplicada) {
        setCargando(true)
        setBusquedaAplicada(limpia)
        setPagina(1)
      }
    }, 250)
    return () => clearTimeout(temporizador)
  }, [busqueda, busquedaAplicada])

  useEffect(() => {
    let activo = true
    consultarUsuariosAdmin({ page: pagina, limit: limite, q: busquedaAplicada })
      .then((datos) => {
        if (activo) {
          if (!Array.isArray(datos.usuarios)) throw new Error('La lista recibida no tiene el formato esperado.')
          setUsuarios(datos.usuarios)
          setTotal(Number.isInteger(datos.total) ? datos.total : datos.usuarios.length)
          setTotalVerificados(Number.isInteger(datos.total_verificados)
            ? datos.total_verificados
            : datos.usuarios.filter((u) => u.correo_verificado).length)
          setTotalPaginas(Number.isInteger(datos.total_paginas) ? datos.total_paginas : 1)
          setError('')
        }
      })
      .catch((err) => { if (activo) setError(err) })
      .finally(() => { if (activo) setCargando(false) })
    return () => { activo = false }
  }, [pagina, limite, busquedaAplicada, recarga])

  const estadisticas = [
    { titulo: 'Cuentas registradas', valor: total, icono: Users, estilo: 'neutro' },
    { titulo: 'En esta página', valor: usuarios.length, icono: ClipboardList, estilo: 'ambar' },
    { titulo: 'Correos verificados', valor: totalVerificados, icono: CheckCircle2, estilo: 'verde' },
  ]

  function cambiarPaginaUsuarios(nuevaPagina) {
    setCargando(true)
    setPagina(nuevaPagina)
  }
  function cambiarLimiteUsuarios(nuevoLimite) {
    setCargando(true)
    setLimite(nuevoLimite)
    setPagina(1)
  }
  function recargar() { setCargando(true); setRecarga((v) => v + 1) }

  return <>
    <Encabezado titulo="Usuarios registrados" descripcion="Consulta las cuentas de paciente creadas en PuntOax." onSalir={onSalir}
      acciones={<button type="button" className="admin-btn admin-btn--outline" onClick={recargar} disabled={cargando}><RefreshCw size={17} />Actualizar</button>} />
    <div className="admin-cuerpo">
      <div className="admin-bienvenida">
        <div><span className="admin-eyebrow">GESTIÓN DE CUENTAS</span><h2>Cuentas de usuario</h2><p>Listado de solo lectura: no muestra contraseñas ni permite modificar cuentas.</p></div>
        <span className="admin-bienvenida-icon"><Users size={38} /></span>
      </div>
      {error && <ErrorCarga error={error} reintentar={recargar} recurso="los usuarios registrados" />}
      {!error && <>
        <section className="admin-resumen" aria-label="Resumen de usuarios">
          {estadisticas.map(({ titulo, valor, icono: Icono, estilo }) => <article className="admin-metrica" key={titulo}>
            <div className={`admin-metrica-icon admin-metrica-icon--${estilo}`}><Icono size={20} /></div>
            <span>{titulo}</span><strong>{valor}</strong>
          </article>)}
        </section>
        <section className="admin-panel" aria-labelledby="admin-usuarios-titulo">
          <div className="admin-panel-header"><div><span className="admin-eyebrow">CUENTAS DE PACIENTE</span><h2 id="admin-usuarios-titulo">Usuarios <span className="admin-contador">{total}</span></h2><p>Listado paginado de cuentas registradas en la plataforma.</p></div></div>
          <div className="admin-herramientas">
            <label className="admin-buscador"><Search size={17} aria-hidden="true" /><span className="admin-solo-lectores">Buscar por correo, nombre o teléfono</span><input type="search" value={busqueda} placeholder="Buscar correo, nombre o teléfono" onChange={(e) => setBusqueda(e.target.value)} /></label>
          </div>
          {cargando ? <Cargando mensaje="Consultando usuarios…" /> : usuarios.length ? <>
            <div className="admin-tabla-wrap"><table className="admin-tabla"><thead><tr><th>Usuario</th><th>Teléfono</th><th>Registro</th><th>Correo</th><th>Cuenta</th><th className="admin-tabla-accion">Acción</th></tr></thead><tbody>
              {usuarios.map((u) => <tr key={u.id_usuario}>
                <td data-label="Usuario"><div className="admin-fila-clinica"><span className="admin-fila-icon"><User size={19} /></span><div><strong>{nombreCompleto(u) || 'Sin nombre registrado'}</strong><small>{texto(u.correo)}</small></div></div></td>
                <td data-label="Teléfono"><span className="admin-celda-icon"><Phone size={15} />{texto(u.telefono)}</span></td>
                <td data-label="Registro"><span className="admin-celda-icon"><CalendarDays size={15} />{fecha(u.fecha_registro)}</span></td>
                <td data-label="Correo"><EstadoVerificacion verificado={Boolean(u.correo_verificado)} /></td>
                <td data-label="Cuenta"><EstadoCuenta activo={u.activo} /></td>
                <td className="admin-tabla-accion"><Link to={`/admin/usuarios/${u.id_usuario}`} className="admin-revisar">Ver detalle<ChevronRight size={17} /></Link></td>
              </tr>)}</tbody></table></div>
            <Paginacion
              paginaActual={pagina}
              totalPaginas={totalPaginas}
              totalRegistros={total}
              limite={limite}
              mostrando={usuarios.length}
              onCambiarPagina={cambiarPaginaUsuarios}
              onCambiarLimite={cambiarLimiteUsuarios}
              etiquetaRegistros="usuarios"
            />
          </> : <div className="admin-sin-datos"><Users size={30} /><strong>No hay usuarios con esta búsqueda</strong><p>{busquedaAplicada ? 'Prueba con otro correo, nombre o teléfono.' : 'Todavía no se ha registrado ninguna cuenta de usuario.'}</p></div>}
        </section>
      </>}
      <p className="admin-nota"><CircleHelp size={16} />El listado es de solo lectura y se consulta por páginas. Las contraseñas nunca se envían al navegador.</p>
    </div>
  </>
}

function Campo({ etiqueta, valor }) {
  return <div className="admin-campo"><dt>{etiqueta}</dt><dd>{texto(valor)}</dd></div>
}
function PanelInformacion({ solicitud }) {
  const foto = solicitud.datos_ficha
  const clinica = foto?.clinica || {}
  const servicios = Array.isArray(foto?.servicios) ? foto.servicios : []
  const horarios = Array.isArray(foto?.horarios) ? foto.horarios : []
  const camposModificados = Array.isArray(solicitud.campos_modificados) && solicitud.campos_modificados.length > 0
    ? solicitud.campos_modificados
    : Array.isArray(foto?.campos_modificados) ? foto.campos_modificados : []
  const motivo = solicitud.motivo || foto?.motivo || ''
  const tipoSolicitud = solicitud.tipo_solicitud || foto?.tipo_solicitud || 'postulacion'
  const ubicacionAnterior = foto?.datos_anteriores?.ubicacion || (
    clinica.latitud != null && clinica.longitud != null
      ? { latitud: Number(clinica.latitud), longitud: Number(clinica.longitud) }
      : null
  )
  const ubicacionNueva = foto?.ubicacion_solicitada || foto?.datos_nuevos?.ubicacion || null
  const hayComparacionUbicacion = Boolean(
    ubicacionNueva &&
    Number.isFinite(Number(ubicacionNueva.latitud)) &&
    Number.isFinite(Number(ubicacionNueva.longitud))
  )
  const maps = urlSegura(clinica.ubicacion_maps_url)
  const sitio = urlSegura(clinica.sitio_web)
  const lat = Number(clinica.latitud)
  const lng = Number(clinica.longitud)
  const tieneCoordenadas = clinica.latitud != null && clinica.longitud != null &&
    Number.isFinite(lat) && Number.isFinite(lng)
  const osm = tieneCoordenadas
    ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`
    : null
  return <div className="admin-detalle-contenido">
    {(camposModificados.length > 0 || motivo) && (
      <section className="admin-panel admin-detalle-bloque" aria-label="Resumen de solicitud de actualización">
        <div className="admin-seccion-titulo"><ClipboardList size={19} /><h2>Detalle de la actualización solicitada</h2></div>
        <dl className="admin-campos">
          <Campo etiqueta="Tipo de solicitud" valor={ETIQUETAS_TIPO_SOLICITUD[tipoSolicitud] || tipoSolicitud} />
          <Campo etiqueta="Fecha de envío" valor={fecha(solicitud.fecha_solicitud)} />
          {solicitud.fecha_resolucion && <Campo etiqueta="Fecha de resolución" valor={fecha(solicitud.fecha_resolucion)} />}
        </dl>
        {motivo && (
          <div className="admin-descripcion" style={{ marginTop: '10px' }}>
            <strong>Motivo proporcionado por la clínica</strong>
            <p>{motivo}</p>
          </div>
        )}
        {camposModificados.length > 0 && (
          <div style={{ marginTop: '14px' }}>
            <strong style={{ display: 'block', marginBottom: '8px', fontSize: '13.5px' }}>
              Campos modificados ({camposModificados.length})
            </strong>
            <div className="admin-items">
              {camposModificados.map((c, idx) => (
                <div className="admin-item" key={`${c.campo || idx}`}>
                  <strong>{texto(c.etiqueta || c.campo)}</strong>
                  <p style={{ margin: '4px 0 2px', color: '#7A3232' }}>
                    <strong>Anterior:</strong> {texto(c.valor_anterior)}
                  </p>
                  <p style={{ margin: 0, color: '#103328' }}>
                    <strong>Nuevo:</strong> {texto(c.valor_nuevo)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
        {hayComparacionUbicacion && (
          <div style={{ marginTop: '14px' }}>
            <strong style={{ display: 'block', marginBottom: '8px', fontSize: '13.5px' }}>
              Comparación de ubicación en mapa (Anterior vs Nueva solicitada)
            </strong>
            <div style={{ height: '240px', borderRadius: '10px', overflow: 'hidden', border: '1px solid #D6E6E0' }}>
              <MapContainer
                center={[Number(ubicacionNueva.latitud), Number(ubicacionNueva.longitud)]}
                zoom={15}
                style={{ width: '100%', height: '100%' }}
                scrollWheelZoom={false}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {ubicacionAnterior && Number.isFinite(Number(ubicacionAnterior.latitud)) && (
                  <Marker
                    position={[Number(ubicacionAnterior.latitud), Number(ubicacionAnterior.longitud)]}
                    icon={crearPinAdmin('#6B7280')}
                  >
                    <Popup>Ubicación anterior ({Number(ubicacionAnterior.latitud).toFixed(6)}, {Number(ubicacionAnterior.longitud).toFixed(6)})</Popup>
                  </Marker>
                )}
                <Marker
                  position={[Number(ubicacionNueva.latitud), Number(ubicacionNueva.longitud)]}
                  icon={crearPinAdmin('#B42318')}
                >
                  <Popup>Nueva ubicación solicitada ({Number(ubicacionNueva.latitud).toFixed(6)}, {Number(ubicacionNueva.longitud).toFixed(6)})</Popup>
                </Marker>
              </MapContainer>
            </div>
          </div>
        )}
      </section>
    )}
    <section className="admin-panel admin-detalle-bloque"><div className="admin-seccion-titulo"><Building2 size={19} /><h2>Información institucional</h2></div>
      {!foto && <div className="admin-aviso admin-aviso--info"><AlertCircle size={18} /><p>El API no devolvió la ficha guardada al postular. Solo pueden consultarse los datos resumidos.</p></div>}
      <dl className="admin-campos"><Campo etiqueta="Nombre de la clínica" valor={clinica.nombre || solicitud.nombre_clinica} /><Campo etiqueta="Tipo de institución" valor={TIPO[clinica.tipo_institucion || solicitud.tipo_institucion] || clinica.tipo_institucion || solicitud.tipo_institucion} /><Campo etiqueta="Municipio" valor={clinica.municipio || solicitud.municipio} /><Campo etiqueta="Localidad" valor={clinica.localidad} /><Campo etiqueta="Dirección" valor={clinica.direccion} /><Campo etiqueta="Código postal" valor={clinica.codigo_postal} /><Campo etiqueta="Ubicación confirmada" valor={tieneCoordenadas ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : 'Sin confirmar en el mapa'} /></dl>
      {clinica.descripcion && <div className="admin-descripcion"><strong>Descripción de la institución</strong><p>{clinica.descripcion}</p></div>}
      {maps && <a className="admin-link" href={maps} target="_blank" rel="noopener noreferrer"><MapPin size={16} />Ver ubicación en Google Maps <ArrowRight size={15} /></a>}
      {osm && <a className="admin-link" href={osm} target="_blank" rel="noopener noreferrer"><MapPin size={16} />Ver punto confirmado en OpenStreetMap <ArrowRight size={15} /></a>}
    </section>
    <section className="admin-panel admin-detalle-bloque"><div className="admin-seccion-titulo"><Phone size={19} /><h2>Datos de contacto</h2></div>
      <dl className="admin-campos"><Campo etiqueta="Teléfono" valor={clinica.telefono || solicitud.telefono} /><Campo etiqueta="Correo de contacto" valor={clinica.correo_contacto || solicitud.correo_contacto} /></dl>
      {sitio && <a className="admin-link" href={sitio} target="_blank" rel="noopener noreferrer">Ver sitio web <ArrowRight size={15} /></a>}
    </section>
    <section className="admin-panel admin-detalle-bloque"><div className="admin-seccion-titulo"><CheckCircle2 size={19} /><h2>Servicios registrados</h2></div>
      {servicios.length ? <div className="admin-items">{servicios.map((s, i) => <div className="admin-item" key={s.id_servicio || i}><strong>{texto(s.nombre || s.categoria)}</strong><p>{texto(s.detalle_servicio || s.detalle)}</p></div>)}</div> : <p className="admin-vacio-pequeno">Sin servicios en la ficha recibida.</p>}
    </section>
    <section className="admin-panel admin-detalle-bloque"><div className="admin-seccion-titulo"><Clock3 size={19} /><h2>Horarios de atención</h2></div>
      {horarios.length ? <div className="admin-horarios">{horarios.map((h, i) => <div className="admin-horario" key={i}><span>{DIAS[Number(h.dia_semana)] || 'Día no especificado'}</span><strong>{h.es_24_horas ? '24 horas' : `${texto(h.apertura)} – ${texto(h.cierre)}${h.cruza_medianoche ? ' (nocturno)' : ''}`}</strong></div>)}</div> : <p className="admin-vacio-pequeno">Sin horarios en la ficha recibida.</p>}
    </section>
  </div>
}

function Documentos({ documentos }) {
  const [descargando, setDescargando] = useState(null)
  const [errorDocumento, setErrorDocumento] = useState('')
  const tarea = useRef(false)
  async function descargar(documento) {
    if (tarea.current) return
    tarea.current = true
    setDescargando(documento.id_documento)
    setErrorDocumento('')
    try {
      const archivo = await descargarDocumentoAdmin(documento.id_documento)
      const enlace = document.createElement('a')
      const url = URL.createObjectURL(archivo)
      enlace.href = url
      enlace.download = documento.nombre_original || 'documento-clinica'
      document.body.appendChild(enlace)
      enlace.click()
      enlace.remove()
      // Esperar a que el navegador inicie la descarga antes de liberar el blob.
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) { setErrorDocumento(err) }
    finally { tarea.current = false; setDescargando(null) }
  }
  return <section className="admin-panel admin-detalle-bloque"><div className="admin-seccion-titulo"><FileText size={19} /><h2>Documentos de respaldo</h2></div>
    <p className="admin-seccion-ayuda">Archivos privados actuales de la clínica. Solo el administrador puede descargarlos.</p>
    {errorDocumento && <ErrorCarga error={errorDocumento} recurso="el documento" />}
    {documentos.length ? <div className="admin-documentos">{documentos.map((d) => <div className="admin-documento" key={d.id_documento}><span className="admin-documento-icon"><FileText size={19} /></span><div className="admin-documento-texto"><strong>{d.nombre_original || 'Documento de respaldo'}</strong><small>{typeof d.tamano_bytes === 'number' ? `${Math.ceil(d.tamano_bytes / 1024)} KB · ` : ''}{fecha(d.fecha_carga)}</small></div><button type="button" className="admin-btn admin-btn--outline" disabled={descargando !== null} onClick={() => descargar(d)}><Download size={16} />{descargando === d.id_documento ? 'Descargando…' : 'Descargar'}</button></div>)}</div> : <p className="admin-vacio-pequeno">No hay documentos disponibles para descargar.</p>}
  </section>
}

function ModalAccion({ accion, procesando, error, observaciones, setObservaciones, cerrar, confirmar }) {
  const esRechazo = accion === 'rechazar'
  useEffect(() => {
    const tecla = (e) => { if (e.key === 'Escape' && !procesando) cerrar() }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [cerrar, procesando])
  return <div className="admin-modal-fondo" role="presentation"><div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="admin-modal-titulo" aria-describedby="admin-modal-descripcion">
    <div className="admin-modal-cabecera"><span className={`admin-modal-icon admin-modal-icon--${accion}`}>
      {['aprobar', 'mostrar'].includes(accion) ? <CheckCircle2 size={25} /> : accion === 'rechazar' ? <XCircle size={25} /> : <EyeOff size={25} />}
    </span><button type="button" className="admin-cerrar" onClick={cerrar} disabled={procesando} aria-label="Cerrar"><X size={20} /></button></div>
    <h2 id="admin-modal-titulo">{NOMBRE_ACCION[accion]}</h2><p id="admin-modal-descripcion">{INFO_ACCION[accion]} ¿Deseas continuar?</p>
    {esRechazo && <label className="admin-observaciones"><span>Motivo del rechazo administrativo (obligatorio)</span><textarea autoFocus placeholder="Indica qué debe corregir la clínica…" value={observaciones} maxLength={1000} rows={4} onChange={(e) => setObservaciones(e.target.value)} /><small>Mínimo 10 caracteres. {observaciones.trim().length}/1000</small></label>}
    {error && <div className="admin-modal-error" role="alert">{error}</div>}
    <div className="admin-modal-acciones"><button type="button" className="admin-btn admin-btn--outline" onClick={cerrar} disabled={procesando}>Cancelar</button><button type="button" className={`admin-btn ${['rechazar', 'ocultar'].includes(accion) ? 'admin-btn--peligro' : 'admin-btn--primario'}`} disabled={procesando || (esRechazo && observaciones.trim().length < 10)} onClick={confirmar}>{procesando ? 'Guardando…' : `Sí, ${accion === 'mostrar' ? 'mostrar' : accion}`}</button></div>
  </div></div>
}

function DetalleSolicitud({ idSolicitud, onSalir }) {
  const navigate = useNavigate()
  const [detalle, setDetalle] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [accion, setAccion] = useState(null)
  const [observaciones, setObservaciones] = useState('')
  const [errorAccion, setErrorAccion] = useState('')
  const [procesando, setProcesando] = useState(false)
  const ocupado = useRef(false)
  const location = useLocation()

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const resultado = await consultarSolicitudAdmin(idSolicitud)
      if (!resultado?.solicitud) throw new Error('La solicitud no se encontró en la respuesta del servidor.')
      setDetalle(resultado)
      setError('')
    } catch (err) { setError(err) }
    finally { setCargando(false) }
  }, [idSolicitud])
  useEffect(() => {
    let activo = true
    consultarSolicitudAdmin(idSolicitud)
      .then((resultado) => {
        if (!resultado?.solicitud) throw new Error('La solicitud no se encontró en la respuesta del servidor.')
        if (activo) { setDetalle(resultado); setError('') }
      })
      .catch((err) => { if (activo) setError(err) })
      .finally(() => { if (activo) setCargando(false) })
    return () => { activo = false }
  }, [idSolicitud])

  const solicitud = detalle?.solicitud
  const publicado = solicitud?.estado_publicacion
  const estado = solicitud ? estadoEfectivo(solicitud) : null
  const pendiente = solicitud?.estado === 'pendiente'
  const permiteVisibilidad = solicitud?.estado === 'aprobada' && ['aprobada', 'suspendida'].includes(publicado)
  const abrir = (tipo) => { setAccion(tipo); setObservaciones(''); setErrorAccion(''); setAviso('') }
  const cerrar = useCallback(() => { if (!ocupado.current) setAccion(null) }, [])

  async function confirmar() {
    if (ocupado.current || !accion || !solicitud) return
    if (accion === 'rechazar' && observaciones.trim().length < 10) { setErrorAccion('Escribe un motivo de al menos 10 caracteres.'); return }
    ocupado.current = true
    setProcesando(true)
    setErrorAccion('')
    try {
      const respuesta = ['aprobar', 'rechazar'].includes(accion)
        ? await resolverSolicitudAdmin(solicitud.id_solicitud, accion, observaciones)
        : await cambiarVisibilidadAdmin(solicitud.id_clinica, accion)
      // Actualiza inmediatamente, incluso si falla una consulta posterior.
      setDetalle((anterior) => ({ ...anterior, solicitud: {
        ...anterior.solicitud,
        estado: respuesta.solicitud?.estado || anterior.solicitud.estado,
        observaciones: respuesta.solicitud?.observaciones ?? anterior.solicitud.observaciones,
        estado_publicacion: respuesta.clinica?.estado_publicacion || anterior.solicitud.estado_publicacion,
      } }))
      setAviso(respuesta.mensaje || 'La acción se realizó correctamente.')
      setAccion(null)
      try { const actualizado = await consultarSolicitudAdmin(solicitud.id_solicitud); setDetalle(actualizado) } catch { /* se mantiene el resultado confirmado por PATCH */ }
    } catch (err) { setErrorAccion(err.message) }
    finally { ocupado.current = false; setProcesando(false) }
  }

  return <>
    <Encabezado titulo="Revisar alta de clínica" descripcion="Verifica la ficha enviada y gestiona el estado de su publicación." onSalir={onSalir}
      acciones={<button type="button" className="admin-btn admin-btn--outline" onClick={cargar} disabled={cargando || procesando}><RefreshCw size={16} />Actualizar</button>} />
    <div className="admin-cuerpo admin-detalle-pagina">
      <button className="admin-volver" type="button" onClick={() => navigate(location.state?.volver || '/admin')}><ArrowLeft size={17} />Volver a solicitudes</button>
      {error && <ErrorCarga error={error} reintentar={cargar} recurso="la solicitud" />}
      {cargando && !detalle ? <Cargando mensaje="Cargando la ficha de revisión…" /> : solicitud && <>
        <div className="admin-detalle-hero"><div className="admin-detalle-icon"><Building2 size={31} /></div><div className="admin-detalle-hero-texto"><span className="admin-eyebrow">POSTULACIÓN DE CENTRO DE SALUD</span><h2>{texto(solicitud.nombre_clinica)}</h2><div className="admin-detalle-meta"><span><MapPin size={15} />{texto(solicitud.municipio)}</span><span><CalendarDays size={15} />{fecha(solicitud.fecha_solicitud)}</span></div></div><Estado estado={estado} /></div>
        {aviso && <div className="admin-aviso admin-aviso--exito" role="status"><CheckCircle2 size={19} /><p>{aviso}</p><button type="button" className="admin-cerrar" aria-label="Cerrar aviso" onClick={() => setAviso('')}><X size={17} /></button></div>}
        <div className="admin-detalle-grid"><div>
          <PanelInformacion solicitud={solicitud} />
          <Documentos key={solicitud.id_solicitud} documentos={Array.isArray(detalle.documentos) ? detalle.documentos : []} />
        </div><aside className="admin-detalle-lateral"><section className="admin-panel admin-dictamen"><div className="admin-seccion-titulo"><ShieldCheck size={20} /><h2>Dictamen administrativo</h2></div><p className="admin-dictamen-ayuda">Revisa la documentación y decide si la clínica cumple los requisitos para ser publicada.</p><div className="admin-dictamen-estado"><small>Estado de la solicitud</small><Estado estado={solicitud.estado} /></div><div className="admin-dictamen-estado"><small>Publicación actual</small><Estado estado={publicado} /></div>
            {pendiente && <div className="admin-decisiones"><button type="button" className="admin-btn admin-btn--primario" onClick={() => abrir('aprobar')} disabled={procesando}><Check size={18} />Aprobar clínica</button><button type="button" className="admin-btn admin-btn--peligro-claro" onClick={() => abrir('rechazar')} disabled={procesando}><X size={18} />Rechazar solicitud</button></div>}
            {permiteVisibilidad && <div className="admin-decisiones"><button type="button" className={`admin-btn ${publicado === 'aprobada' ? 'admin-btn--peligro-claro' : 'admin-btn--primario'}`} disabled={procesando} onClick={() => abrir(publicado === 'aprobada' ? 'ocultar' : 'mostrar')}>{publicado === 'aprobada' ? <EyeOff size={18} /> : <Eye size={18} />}{publicado === 'aprobada' ? 'Ocultar del mapa' : 'Volver a mostrar'}</button></div>}
            {solicitud.estado === 'rechazada' && <p className="admin-dictamen-nota">Esta solicitud fue rechazada y ya no puede resolverse de nuevo. La clínica puede volver a postular.</p>}
            {solicitud.observaciones && <div className="admin-observaciones-anteriores"><strong>Motivo registrado de la resolución</strong><p>{solicitud.observaciones}</p></div>}
            <div className="admin-dictamen-pie"><CircleHelp size={17} /><span>Las decisiones se guardan directamente en el servidor y requieren una cuenta administradora.</span></div>
          </section>
          <section className="admin-panel admin-ayuda-panel"><h2><Mail size={18} /> Datos para seguimiento</h2><p>Correo: {texto(solicitud.correo_contacto || solicitud.datos_ficha?.clinica?.correo_contacto)}</p><p>Teléfono: {texto(solicitud.telefono || solicitud.datos_ficha?.clinica?.telefono)}</p></section>
        </aside></div>
      </>}
    </div>
    {accion && <ModalAccion accion={accion} procesando={procesando} error={errorAccion} observaciones={observaciones} setObservaciones={setObservaciones} cerrar={cerrar} confirmar={confirmar} />}
  </>
}

const FILTROS_CLINICAS = [
  { valor: 'todas', nombre: 'Todas' },
  { valor: 'aprobada', nombre: 'Aprobadas' },
  { valor: 'suspendida', nombre: 'Ocultas' },
  { valor: 'pendiente', nombre: 'Pendientes' },
  { valor: 'borrador', nombre: 'Borrador' },
  { valor: 'rechazada', nombre: 'Rechazadas' },
]

function ListaClinicasAdmin({ onSalir }) {
  const [parametros, setParametros] = useSearchParams()
  const solicitado = parametros.get('estado') || 'todas'
  const filtro = FILTROS_CLINICAS.some((f) => f.valor === solicitado) ? solicitado : 'todas'
  const [busqueda, setBusqueda] = useState('')
  const [busquedaAplicada, setBusquedaAplicada] = useState('')
  const [estadoPaginacion, setEstadoPaginacion] = useState({ filtro, pagina: 1 })
  const [limite, setLimite] = useState(10)
  const [clinicas, setClinicas] = useState([])
  const [total, setTotal] = useState(0)
  const [totalPaginas, setTotalPaginas] = useState(1)
  const [resumen, setResumen] = useState({ total: 0, aprobadas: 0, suspendidas: 0, pendientes: 0, borrador: 0, rechazadas: 0 })
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [recarga, setRecarga] = useState(0)
  const pagina = estadoPaginacion.filtro === filtro ? estadoPaginacion.pagina : 1

  useEffect(() => {
    const temporizador = setTimeout(() => {
      const limpia = busqueda.trim()
      if (limpia !== busquedaAplicada) {
        setCargando(true)
        setBusquedaAplicada(limpia)
        setEstadoPaginacion({ filtro, pagina: 1 })
      }
    }, 250)
    return () => clearTimeout(temporizador)
  }, [busqueda, busquedaAplicada, filtro])

  useEffect(() => {
    let activo = true
    consultarClinicasAdmin(filtro, { page: pagina, limit: limite, q: busquedaAplicada })
      .then((datos) => {
        if (activo) {
          if (!Array.isArray(datos.clinicas)) throw new Error('La lista recibida no tiene el formato esperado.')
          setClinicas(datos.clinicas)
          setTotal(Number.isInteger(datos.total) ? datos.total : datos.clinicas.length)
          setTotalPaginas(Number.isInteger(datos.total_paginas) ? datos.total_paginas : 1)
          if (datos.resumen) setResumen(datos.resumen)
          setError('')
        }
      })
      .catch((err) => { if (activo) setError(err) })
      .finally(() => { if (activo) setCargando(false) })
    return () => { activo = false }
  }, [filtro, pagina, limite, busquedaAplicada, recarga])

  function cambiarPagina(nuevaPagina) { setCargando(true); setEstadoPaginacion({ filtro, pagina: nuevaPagina }) }
  function cambiarLimite(nuevoLimite) { setCargando(true); setLimite(nuevoLimite); setEstadoPaginacion({ filtro, pagina: 1 }) }
  function seleccionarFiltro(valor) { setCargando(true); setParametros({ estado: valor }); setEstadoPaginacion({ filtro: valor, pagina: 1 }) }
  function recargar() { setCargando(true); setRecarga((v) => v + 1) }

  const estadisticas = [
    { titulo: 'Clínicas registradas', valor: resumen.total ?? 0, icono: Building2, estilo: 'neutro' },
    { titulo: 'Publicadas en mapa', valor: resumen.aprobadas ?? 0, icono: CheckCircle2, estilo: 'verde' },
    { titulo: 'Ocultas del directorio', valor: resumen.suspendidas ?? 0, icono: EyeOff, estilo: 'rojo' },
    { titulo: 'Pendientes / borrador', valor: (resumen.pendientes ?? 0) + (resumen.borrador ?? 0), icono: Clock3, estilo: 'ambar' },
  ]

  return <>
    <Encabezado titulo="Clínicas registradas" descripcion="Consulta todas las clínicas almacenadas en la plataforma y gestiona su visibilidad." onSalir={onSalir}
      acciones={<button type="button" className="admin-btn admin-btn--outline" onClick={recargar} disabled={cargando}><RefreshCw size={17} />Actualizar</button>} />
    <div className="admin-cuerpo">
      {error && <ErrorCarga error={error} reintentar={recargar} recurso="las clínicas registradas" />}
      {!error && <>
        <section className="admin-resumen" aria-label="Resumen de clínicas">
          {estadisticas.map(({ titulo, valor, icono: Icono, estilo }) => <article className="admin-metrica" key={titulo}>
            <div className={`admin-metrica-icon admin-metrica-icon--${estilo}`}><Icono size={20} /></div>
            <span>{titulo}</span><strong>{valor}</strong>
          </article>)}
        </section>
        <section className="admin-panel" aria-labelledby="admin-clinicas-titulo">
          <div className="admin-panel-header"><div><span className="admin-eyebrow">DIRECTORIO INSTITUCIONAL</span><h2 id="admin-clinicas-titulo">Clínicas <span className="admin-contador">{total}</span></h2><p>Consulta la ficha real en PostgreSQL, servicios, horarios, ubicación y estado de publicación.</p></div></div>
          <div className="admin-herramientas">
            <div className="admin-filtros" role="group" aria-label="Filtrar por estado">{FILTROS_CLINICAS.map((item) => <button key={item.valor} type="button" className={`admin-filtro ${filtro === item.valor ? 'activo' : ''}`} aria-pressed={filtro === item.valor} onClick={() => seleccionarFiltro(item.valor)}>{item.nombre}</button>)}</div>
            <label className="admin-buscador"><Search size={17} aria-hidden="true" /><span className="admin-solo-lectores">Buscar clínica por nombre, municipio o correo</span><input type="search" value={busqueda} placeholder="Buscar clínica o municipio" onChange={(e) => setBusqueda(e.target.value)} /></label>
          </div>
          {cargando ? <Cargando mensaje="Consultando clínicas…" /> : clinicas.length ? <>
            <div className="admin-tabla-wrap"><table className="admin-tabla"><thead><tr><th>Clínica</th><th>Municipio</th><th>Contacto</th><th>Estado</th><th className="admin-tabla-accion">Acción</th></tr></thead><tbody>
              {clinicas.map((c) => <tr key={c.id_clinica}>
                <td data-label="Clínica"><div className="admin-fila-clinica"><span className="admin-fila-icon"><Building2 size={19} /></span><div><strong>{texto(c.nombre)}</strong><small>{TIPO[c.tipo_institucion] || texto(c.tipo_institucion)}</small></div></div></td>
                <td data-label="Municipio"><span className="admin-celda-icon"><MapPin size={15} />{texto(c.municipio)}</span></td>
                <td data-label="Contacto"><span className="admin-celda-icon"><Phone size={15} />{texto(c.telefono || c.correo_contacto)}</span></td>
                <td data-label="Estado"><Estado estado={c.estado_publicacion} /></td>
                <td className="admin-tabla-accion"><Link to={`/admin/clinicas/${c.id_clinica}`} className="admin-revisar">Ver detalle<ChevronRight size={17} /></Link></td>
              </tr>)}</tbody></table></div>
            <Paginacion
              paginaActual={pagina}
              totalPaginas={totalPaginas}
              totalRegistros={total}
              limite={limite}
              mostrando={clinicas.length}
              onCambiarPagina={cambiarPagina}
              onCambiarLimite={cambiarLimite}
              etiquetaRegistros="clínicas"
            />
          </> : <div className="admin-sin-datos"><Building2 size={30} /><strong>No hay clínicas con estos filtros</strong><p>{busquedaAplicada ? 'Prueba con otro nombre o municipio.' : 'No existen clínicas en este estado.'}</p></div>}
        </section>
      </>}
    </div>
  </>
}

function DetalleClinicaAdmin({ idClinica, onSalir }) {
  const navigate = useNavigate()
  const [detalle, setDetalle] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [accion, setAccion] = useState(null)
  const [observaciones, setObservaciones] = useState('')
  const [errorAccion, setErrorAccion] = useState('')
  const [procesando, setProcesando] = useState(false)
  const ocupado = useRef(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const resultado = await consultarClinicaAdmin(idClinica)
      if (!resultado?.clinica) throw new Error('No se encontró la clínica solicitada.')
      setDetalle(resultado)
      setError('')
    } catch (err) { setError(err) }
    finally { setCargando(false) }
  }, [idClinica])

  useEffect(() => {
    let activo = true
    consultarClinicaAdmin(idClinica)
      .then((resultado) => {
        if (!resultado?.clinica) throw new Error('No se encontró la clínica solicitada.')
        if (activo) { setDetalle(resultado); setError('') }
      })
      .catch((err) => { if (activo) setError(err) })
      .finally(() => { if (activo) setCargando(false) })
    return () => { activo = false }
  }, [idClinica])

  const clinica = detalle?.clinica
  const servicios = Array.isArray(detalle?.servicios) ? detalle.servicios : []
  const horarios = Array.isArray(detalle?.horarios) ? detalle.horarios : []
  const documentos = Array.isArray(detalle?.documentos) ? detalle.documentos : []
  const enlaces = Array.isArray(clinica?.enlaces_informacion) ? clinica.enlaces_informacion : []
  const lat = Number(clinica?.latitud)
  const lng = Number(clinica?.longitud)
  const tieneCoordenadas = clinica?.latitud != null && clinica?.longitud != null && Number.isFinite(lat) && Number.isFinite(lng)
  const maps = urlSegura(clinica?.ubicacion_maps_url)
  const sitio = urlSegura(clinica?.sitio_web)
  const osm = tieneCoordenadas ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}` : null
  const permiteVisibilidad = ['aprobada', 'suspendida'].includes(clinica?.estado_publicacion)

  const cerrar = useCallback(() => { if (!ocupado.current) setAccion(null) }, [])

  async function confirmarVisibilidad() {
    if (ocupado.current || !accion || !clinica) return
    ocupado.current = true
    setProcesando(true)
    setErrorAccion('')
    try {
      const respuesta = await cambiarVisibilidadAdmin(clinica.id_clinica, accion)
      setDetalle((anterior) => ({
        ...anterior,
        clinica: {
          ...anterior.clinica,
          estado_publicacion: respuesta.clinica?.estado_publicacion || anterior.clinica.estado_publicacion,
        },
      }))
      setAviso(respuesta.mensaje || 'Visibilidad actualizada correctamente.')
      setAccion(null)
    } catch (err) { setErrorAccion(err.message) }
    finally { ocupado.current = false; setProcesando(false) }
  }

  return <>
    <Encabezado titulo="Detalle de clínica" descripcion="Información institucional real almacenada en la base de datos." onSalir={onSalir}
      acciones={<button type="button" className="admin-btn admin-btn--outline" onClick={cargar} disabled={cargando || procesando}><RefreshCw size={16} />Actualizar</button>} />
    <div className="admin-cuerpo admin-detalle-pagina">
      <button className="admin-volver" type="button" onClick={() => navigate('/admin/clinicas')}><ArrowLeft size={17} />Volver a clínicas</button>
      {error && <ErrorCarga error={error} reintentar={cargar} recurso="la clínica" />}
      {cargando && !detalle ? <Cargando mensaje="Cargando información de la clínica…" /> : clinica && <>
        <div className="admin-detalle-hero"><div className="admin-detalle-icon"><Building2 size={31} /></div><div className="admin-detalle-hero-texto"><span className="admin-eyebrow">FICHA INSTITUCIONAL</span><h2>{texto(clinica.nombre)}</h2><div className="admin-detalle-meta"><span><MapPin size={15} />{texto(clinica.municipio)}</span><span><CalendarDays size={15} />Registro: {fecha(clinica.fecha_registro)}</span></div></div><Estado estado={clinica.estado_publicacion} /></div>
        {aviso && <div className="admin-aviso admin-aviso--exito" role="status"><CheckCircle2 size={19} /><p>{aviso}</p><button type="button" className="admin-cerrar" aria-label="Cerrar aviso" onClick={() => setAviso('')}><X size={17} /></button></div>}
        <div className="admin-detalle-grid">
          <div className="admin-detalle-contenido">
            <section className="admin-panel admin-detalle-bloque"><div className="admin-seccion-titulo"><Building2 size={19} /><h2>Información institucional</h2></div>
              <dl className="admin-campos">
                <Campo etiqueta="Nombre institucional" valor={clinica.nombre} />
                <Campo etiqueta="Tipo de institución" valor={TIPO[clinica.tipo_institucion] || clinica.tipo_institucion} />
                <Campo etiqueta="Estado de publicación" valor={etiquetaEstado(clinica.estado_publicacion)} />
                <Campo etiqueta="Municipio" valor={clinica.municipio} />
                <Campo etiqueta="Localidad" valor={clinica.localidad} />
                <Campo etiqueta="Dirección" valor={clinica.direccion} />
                <Campo etiqueta="Código postal" valor={clinica.codigo_postal} />
                <Campo etiqueta="Coordenadas" valor={tieneCoordenadas ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : 'Sin confirmar en el mapa'} />
              </dl>
              {clinica.descripcion && <div className="admin-descripcion"><strong>Descripción</strong><p>{clinica.descripcion}</p></div>}
              {tieneCoordenadas && (
                <div style={{ height: '240px', borderRadius: '10px', overflow: 'hidden', border: '1px solid #D6E6E0', marginTop: '16px' }}>
                  <MapContainer center={[lat, lng]} zoom={15} style={{ width: '100%', height: '100%' }} scrollWheelZoom={false}>
                    <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <Marker position={[lat, lng]} icon={crearPinAdmin('#103328')}><Popup>{texto(clinica.nombre)}</Popup></Marker>
                  </MapContainer>
                </div>
              )}
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                {maps && <a className="admin-link" href={maps} target="_blank" rel="noopener noreferrer"><MapPin size={16} />Abrir en Google Maps <ArrowRight size={15} /></a>}
                {osm && <a className="admin-link" href={osm} target="_blank" rel="noopener noreferrer"><MapPin size={16} />Ver en OpenStreetMap <ArrowRight size={15} /></a>}
              </div>
            </section>

            <section className="admin-panel admin-detalle-bloque"><div className="admin-seccion-titulo"><Phone size={19} /><h2>Contacto institucional</h2></div>
              <dl className="admin-campos">
                <Campo etiqueta="Teléfono" valor={clinica.telefono} />
                <Campo etiqueta="Correo de contacto" valor={clinica.correo_contacto} />
                <Campo etiqueta="Correo de acceso" valor={clinica.correo_acceso} />
                <Campo etiqueta="Correo verificado" valor={clinica.correo_acceso ? (clinica.correo_verificado ? 'Sí' : 'Pendiente') : 'Sin cuenta de acceso'} />
              </dl>
              {sitio && <a className="admin-link" href={sitio} target="_blank" rel="noopener noreferrer"><Globe size={16} />Visitar sitio web <ArrowRight size={15} /></a>}
            </section>

            <section className="admin-panel admin-detalle-bloque"><div className="admin-seccion-titulo"><CheckCircle2 size={19} /><h2>Servicios disponibles</h2></div>
              {servicios.length ? <div className="admin-items">{servicios.map((s) => (
                <div className="admin-item" key={s.id_servicio}>
                  <strong>{texto(s.nombre)}</strong>
                  <p>{texto(s.detalle_servicio)}</p>
                  {(s.costo_texto || s.costo !== null || s.requisitos) && (
                    <small style={{ display: 'block', marginTop: '6px', color: '#5c7262' }}>
                      {s.costo_texto ? `Costo: ${s.costo_texto}. ` : s.costo !== null ? `Costo: $${s.costo}. ` : ''}
                      {s.requisitos ? `Requisitos: ${s.requisitos}` : ''}
                    </small>
                  )}
                </div>
              ))}</div> : <p className="admin-vacio-pequeno">No hay servicios activos registrados para esta clínica.</p>}
            </section>

            <section className="admin-panel admin-detalle-bloque"><div className="admin-seccion-titulo"><Clock3 size={19} /><h2>Horarios de atención</h2></div>
              {horarios.length ? <div className="admin-horarios">{horarios.map((h, i) => <div className="admin-horario" key={i}><span>{DIAS[Number(h.dia_semana)] || 'Día no especificado'}</span><strong>{h.es_24_horas ? '24 horas' : `${texto(h.apertura)} – ${texto(h.cierre)}${h.cruza_medianoche ? ' (nocturno)' : ''}`}</strong></div>)}</div> : <p className="admin-vacio-pequeno">No hay horarios registrados.</p>}
            </section>

            <section className="admin-panel admin-detalle-bloque"><div className="admin-seccion-titulo"><ExternalLink size={19} /><h2>Enlaces informativos</h2></div>
              {enlaces.length ? <div className="admin-items">{enlaces.map((e, i) => {
                const href = urlSegura(e?.url)
                return <div className="admin-item" key={i}><strong>{texto(e?.titulo)}</strong>{href ? <a className="admin-link" style={{ marginTop: '4px' }} href={href} target="_blank" rel="noopener noreferrer">{href} <ExternalLink size={14} /></a> : <p>Enlace no válido</p>}</div>
              })}</div> : <p className="admin-vacio-pequeno">No hay enlaces informativos registrados.</p>}
            </section>

            <Documentos key={clinica.id_clinica} documentos={documentos} />
          </div>

          <aside className="admin-detalle-lateral">
            <section className="admin-panel admin-dictamen">
              <div className="admin-seccion-titulo"><ShieldCheck size={20} /><h2>Visibilidad en directorio</h2></div>
              <p className="admin-dictamen-ayuda">Controla si la clínica aparece en el mapa público sin eliminar sus datos ni su historial.</p>
              <div className="admin-dictamen-estado"><small>Estado actual</small><Estado estado={clinica.estado_publicacion} /></div>
              {permiteVisibilidad ? (
                <div className="admin-decisiones">
                  <button
                    type="button"
                    className={`admin-btn ${clinica.estado_publicacion === 'aprobada' ? 'admin-btn--peligro-claro' : 'admin-btn--primario'}`}
                    disabled={procesando}
                    onClick={() => { setAccion(clinica.estado_publicacion === 'aprobada' ? 'ocultar' : 'mostrar'); setErrorAccion(''); setAviso('') }}
                  >
                    {clinica.estado_publicacion === 'aprobada' ? <EyeOff size={18} /> : <Eye size={18} />}
                    {clinica.estado_publicacion === 'aprobada' ? 'Ocultar del directorio' : 'Volver a mostrar'}
                  </button>
                </div>
              ) : (
                <p className="admin-dictamen-nota">Solo las clínicas aprobadas u ocultas pueden alternar su visibilidad pública.</p>
              )}
              {detalle?.ultima_solicitud && (
                <Link to={`/admin/solicitudes/${detalle.ultima_solicitud.id_solicitud}`} className="admin-link">
                  Ver última solicitud ({etiquetaEstado(detalle.ultima_solicitud.estado)}) <ArrowRight size={15} />
                </Link>
              )}
            </section>
          </aside>
        </div>
      </>}
    </div>
    {accion && <ModalAccion accion={accion} procesando={procesando} error={errorAccion} observaciones={observaciones} setObservaciones={setObservaciones} cerrar={cerrar} confirmar={confirmarVisibilidad} />}
  </>
}

function DetalleUsuarioAdmin({ idUsuario, onSalir }) {
  const navigate = useNavigate()
  const [usuario, setUsuario] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const [procesando, setProcesando] = useState(false)
  const [errorAccion, setErrorAccion] = useState('')

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const resultado = await consultarUsuarioAdmin(idUsuario)
      if (!resultado?.usuario) throw new Error('No se encontró la cuenta solicitada.')
      setUsuario(resultado.usuario)
      setError('')
    } catch (err) { setError(err) }
    finally { setCargando(false) }
  }, [idUsuario])

  useEffect(() => {
    let activo = true
    consultarUsuarioAdmin(idUsuario)
      .then((resultado) => {
        if (!resultado?.usuario) throw new Error('No se encontró la cuenta solicitada.')
        if (activo) { setUsuario(resultado.usuario); setError('') }
      })
      .catch((err) => { if (activo) setError(err) })
      .finally(() => { if (activo) setCargando(false) })
    return () => { activo = false }
  }, [idUsuario])

  const estaActivo = usuario?.activo !== false

  async function confirmarCambioEstado() {
    if (!usuario || procesando) return
    setProcesando(true)
    setErrorAccion('')
    try {
      const respuesta = await cambiarEstadoUsuarioAdmin(usuario.id_usuario, !estaActivo)
      setUsuario((prev) => ({ ...prev, activo: respuesta.usuario?.activo ?? !estaActivo }))
      setAviso(respuesta.mensaje || 'Estado de la cuenta actualizado.')
      setConfirmando(false)
    } catch (err) { setErrorAccion(err.message) }
    finally { setProcesando(false) }
  }

  return <>
    <Encabezado titulo="Detalle de usuario" descripcion="Información de cuenta de paciente registrada en PuntOax." onSalir={onSalir}
      acciones={<button type="button" className="admin-btn admin-btn--outline" onClick={cargar} disabled={cargando || procesando}><RefreshCw size={16} />Actualizar</button>} />
    <div className="admin-cuerpo admin-detalle-pagina">
      <button className="admin-volver" type="button" onClick={() => navigate('/admin/usuarios')}><ArrowLeft size={17} />Volver a usuarios</button>
      {error && <ErrorCarga error={error} reintentar={cargar} recurso="el usuario" />}
      {cargando && !usuario ? <Cargando mensaje="Cargando información del usuario…" /> : usuario && <>
        <div className="admin-detalle-hero"><div className="admin-detalle-icon"><User size={31} /></div><div className="admin-detalle-hero-texto"><span className="admin-eyebrow">CUENTA DE PACIENTE</span><h2>{nombreCompleto(usuario) || 'Sin nombre registrado'}</h2><div className="admin-detalle-meta"><span><Mail size={15} />{texto(usuario.correo)}</span><span><CalendarDays size={15} />Registro: {fecha(usuario.fecha_registro)}</span></div></div><EstadoCuenta activo={usuario.activo} /></div>
        {aviso && <div className="admin-aviso admin-aviso--exito" role="status"><CheckCircle2 size={19} /><p>{aviso}</p><button type="button" className="admin-cerrar" aria-label="Cerrar aviso" onClick={() => setAviso('')}><X size={17} /></button></div>}
        <div className="admin-detalle-grid">
          <div className="admin-detalle-contenido">
            <section className="admin-panel admin-detalle-bloque"><div className="admin-seccion-titulo"><User size={19} /><h2>Datos de la cuenta</h2></div>
              <dl className="admin-campos">
                <Campo etiqueta="Nombre completo" valor={nombreCompleto(usuario) || 'Sin nombre registrado'} />
                <Campo etiqueta="Correo electrónico" valor={usuario.correo} />
                <Campo etiqueta="Teléfono" valor={usuario.telefono} />
                <Campo etiqueta="Fecha de registro" valor={fecha(usuario.fecha_registro)} />
                <Campo etiqueta="Verificación de correo" valor={usuario.correo_verificado ? 'Correo verificado' : 'Sin verificar'} />
                <Campo etiqueta="Estado de la cuenta" valor={estaActivo ? 'Activa' : 'Desactivada'} />
                <Campo etiqueta="Rol" valor="Paciente / Usuario" />
                <Campo etiqueta="Método de acceso" valor={[usuario.acceso_password ? 'Contraseña' : null, usuario.acceso_google ? 'Google' : null].filter(Boolean).join(' · ') || 'No especificado'} />
              </dl>
            </section>
          </div>
          <aside className="admin-detalle-lateral">
            <section className="admin-panel admin-dictamen">
              <div className="admin-seccion-titulo"><ShieldCheck size={20} /><h2>Estado de acceso</h2></div>
              <p className="admin-dictamen-ayuda">Desactivar una cuenta bloquea el inicio de sesión y revoca sesiones activas sin eliminar citas ni registros históricos.</p>
              <div className="admin-dictamen-estado"><small>Cuenta</small><EstadoCuenta activo={usuario.activo} /></div>
              <div className="admin-dictamen-estado"><small>Correo</small><EstadoVerificacion verificado={Boolean(usuario.correo_verificado)} /></div>
              <div className="admin-decisiones">
                <button
                  type="button"
                  className={`admin-btn ${estaActivo ? 'admin-btn--peligro-claro' : 'admin-btn--primario'}`}
                  disabled={procesando}
                  onClick={() => { setConfirmando(true); setErrorAccion(''); setAviso('') }}
                >
                  {estaActivo ? <XCircle size={18} /> : <CheckCircle2 size={18} />}
                  {estaActivo ? 'Desactivar cuenta' : 'Reactivar cuenta'}
                </button>
              </div>
            </section>
          </aside>
        </div>
      </>}
    </div>
    {confirmando && (
      <div className="admin-modal-fondo" role="presentation">
        <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="admin-modal-usuario-titulo">
          <div className="admin-modal-cabecera">
            <span className={`admin-modal-icon ${estaActivo ? 'admin-modal-icon--ocultar' : ''}`}>
              {estaActivo ? <XCircle size={25} /> : <CheckCircle2 size={25} />}
            </span>
            <button type="button" className="admin-cerrar" onClick={() => !procesando && setConfirmando(false)} disabled={procesando} aria-label="Cerrar"><X size={20} /></button>
          </div>
          <h2 id="admin-modal-usuario-titulo">{estaActivo ? 'Desactivar cuenta de usuario' : 'Reactivar cuenta de usuario'}</h2>
          <p>{estaActivo
            ? 'La persona no podrá iniciar sesión ni usar rutas privadas hasta que reactives la cuenta. Sus citas e historial se conservarán intactos.'
            : 'La cuenta recuperará el acceso para iniciar sesión y usar sus funciones de paciente.'} ¿Deseas continuar?</p>
          {errorAccion && <div className="admin-modal-error" role="alert">{errorAccion}</div>}
          <div className="admin-modal-acciones">
            <button type="button" className="admin-btn admin-btn--outline" onClick={() => setConfirmando(false)} disabled={procesando}>Cancelar</button>
            <button type="button" className={`admin-btn ${estaActivo ? 'admin-btn--peligro' : 'admin-btn--primario'}`} onClick={confirmarCambioEstado} disabled={procesando}>
              {procesando ? 'Guardando…' : estaActivo ? 'Sí, desactivar' : 'Sí, reactivar'}
            </button>
          </div>
        </div>
      </div>
    )}
  </>
}

const FILTROS_CITAS = [
  { valor: 'todas', nombre: 'Todas' },
  { valor: 'confirmada', nombre: 'Programadas' },
  { valor: 'completada', nombre: 'Completadas' },
  { valor: 'cancelada', nombre: 'Canceladas' },
  { valor: 'no_asistio', nombre: 'No asistió' },
]

function fechaHoraMexico(valor) {
  if (!valor) return 'Sin fecha'
  const d = new Date(valor)
  return Number.isNaN(d.getTime()) ? 'Sin fecha' : new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Mexico_City',
  }).format(d)
}

function etiquetaEstadoCita(estado) {
  return {
    confirmada: 'Programada',
    completada: 'Completada',
    cancelada: 'Cancelada',
    no_asistio: 'No asistió',
  }[estado] || texto(estado)
}

function claseEstadoCita(estado) {
  if (estado === 'completada') return 'aprobada'
  if (estado === 'confirmada') return 'pendiente'
  if (estado === 'cancelada') return 'rechazada'
  return 'suspendida'
}

function ListaCitasAdmin({ onSalir }) {
  const [filtro, setFiltro] = useState('todas')
  const [busqueda, setBusqueda] = useState('')
  const [busquedaAplicada, setBusquedaAplicada] = useState('')
  const [pagina, setPagina] = useState(1)
  const [limite, setLimite] = useState(10)
  const [citas, setCitas] = useState([])
  const [total, setTotal] = useState(0)
  const [totalPaginas, setTotalPaginas] = useState(1)
  const [resumen, setResumen] = useState({ total: 0, programadas: 0, completadas: 0, canceladas: 0, no_asistio: 0 })
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    const temporizador = setTimeout(() => {
      const limpia = busqueda.trim()
      if (limpia !== busquedaAplicada) {
        setCargando(true)
        setBusquedaAplicada(limpia)
        setPagina(1)
      }
    }, 250)
    return () => clearTimeout(temporizador)
  }, [busqueda, busquedaAplicada])

  useEffect(() => {
    let activo = true
    consultarCitasAdmin({ estado: filtro, q: busquedaAplicada, page: pagina, limit: limite })
      .then((datos) => {
        if (activo) {
          if (!Array.isArray(datos.citas)) throw new Error('La lista de citas no tiene el formato esperado.')
          setCitas(datos.citas)
          setTotal(Number.isInteger(datos.total) ? datos.total : datos.citas.length)
          setTotalPaginas(Number.isInteger(datos.total_paginas) ? datos.total_paginas : 1)
          if (datos.resumen) setResumen(datos.resumen)
          setError('')
        }
      })
      .catch((err) => { if (activo) setError(err) })
      .finally(() => { if (activo) setCargando(false) })
    return () => { activo = false }
  }, [filtro, busquedaAplicada, pagina, limite, recarga])

  const estadisticas = [
    { titulo: 'Citas registradas', valor: resumen.total ?? 0, icono: ClipboardList, estilo: 'neutro' },
    { titulo: 'Citas programadas', valor: resumen.programadas ?? 0, icono: CalendarDays, estilo: 'ambar' },
    { titulo: 'Citas completadas', valor: resumen.completadas ?? 0, icono: CheckCircle2, estilo: 'verde' },
    { titulo: 'Citas canceladas', valor: resumen.canceladas ?? 0, icono: XCircle, estilo: 'rojo' },
  ]

  function recargar() { setCargando(true); setRecarga((v) => v + 1) }

  return <>
    <Encabezado titulo="Supervisión de citas" descripcion="Consulta general de citas registradas en las clínicas de PuntOax (solo lectura)." onSalir={onSalir}
      acciones={<button type="button" className="admin-btn admin-btn--outline" onClick={recargar} disabled={cargando}><RefreshCw size={17} />Actualizar</button>} />
    <div className="admin-cuerpo">
      {error && <ErrorCarga error={error} reintentar={recargar} recurso="las citas" />}
      {!error && <>
        <section className="admin-resumen" aria-label="Resumen de citas">
          {estadisticas.map(({ titulo, valor, icono: Icono, estilo }) => <article className="admin-metrica" key={titulo}>
            <div className={`admin-metrica-icon admin-metrica-icon--${estilo}`}><Icono size={20} /></div>
            <span>{titulo}</span><strong>{valor}</strong>
          </article>)}
        </section>
        <section className="admin-panel" aria-labelledby="admin-citas-titulo">
          <div className="admin-panel-header"><div><span className="admin-eyebrow">SUPERVISIÓN DE CITAS</span><h2 id="admin-citas-titulo">Citas <span className="admin-contador">{total}</span></h2><p>Listado paginado de citas por clínica, servicio y estado.</p></div></div>
          <div className="admin-herramientas">
            <div className="admin-filtros" role="group" aria-label="Filtrar por estado">{FILTROS_CITAS.map((item) => <button key={item.valor} type="button" className={`admin-filtro ${filtro === item.valor ? 'activo' : ''}`} aria-pressed={filtro === item.valor} onClick={() => { setCargando(true); setFiltro(item.valor); setPagina(1) }}>{item.nombre}</button>)}</div>
            <label className="admin-buscador"><Search size={17} aria-hidden="true" /><span className="admin-solo-lectores">Buscar por clínica, servicio o paciente</span><input type="search" value={busqueda} placeholder="Buscar clínica, servicio o paciente" onChange={(e) => setBusqueda(e.target.value)} /></label>
          </div>
          {cargando ? <Cargando mensaje="Consultando citas…" /> : citas.length ? <>
            <div className="admin-tabla-wrap"><table className="admin-tabla"><thead><tr><th>Clínica y servicio</th><th>Paciente</th><th>Fecha y hora</th><th>Estado</th><th className="admin-tabla-accion">Clínica</th></tr></thead><tbody>
              {citas.map((c) => <tr key={c.id_cita}>
                <td data-label="Clínica y servicio"><div className="admin-fila-clinica"><span className="admin-fila-icon"><CalendarDays size={19} /></span><div><strong>{texto(c.nombre_clinica)}</strong><small>{texto(c.nombre_servicio)}</small></div></div></td>
                <td data-label="Paciente"><div className="admin-fila-clinica"><div><strong>{[c.paciente_nombre, c.paciente_apellidos].filter(Boolean).join(' ').trim() || 'Paciente'}</strong><small>{texto(c.paciente_correo)}</small></div></div></td>
                <td data-label="Fecha y hora"><span className="admin-celda-icon"><Clock3 size={15} />{fechaHoraMexico(c.fecha_hora_inicio)}</span></td>
                <td data-label="Estado"><span className={`admin-estado admin-estado--${claseEstadoCita(c.estado)}`}><span aria-hidden="true" className="admin-estado-punto" />{etiquetaEstadoCita(c.estado)}</span></td>
                <td className="admin-tabla-accion"><Link to={`/admin/clinicas/${c.id_clinica}`} className="admin-revisar">Ver clínica<ChevronRight size={17} /></Link></td>
              </tr>)}</tbody></table></div>
            <Paginacion
              paginaActual={pagina}
              totalPaginas={totalPaginas}
              totalRegistros={total}
              limite={limite}
              mostrando={citas.length}
              onCambiarPagina={(p) => { setCargando(true); setPagina(p) }}
              onCambiarLimite={(l) => { setCargando(true); setLimite(l); setPagina(1) }}
              etiquetaRegistros="citas"
            />
          </> : <div className="admin-sin-datos"><CalendarDays size={30} /><strong>No hay citas con estos filtros</strong><p>{busquedaAplicada ? 'Prueba con otro término de búsqueda.' : 'No hay citas registradas en este estado.'}</p></div>}
        </section>
      </>}
    </div>
  </>
}

function formatearDiaCortoMexico(fechaIso) {
  if (!fechaIso) return ''
  const d = new Date(`${fechaIso}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return fechaIso
  return new Intl.DateTimeFormat('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(d)
}

function formatearHoraMexico(fechaIso) {
  if (!fechaIso) return 'Sin hora'
  const d = new Date(fechaIso)
  if (Number.isNaN(d.getTime())) return 'Sin hora'
  return new Intl.DateTimeFormat('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Mexico_City',
  }).format(d)
}

function SupervisionCalendariosAdmin({ onSalir }) {
  const [idClinica, setIdClinica] = useState('')
  const [fechaSeleccionada, setFechaSeleccionada] = useState('')
  const [pagina, setPagina] = useState(1)
  const [limite, setLimite] = useState(10)
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [recarga, setRecarga] = useState(0)

  const fechaConsulta = fechaSeleccionada || undefined

  useEffect(() => {
    let activo = true
    consultarCalendarioAdmin(idClinica, { fecha: fechaConsulta, page: pagina, limit: limite })
      .then((res) => {
        if (!activo) return
        setDatos(res)
        if (!fechaSeleccionada && Array.isArray(res?.dias) && res.dias.length > 0) {
          const primerConCupo = res.dias.find((d) => d.total > 0) || res.dias[0]
          if (primerConCupo?.fecha) {
            setFechaSeleccionada(primerConCupo.fecha)
          }
        }
        setError('')
      })
      .catch((err) => { if (activo) setError(err) })
      .finally(() => { if (activo) setCargando(false) })
    return () => { activo = false }
  }, [idClinica, fechaConsulta, pagina, limite, recarga, fechaSeleccionada])

  const clinicas = Array.isArray(datos?.clinicas) ? datos.clinicas : []
  const clinica = datos?.clinica
  const horarios = Array.isArray(datos?.horarios) ? datos.horarios : []
  const dias = Array.isArray(datos?.dias) ? datos.dias : []
  const espacios = Array.isArray(datos?.espacios) ? datos.espacios : []
  const bloqueados = Array.isArray(datos?.bloqueados) ? datos.bloqueados : []
  const festivos = Array.isArray(datos?.festivos) ? datos.festivos : []
  const total = Number.isInteger(datos?.total) ? datos.total : espacios.length
  const totalPaginas = Number.isInteger(datos?.total_paginas) ? datos.total_paginas : 1

  const fechaActiva = fechaSeleccionada || dias[0]?.fecha || ''
  const indiceDia = dias.findIndex((d) => d.fecha === fechaActiva)
  const infoDiaActivo = indiceDia >= 0 ? dias[indiceDia] : null

  function cambiarClinica(nuevoId) {
    setCargando(true)
    setIdClinica(nuevoId)
    setFechaSeleccionada('')
    setPagina(1)
  }

  function seleccionarDia(nuevaFecha) {
    setCargando(true)
    setFechaSeleccionada(nuevaFecha)
    setPagina(1)
  }

  function recargar() { setCargando(true); setRecarga((v) => v + 1) }

  return <>
    <Encabezado titulo="Calendarios y cupos" descripcion="Consulta de horarios, disponibilidad por día y cupos de los próximos 15 días (solo lectura)." onSalir={onSalir}
      acciones={<button type="button" className="admin-btn admin-btn--outline" onClick={recargar} disabled={cargando}><RefreshCw size={17} />Actualizar</button>} />
    <div className="admin-cuerpo">
      {error && <ErrorCarga error={error} reintentar={recargar} recurso="los calendarios" />}
      {!error && (
        <div className="admin-detalle-contenido">
          <section className="admin-panel admin-detalle-bloque" aria-label="Selector de clínica y horarios">
            <div className="admin-herramientas" style={{ padding: 0, marginBottom: '14px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: '1 1 280px' }}>
                <strong style={{ fontSize: '12px', color: '#365440' }}>Seleccionar clínica</strong>
                <select
                  value={idClinica || clinica?.id_clinica || ''}
                  onChange={(e) => cambiarClinica(e.target.value)}
                  style={{ padding: '10px 12px', borderRadius: '9px', border: '1px solid #d9e2dc', background: '#fff', color: '#143626', font: 'inherit' }}
                >
                  {clinicas.map((c) => (
                    <option key={c.id_clinica} value={c.id_clinica}>
                      {c.nombre} ({c.municipio || 'Oaxaca'}) · {etiquetaEstado(c.estado_publicacion)}
                    </option>
                  ))}
                </select>
              </label>
              {clinica && (
                <Link to={`/admin/clinicas/${clinica.id_clinica}`} className="admin-btn admin-btn--outline">
                  Ver ficha de clínica <ChevronRight size={16} />
                </Link>
              )}
            </div>

            {clinica && (
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#5b7064', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '8px' }}>
                  Horarios semanales de atención
                </div>
                {horarios.length ? (
                  <div className="admin-calendario-horarios">
                    {horarios.map((h, i) => (
                      <span className="admin-calendario-horario-pill" key={i}>
                        <strong>{DIAS[Number(h.dia_semana)] || 'Día'}</strong>
                        <span>{h.es_24_horas ? '24 h' : `${texto(h.apertura)}–${texto(h.cierre)}${h.cruza_medianoche ? ' (noc.)' : ''}`}</span>
                      </span>
                    ))}
                  </div>
                ) : <p className="admin-vacio-pequeno">Sin horarios semanales configurados.</p>}
              </div>
            )}
          </section>

          {cargando && !datos ? <Cargando mensaje="Consultando calendario y cupos…" /> : !clinica ? (
            <div className="admin-sin-datos"><CalendarDays size={30} /><strong>No hay clínicas disponibles</strong><p>Aún no hay clínicas aprobadas o suspendidas para consultar su agenda.</p></div>
          ) : <>
            <section className="admin-panel admin-detalle-bloque" aria-label="Calendario de próximos 15 días">
              <div className="admin-calendario-nav" style={{ marginBottom: '14px' }}>
                <div className="admin-seccion-titulo" style={{ borderBottom: 0, paddingBottom: 0, marginBottom: 0 }}>
                  <CalendarDays size={19} />
                  <h2>Próximos 15 días (hora de Oaxaca)</h2>
                </div>
                {dias.length > 0 && (
                  <div className="admin-calendario-nav-botones">
                    <button
                      type="button"
                      className="admin-btn admin-btn--outline"
                      disabled={indiceDia <= 0}
                      onClick={() => indiceDia > 0 && seleccionarDia(dias[indiceDia - 1].fecha)}
                    >
                      <ChevronLeft size={16} aria-hidden="true" /> Día anterior
                    </button>
                    <button
                      type="button"
                      className="admin-btn admin-btn--outline"
                      disabled={indiceDia < 0 || indiceDia >= dias.length - 1}
                      onClick={() => indiceDia >= 0 && indiceDia < dias.length - 1 && seleccionarDia(dias[indiceDia + 1].fecha)}
                    >
                      Día siguiente <ChevronRight size={16} aria-hidden="true" />
                    </button>
                  </div>
                )}
              </div>

              <div className="admin-calendario-dias" role="listbox" aria-label="Seleccionar fecha">
                {dias.map((d) => {
                  const activo = d.fecha === fechaActiva
                  return (
                    <button
                      key={d.fecha}
                      type="button"
                      role="option"
                      aria-selected={activo}
                      className={`admin-calendario-dia ${activo ? 'activo' : ''} ${d.bloqueado || d.festivo ? 'bloqueado' : ''}`}
                      onClick={() => seleccionarDia(d.fecha)}
                    >
                      <span className="admin-calendario-dia-fecha">{formatearDiaCortoMexico(d.fecha)}</span>
                      <span className="admin-calendario-dia-meta">{d.fecha}</span>
                      {d.bloqueado ? (
                        <span className="admin-calendario-dia-etiqueta is-alerta">Bloqueado</span>
                      ) : d.festivo ? (
                        <span className="admin-calendario-dia-etiqueta is-alerta">Festivo</span>
                      ) : d.total > 0 ? (
                        <span className="admin-calendario-dia-etiqueta">{d.disponibles} disp. · {d.total} total</span>
                      ) : (
                        <span className="admin-calendario-dia-etiqueta is-vacio">Sin cupos</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </section>

            <section className="admin-panel" aria-label="Cupos del día seleccionado">
              <div className="admin-panel-header">
                <div>
                  <span className="admin-eyebrow">DISPONIBILIDAD DEL DÍA</span>
                  <h2>
                    Cupos para {fechaActiva ? `${formatearDiaCortoMexico(fechaActiva)} (${fechaActiva})` : 'la fecha seleccionada'}{' '}
                    <span className="admin-contador">{total}</span>
                  </h2>
                  {infoDiaActivo && (
                    <p>
                      {infoDiaActivo.bloqueado
                        ? `Día bloqueado${infoDiaActivo.motivo_bloqueo ? `: ${infoDiaActivo.motivo_bloqueo}` : '.'}`
                        : infoDiaActivo.festivo
                          ? `Día festivo oficial: ${infoDiaActivo.festivo}.`
                          : `${infoDiaActivo.disponibles} disponibles, ${infoDiaActivo.reservados} reservados, ${infoDiaActivo.deshabilitados} deshabilitados.`}
                    </p>
                  )}
                </div>
              </div>

              {cargando ? <Cargando mensaje="Cargando cupos del día…" /> : espacios.length ? <>
                <div className="admin-tabla-wrap">
                  <table className="admin-tabla">
                    <thead><tr><th>Hora (Oaxaca)</th><th>Servicio</th><th>Estado</th></tr></thead>
                    <tbody>
                      {espacios.map((e) => (
                        <tr key={e.id_espacio}>
                          <td data-label="Hora"><span className="admin-celda-icon"><Clock3 size={15} />{formatearHoraMexico(e.fecha_hora_inicio)} h</span></td>
                          <td data-label="Servicio"><strong>{texto(e.nombre_servicio)}</strong></td>
                          <td data-label="Estado">
                            <span className={`agenda-estado ${e.ocupado ? 'is-ocupado' : e.habilitado ? 'is-disponible' : 'is-deshabilitado'}`}>
                              {e.ocupado ? 'Reservado' : e.habilitado ? 'Disponible' : 'Deshabilitado'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {total > 10 && (
                  <Paginacion
                    paginaActual={pagina}
                    totalPaginas={totalPaginas}
                    totalRegistros={total}
                    limite={limite}
                    mostrando={espacios.length}
                    onCambiarPagina={setPagina}
                    onCambiarLimite={(nuevoLimite) => { setLimite(nuevoLimite); setPagina(1) }}
                    etiquetaRegistros="cupos"
                  />
                )}
              </> : (
                <div className="admin-sin-datos">
                  <CalendarDays size={28} />
                  <strong>No hay cupos para esta fecha</strong>
                  <p>Selecciona otro día del calendario de 15 días o cambia de clínica para consultar su disponibilidad.</p>
                </div>
              )}
            </section>

            <div className="admin-calendario-desplegables">
              <details className="admin-calendario-desplegable" open={bloqueados.length > 0 && bloqueados.length <= 4}>
                <summary>
                  <span>Días bloqueados ({bloqueados.length})</span>
                  <ChevronRight size={16} aria-hidden="true" />
                </summary>
                {bloqueados.length ? (
                  <ul className="admin-calendario-lista-compacta">
                    {bloqueados.map((b) => <li key={b.fecha}><strong>{b.fecha}</strong> · {b.motivo || 'Sin motivo especificado'}</li>)}
                  </ul>
                ) : <p className="admin-vacio-pequeno" style={{ marginTop: '8px' }}>Sin días bloqueados en los próximos 15 días.</p>}
              </details>

              <details className="admin-calendario-desplegable" open={festivos.length > 0 && festivos.length <= 4}>
                <summary>
                  <span>Días festivos oficiales ({festivos.length})</span>
                  <ChevronRight size={16} aria-hidden="true" />
                </summary>
                {festivos.length ? (
                  <ul className="admin-calendario-lista-compacta">
                    {festivos.map((f) => <li key={f.fecha}><strong>{f.fecha}</strong> · {f.nombre}</li>)}
                  </ul>
                ) : <p className="admin-vacio-pequeno" style={{ marginTop: '8px' }}>Sin días festivos en los próximos 15 días.</p>}
              </details>
            </div>
          </>}
        </div>
      )}
    </div>
  </>
}

function MapaCentrosAdmin({ sesion, onSalir, mapaExpandido, onAlternarExpandido }) {
  const [clinicas, setClinicas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    let activo = true
    fetch('/api/clinicas')
      .catch(() => {
        const errorConexion = new Error('No se pudo conectar con el servidor.')
        errorConexion.codigo = 'ERROR_CONEXION'
        throw errorConexion
      })
      .then((res) => {
        if (!res.ok) {
          const errorRespuesta = new Error('No se pudo consultar el mapa.')
          errorRespuesta.status = res.status
          throw errorRespuesta
        }
        return res.json()
      })
      .then((datos) => { if (activo) { setClinicas(Array.isArray(datos) ? datos : []); setError('') } })
      .catch((err) => { if (activo) setError(err) })
      .finally(() => { if (activo) setCargando(false) })
    return () => { activo = false }
  }, [recarga])

  useEffect(() => {
    if (!mapaExpandido) return undefined
    const manejarEscape = (e) => {
      if (e.key === 'Escape') onAlternarExpandido(false)
    }
    window.addEventListener('keydown', manejarEscape)
    return () => window.removeEventListener('keydown', manejarEscape)
  }, [mapaExpandido, onAlternarExpandido])

  useEffect(() => {
    const id = setTimeout(() => {
      window.dispatchEvent(new Event('resize'))
    }, 120)
    return () => clearTimeout(id)
  }, [mapaExpandido])

  function recargar() { setCargando(true); setRecarga((v) => v + 1) }

  return <>
    <Encabezado titulo="Mapa de centros" descripcion="Supervisión geográfica con filtros por servicio, municipio, horario, nivel de atención y modos de vista." onSalir={onSalir}
      acciones={<>
        <button
          type="button"
          className="admin-btn admin-btn--outline"
          onClick={() => onAlternarExpandido(!mapaExpandido)}
        >
          {mapaExpandido ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}
          {mapaExpandido ? 'Restaurar panel' : 'Expandir mapa'}
        </button>
        <button type="button" className="admin-btn admin-btn--outline" onClick={recargar} disabled={cargando}><RefreshCw size={17} />Actualizar</button>
      </>} />
    <div className="admin-cuerpo">
      {error ? (
        <ErrorCarga error={error} reintentar={recargar} recurso="el mapa" />
      ) : (
        <div className="admin-mapa-wrap">
          <MapaCentros
            sesion={sesion}
            onSalir={onSalir}
            clinicas={clinicas}
            cargando={cargando}
            sinEncabezado={true}
            sinPie={true}
          />
        </div>
      )}
    </div>
  </>
}

export default function Administracion({
  sesion,
  onSalir,
  idSolicitud = null,
  idClinica = null,
  idUsuario = null,
  listaUsuarios = false,
  listaClinicas = false,
  vistaAdmin = null,
}) {
  const [mapaExpandido, setMapaExpandido] = useState(false)
  const enDetalle = Boolean(idSolicitud || idClinica || idUsuario)
  const expandir = vistaAdmin === 'mapa' && mapaExpandido
  return <div className={`admin-app ${expandir ? 'is-mapa-expandido' : ''}`}><Lateral perfil={sesion} onSalir={onSalir} detalle={enDetalle} />
    <div className="admin-contenedor"><main className="admin-main">
      {listaUsuarios ? <ListaUsuarios onSalir={onSalir} />
        : listaClinicas ? <ListaClinicasAdmin onSalir={onSalir} />
        : vistaAdmin === 'citas' ? <ListaCitasAdmin onSalir={onSalir} />
        : vistaAdmin === 'calendarios' ? <SupervisionCalendariosAdmin onSalir={onSalir} />
        : vistaAdmin === 'mapa' ? <MapaCentrosAdmin sesion={sesion} onSalir={onSalir} mapaExpandido={mapaExpandido} onAlternarExpandido={setMapaExpandido} />
        : idUsuario ? <DetalleUsuarioAdmin key={idUsuario} idUsuario={idUsuario} onSalir={onSalir} />
        : idClinica ? <DetalleClinicaAdmin key={idClinica} idClinica={idClinica} onSalir={onSalir} />
        : idSolicitud ? <DetalleSolicitud key={idSolicitud} idSolicitud={idSolicitud} onSalir={onSalir} />
        : <ListaSolicitudes onSalir={onSalir} />}
    </main><footer className="admin-footer">© 2026 PuntOax · Panel de administración · Oaxaca</footer></div>
  </div>
}
