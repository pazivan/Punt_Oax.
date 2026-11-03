import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import Login from './components/Auth/Login.jsx'
import Register from './components/Auth/Register.jsx'
import { RutaPrivada } from './RutaPrivada.jsx'
import { cerrarSesion, consultarPerfil, leerSesion } from './api/auth.js'
import DirectorioMapa from './components/DirectorioMapa.jsx'
import './App.css'


function App() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [sesion, setSesion] = useState(leerSesion)
  const [mensajeAuth, setMensajeAuth] = useState('')
  const [perfil, setPerfil] = useState(null)
  const [verificandoPerfil, setVerificandoPerfil] = useState(() => Boolean(leerSesion()))
  const [errorPerfil, setErrorPerfil] = useState('')
  const consultaPerfil = useRef(0)
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
    consultaPerfil.current++
    cerrarSesion()
    // Recargar evita que un guard de la ruta privada redirija a /login
    // mientras React actualiza la sesión tras cerrar sesión.
    window.location.replace('/')
  }

  if (pathname === '/login') {
    return <Login
      onSwitchToRegister={() => { setMensajeAuth(''); navigate('/registro') }}
      onBackToPublic={() => navigate('/')}
      onLogin={(nuevaSesion) => {
        setPerfil(null)
        setVerificandoPerfil(true)
        setSesion(nuevaSesion)
        setErrorPerfil('')
        setMensajeAuth('')
        navigate('/cuenta')
      }}
      mensaje={mensajeAuth}
    />
  }

  if (pathname === '/registro') {
    return <Register
      onSwitchToLogin={(mensaje = '') => { setMensajeAuth(mensaje); navigate('/login') }}
      onBackToPublic={() => navigate('/')}
    />
  }

  if (pathname === '/cuenta' || pathname === '/admin') {
    return <RutaPrivada
      sesion={sesion}
      perfil={perfil}
      verificando={verificandoPerfil}
      error={errorPerfil}
      rolesPermitidos={pathname === '/admin' ? ['administrador'] : ['usuario', 'clinica', 'administrador']}
    >
      <main className="app-container">
        <h1>{pathname === '/admin' ? 'Área de administración' : 'Mi cuenta'}</h1>
        <p role="status">Sesión verificada: {sesion?.cuenta.correo || sesion?.cuenta.nombre}</p>
        <p>Los paneles de cada rol aún no están disponibles.</p>
        <Link to="/">Volver al directorio</Link>{' '}
        <button type="button" onClick={salir}>Cerrar sesión</button>
      </main>
    </RutaPrivada>
  }

  // / y /centro/:id comparten la misma instancia del directorio.
  // El modal se muestra encima del mapa; la URL conserva filtros y enlace directo.
  if (pathname === '/' || /^\/centro\/[^/]+$/.test(pathname)) {
    return <DirectorioMapa sesion={sesion} perfil={perfil} errorPerfil={errorPerfil} onSalir={salir} />
  }
  return <Navigate to="/" replace />
}

export default App
