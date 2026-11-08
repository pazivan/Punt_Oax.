import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AlertTriangle, Building2, ExternalLink, MapPin } from 'lucide-react'
import Login from './components/Auth/Login.jsx'
import Register from './components/Auth/Register.jsx'
import Inicio from './components/Inicio/Inicio.jsx'
import MapaCentros from './components/Inicio/MapaCentros.jsx'
import InformacionUtil from './components/Inicio/InformacionUtil.jsx'
import AgendarCitaDatos from './components/Inicio/AgendarCitaDatos.jsx'
import ModalConfirmacion from './components/Inicio/ModalConfirmacion.jsx'
import DirectorioMapa from './components/DirectorioMapa.jsx'
import Conocenos from './components/Conocenos.jsx'
import FichaClinica from './components/Clinica/FichaClinica.jsx'
import { RutaPrivada } from './RutaPrivada.jsx'
import { cerrarSesion, consultarPerfil, leerSesion } from './api/auth.js'
import './App.css'

function App() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [sesion, setSesion] = useState(leerSesion)
  const [mensajeAuth, setMensajeAuth] = useState('')
  const [tipoRegistro, setTipoRegistro] = useState('usuario')
  const [perfil, setPerfil] = useState(null)
  const [verificandoPerfil, setVerificandoPerfil] = useState(() => Boolean(leerSesion()))
  const [errorPerfil, setErrorPerfil] = useState('')
  const consultaPerfil = useRef(0)
  const [clinicas, setClinicas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [reintentoCatalogo, setReintentoCatalogo] = useState(0)
  const [mostrarConfirmacionSalir, setMostrarConfirmacionSalir] = useState(false)

  useEffect(() => {
    // El catálogo es público: no depende de una sesión verificada.
    if (pathname !== '/mapa' && pathname !== '/directorio' && pathname !== '/agendar-cita') return
    const controlador = new AbortController()
    async function cargarClinicas() {
      setCargando(true)
      setError('')
      setClinicas([])
      try {
        const respuesta = await fetch('/api/clinicas', {
          signal: controlador.signal,
          headers: sesion?.token ? { Authorization: `Bearer ${sesion.token}` } : undefined,
        })

        if (!respuesta.ok) {
          throw new Error(`El servidor respondió con estado ${respuesta.status}`)
        }

        const datos = await respuesta.json()
        if (!controlador.signal.aborted) setClinicas(Array.isArray(datos) ? datos : [])
      } catch {
        if (!controlador.signal.aborted) {
          setClinicas([])
          setError('No se pudieron cargar las clínicas. Revisa que el servidor Node esté activo.')
        }
      } finally {
        if (!controlador.signal.aborted) setCargando(false)
      }
    }

    cargarClinicas()
    return () => controlador.abort()
  }, [pathname, sesion, reintentoCatalogo])

  useEffect(() => {
    if (!sesion) return
    let activo = true
    const consulta = ++consultaPerfil.current
    consultarPerfil()
      .then((datos) => {
        if (activo && consulta === consultaPerfil.current) {
          setPerfil(datos.usuarioAutenticado)
          setErrorPerfil('')
          setVerificandoPerfil(false)
        }
      })
      .catch((err) => {
        if (activo && consulta === consultaPerfil.current) {
          setErrorPerfil(err.message)
          setVerificandoPerfil(false)
          if (!leerSesion()) {
            setSesion(null)
            setPerfil(null)
            setMensajeAuth('Tu sesión expiró. Inicia sesión de nuevo.')
          }
        }
      })
    return () => { activo = false }
  }, [sesion])

  function salir() {
    setMostrarConfirmacionSalir(true)
  }

  function confirmarSalir() {
    consultaPerfil.current++
    cerrarSesion()
    setMostrarConfirmacionSalir(false)
    setSesion(null)
    setPerfil(null)
    setErrorPerfil('')
    setMensajeAuth('')
    navigate('/login', { replace: true })
  }

  const modalConfirmacionSalir = (
    <ModalConfirmacion
      abierto={mostrarConfirmacionSalir}
      titulo="¿Estás seguro de que quieres salir?"
      mensaje="Se cerrará tu sesión actual y serás dirigido a la página de iniciar sesión."
      textoCancelar="Cancelar"
      textoConfirmar="Sí, salir"
      onCancelar={() => setMostrarConfirmacionSalir(false)}
      onConfirmar={confirmarSalir}
    />
  )

  if (pathname === '/login') {
    return <Login
      key={tipoRegistro}
      initialAccountType={tipoRegistro}
      onSwitchToRegister={(tipo = 'usuario') => {
        setMensajeAuth('')
        setTipoRegistro(tipo === 'clinica' ? 'clinica' : 'usuario')
        navigate('/registro')
      }}
      onBackToPublic={() => navigate('/conocenos')}
      onLogin={(nuevaSesion) => {
        setPerfil(null)
        setVerificandoPerfil(true)
        setSesion(nuevaSesion)
        setErrorPerfil('')
        setMensajeAuth('')
        // La ficha se consulta de nuevo en el servidor dentro de /mi-clinica.
        navigate(nuevaSesion?.tipo === 'clinica' ? '/mi-clinica' : '/cuenta')
      }}
      mensaje={mensajeAuth}
    />
  }

  if (pathname === '/registro') {
    return <Register
      key={tipoRegistro}
      initialAccountType={tipoRegistro}
      onSwitchToLogin={(mensaje = '', tipo = 'usuario') => {
        setMensajeAuth(typeof mensaje === 'string' ? mensaje : '')
        setTipoRegistro(tipo === 'clinica' ? 'clinica' : 'usuario')
        navigate('/login')
      }}
      onBackToPublic={() => navigate('/conocenos')}
    />
  }

  if (pathname === '/conocenos') {
    return <Conocenos />
  }

  if (pathname === '/mapa') {
    return (
      <>
        {error ? (
          <main className="app-container" role="alert">
            <div className="state-card error">
              <span className="alert-icon" aria-hidden="true"><AlertTriangle size={20} /></span>
              <div>
                <strong>No se pudo cargar el mapa</strong>
                <p>{error}</p>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => setReintentoCatalogo((valor) => valor + 1)}
                >
                  Reintentar
                </button>
              </div>
            </div>
          </main>
        ) : (
          <MapaCentros sesion={sesion} onSalir={salir} clinicas={clinicas} cargando={cargando} />
        )}
        {modalConfirmacionSalir}
      </>
    )
  }

  if (pathname === '/agendar-cita') {
    return (
      <>
        <RutaPrivada
          sesion={sesion}
          perfil={perfil}
          verificando={verificandoPerfil}
          error={errorPerfil}
          rolesPermitidos={['usuario', 'clinica', 'administrador']}
        >
          <AgendarCitaDatos
            clinica={clinicas[0] || null}
            clinicas={clinicas}
            sesion={sesion}
            onSalir={salir}
            onVolverAlCentro={() => navigate('/mapa')}
          />
        </RutaPrivada>
        {modalConfirmacionSalir}
      </>
    )
  }

  if (pathname === '/informacion-util') {
    return (
      <>
        <RutaPrivada
          sesion={sesion}
          perfil={perfil}
          verificando={verificandoPerfil}
          error={errorPerfil}
          rolesPermitidos={['usuario', 'clinica', 'administrador']}
        >
          <InformacionUtil sesion={sesion} onSalir={salir} />
        </RutaPrivada>
        {modalConfirmacionSalir}
      </>
    )
  }

  if (pathname === '/mi-clinica') {
    return (
      <>
        <RutaPrivada
          sesion={sesion}
          perfil={perfil}
          verificando={verificandoPerfil}
          error={errorPerfil}
          rolesPermitidos={['clinica']}
        >
          <FichaClinica onSalir={salir} />
        </RutaPrivada>
        {modalConfirmacionSalir}
      </>
    )
  }

  // Una clínica no usa la vista genérica de "Mi cuenta": su destino es la ficha.
  if (pathname === '/cuenta' && perfil?.rol === 'clinica') {
    return <Navigate to="/mi-clinica" replace />
  }

  if (pathname === '/cuenta' || pathname === '/admin') {
    return (
      <>
        <RutaPrivada
          sesion={sesion}
          perfil={perfil}
          verificando={verificandoPerfil}
          error={errorPerfil}
          rolesPermitidos={pathname === '/admin' ? ['administrador'] : ['usuario', 'clinica', 'administrador']}
        >
          {pathname === '/cuenta' && (perfil?.rol === 'usuario' || sesion?.tipo === 'usuario') ? (
            <Inicio sesion={sesion} onSalir={salir} />
          ) : (
            <main className="app-container">
              <h1>{pathname === '/admin' ? 'Área de administración' : 'Mi cuenta'}</h1>
              <p role="status">Sesión verificada: {sesion?.cuenta.correo || sesion?.cuenta.nombre}</p>
              <p>Los paneles de cada rol aún no están disponibles.</p>
              <Link to="/">Volver al directorio</Link>{' '}
              <button type="button" onClick={salir}>Cerrar sesión</button>
            </main>
          )}
        </RutaPrivada>
        {modalConfirmacionSalir}
      </>
    )
  }

  if (pathname === '/' || /^\/centro\/[^/]+$/.test(pathname)) {
    return (
      <>
        <DirectorioMapa sesion={sesion} perfil={perfil} errorPerfil={errorPerfil} onSalir={salir} />
        {modalConfirmacionSalir}
      </>
    )
  }

  if (pathname !== '/directorio') return <Navigate to="/" replace />

  return (
    <div className="app-container">
      <header className="app-header">
        <p role="note">Catálogo en pruebas: los centros mostrados pueden ser ejemplos; confirma sus datos antes de acudir.</p>
        <div className="header-badge">PuntOax • Salud en Oaxaca</div>
        <h1>Directorio de Clínicas</h1>
        <p className="header-subtitle">
          Puntos de atención y servicios de salud integrados con PostgreSQL y PostGIS.
        </p>
        <div className="auth-directory-actions">
          {sesion ? (
            <>
              <p role="status">Sesión iniciada: {sesion.cuenta.correo || sesion.cuenta.nombre}</p>
              {perfil && <p>Perfil verificado.</p>}
              <Link to="/cuenta">Mi cuenta</Link>
              <button type="button" onClick={salir}>Cerrar sesión</button>
            </>
          ) : (
            <>
              <Link to="/login" onClick={() => setMensajeAuth('')}>Iniciar sesión</Link>
              <Link to="/registro" onClick={() => setTipoRegistro('usuario')}>Crear cuenta</Link>
            </>
          )}
        </div>
        {errorPerfil && <p className="auth-directory-error" role="alert">{errorPerfil}</p>}
      </header>

      <main className="main-content">
        {cargando && (
          <div className="state-card loading">
            <div className="spinner"></div>
            <p>Cargando clínicas desde el servidor…</p>
          </div>
        )}

        {error && (
          <div className="state-card error" role="alert">
            <span className="alert-icon" aria-hidden="true"><AlertTriangle size={20} /></span>
            <div>
              <strong>Error de conexión</strong>
              <p>{error}</p>
            </div>
          </div>
        )}

        {!cargando && !error && clinicas.length === 0 && (
          <div className="state-card empty">
            <span className="empty-icon" aria-hidden="true"><Building2 size={28} /></span>
            <h3>No hay clínicas aprobadas para mostrar</h3>
            <p>La base de datos está conectada pero aún no cuenta con clínicas registradas con estado "aprobada".</p>
          </div>
        )}

        {!cargando && !error && clinicas.length > 0 && (
          <div className="clinicas-grid">
            {clinicas.map((clinica) => (
              <article key={clinica.id_clinica} className="clinica-card">
                <div className="card-header">
                  <span className="badge-tipo">{clinica.tipo_institucion || 'Centro de Salud'}</span>
                  {clinica.municipio && (
                    <span className="badge-municipio">
                      <MapPin size={12} style={{ verticalAlign: 'middle', marginRight: '3px' }} aria-hidden="true" />
                      {clinica.municipio}
                    </span>
                  )}
                </div>

                <h3>{clinica.nombre}</h3>

                {clinica.descripcion && (
                  <p className="card-desc">{clinica.descripcion}</p>
                )}

                <div className="card-details">
                  {clinica.direccion && (
                    <p className="detail-item">
                      <strong>Dirección:</strong> {clinica.direccion}
                      {clinica.codigo_postal ? `, C.P. ${clinica.codigo_postal}` : ''}
                    </p>
                  )}
                  {clinica.telefono && (
                    <p className="detail-item">
                      <strong>Teléfono:</strong> <a href={`tel:${clinica.telefono}`}>{clinica.telefono}</a>
                    </p>
                  )}
                  {clinica.correo_contacto && (
                    <p className="detail-item">
                      <strong>Contacto:</strong> <a href={`mailto:${clinica.correo_contacto}`}>{clinica.correo_contacto}</a>
                    </p>
                  )}
                </div>

                {clinica.sitio_web && (
                  <div className="card-footer">
                    <a
                      href={clinica.sitio_web}
                      target="_blank"
                      rel="noreferrer"
                      className="link-btn"
                    >
                      <span>Sitio Oficial</span>{' '}
                      <ExternalLink size={13} style={{ verticalAlign: 'middle' }} aria-hidden="true" />
                    </a>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </main>
      {modalConfirmacionSalir}
    </div>
  )
}

export default App
