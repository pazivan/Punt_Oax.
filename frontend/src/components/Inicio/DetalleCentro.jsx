import { Link } from 'react-router-dom';
import '../../styles/Inicio.css';

/**
 * DetalleCentro - Ventana "Detalle de centro - PuntoOax" según diseño oficial de Figma (1280x1218).
 *
 * Contrato de propiedades (Props):
 * @param {Object} props
 * @param {Object} props.clinica - Sede seleccionada para mostrar su información completa.
 * @param {Object|null} [props.sesion] - Sesión activa del usuario.
 * @param {() => void} [props.onSalir] - Función para cerrar sesión.
 * @param {() => void} [props.onVolverAlMapa] - Callback para regresar a la ventana de Mapa.
 */
export default function DetalleCentro({
  clinica,
  sesion,
  onSalir,
  onVolverAlMapa,
}) {
  if (!clinica) return null;

  const nombreOCorreo = sesion?.cuenta?.nombre || sesion?.cuenta?.correo || 'Mi cuenta';
  const servicios = Array.isArray(clinica.servicios) ? clinica.servicios : [];

  return (
    <div className="detalle-page">
      {/* Header (80px) */}
      <header className="inicio-header">
        <div className="inicio-header-container">
          <div className="inicio-header-left">
            <div className="inicio-brand-wrap">
              <Link to="/cuenta" className="inicio-brand" style={{ textDecoration: 'none' }}>
                PuntOax
              </Link>
            </div>

            <nav className="inicio-nav" aria-label="Navegación principal">
              <Link to="/cuenta" className="inicio-nav-link">
                Inicio
              </Link>
              <button
                type="button"
                onClick={onVolverAlMapa}
                className="inicio-nav-link active detalle-nav-active-btn"
              >
                <span className="inicio-nav-link-active-text">Mapa de centros</span>
              </button>
              <a href="#agenda" className="inicio-nav-link">
                Agenda
              </a>
              <a href="#conocenos" className="inicio-nav-link">
                Conócenos
              </a>
            </nav>
          </div>

          <div className="inicio-header-right">
            <Link
              to="/cuenta"
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
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M6 6C7.65685 6 9 4.65685 9 3C9 1.34315 7.65685 0 6 0C4.34315 0 3 1.34315 3 3C3 4.65685 4.34315 6 6 6ZM6 7.5C3.9975 7.5 0 8.505 0 10.5V12H12V10.5C12 8.505 8.0025 7.5 6 7.5Z"
                    fill="#FFFFFF"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main (padding-top: 80px) */}
      <main className="detalle-main">
        <div className="detalle-container">
          {/* Back Link:margin (height: 44px) */}
          <div className="detalle-back-margin">
            <div className="detalle-back-wrap">
              <button
                type="button"
                onClick={onVolverAlMapa}
                className="detalle-back-link"
              >
                <span className="detalle-back-icon" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path
                      d="M13.33 6.17H3.19L7.85 1.51L6.67 0.33L0 7L6.67 13.67L7.85 12.49L3.19 7.83H13.33V6.17Z"
                      fill="#001D14"
                    />
                  </svg>
                </span>
                <span className="detalle-back-text">Volver al directorio</span>
              </button>
            </div>
          </div>

          {/* Header Title & Subtitle:margin (height: 120px) */}
          <div className="detalle-header-margin">
            <div className="detalle-header-block">
              <h1 className="detalle-heading-title">{clinica.nombre}</h1>
              <p className="detalle-heading-subtitle">
                {clinica.subtitulo_region ||
                  `${clinica.municipio || 'Oaxaca de Juárez'} · Oaxaca y zona metropolitana`}
              </p>
            </div>
          </div>

          {/* Main Content Grid (1232px x 790px) */}
          <div className="detalle-content-grid">
            {/* Left Column: General Info & Center Details (698.67px x 790px, padding: 48px) */}
            <section className="detalle-left-card" aria-label="Información general y datos del centro">
              {/* Category Tag */}
              <div className="detalle-category-tag-wrap">
                <span className="detalle-category-pill">
                  {clinica.etiqueta_categoria || 'DETECCIÓN DE ITS'}
                </span>
              </div>

              {/* General Information */}
              <div className="detalle-general-info">
                <h2 className="detalle-section-h2">Información general</h2>
                <p className="detalle-general-desc">
                  {clinica.descripcion ||
                    'Pruebas de VIH, sífilis y hepatitis C. Orientación y consejería asociada al servicio.'}
                </p>
              </div>

              {/* Services */}
              <div className="detalle-services-block">
                <h3 className="detalle-section-h3">Servicios</h3>
                <div className="detalle-services-chips">
                  {servicios.map((servicio) => (
                    <span key={servicio} className="detalle-service-chip">
                      {servicio}
                    </span>
                  ))}
                </div>
              </div>

              {/* Center Data Grid (Datos del centro) */}
              <div className="detalle-data-grid-section">
                <h3 className="detalle-section-h3">Datos del centro</h3>

                {/* Fila 1: Horario y Costo */}
                <div className="detalle-data-row">
                  <div className="detalle-data-box">
                    <div className="detalle-data-label-row">
                      <span className="detalle-data-icon" aria-hidden="true">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path
                            d="M6.67 0C2.98 0 0 2.98 0 6.67C0 10.35 2.98 13.33 6.67 13.33C10.35 13.33 13.33 10.35 13.33 6.67C13.33 2.98 10.35 0 6.67 0ZM7.33 7.33H4V6H6V2.67H7.33V7.33Z"
                            fill="#414845"
                          />
                        </svg>
                      </span>
                      <span className="detalle-data-label">Horario</span>
                    </div>
                    <p className="detalle-data-value">
                      {clinica.horario_detalle ||
                        clinica.horario ||
                        'Lun. a vie., 09:00–10:30 y 11:30–13:00 h'}
                    </p>
                  </div>

                  <div className="detalle-data-box">
                    <div className="detalle-data-label-row">
                      <span className="detalle-data-icon" aria-hidden="true">
                        <svg width="15" height="11" viewBox="0 0 15 11" fill="none">
                          <path
                            d="M13.33 0H1.33C0.59 0 0 0.59 0 1.33V9.33C0 10.07 0.59 10.67 1.33 10.67H13.33C14.07 10.67 14.67 10.07 14.67 9.33V1.33C14.67 0.59 14.07 0 13.33 0ZM13.33 9.33H1.33V5.33H13.33V9.33ZM13.33 2.67H1.33V1.33H13.33V2.67Z"
                            fill="#414845"
                          />
                        </svg>
                      </span>
                      <span className="detalle-data-label">Costo</span>
                    </div>
                    <p className="detalle-data-value">{clinica.costo || 'Gratuito'}</p>
                  </div>
                </div>

                {/* Fila 2: Requisitos y Teléfono */}
                <div className="detalle-data-row">
                  <div className="detalle-data-box">
                    <div className="detalle-data-label-row">
                      <span className="detalle-data-icon" aria-hidden="true">
                        <svg width="11" height="14" viewBox="0 0 11 14" fill="none">
                          <path
                            d="M6.67 0H1.33C0.6 0 0 0.6 0 1.33V12C0 12.73 0.6 13.33 1.33 13.33H9.33C10.07 13.33 10.67 12.73 10.67 12V4L6.67 0ZM8 10.67H2.67V9.33H8V10.67ZM8 8H2.67V6.67H8V8ZM6 4.67V1L9.67 4.67H6Z"
                            fill="#414845"
                          />
                        </svg>
                      </span>
                      <span className="detalle-data-label">Requisitos</span>
                    </div>
                    <p className="detalle-data-value">{clinica.requisitos || 'Presentar CURP'}</p>
                  </div>

                  <div className="detalle-data-box">
                    <div className="detalle-data-label-row">
                      <span className="detalle-data-icon" aria-hidden="true">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                          <path
                            d="M2.41 5.19C3.37 7.08 4.92 8.62 6.81 9.59L8.28 8.12C8.46 7.94 8.73 7.88 8.96 7.96C9.71 8.21 10.52 8.34 11.33 8.34C11.7 8.34 12 8.64 12 9.01V11.33C12 11.7 11.7 12 11.33 12C5.07 12 0 6.93 0 0.67C0 0.3 0.3 0 0.67 0H3C3.37 0 3.67 0.3 3.67 0.67C3.67 1.5 3.8 2.3 4.05 3.05C4.12 3.28 4.07 3.54 3.88 3.73L2.41 5.19Z"
                            fill="#414845"
                          />
                        </svg>
                      </span>
                      <span className="detalle-data-label">Teléfono</span>
                    </div>
                    <p className="detalle-data-value">
                      {clinica.telefono || 'Sin teléfono registrado'}
                    </p>
                  </div>
                </div>

                {/* Fila 3: Dirección */}
                <div className="detalle-data-box detalle-data-box-full">
                  <div className="detalle-data-label-row">
                    <span className="detalle-data-icon" aria-hidden="true">
                      <svg width="11" height="14" viewBox="0 0 11 14" fill="none">
                        <path
                          d="M5.33 0C2.39 0 0 2.39 0 5.33C0 9.33 5.33 13.33 5.33 13.33C5.33 13.33 10.67 9.33 10.67 5.33C10.67 2.39 8.28 0 5.33 0ZM5.33 7.2C4.3 7.2 3.47 6.36 3.47 5.33C3.47 4.3 4.3 3.47 5.33 3.47C6.36 3.47 7.2 4.3 7.2 5.33C7.2 6.36 6.36 7.2 5.33 7.2Z"
                          fill="#414845"
                        />
                      </svg>
                    </span>
                    <span className="detalle-data-label">Dirección</span>
                  </div>
                  <p className="detalle-data-value">
                    {clinica.direccion || 'Mártires de Tacubaya 315, Col. Centro, Oaxaca de Juárez'}
                  </p>
                </div>
              </div>

              {/* Before Your Visit Section */}
              <div className="detalle-before-visit">
                <h3 className="detalle-before-visit-title">Antes de tu visita</h3>
                <p className="detalle-before-visit-text">
                  {clinica.nota_visita ||
                    'Para las pruebas rápidas presenta tu CURP. Puedes acudir sin cita previa durante el horario de atención indicado.'}
                </p>
                <div className="detalle-before-visit-badge-wrap">
                  <span className="detalle-before-visit-badge">
                    {clinica.etiqueta_visita || 'Atención confidencial'}
                  </span>
                </div>
              </div>
            </section>

            {/* Right Column: Location Map & Appointment Scheduling (485.33px x 612px, padding: 48px) */}
            <aside className="detalle-right-card" aria-label="Ubicación y organización de visita">
              {/* Ubicación Title & Address */}
              <div className="detalle-ubicacion-header">
                <h2 className="detalle-section-h2">Ubicación</h2>
                <p className="detalle-ubicacion-address">
                  {clinica.direccion_corta ||
                    clinica.direccion ||
                    'Mártires de Tacubaya 315, Col. Centro'}
                </p>
              </div>

              {/* Map View (389.33px x 288px) */}
              <div className="detalle-map-view">
                <div className="detalle-map-floating-pin" aria-hidden="true">
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                    <path
                      d="M7.5 0C3.91 0 1 2.91 1 6.5C1 11.375 7.5 15 7.5 15C7.5 15 14 11.375 14 6.5C14 2.91 11.09 0 7.5 0ZM7.5 9C6.12 9 5 7.88 5 6.5C5 5.12 6.12 4 7.5 4C8.88 4 10 5.12 10 6.5C10 7.88 8.88 9 7.5 9Z"
                      fill="#FFFFFF"
                    />
                  </svg>
                </div>
              </div>

              {/* Visit Organization */}
              <div className="detalle-visit-org">
                <h3 className="detalle-before-visit-title">Organiza tu visita</h3>
                <p className="detalle-ubicacion-address">
                  Elige la fecha y el horario que mejor se adapten a ti.
                </p>
              </div>

              {/* Action Button -> Button (height: 52px) */}
              <button type="button" className="detalle-schedule-btn">
                <span className="detalle-schedule-btn-text">Agendar cita</span>
                <span className="detalle-schedule-btn-icon" aria-hidden="true">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M6 0L4.9425 1.0575L9.1275 5.25H0V6.75H9.1275L4.9425 10.9425L6 12L12 6L6 0Z"
                      fill="#FFFFFF"
                    />
                  </svg>
                </span>
              </button>
            </aside>
          </div>
        </div>
      </main>

      {/* Footer (112px) */}
      <footer className="inicio-footer">
        <div className="inicio-footer-container">
          <p className="inicio-footer-text">
            © 2026 PuntOax · Salud, bienestar y orientación en Oaxaca.
          </p>
        </div>
      </footer>
    </div>
  );
}

