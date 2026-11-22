import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import {
  AlertCircle, ArrowLeft, ArrowRight, Building2, CalendarDays, Check,
  CheckCircle2, ChevronRight, CircleHelp, ClipboardList, Clock3,
  Download, Eye, EyeOff, FileText, LayoutDashboard, LoaderCircle,
  LogOut, Mail, MapPin, Phone, RefreshCw, Search, ShieldCheck,
  SlidersHorizontal, User, Users, X, XCircle,
} from 'lucide-react'
import {
  cambiarVisibilidadAdmin, consultarSolicitudAdmin, consultarSolicitudesAdmin,
  consultarUsuariosAdmin, descargarDocumentoAdmin, resolverSolicitudAdmin,
} from '../../api/admin.js'
import './Administracion.css'

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
  return { pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada', suspendida: 'Oculta' }[estado] || texto(estado)
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
function nombreCompleto(usuario) {
  return [usuario.nombre, usuario.apellidos].filter((v) => typeof v === 'string' && v.trim()).join(' ').trim()
}
function estadoEfectivo(solicitud) {
  return solicitud.estado === 'aprobada' && solicitud.estado_publicacion === 'suspendida'
    ? 'suspendida' : solicitud.estado
}
function ErrorCarga({ mensaje, reintentar }) {
  return <div className="admin-aviso admin-aviso--error" role="alert">
    <AlertCircle size={19} aria-hidden="true" />
    <div><strong>No se pudo completar la consulta</strong><p>{mensaje}</p></div>
    {reintentar && <button className="admin-btn admin-btn--outline" onClick={reintentar} type="button">Reintentar</button>}
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
  const seccionActiva = detalle ? '' : enUsuarios ? 'usuarios' : (estado || 'resumen')
  const opciones = [
    { valor: 'resumen', destino: '/admin', titulo: 'Resumen y solicitudes', Icono: LayoutDashboard },
    { valor: 'pendiente', destino: '/admin?estado=pendiente', titulo: 'Pendientes de revisión', Icono: Clock3 },
    { valor: 'aprobada', destino: '/admin?estado=aprobada', titulo: 'Clínicas aprobadas', Icono: Building2 },
    { valor: 'suspendida', destino: '/admin?estado=suspendida', titulo: 'Clínicas ocultas', Icono: EyeOff },
    { valor: 'usuarios', destino: '/admin/usuarios', titulo: 'Usuarios registrados', Icono: Users },
  ]
  return <aside className="admin-aside">
    <Link to="/admin" className="admin-logo"><span className="admin-logo-icon"><ShieldCheck size={22} /></span><span>PuntOax<small>PANEL DE ADMINISTRACIÓN</small></span></Link>
    <div className="admin-aside-grupo">GESTIÓN CENTRAL</div>
    <nav className="admin-aside-nav" aria-label="Menú de administración">
      {opciones.map(({ valor, destino, titulo, Icono }) =>
        <Link key={valor} to={destino} aria-current={seccionActiva === valor ? 'page' : undefined}
          className={`admin-aside-enlace ${seccionActiva === valor ? 'activo' : ''}`}>
          <Icono size={18} />{titulo}
        </Link>
      )}
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
    <div className="admin-header-acciones">{acciones}<button onClick={onSalir} type="button" className="admin-salir-movil" title="Cerrar sesión"><LogOut size={19} /></button><span className="admin-avatar" aria-hidden="true"><ShieldCheck size={19} /></span></div>
  </header>
}
function Resumen({ solicitudes }) {
  const total = solicitudes.length
  const pendientes = solicitudes.filter((s) => s.estado === 'pendiente').length
  const aprobadas = solicitudes.filter((s) => s.estado === 'aprobada').length
  const rechazadas = solicitudes.filter((s) => s.estado === 'rechazada').length
  const estadisticas = [
    { titulo: 'Pendientes de revisión', valor: pendientes, icono: Clock3, estilo: 'ambar' },
    { titulo: 'Solicitudes aprobadas', valor: aprobadas, icono: CheckCircle2, estilo: 'verde' },
    { titulo: 'Solicitudes rechazadas', valor: rechazadas, icono: XCircle, estilo: 'rojo' },
    { titulo: 'Solicitudes registradas', valor: total, icono: ClipboardList, estilo: 'neutro' },
  ]
  return <section className="admin-resumen" aria-label="Resumen de solicitudes">
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
  const [solicitudes, setSolicitudes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [recarga, setRecarga] = useState(0)
  useEffect(() => {
    let activo = true
    consultarSolicitudesAdmin('todas')
      .then((datos) => {
        if (activo) {
          if (!Array.isArray(datos.solicitudes)) throw new Error('La lista recibida no tiene el formato esperado.')
          setSolicitudes(datos.solicitudes)
          setError('')
        }
      })
      .catch((err) => { if (activo) setError(err.message) })
      .finally(() => { if (activo) setCargando(false) })
    return () => { activo = false }
  }, [recarga])

  const visibles = useMemo(() => solicitudes.filter((s) => {
    const estado = estadoEfectivo(s)
    const coincideEstado = filtro === 'todas' || estado === filtro
    const consulta = busqueda.trim().toLocaleLowerCase('es-MX')
    return coincideEstado && (!consulta || [s.nombre_clinica, s.municipio, s.tipo_institucion]
      .some((v) => String(v || '').toLocaleLowerCase('es-MX').includes(consulta)))
  }), [solicitudes, filtro, busqueda])
  const pendientes = solicitudes.filter((s) => s.estado === 'pendiente').length

  function seleccionarFiltro(valor) { setParametros({ estado: valor }) }
  function recargar() { setCargando(true); setRecarga((v) => v + 1) }

  const esResumen = !parametros.has('estado')
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
      {error && <ErrorCarga mensaje={error} reintentar={recargar} />}
      {cargando ? <Cargando /> : !error && <>
        {esResumen && <Resumen solicitudes={solicitudes} />}
        <section className="admin-panel" aria-labelledby="admin-tabla-titulo">
          <div className="admin-panel-header"><div><span className="admin-eyebrow">BANDEJA DE REVISIÓN</span><h2 id="admin-tabla-titulo">{esResumen ? 'Clínicas y solicitudes' : seccion.titulo} <span className="admin-contador">{visibles.length}</span></h2><p>{esResumen ? (pendientes ? `${pendientes} solicitud${pendientes === 1 ? '' : 'es'} pendiente${pendientes === 1 ? '' : 's'} de respuesta.` : 'No hay solicitudes pendientes de revisión.') : seccion.introduccion}</p></div></div>
          <div className="admin-herramientas">
            <div className="admin-filtros" role="group" aria-label="Filtrar por estado">{FILTROS.map((item) => <button key={item.valor} type="button" className={`admin-filtro ${filtro === item.valor ? 'activo' : ''}`} aria-pressed={filtro === item.valor} onClick={() => seleccionarFiltro(item.valor)}>{item.nombre}</button>)}</div>
            <label className="admin-buscador"><Search size={17} aria-hidden="true" /><span className="admin-solo-lectores">Buscar por nombre, municipio o institución</span><input type="search" value={busqueda} placeholder="Buscar clínica o municipio" onChange={(e) => setBusqueda(e.target.value)} /></label>
          </div>
          {visibles.length ? <div className="admin-tabla-wrap"><table className="admin-tabla"><thead><tr><th>Clínica</th><th>Municipio</th><th>Solicitud</th><th>Estado</th><th className="admin-tabla-accion">Acción</th></tr></thead><tbody>
            {visibles.map((s) => <tr key={s.id_solicitud}>
              <td data-label="Clínica"><div className="admin-fila-clinica"><span className="admin-fila-icon"><Building2 size={19} /></span><div><strong>{texto(s.nombre_clinica)}</strong><small>{TIPO[s.tipo_institucion] || texto(s.tipo_institucion)}</small></div></div></td>
              <td data-label="Municipio"><span className="admin-celda-icon"><MapPin size={15} />{texto(s.municipio)}</span></td>
              <td data-label="Solicitud"><span className="admin-celda-icon"><CalendarDays size={15} />{fecha(s.fecha_solicitud)}</span></td>
              <td data-label="Estado"><Estado estado={estadoEfectivo(s)} /></td>
              <td className="admin-tabla-accion"><Link to={`/admin/solicitudes/${s.id_solicitud}`} className="admin-revisar">{s.estado === 'pendiente' ? 'Revisar' : 'Ver detalle'}<ChevronRight size={17} /></Link></td>
            </tr>)}</tbody></table></div> : <div className="admin-sin-datos"><SlidersHorizontal size={30} /><strong>No hay solicitudes con estos filtros</strong><p>{busqueda ? 'Prueba con otro nombre o elimina el texto de búsqueda.' : 'Selecciona otro estado para consultar solicitudes existentes.'}</p></div>}
        </section>
      </>}
      <p className="admin-nota"><CircleHelp size={16} />Los registros provienen del API de administración. Solo las clínicas aprobadas y visibles aparecen en el catálogo público.</p>
    </div>
  </>
}

function ListaUsuarios({ onSalir }) {
  const [usuarios, setUsuarios] = useState([])
  const [total, setTotal] = useState(0)
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    let activo = true
    consultarUsuariosAdmin()
      .then((datos) => {
        if (activo) {
          if (!Array.isArray(datos.usuarios)) throw new Error('La lista recibida no tiene el formato esperado.')
          setUsuarios(datos.usuarios)
          setTotal(Number.isInteger(datos.total) ? datos.total : datos.usuarios.length)
          setError('')
        }
      })
      .catch((err) => { if (activo) setError(err.message) })
      .finally(() => { if (activo) setCargando(false) })
    return () => { activo = false }
  }, [recarga])

  const visibles = useMemo(() => {
    const consulta = busqueda.trim().toLocaleLowerCase('es-MX')
    if (!consulta) return usuarios
    return usuarios.filter((u) => [u.correo, u.nombre, u.apellidos, u.telefono]
      .some((v) => String(v || '').toLocaleLowerCase('es-MX').includes(consulta)))
  }, [usuarios, busqueda])

  const verificados = usuarios.filter((u) => u.correo_verificado).length
  const estadisticas = [
    { titulo: 'Cuentas registradas', valor: total, icono: Users, estilo: 'neutro' },
    { titulo: 'En este listado', valor: usuarios.length, icono: ClipboardList, estilo: 'ambar' },
    { titulo: 'Correos verificados', valor: verificados, icono: CheckCircle2, estilo: 'verde' },
  ]

  function recargar() { setCargando(true); setRecarga((v) => v + 1) }

  return <>
    <Encabezado titulo="Usuarios registrados" descripcion="Consulta las cuentas de paciente creadas en PuntOax." onSalir={onSalir}
      acciones={<button type="button" className="admin-btn admin-btn--outline" onClick={recargar} disabled={cargando}><RefreshCw size={17} />Actualizar</button>} />
    <div className="admin-cuerpo">
      <div className="admin-bienvenida">
        <div><span className="admin-eyebrow">GESTIÓN DE CUENTAS</span><h2>Cuentas de usuario</h2><p>Listado de solo lectura: no muestra contraseñas ni permite modificar cuentas.</p></div>
        <span className="admin-bienvenida-icon"><Users size={38} /></span>
      </div>
      {error && <ErrorCarga mensaje={error} reintentar={recargar} />}
      {cargando ? <Cargando mensaje="Consultando usuarios…" /> : !error && <>
        <section className="admin-resumen" aria-label="Resumen de usuarios">
          {estadisticas.map(({ titulo, valor, icono: Icono, estilo }) => <article className="admin-metrica" key={titulo}>
            <div className={`admin-metrica-icon admin-metrica-icon--${estilo}`}><Icono size={20} /></div>
            <span>{titulo}</span><strong>{valor}</strong>
          </article>)}
        </section>
        <section className="admin-panel" aria-labelledby="admin-usuarios-titulo">
          <div className="admin-panel-header"><div><span className="admin-eyebrow">CUENTAS DE PACIENTE</span><h2 id="admin-usuarios-titulo">Usuarios <span className="admin-contador">{visibles.length}</span></h2><p>{total > usuarios.length ? `Se muestran las ${usuarios.length} cuentas más recientes de ${total}.` : 'Todas las cuentas registradas en la plataforma.'}</p></div></div>
          <div className="admin-herramientas">
            <label className="admin-buscador"><Search size={17} aria-hidden="true" /><span className="admin-solo-lectores">Buscar por correo, nombre o teléfono</span><input type="search" value={busqueda} placeholder="Buscar correo, nombre o teléfono" onChange={(e) => setBusqueda(e.target.value)} /></label>
          </div>
          {visibles.length ? <div className="admin-tabla-wrap"><table className="admin-tabla"><thead><tr><th>Usuario</th><th>Teléfono</th><th>Registro</th><th>Correo</th><th>Acceso</th></tr></thead><tbody>
            {visibles.map((u) => <tr key={u.id_usuario}>
              <td data-label="Usuario"><div className="admin-fila-clinica"><span className="admin-fila-icon"><User size={19} /></span><div><strong>{nombreCompleto(u) || 'Sin nombre registrado'}</strong><small>{texto(u.correo)}</small></div></div></td>
              <td data-label="Teléfono"><span className="admin-celda-icon"><Phone size={15} />{texto(u.telefono)}</span></td>
              <td data-label="Registro"><span className="admin-celda-icon"><CalendarDays size={15} />{fecha(u.fecha_registro)}</span></td>
              <td data-label="Correo"><EstadoVerificacion verificado={Boolean(u.correo_verificado)} /></td>
              <td data-label="Acceso">{[u.acceso_password ? 'Contraseña' : null, u.acceso_google ? 'Google' : null].filter(Boolean).join(' · ') || 'No especificado'}</td>
            </tr>)}</tbody></table></div> : <div className="admin-sin-datos"><Users size={30} /><strong>No hay usuarios con esta búsqueda</strong><p>{busqueda ? 'Prueba con otro correo, nombre o teléfono.' : 'Todavía no se ha registrado ninguna cuenta de usuario.'}</p></div>}
        </section>
      </>}
      <p className="admin-nota"><CircleHelp size={16} />El listado es de solo lectura y muestra hasta 200 cuentas, de la más reciente a la más antigua. Las contraseñas nunca se envían al navegador.</p>
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
      {horarios.length ? <div className="admin-horarios">{horarios.map((h, i) => <div className="admin-horario" key={i}><span>{DIAS[Number(h.dia_semana)] || 'Día no especificado'}</span><strong>{texto(h.apertura)} – {texto(h.cierre)}</strong></div>)}</div> : <p className="admin-vacio-pequeno">Sin horarios en la ficha recibida.</p>}
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
    } catch (err) { setErrorDocumento(err.message) }
    finally { tarea.current = false; setDescargando(null) }
  }
  return <section className="admin-panel admin-detalle-bloque"><div className="admin-seccion-titulo"><FileText size={19} /><h2>Documentos de respaldo</h2></div>
    <p className="admin-seccion-ayuda">Archivos privados actuales de la clínica. Solo el administrador puede descargarlos.</p>
    {errorDocumento && <ErrorCarga mensaje={errorDocumento} />}
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
    {['aprobar', 'rechazar'].includes(accion) && <label className="admin-observaciones"><span>{esRechazo ? 'Motivo del rechazo (obligatorio)' : 'Observaciones (opcional)'}</span><textarea autoFocus={esRechazo} placeholder={esRechazo ? 'Indica qué debe corregir la clínica…' : 'Agrega un comentario para la clínica…'} value={observaciones} maxLength={1000} rows={4} onChange={(e) => setObservaciones(e.target.value)} /><small>{esRechazo ? 'Mínimo 10 caracteres. ' : ''}{observaciones.trim().length}/1000</small></label>}
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
    } catch (err) { setError(err.message) }
    finally { setCargando(false) }
  }, [idSolicitud])
  useEffect(() => {
    let activo = true
    consultarSolicitudAdmin(idSolicitud)
      .then((resultado) => {
        if (!resultado?.solicitud) throw new Error('La solicitud no se encontró en la respuesta del servidor.')
        if (activo) { setDetalle(resultado); setError('') }
      })
      .catch((err) => { if (activo) setError(err.message) })
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
      {error && <ErrorCarga mensaje={error} reintentar={cargar} />}
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
            {solicitud.observaciones && <div className="admin-observaciones-anteriores"><strong>Observaciones registradas</strong><p>{solicitud.observaciones}</p></div>}
            <div className="admin-dictamen-pie"><CircleHelp size={17} /><span>Las decisiones se guardan directamente en el servidor y requieren una cuenta administradora.</span></div>
          </section>
          <section className="admin-panel admin-ayuda-panel"><h2><Mail size={18} /> Datos para seguimiento</h2><p>Correo: {texto(solicitud.correo_contacto || solicitud.datos_ficha?.clinica?.correo_contacto)}</p><p>Teléfono: {texto(solicitud.telefono || solicitud.datos_ficha?.clinica?.telefono)}</p></section>
        </aside></div>
      </>}
    </div>
    {accion && <ModalAccion accion={accion} procesando={procesando} error={errorAccion} observaciones={observaciones} setObservaciones={setObservaciones} cerrar={cerrar} confirmar={confirmar} />}
  </>
}

export default function Administracion({ sesion, onSalir, idSolicitud = null, listaUsuarios = false }) {
  return <div className="admin-app"><Lateral perfil={sesion} onSalir={onSalir} detalle={Boolean(idSolicitud)} />
    <div className="admin-contenedor"><main className="admin-main">
      {listaUsuarios ? <ListaUsuarios onSalir={onSalir} /> : idSolicitud ? <DetalleSolicitud key={idSolicitud} idSolicitud={idSolicitud} onSalir={onSalir} /> : <ListaSolicitudes onSalir={onSalir} />}
    </main><footer className="admin-footer">© 2026 PuntOax · Panel de administración · Oaxaca</footer></div>
  </div>
}
