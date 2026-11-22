import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { User } from 'lucide-react'
import { consultarMiFicha } from '../../api/auth'
import '../../styles/Inicio.css'

export default function EncabezadoClinica({
  sesion,
  onSalir,
  modoPostulacion = null,
  estadoPublicacion = null,
  vistaPanel = null,
  onSeleccionarVistaPanel = null,
  vistaCitas = null,
  onSeleccionarVistaCitas = null,
}) {
  const { pathname, search, hash } = useLocation()
  const params = new URLSearchParams(search)
  const vistaQuery = params.get('vista')

  // El estado real vive en el servidor. Se usa el valor recibido por props y,
  // cuando la vista no lo conoce (mapa, conócenos, información útil), se
  // consulta la ficha una vez, sin depender del almacenamiento de la sesión.
  const [estadoDetectado, setEstadoDetectado] = useState(null)
  const estadoEfectivo = estadoPublicacion || estadoDetectado

  useEffect(() => {
    if (modoPostulacion !== null || estadoEfectivo || sesion?.tipo !== 'clinica') return undefined
    let activo = true
    consultarMiFicha()
      .then((datos) => {
        if (activo) setEstadoDetectado(datos?.clinica?.estado_publicacion || 'borrador')
      })
      .catch(() => {
        // Si falla la consulta, se mantiene la navegación restringida segura.
        if (activo) setEstadoDetectado('borrador')
      })
    return () => { activo = false }
  }, [modoPostulacion, estadoEfectivo, sesion?.tipo])

  const enPostulacion =
    modoPostulacion === true ||
    (modoPostulacion !== false && estadoEfectivo !== 'aprobada')

  if (enPostulacion) {
    const enlacesPostulacion = [
      { ruta: '/mi-clinica', texto: 'Inicio' },
      { ruta: '/mi-clinica#postulacion', texto: 'Mi postulación' },
    ]

    return (
      <header className="inicio-header clinica-header">
        <div className="inicio-header-container">
          <div className="inicio-header-left">
            <div className="inicio-brand-wrap">
              <Link
                to="/mi-clinica"
                className="inicio-brand"
                style={{ textDecoration: 'none' }}
              >
                <img
                  src="/logo-puntoax.svg"
                  alt=""
                  className="inicio-brand-logo"
                  aria-hidden="true"
                />
                <span>PuntOax</span>
              </Link>
            </div>

            <nav
              className="inicio-nav agendar-header-nav"
              aria-label="Navegación principal"
            >
              {enlacesPostulacion.map(({ ruta, texto }) => {
                const activo = ruta.includes('#')
                  ? pathname === '/mi-clinica' && hash === '#postulacion'
                  : pathname === ruta && !hash
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
              to="/mi-perfil"
              className={`inicio-header-profile-link ${pathname === '/mi-perfil' ? 'is-active' : ''}`}
              title={sesion?.cuenta?.nombre || sesion?.cuenta?.correo || 'Mi perfil'}
              aria-label="Mi perfil"
              aria-current={pathname === '/mi-perfil' ? 'page' : undefined}
            >
              <span className="inicio-avatar-circle" aria-hidden="true">
                <User size={14} color="#FFFFFF" />
              </span>
              <span>Mi perfil</span>
            </Link>

            <button
              type="button"
              onClick={onSalir}
              className="inicio-header-logout-btn"
            >
              Salir
            </button>
          </div>
        </div>
      </header>
    )
  }

  // Encabezado unificado para todas las pestañas de la clínica aprobada
  const vistaPanelEfectiva =
    vistaPanel || (vistaQuery === 'editar' ? 'editar' : 'inicio')
  const vistaCitasEfectiva =
    vistaCitas || (vistaQuery === 'calendario' ? 'calendario' : 'listado')

  const enPanel = pathname === '/panel-clinica' || pathname === '/mi-clinica'
  const enCitas = pathname === '/mi-clinica/citas'

  const elementosAprobada = [
    {
      id: 'inicio',
      texto: 'Inicio',
      ruta: '/panel-clinica',
      activo: enPanel && vistaPanelEfectiva === 'inicio',
      onClickLocal:
        enPanel && typeof onSeleccionarVistaPanel === 'function'
          ? () => onSeleccionarVistaPanel('inicio')
          : null,
    },
    {
      id: 'mapa',
      texto: 'Ver mapa',
      ruta: '/mapa',
      activo: pathname === '/mapa',
      onClickLocal: null,
    },
    {
      id: 'editar',
      texto: 'Editar información',
      ruta: '/panel-clinica?vista=editar',
      activo: enPanel && vistaPanelEfectiva === 'editar',
      onClickLocal:
        enPanel && typeof onSeleccionarVistaPanel === 'function'
          ? () => onSeleccionarVistaPanel('editar')
          : null,
    },
    {
      id: 'citas',
      texto: 'Mis citas',
      ruta: '/mi-clinica/citas',
      activo: enCitas && vistaCitasEfectiva === 'listado',
      onClickLocal:
        enCitas && typeof onSeleccionarVistaCitas === 'function'
          ? () => onSeleccionarVistaCitas('listado')
          : null,
    },
    {
      id: 'calendario',
      texto: 'Ver calendario',
      ruta: '/mi-clinica/citas?vista=calendario',
      activo: enCitas && vistaCitasEfectiva === 'calendario',
      onClickLocal:
        enCitas && typeof onSeleccionarVistaCitas === 'function'
          ? () => onSeleccionarVistaCitas('calendario')
          : null,
    },
  ]

  const nombreOCorreo =
    sesion?.cuenta?.nombre ||
    sesion?.cuenta?.correo ||
    'Mi clínica'

  return (
    <header className="inicio-header clinica-header">
      <div className="inicio-header-container">
        <div className="inicio-header-left">
          <div className="inicio-brand-wrap">
            <Link
              to="/panel-clinica"
              className="inicio-brand"
              style={{ textDecoration: 'none' }}
              onClick={() => {
                if (enPanel && typeof onSeleccionarVistaPanel === 'function') {
                  onSeleccionarVistaPanel('inicio')
                }
              }}
            >
              <img
                src="/logo-puntoax.svg"
                alt=""
                className="inicio-brand-logo"
                aria-hidden="true"
              />
              <span>PuntOax</span>
            </Link>
          </div>

          <nav
            className="inicio-nav agendar-header-nav"
            aria-label="Navegación principal"
          >
            {elementosAprobada.map(({ id, texto, ruta, activo, onClickLocal }) =>
              onClickLocal ? (
                <button
                  key={id}
                  type="button"
                  onClick={onClickLocal}
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
                </button>
              ) : (
                <Link
                  key={id}
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
            )}
          </nav>
        </div>

        <div className="inicio-header-right">
          <Link
            to="/mi-perfil"
            className={`inicio-header-profile-link ${pathname === '/mi-perfil' ? 'is-active' : ''}`}
            title={nombreOCorreo}
            aria-label="Mi perfil"
            aria-current={pathname === '/mi-perfil' ? 'page' : undefined}
          >
            <span className="inicio-avatar-circle" aria-hidden="true">
              <User size={14} color="#FFFFFF" />
            </span>
            <span>Mi perfil</span>
          </Link>

          <button
            type="button"
            onClick={onSalir}
            className="inicio-header-logout-btn"
          >
            Salir
          </button>
        </div>
      </div>
    </header>
  )
}
