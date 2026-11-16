import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { reenviarVerificacion, verificarCorreo, solicitarRecuperacion, restablecerPassword } from '../../api/auth'
import { PASSWORD_REQUISITOS, validarPassword } from '../../utils/validaciones'
import '../../styles/Auth.css'

export default function CorreoCuenta({ modo }) {
  const { state, search } = useLocation()
  const navigate = useNavigate()
  const parametros = new URLSearchParams(search)
  const [rol, setRol] = useState(parametros.get('rol') || state?.rol || 'usuario')
  const [correo, setCorreo] = useState(parametros.get('correo') || state?.correo || '')
  const [codigo, setCodigo] = useState('')
  const [token] = useState(parametros.get('token') || '')
  const [password, setPassword] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const titulo = modo === 'verificar' ? 'Verifica tu correo' : modo === 'solicitar' ? 'Recupera tu contraseña' : 'Nueva contraseña'

  async function ejecutar(e) {
    e.preventDefault()
    if (ocupado) return
    setOcupado(true); setError(''); setMensaje('')
    try {
      if (modo === 'verificar') {
        await verificarCorreo(rol, correo, codigo)
        navigate('/login', { replace: true, state: { aviso: 'Correo verificado. Ya puedes iniciar sesión.' } })
      } else if (modo === 'solicitar') {
        const respuesta = await solicitarRecuperacion(rol, correo)
        setMensaje(respuesta.mensaje)
      } else {
        if (!validarPassword(password) || password !== confirmacion) throw new Error(PASSWORD_REQUISITOS + ' Las contraseñas deben coincidir.')
        await restablecerPassword(rol, correo, token, password)
        setPassword(''); setConfirmacion('')
        navigate('/login', { replace: true, state: { aviso: 'Contraseña actualizada. Inicia sesión de nuevo.' } })
      }
    } catch (err) { setError(err.message) }
    finally { setOcupado(false) }
  }

  async function reenviar() {
    if (ocupado) return
    setOcupado(true); setError(''); setMensaje('')
    try { const respuesta = await reenviarVerificacion(rol, correo); setMensaje(respuesta.mensaje) }
    catch (err) { setError(err.message) }
    finally { setOcupado(false) }
  }

  return <main className="auth-page-wrapper"><div className="auth-main"><section className="auth-right-panel">
    <div className="auth-form-inner">
      <h1 className="auth-form-title">{titulo}</h1>
      {modo === 'verificar' && <p>Introduce el código de seis dígitos enviado a tu correo. Vence en 10 minutos.</p>}
      {modo === 'solicitar' && <p>Si existe una cuenta, enviaremos un enlace que vence en 10 minutos.</p>}
      {error && <p role="alert" className="auth-error-alert">{error}</p>}
      {mensaje && <p role="status" className="auth-info-banner">{mensaje}</p>}
      <form className="auth-form" onSubmit={ejecutar}>
        {modo !== 'restablecer' && <><label className="auth-label" htmlFor="rol-correo">Tipo de cuenta</label>
          <select id="rol-correo" className="auth-input" value={rol} onChange={(e) => setRol(e.target.value)} disabled={modo === 'verificar' && !!state?.rol}>
            <option value="usuario">Usuario</option><option value="clinica">Clínica</option>
            {modo !== 'verificar' && <option value="administrador">Administrador</option>}
          </select></>}
        <label className="auth-label" htmlFor="correo-cuenta">Correo electrónico</label>
        <input id="correo-cuenta" className="auth-input" type="email" required maxLength="255" autoComplete="email"
          value={correo} onChange={(e) => setCorreo(e.target.value)} readOnly={modo === 'restablecer'} />
        {modo === 'verificar' && <><label className="auth-label" htmlFor="codigo-correo">Código</label>
          <input id="codigo-correo" className="auth-input" inputMode="numeric" autoComplete="one-time-code"
            pattern="[0-9]{6}" maxLength="6" required value={codigo} onChange={(e) => setCodigo(e.target.value)} /></>}
        {modo === 'restablecer' && <><label className="auth-label" htmlFor="nueva-password">Nueva contraseña</label>
          <input id="nueva-password" className="auth-input" type="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <label className="auth-label" htmlFor="confirmar-password">Confirmar contraseña</label>
          <input id="confirmar-password" className="auth-input" type="password" required autoComplete="new-password" value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} /></>}
        <button className="auth-submit-btn" disabled={ocupado}>{ocupado ? 'Procesando…' : modo === 'verificar' ? 'Verificar correo' : modo === 'solicitar' ? 'Enviar enlace' : 'Cambiar contraseña'}</button>
      </form>
      {modo === 'verificar' && <button type="button" className="auth-inline-link" disabled={ocupado} onClick={reenviar}>Reenviar código</button>}
      <p><Link to="/login">Volver a iniciar sesión</Link></p>
    </div>
  </section></div></main>
}
