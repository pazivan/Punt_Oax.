import { useEffect, useRef, useState } from 'react'
import Login from './components/Auth/Login.jsx'
import Register from './components/Auth/Register.jsx'
import { cerrarSesion, consultarPerfil, leerSesion } from './api/auth.js'
import './App.css'

function App() {
  const [vista, setVista] = useState('directorio')
  const [sesion, setSesion] = useState(leerSesion)
  const [mensajeAuth, setMensajeAuth] = useState('')
  const [perfil, setPerfil] = useState(null)
  const [errorPerfil, setErrorPerfil] = useState('')
  const consultaPerfil = useRef(0)
  const [clinicas, setClinicas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function cargarClinicas() {
      try {
        const respuesta = await fetch('/api/clinicas')

        if (!respuesta.ok) {
          throw new Error(`El servidor respondió con estado ${respuesta.status}`)
        }

        const datos = await respuesta.json()
        setClinicas(datos)
      } catch {
        setError('No se pudieron cargar las clínicas. Revisa que el servidor Node esté activo.')
      } finally {
        setCargando(false)
      }
    }

    cargarClinicas()
  }, [])

  useEffect(() => {
    if (!sesion) return
    let activo = true
    const consulta = ++consultaPerfil.current
    consultarPerfil()
      .then((datos) => {
        if (activo && consulta === consultaPerfil.current) {
          setPerfil(datos.usuarioAutenticado)
          setErrorPerfil('')
        }
      })
      .catch((err) => {
        if (activo && consulta === consultaPerfil.current) {
          setErrorPerfil(err.message)
          if (!leerSesion()) {
            setSesion(null)
            setPerfil(null)
          }
        }
      })
    return () => { activo = false }
  }, [sesion])

  function salir() {
    consultaPerfil.current++
    cerrarSesion()
    setSesion(null)
    setPerfil(null)
    setErrorPerfil('')
    setVista('directorio')
  }

  if (vista === 'login') {
    return <Login
      onSwitchToRegister={() => { setMensajeAuth(''); setVista('register') }}
      onBackToPublic={() => setVista('directorio')}
      onLogin={(nuevaSesion) => { setSesion(nuevaSesion); setErrorPerfil(''); setMensajeAuth(''); setVista('directorio') }}
      mensaje={mensajeAuth}
    />
  }

  if (vista === 'register') {
    return <Register
      onSwitchToLogin={(mensaje = '') => { setMensajeAuth(mensaje); setVista('login') }}
      onBackToPublic={() => setVista('directorio')}
    />
  }

  return (
    <div className="app-container">
      <header className="app-header">
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
              <button type="button" onClick={salir}>Cerrar sesión</button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => { setMensajeAuth(''); setVista('login') }}>Iniciar sesión</button>
              <button type="button" onClick={() => setVista('register')}>Crear cuenta</button>
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
            <span className="alert-icon">⚠️</span>
            <div>
              <strong>Error de conexión</strong>
              <p>{error}</p>
            </div>
          </div>
        )}

        {!cargando && !error && clinicas.length === 0 && (
          <div className="state-card empty">
            <span className="empty-icon">🏥</span>
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
                    <span className="badge-municipio">📍 {clinica.municipio}</span>
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
                  {clinica.requisitos_generales && (
                    <p className="detail-item requisitos">
                      <strong>Requisitos:</strong> {clinica.requisitos_generales}
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
                      Sitio Oficial ↗
                    </a>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

export default App
