import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import FichaCentroMapa, { ResumenMarcador } from './FichaCentroMapa.jsx'
import { OAXACA, coordenadas, filtrarCentros } from '../utils/centros.js'
import './DirectorioMapa.css'

function MoverMapa({ destino }) {
  const map = useMap()
  useEffect(() => { if (destino) map.flyTo(destino, Math.max(map.getZoom(), 14), { duration: 0.7 }) }, [destino, map])
  return null
}

function CentroMarcador({ centro, seleccionado, version, onSeleccionar, onAbrir }) {
  const ref = useRef(null)
  useEffect(() => { if (seleccionado) ref.current?.openPopup() }, [seleccionado, version])
  return <CircleMarker ref={ref} center={coordenadas(centro)} radius={11}
    pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#153b2f', fillOpacity: 1 }}
    eventHandlers={{ click: () => onSeleccionar(centro.id_clinica) }}>
    <Popup className="puntoax-mapa-popup" maxWidth={350} minWidth={265} autoPan={true}>
      <ResumenMarcador centro={centro} onVerFicha={() => onAbrir(centro)} />
    </Popup>
  </CircleMarker>
}

export default function DirectorioMapa({ sesion, perfil, errorPerfil, onSalir }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [params, setParams] = useSearchParams()
  const idDetalle = pathname.startsWith('/centro/') ? pathname.slice('/centro/'.length) : null
  const [centros, setCentros] = useState([])
  const [estado, setEstado] = useState('cargando')
  const [reintento, setReintento] = useState(0)
  const [seleccionado, setSeleccionado] = useState(null)
  const [versionFoco, setVersionFoco] = useState(0)
  const [destino, setDestino] = useState(null)
  const busqueda = params.get('q') || ''
  const municipio = params.get('municipio') || ''
  const servicio = params.get('servicio') || ''

  useEffect(() => {
    const controlador = new AbortController()
    fetch('/api/clinicas', {
      signal: controlador.signal,
      headers: { Authorization: `Bearer ${sesion.token}` },
    })
      .then(async res => { if (!res.ok) throw new Error('API no disponible'); return res.json() })
      .then(datos => { if (!controlador.signal.aborted) { setCentros(Array.isArray(datos) ? datos : []); setEstado('exito') } })
      .catch(err => { if (err.name !== 'AbortError') setEstado('error') })
    return () => controlador.abort()
  }, [reintento, sesion.token])

  const municipios = useMemo(() => [...new Set(centros.map(c => c.municipio).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')), [centros])
  const servicios = useMemo(() => [...new Set(centros.flatMap(c => Array.isArray(c.servicios) ? c.servicios : []))].sort((a, b) => a.localeCompare(b, 'es')), [centros])
  const visibles = useMemo(() => filtrarCentros(centros, { busqueda, municipio, servicio }), [centros, busqueda, municipio, servicio])
  const conUbicacion = visibles.filter(c => coordenadas(c))

  const cambiarFiltro = (clave, valor) => {
    const nuevos = new URLSearchParams(params)
    if (valor) nuevos.set(clave, valor)
    else nuevos.delete(clave)
    setParams(nuevos, { replace: true })
  }
  const limpiar = () => setParams(new URLSearchParams(), { replace: true })
  const abrirFicha = centro => navigate(`/centro/${encodeURIComponent(centro.id_clinica)}${window.location.search}`)
  const cerrarFicha = useCallback(() => navigate(`/${window.location.search}`, { replace: true }), [navigate])
  const irAlCentro = centro => {
    setSeleccionado(centro.id_clinica)
    setVersionFoco(n => n + 1)
    const punto = coordenadas(centro)
    if (punto) setDestino([...punto])
    else abrirFicha(centro)
  }

  return <div className="puntoax-directorio">
    <header className="puntoax-topbar">
      <Link to="/" className="puntoax-logo">PuntoOax<span className="puntoax-logo-dot">.</span></Link>
      <nav aria-label="Navegación principal"><Link to="/" className="puntoax-topbar-active">Explorar mapa</Link><Link to="/directorio">Directorio</Link><Link to="/informacion-util">Información útil</Link></nav>
      <div className="puntoax-topbar-auth">{sesion ? <><Link to="/cuenta">{perfil?.nombre || 'Mi cuenta'}</Link><button type="button" onClick={onSalir}>Salir</button></> : <><Link to="/login">Iniciar sesión</Link><Link to="/registro" className="puntoax-registrar">Crear cuenta</Link></>}</div>
    </header>
    <p role="note" className="puntoax-error-auth">Catálogo en pruebas: los centros disponibles pueden ser ejemplos. No uses esta información para decidir dónde recibir atención sin confirmarla con el centro.</p>
    {errorPerfil && <div className="puntoax-error-auth" role="alert">{errorPerfil}</div>}
    <div className="puntoax-contenido">
      <aside className="puntoax-barra-lateral" aria-label="Buscar centros">
        <div className="puntoax-lateral-titulo"><span className="puntoax-kicker">DIRECTORIO DE SALUD</span><h1>Encuentra atención cerca de ti</h1><p>Explora los centros y servicios registrados en Oaxaca.</p></div>
        <div className="puntoax-filtros">
          <label htmlFor="puntoax-buscar">Buscar por nombre, dirección o servicio</label>
          <input id="puntoax-buscar" type="search" value={busqueda} onChange={e => cambiarFiltro('q', e.target.value)} placeholder="Buscar centros…" />
          <label htmlFor="puntoax-municipio">Municipio</label>
          <select id="puntoax-municipio" value={municipio} onChange={e => cambiarFiltro('municipio', e.target.value)}><option value="">Todos los municipios</option>{municipios.map(m => <option key={m} value={m}>{m}</option>)}</select>
          <label htmlFor="puntoax-servicio">Servicio</label>
          <select id="puntoax-servicio" value={servicio} onChange={e => cambiarFiltro('servicio', e.target.value)}><option value="">Todos los servicios</option>{servicios.map(s => <option key={s} value={s}>{s}</option>)}</select>
          <button className="puntoax-limpiar" type="button" onClick={limpiar} disabled={!busqueda && !municipio && !servicio}>Limpiar filtros</button>
        </div>
        <div className="puntoax-resultados" aria-live="polite">
          {estado === 'cargando' && <p role="status">Cargando centros…</p>}
          {estado === 'error' && <div role="alert">No fue posible cargar el directorio. Comprueba que el backend esté activo.<button type="button" onClick={() => { setEstado('cargando'); setReintento(n => n + 1) }}>Reintentar</button></div>}
          {estado === 'exito' && <><h2>{visibles.length} {visibles.length === 1 ? 'centro encontrado' : 'centros encontrados'}</h2>{centros.length === 0 && <p>Por ahora no hay centros aprobados.</p>}{centros.length > 0 && visibles.length === 0 && <p>No encontramos centros con estos filtros. Puedes limpiar la búsqueda.</p>}{visibles.map(c => <article className="puntoax-centro-item" key={c.id_clinica}>
            <div className="puntoax-centro-item-enc"><span className="puntoax-etiqueta">{c.municipio || 'Municipio por confirmar'}</span><span className="puntoax-tipo">{c.tipo_institucion || 'Centro de salud'}</span></div>
            <h3>{c.nombre}</h3><p>{c.direccion || 'Dirección por confirmar'}</p>
            <div className="puntoax-centro-item-acciones"><button type="button" onClick={() => irAlCentro(c)}>{coordenadas(c) ? 'Ubicar en mapa' : 'Ver ficha'}</button><button type="button" onClick={() => abrirFicha(c)}>Ver ficha completa →</button></div>
          </article>)}</>}
        </div>
      </aside>
      <main className="puntoax-mapa-contenedor" aria-label="Mapa de centros de salud de Oaxaca">
        <div className="puntoax-mapa-leyenda"><span className="puntoax-leyenda-punto"/> {conUbicacion.length} centros con ubicación en el mapa</div>
        <MapContainer center={OAXACA} zoom={12} scrollWheelZoom={true} className="puntoax-mapa" aria-label="Mapa interactivo de centros">
          <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <MoverMapa destino={destino}/>
          {conUbicacion.map(c => <CentroMarcador key={c.id_clinica} centro={c}
            seleccionado={seleccionado === c.id_clinica} version={versionFoco}
            onSeleccionar={setSeleccionado} onAbrir={abrirFicha} />)}
        </MapContainer>
        {estado === 'exito' && conUbicacion.length === 0 && <div className="puntoax-mapa-sin-puntos">No hay centros con coordenadas para los filtros seleccionados. Revisa el listado.</div>}
        <div className="puntoax-mapa-pie">Mapa © OpenStreetMap · Solo se muestran ubicaciones registradas en la base de datos</div>
      </main>
    </div>
    {idDetalle && <FichaCentroMapa key={idDetalle} id={idDetalle} token={sesion.token} onCerrar={cerrarFicha} />}
  </div>
}
