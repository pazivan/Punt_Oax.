import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import './DetalleCentro.css';

// Íconos SVG ligeros: no requieren dependencias adicionales.
function Icono({ tipo, size = 17 }) {
  const paths = {
    reloj: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    costo: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M6 9h.01M18 15h.01" /></>,
    documento: <><path d="M7 3h7l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path d="M14 3v5h4M9 12h6M9 16h6" /></>,
    telefono: <><path d="M6.6 3.6 9 6l-1.5 2.2a16 16 0 0 0 8.3 8.3L18 15l2.4 2.4-1.3 3c-.4.8-1.4 1.2-2.2 1A19 19 0 0 1 2.6 7.1c-.2-.8.2-1.8 1-2.2l3-1.3Z" /></>,
    ubicacion: <><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    flecha: <><path d="M19 12H5M12 19l-7-7 7-7" /></>,
    siguiente: <><path d="M5 12h14M12 5l7 7-7 7" /></>,
    usuario: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  };

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[tipo]}
    </svg>
  );
}

function Dato({ icono, etiqueta, children, anchoCompleto = false }) {
  return (
    <div className={`detalle-dato${anchoCompleto ? ' detalle-dato--ancho' : ''}`}>
      <Icono tipo={icono} size={16} />
      <div>
        <span className="detalle-dato-etiqueta">{etiqueta}</span>
        <div className="detalle-dato-valor">{children}</div>
      </div>
    </div>
  );
}

export default function DetalleCentro({ sesion, onSalir }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [centro, setCentro] = useState(null);
  const [estado, setEstado] = useState('cargando');

  useEffect(() => {
    let activo = true;
    // Datos temporales del proyecto original: cambiar por la API cuando esté lista.
    // No se ha cambiado la integración de datos en esta adaptación visual.
    const temporizador = window.setTimeout(() => {
      if (!activo) return;
      setCentro({
        id,
        nombre: 'Punto Fijo de Detección – Dirección de Sanidad',
        nivelAtencion: 'COESIDA-CAPASITS',
        municipio: 'Oaxaca de Juárez',
        entidad: 'Oaxaca y zona metropolitana',
        descripcion: 'Pruebas de VIH, sífilis y hepatitis C. Orientación y consejería asociada al servicio.',
        servicios: ['Detección de ITS', 'Orientación'],
        horario: 'Lun. a vie., 09:00–10:30 y 11:30–13:00 h',
        costo: 'Gratuito',
        requisitos: 'Presentar CURP',
        telefono: '951 516 8365',
        correo: null,
        direccion: 'Mártires de Tacubaya 315, Col. Centro, Oaxaca de Juárez',
        // El enlace del mock anterior terminaba en /ejemplo y no era válido.
        ubicacionMaps: null,
      });
      setEstado('exito');
    }, 800);

    return () => {
      activo = false;
      window.clearTimeout(temporizador);
    };
  }, [id]);

  const volverAlMapa = () => {
    // Conserva la navegación anterior; un enlace directo vuelve al directorio.
    if (window.history.state?.idx > 0) navigate(-1);
    else navigate('/');
  };

  // Si cambia :id, evitamos mostrar el centro anterior mientras carga el nuevo.
  const estadoVista = centro?.id === id ? estado : 'cargando';

  // La búsqueda del mapa utiliza la dirección disponible, sin inventar coordenadas.
  const consultaMapa = centro?.direccion ? encodeURIComponent(`${centro.direccion}, Oaxaca, México`) : '';
  const mapaEmbed = consultaMapa ? `https://www.google.com/maps?q=${consultaMapa}&output=embed` : '';
  const mapaUrl = consultaMapa ? `https://www.google.com/maps/search/?api=1&query=${consultaMapa}` : '';

  return (
    <div className="detalle-de-centro">
      <header className="detalle-site-header">
        <div className="detalle-site-header__inner">
          <Link to="/" className="detalle-logo">PuntoOax</Link>
          <nav className="detalle-nav" aria-label="Navegación principal">
            <Link to="/">Inicio</Link>
            <Link className="detalle-nav__activo" to="/">Explorar mapa</Link>
            <span title="Sección pendiente de integración">Mis citas</span>
            <span title="Sección pendiente de integración">Orientación</span>
          </nav>
          <div className="detalle-nav-cuenta">
            <Link to={sesion ? '/cuenta' : '/login'}>Mi cuenta</Link>
            {sesion ? (
              <button type="button" className="detalle-btn-salir" onClick={onSalir}>Salir</button>
            ) : (
              <Link className="detalle-btn-salir" to="/login">Ingresar</Link>
            )}
            <Link className="detalle-usuario" to={sesion ? '/cuenta' : '/login'} aria-label="Abrir mi cuenta">
              <Icono tipo="usuario" size={17} />
            </Link>
          </div>
        </div>
      </header>

      <main className="detalle-contenido">
        <div className="detalle-page-wrapper">
          <button type="button" onClick={volverAlMapa} className="detalle-btn-volver">
            <Icono tipo="flecha" size={16} /> VOLVER AL MAPA
          </button>

          {estadoVista === 'cargando' ? (
            <div className="detalle-estado" role="status"><span className="detalle-spinner" />Cargando información del centro...</div>
          ) : estado === 'error' ? (
            <div className="detalle-estado" role="alert">No se pudo cargar el centro. Intenta nuevamente.</div>
          ) : estado === 'no-encontrado' ? (
            <div className="detalle-estado">Centro no encontrado. Revisa el enlace o vuelve al directorio.</div>
          ) : (
            <>
              <div className="detalle-titulo">
                <h1>{centro.nombre}</h1>
                <p>{[centro.municipio, centro.entidad].filter(Boolean).join(' · ')}</p>
              </div>

              <div className="detalle-columnas">
                <section className="detalle-panel detalle-informacion" aria-labelledby="detalle-info-titulo">
                  {centro.nivelAtencion && <span className="detalle-insignia">{centro.nivelAtencion}</span>}
                  <h2 id="detalle-info-titulo">Información general</h2>
                  <p className="detalle-descripcion">{centro.descripcion || 'Descripción por confirmar.'}</p>

                  <h3 className="detalle-subtitulo-seccion">Servicios</h3>
                  <div className="detalle-etiquetas">
                    {centro.servicios?.length
                      ? centro.servicios.map((servicio, i) => <span key={`${servicio}-${i}`} className="detalle-etiqueta">{servicio}</span>)
                      : <span className="detalle-pendiente">Servicios por confirmar</span>}
                  </div>

                  <h3 className="detalle-subtitulo-seccion">Datos del centro</h3>
                  <div className="detalle-datos-grid">
                    <Dato icono="reloj" etiqueta="Horario">{centro.horario || 'Por confirmar'}</Dato>
                    <Dato icono="costo" etiqueta="Costo">{centro.costo || 'Por confirmar'}</Dato>
                    <Dato icono="documento" etiqueta="Requisitos">{centro.requisitos || 'Por confirmar'}</Dato>
                    <Dato icono="telefono" etiqueta="Teléfono">
                      {centro.telefono ? <a href={`tel:${centro.telefono.replace(/\s+/g, '')}`}>{centro.telefono}</a> : 'No disponible'}
                    </Dato>
                    <Dato icono="ubicacion" etiqueta="Dirección" anchoCompleto>{centro.direccion || 'Dirección por confirmar'}</Dato>
                  </div>

                  <div className="detalle-antes">
                    <h3>Antes de tu visita</h3>
                    <p>Para las pruebas rápidas presenta tu CURP. Puedes acudir sin cita previa durante el horario de atención indicado.</p>
                    <span className="detalle-etiqueta detalle-etiqueta--fuerte">Atención presencial</span>
                  </div>
                </section>

                <aside className="detalle-panel detalle-ubicacion" aria-label="Ubicación y visita">
                  <h2>Ubicación</h2>
                  <p className="detalle-ubicacion-direccion">{centro.direccion || 'Dirección por confirmar'}</p>
                  {mapaEmbed ? (
                    <div className="detalle-mapa">
                      <iframe title={`Mapa de ${centro.nombre}`} src={mapaEmbed} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen />
                    </div>
                  ) : <div className="detalle-mapa detalle-mapa--pendiente">Mapa pendiente de integrar</div>}
                  {mapaUrl && <a className="detalle-mapa-enlace" href={mapaUrl} target="_blank" rel="noreferrer">Ver ubicación en Google Maps ↗</a>}

                  <h3>Organiza tu visita</h3>
                  <p className="detalle-ayuda">Elige la fecha y el horario que mejor se adapten a ti.</p>
                  <button type="button" className="detalle-btn-agendar" disabled title="La función de citas aún no está integrada">
                    Agendar cita <Icono tipo="siguiente" size={17} />
                  </button>
                  <p className="detalle-accion-nota">Próximamente disponible</p>
                </aside>
              </div>
            </>
          )}
        </div>
      </main>

      <footer className="detalle-footer">© 2024 PuntoOax. Salud, bienestar y orientación en Oaxaca.</footer>
    </div>
  );
}
