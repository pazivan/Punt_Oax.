import { Link } from 'react-router-dom'
import { AlertTriangle, Home, RefreshCw } from 'lucide-react'
import './EstadoSesion.css'

export function CargandoSesion({ mensaje = 'Verificando tu sesión…' }) {
  return (
    <div className="puntoax-sesion-page">
      <main className="puntoax-sesion-card" role="status" aria-live="polite">
        <div className="puntoax-sesion-brand">
          <img src="/logo-puntoax.svg" alt="" className="puntoax-sesion-logo" aria-hidden="true" />
          <span>PuntOax</span>
        </div>
        <div className="puntoax-sesion-spinner" aria-hidden="true" />
        <p className="puntoax-sesion-texto">{mensaje}</p>
      </main>
    </div>
  )
}

export function ErrorSesionTemporal({
  titulo = 'No pudimos verificar tu sesión',
  mensaje = 'Ocurrió un problema temporal al conectar con el servidor. Tu sesión sigue guardada en este navegador.',
  onReintentar,
  rutaInicio = '/conocenos',
  textoInicio = 'Ir al inicio',
}) {
  return (
    <div className="puntoax-sesion-page">
      <main className="puntoax-sesion-card" role="alert">
        <div className="puntoax-sesion-brand">
          <img src="/logo-puntoax.svg" alt="" className="puntoax-sesion-logo" aria-hidden="true" />
          <span>PuntOax</span>
        </div>
        <span className="puntoax-sesion-icon-error" aria-hidden="true">
          <AlertTriangle size={24} />
        </span>
        <h1 className="puntoax-sesion-titulo">{titulo}</h1>
        <p className="puntoax-sesion-texto">{mensaje}</p>
        <div className="puntoax-sesion-acciones">
          {typeof onReintentar === 'function' && (
            <button type="button" className="puntoax-sesion-btn-primario" onClick={onReintentar}>
              <RefreshCw size={16} aria-hidden="true" />
              Reintentar
            </button>
          )}
          <Link to={rutaInicio} className="puntoax-sesion-btn-secundario">
            <Home size={16} aria-hidden="true" />
            {textoInicio}
          </Link>
        </div>
      </main>
    </div>
  )
}
