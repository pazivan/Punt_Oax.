import { useEffect, useRef, useState } from 'react'
import { enviarGoogle, guardarSesion } from '../../api/auth'
import { cargarGoogleIdentity } from '../../utils/googleIdentity'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim()

export default function GoogleAuth(props) {
  // Sin configurar Google no se carga ningún recurso externo ni se altera el login.
  return CLIENT_ID ? <GoogleConfigurado {...props} /> : null
}

function GoogleConfigurado({ registro = false, disabled = false, onSuccess, onBusy }) {
  const contenedor = useRef(null)
  const callbacks = useRef({ onSuccess, onBusy })
  const cancelar = useRef(() => {})
  const intento = useRef(null)
  const [ciclo, setCiclo] = useState(0)
  const [estado, setEstado] = useState('preparando')
  const [mensaje, setMensaje] = useState('')
  const [vinculacion, setVinculacion] = useState(null)
  const [password, setPassword] = useState('')
  const [confirmar, setConfirmar] = useState(false)
  const enviando = useRef(false)

  useEffect(() => { callbacks.current = { onSuccess, onBusy } }, [onSuccess, onBusy])

  useEffect(() => {
    let activo = true
    let aceptando = true
    let plazo
    const controlador = new AbortController()
    const destino = contenedor.current
    const terminar = (texto) => {
      aceptando = false
      clearTimeout(plazo)
      controlador.abort()
      intento.current = null
      setPassword('')
      setVinculacion(null)
      setMensaje(texto)
      setEstado('error')
      callbacks.current.onBusy?.(false)
    }
    cancelar.current = () => terminar('Cancelaste el acceso con Google. Puedes intentarlo de nuevo o usar tu correo y contraseña.')
    async function preparar() {
      try {
        const [gis, desafio] = await Promise.all([
          cargarGoogleIdentity(),
          enviarGoogle('/desafio', {}, controlador.signal),
        ])
        if (!activo) return
        intento.current = desafio
        gis.initialize({
          client_id: CLIENT_ID, nonce: desafio.nonce, ux_mode: 'popup',
          auto_select: false, context: registro ? 'signup' : 'signin',
          callback: async ({ credential }) => {
            if (!activo || !aceptando || enviando.current) return
            enviando.current = true
            clearTimeout(plazo)
            setEstado('verificando')
            callbacks.current.onBusy?.(true)
            try {
              const respuesta = await enviarGoogle('', { ...desafio, credential }, controlador.signal)
              if (activo && aceptando) {
                const sesion = guardarSesion(respuesta, 'usuario')
                aceptando = false
                callbacks.current.onSuccess(sesion)
              }
            } catch (error) {
              if (!activo || !aceptando) return
              if (error.codigo === 'GOOGLE_VINCULACION_REQUERIDA') {
                setVinculacion({ id: error.vinculacion, correo: error.correo })
                setEstado('vincular')
                setMensaje(error.message)
              } else terminar(error.message)
            } finally { enviando.current = false }
          },
        })
        gis.renderButton(destino, {
          type: 'standard', theme: 'outline', size: 'large', shape: 'rectangular',
          text: registro ? 'signup_with' : 'signin_with', locale: 'es',
          // El destino aún está hidden mientras se prepara; medir su sección.
          width: Math.floor(Math.min(400, destino.parentElement.getBoundingClientRect().width || 280)),
          click_listener: () => {
            if (!activo || !aceptando) return
            setEstado('esperando')
            callbacks.current.onBusy?.(true)
            plazo = setTimeout(() => {
              if (activo) terminar('El acceso con Google no se completó. Si cerraste la ventana, puedes intentarlo de nuevo.')
            }, 120000)
          },
        })
        setEstado('listo')
      } catch (error) {
        if (activo) terminar(error.message)
      }
    }
    preparar()
    return () => {
      activo = false
      aceptando = false
      clearTimeout(plazo)
      controlador.abort()
      intento.current = null
      destino?.replaceChildren()
      callbacks.current.onBusy?.(false)
    }
  }, [ciclo, registro])

  async function vincular(event) {
    event.preventDefault()
    if (enviando.current || !intento.current) return
    enviando.current = true
    setEstado('vinculando')
    try {
      const respuesta = await enviarGoogle('/vincular', {
        vinculacion: vinculacion.id, csrf: intento.current.csrf, password, confirmar,
      })
      if (intento.current) callbacks.current.onSuccess(guardarSesion(respuesta, 'usuario'))
    } catch (error) {
      if (intento.current) {
        cancelar.current()
        setMensaje(error.message)
      }
    } finally { enviando.current = false; setPassword('') }
  }

  const ocupado = ['esperando', 'verificando', 'vincular', 'vinculando'].includes(estado)
  return (
    <section className="auth-google" aria-label={registro ? 'Registrarse con Google' : 'Iniciar sesión con Google'} aria-busy={ocupado}>
      <div ref={contenedor} className="auth-google-button"
        inert={disabled || estado !== 'listo'}
        hidden={!['listo', 'esperando'].includes(estado)} />
      {estado === 'preparando' && <p role="status">Preparando acceso con Google…</p>}
      {['esperando', 'verificando', 'vinculando'].includes(estado) && (
        <p role="status">{estado === 'esperando' ? 'Completa el acceso en la ventana de Google o cancela para volver.' : 'Verificando tu cuenta…'}</p>
      )}
      {mensaje && <p className={estado === 'error' ? 'auth-error-alert' : 'auth-info-text'} role={estado === 'error' ? 'alert' : 'status'}>{mensaje}</p>}
      {estado === 'vincular' && (
        <form onSubmit={vincular} className="auth-form">
          <p className="auth-info-text">Cuenta original: <strong>{vinculacion.correo}</strong>. Conservaremos tus datos y citas. Si no recuerdas tu contraseña, cancela y usa «¿Olvidaste tu contraseña?».</p>
          <label className="auth-label" htmlFor="google-password">Contraseña de tu cuenta PuntOax</label>
          <input id="google-password" className="auth-input" type="password" autoComplete="current-password"
            required value={password} onChange={(e) => setPassword(e.target.value)} />
          <label className="auth-google-confirm">
            <input type="checkbox" required checked={confirmar} onChange={(e) => setConfirmar(e.target.checked)} />
            Quiero vincular Google a mi cuenta de paciente.
          </label>
          <button className="auth-submit-btn" disabled={!confirmar || !password}>Autenticar y vincular Google</button>
        </form>
      )}
      {['esperando', 'vincular'].includes(estado) && <button type="button" className="auth-inline-link" onClick={() => cancelar.current()}>Cancelar acceso con Google</button>}
      {estado === 'error' && <button type="button" className="auth-inline-link" disabled={disabled} onClick={() => {
        setMensaje(''); setConfirmar(false); setEstado('preparando'); setCiclo((v) => v + 1)
      }}>Reintentar con Google</button>}
      <p className="auth-google-divider">o continúa con tu correo y contraseña</p>
    </section>
  )
}
