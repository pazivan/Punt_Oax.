import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { reenviarVerificacion, verificarCorreo, solicitarRecuperacion, restablecerPassword } from '../../api/auth'
import { PASSWORD_REQUISITOS, validarPassword } from '../../utils/validaciones'
import CodigoVerificacion from './CodigoVerificacion.jsx'
import { ocultarCorreo } from './codigoVerificacionUtils.js'
import { guardarVerificacionPendiente, leerVerificacionPendiente } from '../../api/verificacionPendiente'
import '../../styles/Auth.css'

export default function CorreoCuenta({ modo, onVerificada, onCambiarCorreo }) {
  const { state, search } = useLocation()
  const navigate = useNavigate()
  const parametros = new URLSearchParams(search)
  const pendiente = modo === 'verificar' ? leerVerificacionPendiente() : null
  const [rol, setRol] = useState(parametros.get('rol') || state?.rol || pendiente?.rol || 'usuario')
  const [correo, setCorreo] = useState(parametros.get('correo') || state?.correo || pendiente?.correo || '')
  const [digitos, setDigitos] = useState(['', '', '', '', '', ''])
  const [verificado, setVerificado] = useState(false)
  const [token] = useState(parametros.get('token') || '')
  const [password, setPassword] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [solicitudEnviada, setSolicitudEnviada] = useState(false)
  const titulo = modo === 'verificar' ? 'Verifica tu correo' : modo === 'solicitar' ? 'Recupera tu contraseña' : 'Nueva contraseña'

  useEffect(() => {
    if (modo === 'verificar' && !verificado && correo && ['usuario', 'clinica'].includes(rol)) {
      const anterior = leerVerificacionPendiente()
      if (anterior?.rol !== rol || anterior?.correo !== correo) guardarVerificacionPendiente(rol, correo)
    }
  }, [modo, rol, correo, verificado])

  useEffect(() => {
    if (!verificado) return undefined
    const temporizador = setTimeout(() => navigate('/login', {
      replace: true, state: { aviso: 'Correo verificado. Ya puedes iniciar sesión.' },
    }), 900)
    return () => clearTimeout(temporizador)
  }, [verificado, navigate])

  async function ejecutar(e) {
    e.preventDefault()
    if (ocupado) return
    setOcupado(true); setError(''); setMensaje('')
    try {
      if (modo === 'verificar') {
        if (digitos.some((digito) => !/^\d$/.test(digito))) throw new Error('Introduce los seis dígitos del código.')
        await verificarCorreo(rol, correo, digitos.join(''))
        onVerificada?.()
        setVerificado(true)
        setMensaje('Correo verificado correctamente.')
      } else if (modo === 'solicitar') {
        const respuesta = await solicitarRecuperacion(rol, correo)
        setSolicitudEnviada(true)
        setMensaje(respuesta.mensaje)
      } else {
        if (!validarPassword(password) || password !== confirmacion) throw new Error(PASSWORD_REQUISITOS + ' Las contraseñas deben coincidir.')
        await restablecerPassword(rol, correo, token, password)
        setPassword(''); setConfirmacion('')
        navigate('/login', { replace: true, state: { aviso: 'Contraseña actualizada. Inicia sesión de nuevo.' } })
      }
    } catch (err) { setError(err.message); if (modo === 'verificar') setDigitos(['', '', '', '', '', '']) }
    finally { setOcupado(false) }
  }

  async function reenviar() {
    if (ocupado) return
    setOcupado(true); setError(''); setMensaje('')
    try { const respuesta = await reenviarVerificacion(rol, correo); setMensaje(respuesta.mensaje) }
    catch (err) { setError(err.message) }
    finally { setOcupado(false) }
  }

  if (modo === 'verificar' && (!['usuario', 'clinica'].includes(rol) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo))) {
    return <Navigate to="/login" state={{ aviso: 'Escribe tu correo en el acceso para continuar la verificación.' }} replace />
  }

  return <main className={`auth-page-wrapper auth-simple-page${modo === 'verificar' ? ' auth-verify-page' : ' auth-recover-page'}`}><div className="auth-main"><section className="auth-right-panel">
    <Link to="/" className="auth-simple-brand">
      <img src="/logo-puntoax.svg" alt="" className="auth-brand-logo" aria-hidden="true" />
      <span>PuntOax</span>
    </Link>
    <div className="auth-form-inner">
      <h1 className="auth-form-title">{titulo}</h1>
      {modo === 'verificar' && <p className="auth-verify-intro">Introduce el código de seis dígitos enviado a tu correo. Vence en 10 minutos.</p>}
      {modo === 'solicitar' && <p className="auth-verify-intro">Si existe una cuenta, enviaremos un enlace que vence en 10 minutos.</p>}
      {error && <p role="alert" className="auth-error-alert" id="codigo-error">{error}</p>}
      {mensaje && <p role="status" className="auth-info-banner">{mensaje}</p>}
      <form className="auth-form" onSubmit={ejecutar}>
        {modo === 'verificar' && <div className="auth-correo-fijo">
          <span className="auth-label">Correo de {rol === 'clinica' ? 'clínica' : 'usuario'}</span>
          <strong>{ocultarCorreo(correo)}</strong>
          <Link to="/registro" state={{ tipo: rol, correo }} onClick={onCambiarCorreo} className="auth-inline-link">Cambiar correo</Link>
          <small>Para usar otra dirección, completa nuevamente el registro con tu contraseña.</small>
        </div>}
        {modo === 'solicitar' && <div className="auth-input-group"><label className="auth-label" htmlFor="rol-correo">Tipo de cuenta</label>
          <select id="rol-correo" className="auth-input" value={rol} disabled={solicitudEnviada} onChange={(e) => setRol(e.target.value)}>
            <option value="usuario">Usuario</option><option value="clinica">Clínica</option>
            <option value="administrador">Administrador</option>
          </select></div>}
        {modo !== 'verificar' && <div className="auth-input-group"><label className="auth-label" htmlFor="correo-cuenta">Correo electrónico</label>
        {(modo === 'solicitar' && solicitudEnviada) || modo === 'restablecer' ? (
          <div id="correo-cuenta" className="auth-input auth-input-readonly" aria-readonly="true">{ocultarCorreo(correo.trim())}</div>
        ) : (
          <input id="correo-cuenta" className="auth-input" type="email" required maxLength="255" autoComplete="email"
            value={correo} onChange={(e) => setCorreo(e.target.value)} />
        )}</div>}
        {modo === 'verificar' && <CodigoVerificacion digitos={digitos} onChange={(valor) => { setDigitos(valor); setError('') }}
          error={error} correcto={verificado} disabled={ocupado || verificado} />}
        {modo === 'restablecer' && <><div className="auth-input-group"><label className="auth-label" htmlFor="nueva-password">Nueva contraseña</label>
          <input id="nueva-password" className="auth-input" type="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <div className="auth-input-group"><label className="auth-label" htmlFor="confirmar-password">Confirmar contraseña</label>
          <input id="confirmar-password" className="auth-input" type="password" required autoComplete="new-password" value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} /></div></>}
        <button className="auth-submit-btn" disabled={ocupado || verificado}>{verificado ? 'Correo verificado' : ocupado ? 'Procesando…' : modo === 'verificar' ? 'Verificar correo' : modo === 'solicitar' ? 'Enviar enlace' : 'Cambiar contraseña'}</button>
      </form>
      <div className="auth-bottom-links auth-verify-links">
        {modo === 'verificar' && (
          <button type="button" className="auth-inline-link auth-secondary-link" disabled={ocupado || verificado} onClick={reenviar}>
            Reenviar código
          </button>
        )}
        <p>
          <Link to="/login" className="auth-inline-link auth-secondary-link">
            Volver a iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  </section></div></main>
}
