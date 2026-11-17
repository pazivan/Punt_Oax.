
import { Link, useLocation } from 'react-router-dom'
import { User } from 'lucide-react'
import '../../styles/Inicio.css'

export default function EncabezadoClinica({ sesion, onSalir }) {
  const { pathname } = useLocation()

  const enlaces = [
    { ruta: '/mi-clinica', texto: 'Inicio' },
    { ruta: '/mapa', texto: 'Mapa de centros' },
    { ruta: '/mi-clinica/citas', texto: 'Mis citas' },
    { ruta: '/mi-clinica/agenda', texto: 'Agenda' },
    { ruta: '/panel-clinica', texto: 'Panel' },
    { ruta: '/informacion-util', texto: 'Información útil' },
  ]

  const nombreOCorreo =
    sesion?.cuenta?.nombre ||
    sesion?.cuenta?.correo ||
    'Mi cuenta'

  return (
    <header className="inicio-header">
      <div className="inicio-header-container">
        <div className="inicio-header-left">

          <div className="inicio-brand-wrap">
            <Link
              to="/mi-clinica"
              className="inicio-brand"
              style={{ textDecoration: 'none' }}
            >
              PuntOax
            </Link>
          </div>

          <nav
            className="inicio-nav agendar-header-nav"
            aria-label="Navegación principal"
          >
            {enlaces.map(({ ruta, texto }) => {
              const activo = pathname === ruta

              return (
                <Link
                  key={ruta}
                  to={ruta}
                  className={`inicio-nav-link ${activo ? 'active' : ''}`}
                  aria-current={activo ? 'page' : undefined}
                >
                  {activo ? (
                    <span className="inicio-nav-link-active-text">
                      {texto}
                    </span>
                  ) : (
                    texto
                  )}
                </Link>
              )
            })}
          </nav>
        </div>

        <div className="inicio-header-right">
          <Link
            to="/mi-clinica"
            className="inicio-header-account-link"
            title={nombreOCorreo}
          >
            Mi cuenta
          </Link>

          <button
            type="button"
            onClick={onSalir}
            className="inicio-header-logout-btn"
          >
            Salir
          </button>

          <div className="inicio-avatar-margin">
            <div className="inicio-avatar-circle" aria-hidden="true">
              <User size={14} color="#FFFFFF" />
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
