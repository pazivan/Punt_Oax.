import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, User, X } from 'lucide-react';
import CampanaNotificaciones from './CampanaNotificaciones.jsx';

/**
 * EncabezadoUsuario - Encabezado compartido para el área de usuario autenticado
 * (y vistas públicas/mixtas cuando no corresponde EncabezadoClinica).
 */
export default function EncabezadoUsuario({
  sesion,
  onSalir,
  seccionActiva = null,
  citasPreCargadas = null,
  onClicMapa = null,
}) {
  const { pathname } = useLocation();
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false);
  const botonMenuRef = useRef(null);
  const cajonRef = useRef(null);

  const esAdmin = sesion?.tipo === 'administrador';
  const rutaInicio = sesion ? (esAdmin ? '/admin' : '/inicio') : '/';
  const rutaPerfil = esAdmin ? '/admin' : '/mi-perfil';
  const nombreOCorreo = sesion?.cuenta?.nombre || sesion?.cuenta?.correo || 'Mi cuenta';

  const activa = seccionActiva || (
    pathname === '/inicio' || pathname === '/cuenta' ? 'inicio'
      : pathname === '/mapa' ? 'mapa'
        : pathname === '/agendar-cita' ? 'agendar'
          : pathname === '/mis-citas' ? 'citas'
            : pathname === '/informacion-util' ? 'informacion'
              : pathname === '/conocenos' ? 'conocenos'
                : pathname === '/mi-perfil' ? 'perfil'
                  : pathname === '/admin' ? 'admin'
                    : ''
  );

  const enlaces = esAdmin
    ? [
        { id: 'inicio', ruta: rutaInicio, texto: 'Inicio' },
        { id: 'mapa', ruta: '/mapa', texto: 'Mapa de centros' },
        { id: 'admin', ruta: '/admin', texto: 'Administración' },
        { id: 'informacion', ruta: '/informacion-util', texto: 'Información útil' },
        { id: 'conocenos', ruta: '/conocenos', texto: 'Conócenos' },
      ]
    : [
        { id: 'inicio', ruta: rutaInicio, texto: 'Inicio' },
        { id: 'mapa', ruta: '/mapa', texto: 'Mapa de centros' },
        { id: 'agendar', ruta: '/agendar-cita', texto: 'Agendar cita' },
        ...(sesion?.tipo === 'usuario' ? [{ id: 'citas', ruta: '/mis-citas', texto: 'Mis citas' }] : []),
        { id: 'informacion', ruta: '/informacion-util', texto: 'Información útil' },
        { id: 'conocenos', ruta: '/conocenos', texto: 'Conócenos' },
      ];

  useEffect(() => {
    if (!menuMovilAbierto) return undefined;
    const manejarTecla = (e) => {
      if (e.key === 'Escape') {
        setMenuMovilAbierto(false);
        botonMenuRef.current?.focus();
      }
    };
    window.addEventListener('keydown', manejarTecla);
    return () => window.removeEventListener('keydown', manejarTecla);
  }, [menuMovilAbierto]);

  const cerrarMenu = () => setMenuMovilAbierto(false);

  const renderEnlaceNav = ({ id, ruta, texto }, enMovil = false) => {
    const esActiva = activa === id;
    if (id === 'mapa' && typeof onClicMapa === 'function') {
      return (
        <button
          key={id}
          type="button"
          onClick={() => {
            cerrarMenu();
            onClicMapa();
          }}
          className={`${enMovil ? 'inicio-mobile-nav-link' : 'inicio-nav-link'} ${esActiva ? 'active' : ''}`}
          aria-current={esActiva ? 'page' : undefined}
        >
          {esActiva && !enMovil ? <span className="inicio-nav-link-active-text">{texto}</span> : texto}
        </button>
      );
    }

    return (
      <Link
        key={id}
        to={ruta}
        onClick={cerrarMenu}
        className={`${enMovil ? 'inicio-mobile-nav-link' : 'inicio-nav-link'} ${esActiva ? 'active' : ''}`}
        aria-current={esActiva ? 'page' : undefined}
      >
        {esActiva && !enMovil ? <span className="inicio-nav-link-active-text">{texto}</span> : texto}
      </Link>
    );
  };

  return (
    <header className="inicio-header">
      <div className="inicio-header-container">
        <div className="inicio-header-left">
          <div className="inicio-brand-wrap">
            <Link to={rutaInicio} className="inicio-brand" style={{ textDecoration: 'none' }} onClick={cerrarMenu}>
              <img src="/logo-puntoax.svg" alt="" className="inicio-brand-logo" aria-hidden="true" />
              <span>PuntOax</span>
            </Link>
          </div>

          <nav className="inicio-nav inicio-desktop-nav" aria-label="Navegación principal">
            {enlaces.map((item) => renderEnlaceNav(item, false))}
          </nav>
        </div>

        <div className="inicio-header-right">
          {sesion ? (
            <>
              <CampanaNotificaciones sesion={sesion} citasPreCargadas={citasPreCargadas} />

              <Link
                to={rutaPerfil}
                className={`inicio-header-profile-link inicio-desktop-only-action ${activa === 'perfil' ? 'is-active' : ''}`}
                title={nombreOCorreo}
                aria-label={esAdmin ? 'Administración' : 'Mi perfil'}
                aria-current={activa === 'perfil' ? 'page' : undefined}
              >
                <span className="inicio-avatar-circle" aria-hidden="true">
                  <User size={14} color="#FFFFFF" />
                </span>
                <span>{esAdmin ? 'Administración' : 'Mi perfil'}</span>
              </Link>

              <button
                type="button"
                onClick={onSalir}
                className="inicio-header-logout-btn inicio-desktop-only-action"
              >
                Salir
              </button>
            </>
          ) : (
            <div className="inicio-desktop-only-action inicio-guest-actions">
              <Link to="/login" className="inicio-header-account-link">Iniciar sesión</Link>
              <Link to="/registro" className="inicio-header-logout-btn">Crear cuenta</Link>
            </div>
          )}

          <button
            ref={botonMenuRef}
            type="button"
            className="inicio-hamburger-btn"
            aria-label={menuMovilAbierto ? 'Cerrar menú de navegación' : 'Abrir menú de navegación'}
            aria-expanded={menuMovilAbierto}
            aria-controls="menu-movil-usuario"
            onClick={() => setMenuMovilAbierto((abierto) => !abierto)}
          >
            {menuMovilAbierto ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {menuMovilAbierto && (
        <div
          className="inicio-mobile-backdrop"
          role="presentation"
          onClick={cerrarMenu}
        >
          <aside
            id="menu-movil-usuario"
            ref={cajonRef}
            className="inicio-mobile-drawer"
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
                  cerrarMenu();
                  botonMenuRef.current?.focus();
                }}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <nav className="inicio-mobile-nav-list" aria-label="Opciones de navegación">
              {enlaces.map((item) => renderEnlaceNav(item, true))}
            </nav>

            <div className="inicio-mobile-drawer-footer">
              {sesion ? (
                <>
                  <Link
                    to={rutaPerfil}
                    onClick={cerrarMenu}
                    className={`inicio-mobile-nav-link ${activa === 'perfil' ? 'active' : ''}`}
                    aria-current={activa === 'perfil' ? 'page' : undefined}
                  >
                    {esAdmin ? 'Administración' : 'Mi perfil'}
                  </Link>
                  <button
                    type="button"
                    className="inicio-mobile-logout-btn"
                    onClick={() => {
                      cerrarMenu();
                      onSalir?.();
                    }}
                  >
                    Cerrar sesión
                  </button>
                </>
              ) : (
                <>
                  <Link to="/login" onClick={cerrarMenu} className="inicio-mobile-nav-link">
                    Iniciar sesión
                  </Link>
                  <Link to="/registro" onClick={cerrarMenu} className="inicio-mobile-logout-btn" style={{ textDecoration: 'none', textAlign: 'center' }}>
                    Crear cuenta
                  </Link>
                </>
              )}
            </div>
          </aside>
        </div>
      )}
    </header>
  );
}
