import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import Login from './components/Auth/Login.jsx'
import Register from './components/Auth/Register.jsx'
import CorreoCuenta from './components/Auth/CorreoCuenta.jsx'
import Inicio from './components/Inicio/Inicio.jsx'
import MiPerfil from './components/Inicio/MiPerfil.jsx'
import EncabezadoUsuario from './components/Inicio/EncabezadoUsuario.jsx'
import MapaCentros from './components/Inicio/MapaCentros.jsx'
import InformacionUtil from './components/Inicio/InformacionUtil.jsx'
import AgendarCitaDatos from './components/Inicio/AgendarCitaDatos.jsx'
import ModalConfirmacion from './components/Inicio/ModalConfirmacion.jsx'
import Conocenos from './components/Conocenos.jsx'
import FichaClinica from './components/Clinica/FichaClinica.jsx'
import PanelClinica from './components/Clinica/PanelClinica.jsx'
import MisCitasClinica from './components/Clinica/MisCitasClinica.jsx'
import AgendaClinica from './components/Clinica/AgendaClinica.jsx'
import RutaClinicaAprobada from './components/Clinica/RutaClinicaAprobada.jsx'
import MisCitasUsuario from './components/Citas/MisCitasUsuario.jsx'
import Administracion from './components/Admin/Administracion.jsx'
import AsistentePuntOax from './components/Asistente/AsistentePuntOax.jsx'
import { RutaPrivada } from './RutaPrivada.jsx'
import { CargandoSesion, ErrorSesionTemporal } from './components/EstadoSesion.jsx'
import { describirErrorConsulta } from './utils/erroresConsulta.js'
import { ROLES, obtenerDestinoPorRol, obtenerDestinoPostLogin } from './utils/permisos.js'
import {
  cerrarSesion,
  consultarClinicasCatalogo,
  consultarPerfil,
  leerSesion,
  registrarActividadSesion,
  revocarSesion,
} from './api/auth.js'
import {
  CLAVE_ULTIMA_ACTIVIDAD,
  EVENTO_SESION_EXPIRADA,
  evaluarEstadoInactividad,
  leerUltimaActividad,
  obtenerConfiguracionSesionCliente,
  registrarActividadLocal,
} from './utils/sesionInactividad.js'
import { establecerCapaActiva } from './utils/uiOverlays.js'
import { borrarVerificacionPendiente, guardarVerificacionPendiente, leerVerificacionPendiente } from './api/verificacionPendiente.js'
import './App.css'

const AVISO_MAPA_AUTENTICACION =
  'Necesitas iniciar sesión o crear una cuenta para ver el mapa de centros de salud.'
const INTERVALO_PING_ACTIVIDAD_MS = 60 * 1000

function App() {
  const navigate = useNavigate()
  const { pathname, hash, state: estadoRuta, key: rutaKey } = useLocation()
  const [sesion, setSesion] = useState(leerSesion)
  const [verificacionPendiente, setVerificacionPendiente] = useState(leerVerificacionPendiente)
  const [mensajeAuth, setMensajeAuth] = useState('')
  const [tipoRegistro, setTipoRegistro] = useState('usuario')
  const [perfil, setPerfil] = useState(null)
  const [verificandoPerfil, setVerificandoPerfil] = useState(() => Boolean(leerSesion()))
  const [errorPerfil, setErrorPerfil] = useState('')
  const [errorPerfilReintentar, setErrorPerfilReintentar] = useState(true)
  const [reintentoPerfil, setReintentoPerfil] = useState(0)
  const consultaPerfil = useRef(0)
  const [clinicas, setClinicas] = useState([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [reintentoCatalogo, setReintentoCatalogo] = useState(0)
  const [mostrarConfirmacionSalir, setMostrarConfirmacionSalir] = useState(false)
  const [advertenciaInactividad, setAdvertenciaInactividad] = useState({
    abierta: false,
    segundosRestantes: 60,
    renovando: false,
  })
  const ultimaActividadPingRef = useRef(0)
  const advertenciaAbiertaRef = useRef(false)
  const cerrandoPorExpiracionRef = useRef(false)

  const sesionToken = sesion?.token || null
  const clinicasVisibles = sesionToken ? clinicas : []
  const mostrarAdvertenciaInactividad = Boolean(sesionToken) && advertenciaInactividad.abierta

  useEffect(() => {
    advertenciaAbiertaRef.current = mostrarAdvertenciaInactividad
    establecerCapaActiva('modal-inactividad', mostrarAdvertenciaInactividad)
    return () => establecerCapaActiva('modal-inactividad', false)
  }, [mostrarAdvertenciaInactividad])

  useEffect(() => {
    establecerCapaActiva('modal-salir', mostrarConfirmacionSalir)
    return () => establecerCapaActiva('modal-salir', false)
  }, [mostrarConfirmacionSalir])

  const finalizarSesionLocal = useCallback(async ({
    revocarEnServidor = true,
    mensaje = '',
    rutaDestino = '/login',
  } = {}) => {
    consultaPerfil.current++
    const tokenActual = sesionToken || leerSesion()?.token
    const revocacion = revocarEnServidor && tokenActual
      ? revocarSesion(tokenActual)
      : Promise.resolve(true)
    cerrarSesion()
    setMostrarConfirmacionSalir(false)
    setAdvertenciaInactividad({ abierta: false, segundosRestantes: 60, renovando: false })
    setSesion(null)
    setPerfil(null)
    setClinicas([])
    setCargando(false)
    setError('')
    setErrorPerfil('')
    setMensajeAuth(mensaje)
    navigate(rutaDestino, { replace: true, state: mensaje ? { aviso: mensaje } : null })
    if (revocarEnServidor && tokenActual && !await revocacion && !mensaje) {
      setMensajeAuth('Se cerró la sesión en este navegador, pero no se pudo confirmar el cierre en el servidor. Comprueba tu conexión.')
    }
  }, [navigate, sesionToken])

  useEffect(() => {
    // El catálogo del mapa requiere sesión válida.
    if ((pathname !== '/mapa' && pathname !== '/agendar-cita') || !sesionToken) {
      return undefined
    }
    const controlador = new AbortController()
    async function cargarClinicas() {
      setCargando(true)
      setError('')
      setClinicas([])
      try {
        const datos = await consultarClinicasCatalogo({ signal: controlador.signal })
        if (!controlador.signal.aborted) setClinicas(datos)
      } catch (err) {
        if (err?.name === 'AbortError' || controlador.signal.aborted) return
        setClinicas([])
        if (err?.status === 401 || err?.codigo === 'SESION_REQUERIDA') {
          setError('')
          return
        }
        setError(err?.message || 'No se pudieron cargar las clínicas. Revisa que el servidor Node esté activo.')
      } finally {
        if (!controlador.signal.aborted) setCargando(false)
      }
    }

    cargarClinicas()
    return () => controlador.abort()
  }, [pathname, sesionToken, reintentoCatalogo])

  useEffect(() => {
    // Cada navegación comienza arriba; los enlaces internos de la ficha
    // conservan su destino aunque la vista se monte tras verificar la sesión.
    if (!hash) {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      return undefined
    }
    const id = requestAnimationFrame(() => {
      document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })
    return () => cancelAnimationFrame(id)
  }, [rutaKey, hash])

  useEffect(() => {
    // En móvil la navegación superior es desplazable: mantén visible la pestaña activa
    // al montarse la cabecera (por ejemplo, después de verificar la sesión) y al navegar.
    let cuadro = 0
    const centrar = () => {
      cancelAnimationFrame(cuadro)
      cuadro = requestAnimationFrame(() => {
        for (const nav of document.querySelectorAll('.inicio-nav')) {
          const activo = nav.querySelector('.inicio-nav-link.active')
          if (!activo || nav.scrollWidth <= nav.clientWidth + 4) continue
          const izquierda = activo.offsetLeft - (nav.clientWidth - activo.offsetWidth) / 2
          nav.scrollTo({ left: Math.max(0, izquierda), behavior: 'auto' })
        }
      })
    }
    centrar()
    const observador = new MutationObserver((mutaciones) => {
      const aparecioNav = mutaciones.some((mutacion) =>
        [...mutacion.addedNodes].some((nodo) => nodo.nodeType === 1 &&
          (nodo.matches?.('.inicio-nav') || nodo.querySelector?.('.inicio-nav'))))
      if (aparecioNav) centrar()
    })
    observador.observe(document.body, { childList: true, subtree: true })
    return () => {
      cancelAnimationFrame(cuadro)
      observador.disconnect()
    }
  }, [rutaKey])

  useEffect(() => {
    if (!sesionToken) return
    let activo = true
    const consulta = ++consultaPerfil.current
    consultarPerfil({ segundoPlano: true })
      .then((datos) => {
        if (activo && consulta === consultaPerfil.current) {
          setPerfil(datos.usuarioAutenticado)
          if (datos.sesion_politica) {
            setSesion((actual) => (actual ? { ...actual, politica: datos.sesion_politica } : actual))
          }
          setErrorPerfil('')
          setVerificandoPerfil(false)
        }
      })
      .catch((err) => {
        if (activo && consulta === consultaPerfil.current) {
          const aviso = describirErrorConsulta(err, 'tu sesión')
          setErrorPerfil(aviso.mensaje)
          setErrorPerfilReintentar(aviso.reintentar)
          setVerificandoPerfil(false)
          if (!leerSesion()) {
            setSesion(null)
            setPerfil(null)
            setClinicas([])
            setMensajeAuth(
              err.codigo === 'SESION_EXPIRADA_INACTIVIDAD'
                ? 'Tu sesión expiró por inactividad. Inicia sesión de nuevo.'
                : err.codigo === 'SESION_EXPIRADA_ABSOLUTA'
                  ? 'Tu sesión alcanzó el tiempo máximo permitido. Inicia sesión de nuevo.'
                  : err.codigo === 'TOKEN_EXPIRADO'
                    ? 'Tu sesión expiró. Inicia sesión de nuevo.'
                    : 'Tu sesión ya no es válida. Inicia sesión de nuevo.'
            )
          }
        }
      })
    return () => { activo = false }
  }, [sesionToken, pathname, reintentoPerfil])

  const reintentarVerificacionPerfil = errorPerfilReintentar ? () => {
    setErrorPerfil('')
    setVerificandoPerfil(true)
    setReintentoPerfil((valor) => valor + 1)
  } : undefined

  // Sincronización entre pestañas, regreso tras bfcache/botón Atrás y eventos HTTP 401.
  useEffect(() => {
    function sincronizarSesion(evento) {
      if (
        evento?.type === 'storage' &&
        evento.key !== 'puntoax-sesion' &&
        evento.key !== CLAVE_ULTIMA_ACTIVIDAD &&
        evento.key !== null
      ) {
        return
      }
      if (evento?.type === 'visibilitychange' && document.visibilityState !== 'visible') return
      const actual = leerSesion()
      if (!actual && sesion) {
        consultaPerfil.current++
        setSesion(null)
        setPerfil(null)
        setClinicas([])
        setVerificandoPerfil(false)
        setErrorPerfil('')
        setAdvertenciaInactividad({ abierta: false, segundosRestantes: 60, renovando: false })
        setMensajeAuth('La sesión se cerró en otra ventana. Inicia sesión de nuevo.')
        return
      }
      if (actual?.token !== sesion?.token) {
        consultaPerfil.current++
        setSesion(actual)
        setPerfil(null)
        setVerificandoPerfil(Boolean(actual))
        setErrorPerfil('')
      }
    }

    function manejarSesionExpirada(evento) {
      const codigo = evento?.detail?.codigo || ''
      const msg = codigo === 'SESION_EXPIRADA_INACTIVIDAD'
        ? 'Tu sesión se cerró automáticamente por inactividad. Inicia sesión de nuevo.'
        : codigo === 'SESION_EXPIRADA_ABSOLUTA'
          ? 'Tu sesión alcanzó el tiempo máximo permitido. Inicia sesión de nuevo.'
          : evento?.detail?.mensaje || 'Tu sesión expiró o dejó de ser válida. Inicia sesión de nuevo.'
      finalizarSesionLocal({ revocarEnServidor: false, mensaje: msg })
    }

    function manejarPageShow(evento) {
      const actual = leerSesion()
      if (evento?.persisted || !actual) {
        if (!actual && sesion) {
          setSesion(null)
          setPerfil(null)
          setClinicas([])
        }
      }
    }

    window.addEventListener('storage', sincronizarSesion)
    window.addEventListener('focus', sincronizarSesion)
    window.addEventListener('pageshow', manejarPageShow)
    window.addEventListener(EVENTO_SESION_EXPIRADA, manejarSesionExpirada)
    document.addEventListener('visibilitychange', sincronizarSesion)
    return () => {
      window.removeEventListener('storage', sincronizarSesion)
      window.removeEventListener('focus', sincronizarSesion)
      window.removeEventListener('pageshow', manejarPageShow)
      window.removeEventListener(EVENTO_SESION_EXPIRADA, manejarSesionExpirada)
      document.removeEventListener('visibilitychange', sincronizarSesion)
    }
  }, [sesion, finalizarSesionLocal])

  // Control automático de inactividad (15 min) con advertencia previa (60 s) y límite absoluto (8 h).
  useEffect(() => {
    if (!sesionToken) {
      cerrandoPorExpiracionRef.current = false
      return undefined
    }

    const config = obtenerConfiguracionSesionCliente(sesion?.politica)
    if (!leerUltimaActividad()) {
      registrarActividadLocal(Date.now())
    }

    const registrarInteraccionUsuario = () => {
      // Mientras el modal de advertencia está abierto, el usuario debe confirmar explícitamente.
      if (advertenciaAbiertaRef.current) return
      const ahora = Date.now()
      registrarActividadLocal(ahora)
      if (ahora - ultimaActividadPingRef.current >= INTERVALO_PING_ACTIVIDAD_MS) {
        ultimaActividadPingRef.current = ahora
        registrarActividadSesion()
          .then((datos) => {
            if (datos?.sesion_politica) {
              setSesion((actual) => (actual ? { ...actual, politica: datos.sesion_politica } : actual))
            }
          })
          .catch(() => {
            // Si el servidor devolvió 401, enviarConSesion ya emitió el evento de expiración.
          })
      }
    }

    const comprobarInactividad = () => {
      if (cerrandoPorExpiracionRef.current) return
      const sesionActual = leerSesion()
      if (!sesionActual?.token) return
      const politicaActual = obtenerConfiguracionSesionCliente(sesionActual.politica || sesion?.politica)
      const evaluacion = evaluarEstadoInactividad({
        ahoraMs: Date.now(),
        ultimaActividadMs: leerUltimaActividad() || sesionActual.iniciada_en || Date.now(),
        iniciadaEnMs: sesionActual.iniciada_en,
        expiraAbsolutaMs: politicaActual.expiraAbsolutaMs,
        inactividadMs: politicaActual.inactividadMs,
        advertenciaMs: politicaActual.advertenciaMs,
        absolutaMs: politicaActual.absolutaMs,
      })

      if (evaluacion.estado === 'expirada_inactividad' || evaluacion.estado === 'expirada_absoluta') {
        cerrandoPorExpiracionRef.current = true
        finalizarSesionLocal({
          revocarEnServidor: true,
          mensaje:
            evaluacion.estado === 'expirada_absoluta'
              ? 'Tu sesión alcanzó la duración máxima permitida. Inicia sesión nuevamente.'
              : 'Tu sesión se cerró automáticamente por inactividad. Inicia sesión nuevamente.',
        })
        return
      }

      if (evaluacion.estado === 'advertencia') {
        setAdvertenciaInactividad((prev) =>
          prev.abierta && prev.segundosRestantes === evaluacion.segundosRestantes
            ? prev
            : { ...prev, abierta: true, segundosRestantes: evaluacion.segundosRestantes }
        )
      } else if (advertenciaAbiertaRef.current) {
        // Otra pestaña renovó la actividad.
        setAdvertenciaInactividad({ abierta: false, segundosRestantes: Math.ceil(config.advertenciaMs / 1000), renovando: false })
      }
    }

    const alVolverVisible = () => {
      if (document.visibilityState === 'visible') {
        comprobarInactividad()
        // Verificar también con el servidor sin reiniciar inactividad por ser comprobación automática.
        consultarPerfil({ segundoPlano: true }).catch(() => {})
      }
    }

    const eventosActividad = ['pointerdown', 'keydown', 'touchstart', 'click', 'scroll']
    for (const ev of eventosActividad) {
      window.addEventListener(ev, registrarInteraccionUsuario, { passive: true })
    }
    document.addEventListener('visibilitychange', alVolverVisible)
    window.addEventListener('focus', comprobarInactividad)

    const inicioVerificacion = setTimeout(comprobarInactividad, 0)
    const intervalo = setInterval(comprobarInactividad, 1000)

    return () => {
      clearTimeout(inicioVerificacion)
      clearInterval(intervalo)
      for (const ev of eventosActividad) {
        window.removeEventListener(ev, registrarInteraccionUsuario)
      }
      document.removeEventListener('visibilitychange', alVolverVisible)
      window.removeEventListener('focus', comprobarInactividad)
    }
  }, [sesionToken, sesion?.politica, sesion?.iniciada_en, finalizarSesionLocal])

  async function continuarSesionActiva() {
    setAdvertenciaInactividad((prev) => ({ ...prev, renovando: true }))
    try {
      const datos = await registrarActividadSesion()
      const ahora = Date.now()
      registrarActividadLocal(ahora)
      ultimaActividadPingRef.current = ahora
      if (datos?.sesion_politica) {
        setSesion((actual) => (actual ? { ...actual, politica: datos.sesion_politica } : actual))
      }
      setAdvertenciaInactividad({ abierta: false, segundosRestantes: 60, renovando: false })
    } catch {
      // Si el backend ya expiró la sesión (401), enviarConSesion disparará la salida segura.
      setAdvertenciaInactividad((prev) => ({ ...prev, renovando: false }))
    }
  }

  function salir() {
    setMostrarConfirmacionSalir(true)
  }

  async function confirmarSalir() {
    await finalizarSesionLocal({ revocarEnServidor: true, mensaje: '', rutaDestino: '/login' })
  }

  const modalConfirmacionSalir = (
    <>
      <ModalConfirmacion
        abierto={mostrarConfirmacionSalir}
        titulo="¿Estás seguro de que quieres salir?"
        mensaje="Se cerrará tu sesión actual y serás dirigido a la página de iniciar sesión."
        textoCancelar="Cancelar"
        textoConfirmar="Sí, salir"
        onCancelar={() => setMostrarConfirmacionSalir(false)}
        onConfirmar={confirmarSalir}
      />
      <ModalConfirmacion
        abierto={mostrarAdvertenciaInactividad}
        titulo="Tu sesión está por finalizar"
        mensaje={`Tu sesión está a punto de finalizar por inactividad. ¿Deseas continuar? (${advertenciaInactividad.segundosRestantes} s restantes)`}
        textoCancelar="Cerrar sesión"
        textoConfirmar={advertenciaInactividad.renovando ? 'Continuando…' : 'Continuar sesión'}
        onCancelar={() => finalizarSesionLocal({
          revocarEnServidor: true,
          mensaje: 'Cerraste tu sesión correctamente.',
          rutaDestino: '/login',
        })}
        onConfirmar={continuarSesionActiva}
        deshabilitarAcciones={advertenciaInactividad.renovando}
      />
    </>
  )

  const esUsuarioOVisitanteConHeader =
    (!sesion || sesion.tipo !== 'clinica') && (
      pathname === '/informacion-util' ||
      (Boolean(sesion) && (
        pathname === '/inicio' ||
        pathname === '/mapa' ||
        pathname === '/agendar-cita' ||
        pathname === '/mis-citas' ||
        pathname === '/mi-perfil' ||
        pathname === '/conocenos'
      ))
    )

  function renderRuta() {
    if (pathname === '/login') {
    if (sesion) {
      if (verificandoPerfil) return <CargandoSesion />
      if (!perfil && errorPerfil) {
        return (
          <ErrorSesionTemporal
            mensaje={errorPerfil}
            onReintentar={reintentarVerificacionPerfil}
            rutaInicio="/conocenos"
            textoInicio="Ir al inicio"
          />
        )
      }
      if (perfil) return <Navigate to={obtenerDestinoPorRol(perfil, sesion)} replace />
    }
    return <Login
      key={tipoRegistro}
      initialAccountType={tipoRegistro}
      onSwitchToRegister={(tipo = 'usuario') => {
        setMensajeAuth('')
        setTipoRegistro(tipo === 'clinica' ? 'clinica' : 'usuario')
        navigate('/registro')
      }}
      onBackToPublic={() => navigate('/conocenos')}
      onLogin={(nuevaSesion, destinoSolicitado = '') => {
        borrarVerificacionPendiente()
        setVerificacionPendiente(null)
        setPerfil(null)
        setVerificandoPerfil(true)
        setSesion(nuevaSesion)
        setErrorPerfil('')
        setMensajeAuth('')
        cerrandoPorExpiracionRef.current = false
        ultimaActividadPingRef.current = Date.now()
        navigate(obtenerDestinoPostLogin(destinoSolicitado, null, nuevaSesion), { replace: true })
      }}
      mensaje={estadoRuta?.aviso || mensajeAuth}
    />
  }
  if (pathname === '/verificar-correo') return <CorreoCuenta modo="verificar"
    onVerificada={() => { borrarVerificacionPendiente(); setVerificacionPendiente(null) }}
    onCambiarCorreo={() => { borrarVerificacionPendiente(); setVerificacionPendiente(null) }} />
  if (pathname === '/recuperar') return <CorreoCuenta modo="solicitar" />
  if (pathname === '/restablecer') return <CorreoCuenta modo="restablecer" />

  if (pathname === '/registro') {
    return <Register
      key={estadoRuta?.tipo || tipoRegistro}
      initialAccountType={estadoRuta?.tipo || tipoRegistro}
      initialEmail={estadoRuta?.correo || ''}
      onSwitchToLogin={(mensaje = '', tipo = 'usuario') => {
        setMensajeAuth(typeof mensaje === 'string' ? mensaje : '')
        setTipoRegistro(tipo === 'clinica' ? 'clinica' : 'usuario')
        navigate('/login')
      }}
      onBackToPublic={() => navigate('/conocenos')}
      onVerificar={(rol, correo) => {
        guardarVerificacionPendiente(rol, correo)
        setVerificacionPendiente(leerVerificacionPendiente())
        navigate('/verificar-correo', { state: { rol, correo } })
      }}
    />
  }

  if (pathname === '/' || pathname === '/conocenos') {
    const pendienteActual = verificacionPendiente || leerVerificacionPendiente()
    if (!sesion && pendienteActual) {
      return <Navigate to="/verificar-correo" state={pendienteActual} replace />
    }
    return (
      <>
        <Conocenos sesion={sesion} onSalir={salir} sinEncabezado={esUsuarioOVisitanteConHeader} />
        {modalConfirmacionSalir}
      </>
    )
  }

  if (pathname === '/mapa') {
    return (
      <>
        <RutaPrivada
          sesion={sesion}
          perfil={perfil}
          verificando={verificandoPerfil}
          error={errorPerfil}
          onReintentar={reintentarVerificacionPerfil}
          rolesPermitidos={[ROLES.USUARIO, ROLES.CLINICA, ROLES.ADMINISTRADOR]}
          avisoNoAutenticado={AVISO_MAPA_AUTENTICACION}
        >
          {error ? (
            <ErrorSesionTemporal
              titulo="No se pudo cargar el mapa"
              mensaje={error}
              onReintentar={() => setReintentoCatalogo((valor) => valor + 1)}
              rutaInicio={sesion ? obtenerDestinoPorRol(perfil, sesion) : '/conocenos'}
              textoInicio="Ir al inicio"
            />
          ) : (
            <MapaCentros
              sesion={sesion}
              onSalir={salir}
              clinicas={clinicasVisibles}
              cargando={cargando}
              sinEncabezado={esUsuarioOVisitanteConHeader}
            />
          )}
        </RutaPrivada>
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
          onReintentar={reintentarVerificacionPerfil}
          rolesPermitidos={[ROLES.USUARIO]}
        >
          <AgendarCitaDatos
            clinica={estadoRuta?.clinica || null}
            clinicas={clinicasVisibles}
            cargandoClinicas={cargando}
            errorClinicas={error}
            onReintentarClinicas={() => setReintentoCatalogo((valor) => valor + 1)}
            sesion={sesion}
            onSalir={salir}
            onVolverAlCentro={() => navigate('/mapa')}
            sinEncabezado={esUsuarioOVisitanteConHeader}
          />
        </RutaPrivada>
        {modalConfirmacionSalir}
      </>
    )
  }

  if (pathname === '/informacion-util') {
    return (
      <>
        <InformacionUtil sesion={sesion} onSalir={salir} sinEncabezado={esUsuarioOVisitanteConHeader} />
        {modalConfirmacionSalir}
      </>
    )
  }

  if (pathname === '/asistente') {
    return (
      <div className="puntoax-asistente-demo-page">
        <main className="puntoax-asistente-demo-card">
          <span className="admin-eyebrow">SPRINT 8 · ENTORNO EXPERIMENTAL</span>
          <h1>Asistente virtual híbrido de PuntOax</h1>
          <p>
            Esta vista local permite probar el asistente con Gemini Function Calling conectado exclusivamente al catálogo público de centros aprobados.
          </p>
          <div className="puntoax-asistente-demo-links">
            <a href="/mapa">Ir al mapa de centros</a>
            <a href="/conocenos">Volver a Conócenos</a>
          </div>
        </main>
        <AsistentePuntOax abiertoInicial={true} />
      </div>
    )
  }

  if (pathname === '/mis-citas') {
    return (
      <>
        <RutaPrivada
          sesion={sesion}
          perfil={perfil}
          verificando={verificandoPerfil}
          error={errorPerfil}
          onReintentar={reintentarVerificacionPerfil}
          rolesPermitidos={[ROLES.USUARIO]}
        >
          <MisCitasUsuario sesion={sesion} onSalir={salir} sinEncabezado={esUsuarioOVisitanteConHeader} />
        </RutaPrivada>
        {modalConfirmacionSalir}
      </>
    )
  }

  if (pathname === '/mi-perfil') {
    return (
      <>
        <RutaPrivada
          sesion={sesion}
          perfil={perfil}
          verificando={verificandoPerfil}
          error={errorPerfil}
          onReintentar={reintentarVerificacionPerfil}
          rolesPermitidos={[ROLES.USUARIO, ROLES.CLINICA]}
        >
          <MiPerfil sesion={sesion} perfil={perfil} onSalir={salir} sinEncabezado={esUsuarioOVisitanteConHeader} />
        </RutaPrivada>
        {modalConfirmacionSalir}
      </>
    )
  }

  if (pathname === '/panel-clinica') {
    return (
      <>
        <RutaPrivada
          sesion={sesion}
          perfil={perfil}
          verificando={verificandoPerfil}
          error={errorPerfil}
          onReintentar={reintentarVerificacionPerfil}
          rolesPermitidos={[ROLES.CLINICA]}
        >
          <RutaClinicaAprobada>
            <PanelClinica sesion={sesion} onSalir={salir} />
          </RutaClinicaAprobada>
        </RutaPrivada>
        {modalConfirmacionSalir}
      </>
    )
  }

  if (pathname === '/mi-clinica/citas') {
    return (
      <>
        <RutaPrivada
          sesion={sesion}
          perfil={perfil}
          verificando={verificandoPerfil}
          error={errorPerfil}
          onReintentar={reintentarVerificacionPerfil}
          rolesPermitidos={[ROLES.CLINICA]}
        >
          <RutaClinicaAprobada>
            <MisCitasClinica sesion={sesion} onSalir={salir} />
          </RutaClinicaAprobada>
        </RutaPrivada>
        {modalConfirmacionSalir}
      </>
    )
  }

  if (pathname === '/mi-clinica/agenda') {
    return (
      <>
        <RutaPrivada
          sesion={sesion}
          perfil={perfil}
          verificando={verificandoPerfil}
          error={errorPerfil}
          onReintentar={reintentarVerificacionPerfil}
          rolesPermitidos={[ROLES.CLINICA]}
        >
          <RutaClinicaAprobada>
            <AgendaClinica sesion={sesion} onSalir={salir} />
          </RutaClinicaAprobada>
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
          onReintentar={reintentarVerificacionPerfil}
          rolesPermitidos={[ROLES.CLINICA]}
        >
          <FichaClinica sesion={sesion} onSalir={salir} />
        </RutaPrivada>
        {modalConfirmacionSalir}
      </>
    )
  }

   // El alta institucional pertenece a la propia clínica; preservar enlaces antiguos.
   if (pathname === '/admin/clinicas/nueva') return <Navigate to="/admin/clinicas" replace />
   const esNuevaClinica = false
  const esRutaAdmin =
    pathname === '/admin' ||
    pathname === '/admin/usuarios' ||
    pathname === '/admin/clinicas' ||
    esNuevaClinica ||
    pathname === '/admin/citas' ||
    pathname === '/admin/calendarios' ||
    pathname === '/admin/mapa' ||
    /^\/admin\/solicitudes\/[^/]+$/.test(pathname) ||
    /^\/admin\/clinicas\/[^/]+$/.test(pathname) ||
    /^\/admin\/usuarios\/[^/]+$/.test(pathname)

  if (esRutaAdmin) {
    const idSolicitud = /^\/admin\/solicitudes\/[^/]+$/.test(pathname) ? pathname.split('/')[3] : null
    const idClinica = !esNuevaClinica && /^\/admin\/clinicas\/[^/]+$/.test(pathname) ? pathname.split('/')[3] : null
    const idUsuario = /^\/admin\/usuarios\/[^/]+$/.test(pathname) ? pathname.split('/')[3] : null
    const vistaAdmin = esNuevaClinica
      ? 'nueva-clinica'
      : pathname === '/admin/citas'
        ? 'citas'
        : pathname === '/admin/calendarios'
          ? 'calendarios'
          : pathname === '/admin/mapa'
            ? 'mapa'
            : null
    return (
      <>
        <RutaPrivada
          sesion={sesion}
          perfil={perfil}
          verificando={verificandoPerfil}
          error={errorPerfil}
          onReintentar={reintentarVerificacionPerfil}
          rolesPermitidos={[ROLES.ADMINISTRADOR]}
        >
          <Administracion
            sesion={sesion}
            onSalir={salir}
            listaUsuarios={pathname === '/admin/usuarios'}
            listaClinicas={pathname === '/admin/clinicas'}
            vistaAdmin={vistaAdmin}
            idSolicitud={idSolicitud}
            idClinica={idClinica}
            idUsuario={idUsuario}
          />
        </RutaPrivada>
        {modalConfirmacionSalir}
      </>
    )
  }

  if (pathname === '/inicio') {
    return (
      <>
        <RutaPrivada
          sesion={sesion}
          perfil={perfil}
          verificando={verificandoPerfil}
          error={errorPerfil}
          onReintentar={reintentarVerificacionPerfil}
          rolesPermitidos={[ROLES.USUARIO]}
        >
          <Inicio sesion={sesion} onSalir={salir} sinEncabezado={esUsuarioOVisitanteConHeader} />
        </RutaPrivada>
        {modalConfirmacionSalir}
      </>
    )
  }

  if (pathname === '/cuenta') {
    if (!sesion) return <Navigate to="/login" replace />
    if (verificandoPerfil) return <CargandoSesion />
    return <Navigate to={obtenerDestinoPorRol(perfil, sesion)} replace />
  }

  if (pathname === '/directorio' || /^\/centro\/[^/]+$/.test(pathname)) {
    return <Navigate to="/mapa" replace />
  }

  return <Navigate to="/" replace />
  }

  const esClinicaOAdmin =
    sesion?.tipo === ROLES.CLINICA ||
    sesion?.tipo === ROLES.ADMINISTRADOR ||
    perfil?.tipo === ROLES.CLINICA ||
    perfil?.tipo === ROLES.ADMINISTRADOR

  const esRutaPublicaAsistente =
    pathname === '/' ||
    pathname === '/conocenos' ||
    pathname === '/inicio' ||
    pathname === '/mapa' ||
    pathname === '/informacion-util' ||
    pathname === '/agendar-cita' ||
    pathname === '/mis-citas' ||
    pathname === '/mi-perfil'

  const mostrarAsistente = !esClinicaOAdmin && esRutaPublicaAsistente

  return (
    <>
      {esUsuarioOVisitanteConHeader && (
        <EncabezadoUsuario sesion={sesion} onSalir={salir} />
      )}
      {renderRuta()}
      {mostrarAsistente && (
        <AsistentePuntOax sesion={sesion} />
      )}
    </>
  )
}

export default App
