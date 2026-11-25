import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'
import { Menu, User, X } from 'lucide-react'
import { consultarMiFicha } from '../../api/auth'
import CampanaNotificaciones from '../Inicio/CampanaNotificaciones.jsx'
import {
  bloquearScrollFondo,
  cerrarOtrasCapas,
  establecerCapaActiva,
  registrarCierreCapa,
} from '../../utils/uiOverlays.js'
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
  const { pathname, search } = useLocation()
  const params = new URLSearchParams(search)
  const vistaQuery = params.get('vista')

  // El estado real vive en el servidor. Se usa el valor recibido por props y,
  // cuando la vista no lo conoce (mapa, conócenos, información útil), se
  // consulta la ficha una vez, sin depender del almacenamiento de la sesión.
  const [estadoDetectado, setEstadoDetectado] = useState(null)
  const claveRuta = `${pathname}${search}`
  const [rutaMenuAbierto, setRutaMenuAbierto] = useState(null)
  const menuMovilAbierto = rutaMenuAbierto === claveRuta
  const setMenuMovilAbierto = (valor) => {
    setRutaMenuAbierto((prev) => {
      const actual = prev === claveRuta
      const siguiente = typeof valor === 'function' ? valor(actual) : Boolean(valor)
      return siguiente ? claveRuta : null
    })
  }
  const [indicador, setIndicador] = useState({ left: 0, width: 0, visible: false })
  const botonMenuRef = useRef(null)
  const navRef = useRef(null)
  const itemsRef = useRef(new Map())

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

  const activaId = enPostulacion
    ? ''
    : (elementosAprobada.find((item) => item.activo)?.id || '')

  useLayoutEffect(() => {
    if (enPostulacion) return undefined
    const actualizarIndicador = () => {
      const activoEl = itemsRef.current.get(activaId)
      if (!activoEl || !navRef.current || activoEl.offsetWidth === 0) {
        setIndicador((prev) => (prev.visible ? { ...prev, visible: false } : prev))
        return
      }
      const left = activoEl.offsetLeft
      const width = activoEl.offsetWidth
      setIndicador((prev) =>
        prev.left === left && prev.width === width && prev.visible
          ? prev
          : { left, width, visible: true }
      )
    }

    actualizarIndicador()
    if (typeof ResizeObserver === 'undefined' || !navRef.current) return undefined
    const observador = new ResizeObserver(actualizarIndicador)
    observador.observe(navRef.current)
    return () => observador.disconnect()
  }, [enPostulacion, activaId, elementosAprobada.length])

  useEffect(() => {
    const desregistrar = registrarCierreCapa('menu-movil', () => setRutaMenuAbierto(null))
    return () => {
      desregistrar()
      establecerCapaActiva('menu-movil', false)
    }
  }, [])

  useEffect(() => {
    establecerCapaActiva('menu-movil', menuMovilAbierto)
    if (!menuMovilAbierto) return undefined
    cerrarOtrasCapas('menu-movil')
    const liberarScroll = bloquearScrollFondo()
    const manejarTecla = (e) => {
      if (e.key === 'Escape') {
        setRutaMenuAbierto(null)
        botonMenuRef.current?.focus()
      }
    }
    window.addEventListener('keydown', manejarTecla)
    return () => {
      liberarScroll()
      window.removeEventListener('keydown', manejarTecla)
    }
  }, [menuMovilAbierto])

  if (enPostulacion) {
    const enlacesPostulacion = [
      { ruta: '/mi-clinica', texto: 'Mi postulación' },
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
  const cerrarMenu = () => setMenuMovilAbierto(false)

  const registrarRef = (id, el) => {
    if (el) itemsRef.current.set(id, el)
    else itemsRef.current.delete(id)
  }

  const nombreOCorreo =
    sesion?.cuenta?.nombre ||
    sesion?.cuenta?.correo ||
    'Mi clínica'

  const renderEnlaceNav = ({ id, texto, ruta, activo, onClickLocal }, enMovil = false) => {
    const claseBase = enMovil ? 'inicio-mobile-nav-link' : 'inicio-nav-link'
    if (onClickLocal) {
      return (
        <button
          key={id}
          ref={enMovil ? undefined : (el) => registrarRef(id, el)}
          type="button"
          onClick={() => {
            cerrarMenu()
            onClickLocal()
          }}
          className={`${claseBase} ${activo ? 'active' : ''}`}
          aria-current={activo ? 'page' : undefined}
        >
          {texto}
        </button>
      )
    }

    return (
      <Link
        key={id}
        ref={enMovil ? undefined : (el) => registrarRef(id, el)}
        to={ruta}
        onClick={cerrarMenu}
        className={`${claseBase} ${activo ? 'active' : ''}`}
        aria-current={activo ? 'page' : undefined}
      >
        {texto}
      </Link>
    )
  }

  return (
    <header className="inicio-header">
      <div className="inicio-header-container">
        <div className="inicio-header-left">
          <div className="inicio-brand-wrap">
            <Link
              to="/panel-clinica"
              className="inicio-brand"
              style={{ textDecoration: 'none' }}
              onClick={() => {
                cerrarMenu()
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
            ref={navRef}
            className="inicio-nav inicio-desktop-nav"
            aria-label="Navegación principal"
          >
            {indicador.visible && (
              <span
                className="inicio-nav-indicator"
                aria-hidden="true"
                style={{
                  transform: `translateX(${indicador.left}px)`,
                  width: `${indicador.width}px`,
                }}
              />
            )}
            {elementosAprobada.map((item) => renderEnlaceNav(item, false))}
          </nav>
        </div>

        <div className="inicio-header-right">
          <CampanaNotificaciones sesion={sesion} enPostulacion={false} />

          <Link
            to="/mi-perfil"
            className={`inicio-header-profile-link inicio-desktop-only-action ${pathname === '/mi-perfil' ? 'is-active' : ''}`}
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
            className="inicio-header-logout-btn inicio-desktop-only-action"
          >
            Salir
          </button>

          <button
            ref={botonMenuRef}
            type="button"
            className="inicio-hamburger-btn"
            aria-label={menuMovilAbierto ? 'Cerrar menú de navegación' : 'Abrir menú de navegación'}
            aria-expanded={menuMovilAbierto}
            aria-controls="menu-movil-clinica"
            onClick={() => setMenuMovilAbierto((abierto) => !abierto)}
          >
            {menuMovilAbierto ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {menuMovilAbierto && (() => {
        const cajonClinica = (
          <div
            className="inicio-mobile-backdrop"
            role="presentation"
            onClick={cerrarMenu}
          >
            <aside
              id="menu-movil-clinica"
              className="inicio-mobile-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Menú de navegación móvil"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="inicio-mobile-drawer-header">
                <span className="inicio-brand">
                  <img src="/logo-puntoax.svg" alt="" className="inicio-brand-logo" aria-hidden="true" />
                  <span>PuntOax</span>
                </span>
                <button
                  type="button"
                  className="inicio-mobile-close-btn"
                  aria-label="Cerrar menú"
                  onClick={() => {
                    cerrarMenu()
                    botonMenuRef.current?.focus()
                  }}
                >
                  <X size={20} aria-hidden="true" />
                </button>
              </div>

              <nav className="inicio-mobile-nav-list" aria-label="Opciones de navegación">
                {elementosAprobada.map((item) => renderEnlaceNav(item, true))}
              </nav>

              <div className="inicio-mobile-drawer-footer">
                <Link
                  to="/mi-perfil"
                  onClick={cerrarMenu}
                  className={`inicio-mobile-nav-link inicio-mobile-profile-link ${pathname === '/mi-perfil' ? 'active' : ''}`}
                  aria-current={pathname === '/mi-perfil' ? 'page' : undefined}
                >
                  <User size={16} aria-hidden="true" />
                  <span>Mi perfil</span>
                </Link>
                <button
                  type="button"
                  className="inicio-mobile-logout-btn"
                  onClick={() => {
                    cerrarMenu()
                    onSalir?.()
                  }}
                >
                  Cerrar sesión
                </button>
              </div>
            </aside>
          </div>
        )
        return typeof document !== 'undefined' && document.body
          ? createPortal(cajonClinica, document.body)
          : cajonClinica
      })()}
    </header>
  )
}
