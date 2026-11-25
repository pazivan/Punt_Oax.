import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bell,
  CalendarClock,
  Clock3,
  MapPin,
  X,
} from 'lucide-react';
import { consultarCitasUsuario, consultarMisSolicitudesClinica } from '../../api/auth.js';
import {
  calcularTiempoRestanteCita,
  filtrarCitas,
  formatearFechaCita,
} from '../../utils/citasClinica.js';
import {
  bloquearScrollFondo,
  cerrarOtrasCapas,
  establecerCapaActiva,
  registrarCierreCapa,
} from '../../utils/uiOverlays.js';

function detectarMovilNotif() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(max-width: 768px)').matches;
}

/**
 * CampanaNotificaciones - Módulo de notificaciones y recordatorios de citas próximas
 * en el encabezado para pacientes autenticados.
 * En móvil se presenta como panel centrado en portal para evitar recortes laterales
 * o interferencias con el encabezado y el asistente IA.
 */
export default function CampanaNotificaciones({ sesion, citasPreCargadas = null, enPostulacion = false }) {
  const esUsuarioNormal = !sesion?.tipo || sesion?.tipo === 'usuario';
  const esClinica = sesion?.tipo === 'clinica';
  const [abierto, setAbierto] = useState(false);
  const [esMovil, setEsMovil] = useState(detectarMovilNotif);
  const [citasInternas, setCitasInternas] = useState([]);
  const [solicitudesClinica, setSolicitudesClinica] = useState([]);
  const [errorCitas, setErrorCitas] = useState(false);
  const [cargando, setCargando] = useState(
    () => Boolean((esUsuarioNormal && !Array.isArray(citasPreCargadas)) || esClinica)
  );
  const [ahora, setAhora] = useState(() => Date.now());
  const contenedorRef = useRef(null);
  const botonCampanaRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia('(max-width: 768px)');
    const actualizar = (ev) => setEsMovil(Boolean(ev.matches));
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', actualizar);
      return () => mq.removeEventListener('change', actualizar);
    }
    mq.addListener(actualizar);
    return () => mq.removeListener(actualizar);
  }, []);

  useEffect(() => {
    const desregistrar = registrarCierreCapa('notificaciones', () => setAbierto(false));
    return () => {
      desregistrar();
      establecerCapaActiva('notificaciones', false);
    };
  }, []);

  useEffect(() => {
    establecerCapaActiva('notificaciones', abierto);
    if (abierto) cerrarOtrasCapas('notificaciones');
    if (abierto && esMovil) {
      return bloquearScrollFondo();
    }
    return undefined;
  }, [abierto, esMovil]);

  useEffect(() => {
    if (esClinica) {
      let activo = true;
      consultarMisSolicitudesClinica()
        .then((res) => {
          if (!activo) return;
          setSolicitudesClinica(Array.isArray(res?.solicitudes) ? res.solicitudes : []);
          setErrorCitas(false);
        })
        .catch(() => {
          if (!activo) return;
          setErrorCitas(true);
        })
        .finally(() => {
          if (activo) setCargando(false);
        });
      return () => {
        activo = false;
      };
    }

    if (!esUsuarioNormal || Array.isArray(citasPreCargadas)) return undefined;

    let activo = true;
    consultarCitasUsuario({ forzar: abierto, segundoPlano: !abierto })
      .then((res) => {
        if (!activo) return;
        setCitasInternas(Array.isArray(res?.citas) ? res.citas : []);
        setAhora(Date.now());
      })
      .catch(() => {
        if (!activo) return;
        setErrorCitas(true);
      })
      .finally(() => {
        if (activo) setCargando(false);
      });

    return () => {
      activo = false;
    };
  }, [esUsuarioNormal, esClinica, citasPreCargadas, abierto]);

  // Actualiza el reloj cada minuto para mantener al día el cálculo de "cuánto falta"
  useEffect(() => {
    const intervalo = setInterval(() => {
      setAhora(Date.now());
    }, 60000);
    return () => clearInterval(intervalo);
  }, []);

  useEffect(() => {
    if (!abierto) return undefined;
    function manejarClickFuera(e) {
      const dentroBoton = contenedorRef.current?.contains(e.target);
      const dentroPanel = panelRef.current?.contains(e.target);
      if (!dentroBoton && !dentroPanel) {
        setAbierto(false);
      }
    }
    function manejarEscape(e) {
      if (e.key === 'Escape') {
        setAbierto(false);
        botonCampanaRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', manejarClickFuera);
    document.addEventListener('keydown', manejarEscape);
    return () => {
      document.removeEventListener('mousedown', manejarClickFuera);
      document.removeEventListener('keydown', manejarEscape);
    };
  }, [abierto]);

  const cerrarPanel = () => {
    setAbierto(false);
    botonCampanaRef.current?.focus();
  };

  const renderPanelEnCapa = (contenidoPanel) => {
    if (!abierto) return null;
    if (esMovil && typeof document !== 'undefined' && document.body) {
      return createPortal(
        <div
          className="notif-mobile-backdrop"
          role="presentation"
          onClick={cerrarPanel}
        >
          <div
            className="notif-mobile-sheet-wrap"
            onClick={(e) => e.stopPropagation()}
          >
            {contenidoPanel}
          </div>
        </div>,
        document.body
      );
    }
    return contenidoPanel;
  };

  const fuenteCitas = Array.isArray(citasPreCargadas) ? citasPreCargadas : citasInternas;
  const citasProximas = useMemo(
    () => filtrarCitas(fuenteCitas, 'proximas', ahora),
    [fuenteCitas, ahora]
  );
  const solicitudesResueltas = useMemo(
    () => solicitudesClinica.filter((s) => s.estado === 'aprobada' || s.estado === 'rechazada'),
    [solicitudesClinica]
  );

  if (!esUsuarioNormal && !esClinica) return null;

  if (esClinica) {
    const totalResueltas = solicitudesResueltas.length;
    const destinoBase = enPostulacion ? '/mi-clinica' : '/panel-clinica?vista=solicitudes';
    return (
      <div className="notif-wrapper" ref={contenedorRef}>
        <button
          ref={botonCampanaRef}
          type="button"
          className={`notif-bell-btn${abierto ? ' is-open' : ''}`}
          onClick={() => {
            if (!abierto) {
              setCargando(true);
              setErrorCitas(false);
            }
            setAbierto((prev) => !prev);
          }}
          aria-label={
            totalResueltas > 0
              ? `Notificaciones: ${totalResueltas} solicitud${totalResueltas === 1 ? '' : 'es'} resuelta${totalResueltas === 1 ? '' : 's'}`
              : 'Notificaciones de solicitudes'
          }
          aria-expanded={abierto}
          title="Resoluciones de solicitudes"
        >
          <Bell size={18} color="#001D14" />
          {totalResueltas > 0 && (
            <span className="notif-badge" aria-hidden="true">
              {totalResueltas > 9 ? '9+' : totalResueltas}
            </span>
          )}
        </button>

        {renderPanelEnCapa(
          <section
            ref={panelRef}
            className={`notif-dropdown${esMovil ? ' is-mobile-sheet' : ''}`}
            role="dialog"
            aria-modal={esMovil ? 'true' : undefined}
            aria-label="Resoluciones de solicitudes"
          >
            <header className="notif-dropdown-header">
              <div className="notif-dropdown-header-text">
                <span className="notif-dropdown-eyebrow">SEGUIMIENTO ADMINISTRATIVO</span>
                <h3 className="notif-dropdown-title">Solicitudes resueltas</h3>
              </div>
              <button
                type="button"
                className="notif-close-btn"
                onClick={cerrarPanel}
                aria-label="Cerrar notificaciones"
              >
                <X size={16} color="#414845" />
              </button>
            </header>

            <div className="notif-dropdown-body">
              {cargando ? (
                <p className="notif-empty-text">Consultando tus solicitudes…</p>
              ) : errorCitas ? (
                <p className="notif-empty-text" role="alert">
                  No se pudieron consultar tus solicitudes. Cierra y vuelve a abrir para reintentar.
                </p>
              ) : totalResueltas === 0 ? (
                <div className="notif-empty-box">
                  <CalendarClock size={24} color="#596763" aria-hidden="true" />
                  <p className="notif-empty-title">Sin resoluciones nuevas</p>
                  <p className="notif-empty-text">
                    Cuando el administrador apruebe o rechace una solicitud, verás el dictamen y sus comentarios aquí.
                  </p>
                </div>
              ) : (
                <ul className="notif-list">
                  {solicitudesResueltas.map((sol) => (
                    <li key={sol.id_solicitud} className="notif-item">
                      <Link
                        to={enPostulacion ? '/mi-clinica' : `/panel-clinica?vista=solicitudes&solicitud=${encodeURIComponent(sol.id_solicitud)}`}
                        onClick={() => setAbierto(false)}
                        style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
                      >
                        <div className="notif-item-top">
                          <span className={`notif-countdown-pill${sol.estado === 'rechazada' ? ' is-urgent' : ''}`}>
                            {sol.estado === 'aprobada' ? 'Aprobada' : 'Rechazada'}
                          </span>
                          <span className="notif-service-tag">
                            {sol.tipo_solicitud === 'actualizacion_ubicacion'
                              ? 'Ubicación'
                              : sol.tipo_solicitud === 'actualizacion_informacion'
                                ? 'Actualización'
                                : 'Postulación'}
                          </span>
                        </div>
                        <p className="notif-date-text" style={{ marginTop: '6px' }}>
                          {sol.observaciones
                            ? sol.observaciones
                            : sol.estado === 'aprobada'
                              ? 'Tu solicitud fue aprobada.'
                              : 'Revisa el detalle de la solicitud.'}
                        </p>
                        <p className="notif-location-text">
                          {formatearFechaCita(sol.fecha_resolucion || sol.fecha_solicitud)}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <footer className="notif-dropdown-footer">
              <Link
                to={destinoBase}
                className="notif-footer-link"
                onClick={() => setAbierto(false)}
              >
                <span>Ver historial en Mis solicitudes</span>
                <ArrowRight size={14} color="#001D14" />
              </Link>
            </footer>
          </section>
        )}
      </div>
    );
  }

  const totalProximas = citasProximas.length;

  return (
    <div className="notif-wrapper" ref={contenedorRef}>
      <button
        ref={botonCampanaRef}
        type="button"
        className={`notif-bell-btn${abierto ? ' is-open' : ''}`}
        onClick={() => {
          setAhora(Date.now());
          if (!abierto && !Array.isArray(citasPreCargadas)) {
            setCargando(true);
            setErrorCitas(false);
          }
          setAbierto((prev) => !prev);
        }}
        aria-label={
          totalProximas > 0
            ? `Notificaciones: tienes ${totalProximas} cita${totalProximas === 1 ? '' : 's'} próxima${totalProximas === 1 ? '' : 's'}`
            : 'Notificaciones de citas'
        }
        aria-expanded={abierto}
        title="Recordatorios de citas próximas"
      >
        <Bell size={18} color="#001D14" />
        {totalProximas > 0 && (
          <span className="notif-badge" aria-hidden="true">
            {totalProximas > 9 ? '9+' : totalProximas}
          </span>
        )}
      </button>

      {renderPanelEnCapa(
        <section
          ref={panelRef}
          className={`notif-dropdown${esMovil ? ' is-mobile-sheet' : ''}`}
          role="dialog"
          aria-modal={esMovil ? 'true' : undefined}
          aria-label="Recordatorios de citas próximas"
        >
          <header className="notif-dropdown-header">
            <div className="notif-dropdown-header-text">
              <span className="notif-dropdown-eyebrow">RECORDATORIOS</span>
              <h3 className="notif-dropdown-title">Tus citas próximas</h3>
            </div>
            <button
              type="button"
              className="notif-close-btn"
              onClick={cerrarPanel}
              aria-label="Cerrar notificaciones"
            >
              <X size={16} color="#414845" />
            </button>
          </header>

          <div className="notif-dropdown-body">
            {cargando ? (
              <p className="notif-empty-text">Consultando tus recordatorios…</p>
            ) : errorCitas ? (
              <p className="notif-empty-text" role="alert">No se pudieron consultar tus citas. Cierra y vuelve a abrir las notificaciones para reintentar.</p>
            ) : totalProximas === 0 ? (
              <div className="notif-empty-box">
                <CalendarClock size={24} color="#596763" aria-hidden="true" />
                <p className="notif-empty-title">No tienes citas próximas</p>
                <p className="notif-empty-text">
                  Cuando agendes una cita, aquí verás un recordatorio con el tiempo restante.
                </p>
                <Link
                  to="/agendar-cita"
                  className="notif-cta-btn"
                  onClick={() => setAbierto(false)}
                >
                  <span>Agendar cita</span>
                  <ArrowRight size={14} color="#FFFFFF" />
                </Link>
              </div>
            ) : (
              <ul className="notif-list">
                {citasProximas.map((cita) => {
                  const tiempo = calcularTiempoRestanteCita(cita.fecha_hora_inicio, ahora);
                  return (
                    <li key={cita.id_cita} className="notif-item">
                      <div className="notif-item-top">
                        <span
                          className={`notif-countdown-pill${
                            tiempo.esUrgente ? ' is-urgent' : ''
                          }`}
                        >
                          <Clock3 size={12} aria-hidden="true" />
                          {tiempo.etiqueta}
                        </span>
                        <span className="notif-service-tag">
                          {cita.nombre_servicio || 'Consulta programada'}
                        </span>
                      </div>

                      <p className="notif-clinic-name">
                        {cita.nombre_clinica || 'Centro de salud'}
                      </p>

                      <p className="notif-date-text">
                        {formatearFechaCita(cita.fecha_hora_inicio)}
                      </p>

                      {cita.municipio_clinica && (
                        <p className="notif-location-text">
                          <MapPin size={12} aria-hidden="true" />
                          {cita.municipio_clinica}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <footer className="notif-dropdown-footer">
            <Link
              to="/mis-citas"
              className="notif-footer-link"
              onClick={() => setAbierto(false)}
            >
              <span>Ver todas mis citas</span>
              <ArrowRight size={14} color="#001D14" />
            </Link>
          </footer>
        </section>
      )}
    </div>
  );
}

/**
 * BannerRecordatorioCitas - Aviso destacado para mostrar en la vista de Inicio
 * la cita más cercana del usuario y cuánto tiempo falta para acudir.
 */
export function BannerRecordatorioCitas({ sesion }) {
  const [citas, setCitas] = useState([]);
  const [ahora, setAhora] = useState(() => Date.now());

  const esUsuarioNormal = !sesion?.tipo || sesion?.tipo === 'usuario';

  useEffect(() => {
    if (!esUsuarioNormal) return undefined;
    let activo = true;
    consultarCitasUsuario({ segundoPlano: true })
      .then((res) => {
        if (!activo) return;
        setCitas(Array.isArray(res?.citas) ? res.citas : []);
        setAhora(Date.now());
      })
      .catch(() => {
        if (!activo) return;
        setCitas([]);
      });
    return () => {
      activo = false;
    };
  }, [esUsuarioNormal]);

  const proximas = useMemo(() => filtrarCitas(citas, 'proximas', ahora), [citas, ahora]);

  if (!esUsuarioNormal || proximas.length === 0) return null;

  const siguienteCita = proximas[0];
  const tiempo = calcularTiempoRestanteCita(siguienteCita.fecha_hora_inicio, ahora);

  return (
    <section className="notif-banner" aria-label="Recordatorio de próxima cita">
      <div className="notif-banner-left">
        <div className="notif-banner-icon" aria-hidden="true">
          <Bell size={18} color="#FFFFFF" />
        </div>
        <div className="notif-banner-content">
          <div className="notif-banner-badges">
            <span className="notif-banner-eyebrow">RECORDATORIO DE CITA PRÓXIMA</span>
            <span className={`notif-countdown-pill${tiempo.esUrgente ? ' is-urgent' : ''}`}>
              <Clock3 size={12} aria-hidden="true" />
              {tiempo.etiqueta}
            </span>
          </div>
          <h2 className="notif-banner-title">
            {siguienteCita.nombre_servicio || 'Atención programada'} en{' '}
            {siguienteCita.nombre_clinica || 'tu centro seleccionado'}
          </h2>
          <p className="notif-banner-desc">
            Programada para el <strong>{formatearFechaCita(siguienteCita.fecha_hora_inicio)}</strong>
            {proximas.length > 1
              ? ` · Tienes ${proximas.length - 1} cita${proximas.length - 1 === 1 ? '' : 's'} adicional${proximas.length - 1 === 1 ? '' : 'es'} programada${proximas.length - 1 === 1 ? '' : 's'}.`
              : '.'}
          </p>
        </div>
      </div>

      <Link to="/mis-citas" className="notif-banner-btn">
        <span>Ver mis citas</span>
        <ArrowRight size={14} color="#FFFFFF" />
      </Link>
    </section>
  );
}
