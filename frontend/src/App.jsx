import { useEffect, useState } from 'react'
import Login from './components/Auth/Login'
import Register from './components/Auth/Register'
import './styles/App.css'

function App() {
  const [currentView, setCurrentView] = useState('login') // Inicia en 'login' para que pruebes tus pantallas
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
      } catch (err) {
        setError('No se pudieron cargar las clínicas. Revisa que el servidor Node esté activo.')
        console.error(err)
      } finally {
        setCargando(false)
      }
    }

    if (currentView === 'directorio') {
      cargarClinicas()
    }
  }, [currentView])

  // Vista de Login
  if (currentView === 'login') {
    return (
      <Login
        onSwitchToRegister={() => setCurrentView('register')}
        onBackToPublic={() => setCurrentView('directorio')}
      />
    )
  }

  // Vista de Registro
  if (currentView === 'register') {
    return (
      <Register
        onSwitchToLogin={() => setCurrentView('login')}
        onBackToPublic={() => setCurrentView('directorio')}
      />
    )
  }

  // Vista del Directorio Público
  return (
    <div className="public-directory-view">
      <div className="app-container">
      <header className="app-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
          <div>
            <div className="header-badge">PuntOax • Salud en Oaxaca</div>
            <h1>Directorio de Clínicas</h1>
          </div>
          <div>
            <button
              onClick={() => setCurrentView('login')}
              style={{
                backgroundColor: '#103328',
                color: '#FFFFFF',
                padding: '10px 20px',
                borderRadius: '8px',
                border: 'none',
                cursor: 'pointer',
                fontWeight: '600'
              }}
            >
              Iniciar Sesión
            </button>
          </div>
        </div>
        <p className="header-subtitle" style={{ maxWidth: '1200px', margin: '10px auto 0' }}>
          Puntos de atención y servicios de salud integrados con PostgreSQL y PostGIS.
        </p>
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
            <h3>No hay clínicas registradas para mostrar</h3>
            <p>La base de datos aún no cuenta con clínicas disponibles.</p>
          </div>
        )}
      </main>
      </div>
    </div>
  )
}

export default App