import { Link } from 'react-router-dom';
import '../../styles/Inicio.css';

/**
 * Inicio - Ventana de inicio para usuario autenticado según diseño de Figma (1280x932).
 *
 * Estructura:
 * - Header (80px): PuntOax, navegación (Inicio activo, Conócenos) y acciones (Mi cuenta, Salir, Avatar).
 * - Main (820px):
 *   - Hero (368px): Badge superior, Heading 1, descripción, botón CTA, 2 indicadores y tarjeta derecha con vista previa + badge Oaxaca.
 *   - Fila de 3 tarjetas (228px): Mapa de centros, Información útil (dirige a /mapa) y Agenda tu visita.
 * - Footer (112px): Texto institucional centrado.
 */
export default function Inicio({ sesion, onSalir }) {
  const nombreOCorreo = sesion?.cuenta?.nombre || sesion?.cuenta?.correo || 'Mi cuenta';

  return (
    <div className="inicio-page">
      {/* Header (80px) */}
      <header className="inicio-header">
        <div className="inicio-header-container">
          <div className="inicio-header-left">
            <div className="inicio-brand-wrap">
              <span className="inicio-brand">PuntOax</span>
            </div>

            <nav className="inicio-nav" aria-label="Navegación principal">
              <Link to="/cuenta" className="inicio-nav-link active">
                <span className="inicio-nav-link-active-text">Inicio</span>
              </Link>
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
      <main className="inicio-main">
        <div className="inicio-container">
          {/* Bloque superior (1232px x 368px) */}
          <section className="inicio-hero-section" aria-labelledby="inicio-hero-heading">
            {/* Columna izquierda (height: 292px, gap: 24px) */}
            <div className="inicio-hero-left">
              {/* Background badge (#D6E6E0) */}
              <div className="inicio-hero-badge">
                <span className="inicio-hero-badge-icon" aria-hidden="true">
                  <svg width="15" height="14" viewBox="0 0 15 14" fill="none">
                    <path
                      d="M7.33 0L9.5 4.6L14.67 5.2L10.8 8.7L11.8 14L7.33 11.4L2.87 14L3.87 8.7L0 5.2L5.17 4.6L7.33 0Z"
                      fill="#596763"
                    />
                  </svg>
                </span>
                <span className="inicio-hero-badge-text">SALUD SEXUAL EN OAXACA</span>
              </div>

              {/* Heading 1 → Información clara para encontrar atención en Oaxaca. */}
              <h1 id="inicio-hero-heading" className="inicio-hero-heading">
                Información clara para encontrar atención en Oaxaca.
              </h1>

              {/* Descripción (max-width: 576px, height: 48px) */}
              <div className="inicio-hero-desc-wrap">
                <p className="inicio-hero-desc">
                  Consulta centros verificados de detección de ITS e interrupción legal del embarazo, conoce sus servicios y organiza tu visita con tranquilidad.
                </p>
              </div>

              {/* Botón CTA (#103328, 222.19px x 56px) */}
              <div className="inicio-hero-cta-wrap">
                <Link to="/mapa" className="inicio-hero-cta-link">
                  <span className="inicio-hero-cta-text">Explorar mapa</span>
                  <span className="inicio-hero-cta-icon" aria-hidden="true">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M6 0L4.9425 1.0575L9.1275 5.25H0V6.75H9.1275L4.9425 10.9425L6 12L12 6L6 0Z"
                        fill="#789C8D"
                      />
                    </svg>
                  </span>
                </Link>
              </div>

              {/* Indicadores con ícono check (Nimbus Sans 12px) */}
              <div className="inicio-hero-checks-row">
                <div className="inicio-hero-check-item">
                  <span className="inicio-hero-check-icon" aria-hidden="true">
                    <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                      <path
                        d="M3.65 6.35L0.92 3.62L0 4.54L3.65 8.19L10.87 0.97L9.95 0.05L3.65 6.35Z"
                        fill="#001D14"
                      />
                    </svg>
                  </span>
                  <span className="inicio-hero-check-text">Consulta confidencial</span>
                </div>

                <div className="inicio-hero-check-item">
                  <span className="inicio-hero-check-icon" aria-hidden="true">
                    <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                      <path
                        d="M3.65 6.35L0.92 3.62L0 4.54L3.65 8.19L10.87 0.97L9.95 0.05L3.65 6.35Z"
                        fill="#001D14"
                      />
                    </svg>
                  </span>
                  <span className="inicio-hero-check-text">Centros verificados</span>
                </div>
              </div>
            </div>

            {/* Columna derecha: Background+Shadow (height: 368px, padding: 24px) */}
            <div className="inicio-hero-right-card">
              <div className="inicio-hero-preview-frame">
                <div className="inicio-hero-preview-gradient" aria-hidden="true" />

                {/* Overlay+Shadow+OverlayBlur (178.5px x 64px) */}
                <div className="inicio-hero-floating-badge">
                  <span className="inicio-pin-icon" aria-hidden="true">
                    <svg width="12" height="15" viewBox="0 0 12 15" fill="none">
                      <path
                        d="M6 0C2.68629 0 0 2.68629 0 6C0 10.5 6 15 6 15C6 15 12 10.5 12 6C12 2.68629 9.31371 0 6 0ZM6 8.25C4.75736 8.25 3.75 7.24264 3.75 6C3.75 4.75736 4.75736 3.75 6 3.75C7.24264 3.75 8.25 4.75736 8.25 6C8.25 7.24264 7.24264 8.25 6 8.25Z"
                        fill="#001D14"
                      />
                    </svg>
                  </span>
                  <div className="inicio-floating-badge-texts">
                    <span className="inicio-floating-title">Oaxaca</span>
                    <span className="inicio-floating-subtitle">Centros cercanos</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Fila inferior de 3 tarjetas (1232px x 228px, gap: 24px) */}
          <section
            id="mapa-centros"
            className="inicio-features-row"
            aria-label="Secciones principales"
          >
            {/* Tarjeta 1: Mapa de centros */}
            <Link to="/mapa" className="inicio-feature-card">
              <div className="inicio-feature-card-body">
                <div className="inicio-feature-icon-box" aria-hidden="true">
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                    <path
                      d="M7.5 0C3.91 0 1 2.91 1 6.5C1 11.375 7.5 15 7.5 15C7.5 15 14 11.375 14 6.5C14 2.91 11.09 0 7.5 0ZM7.5 9C6.12 9 5 7.88 5 6.5C5 5.12 6.12 4 7.5 4C8.88 4 10 5.12 10 6.5C10 7.88 8.88 9 7.5 9Z"
                      fill="#001D14"
                    />
                  </svg>
                </div>

                <div className="inicio-feature-heading-wrap">
                  <h3 className="inicio-feature-heading">Mapa de centros</h3>
                </div>

                <div className="inicio-feature-desc-wrap">
                  <p className="inicio-feature-desc">
                    Explora por municipio y región para encontrar clínicas y centros especializados.
                  </p>
                </div>
              </div>

              <div className="inicio-feature-margin-bottom">
                <div className="inicio-feature-action-row">
                  <span className="inicio-feature-action-text">Explorar</span>
                  <span className="inicio-feature-action-icon" aria-hidden="true">
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                      <path
                        d="M5.33 0L4.39 0.94L8.11 4.67H0V6H8.11L4.39 9.73L5.33 10.67L10.67 5.33L5.33 0Z"
                        fill="#001D14"
                      />
                    </svg>
                  </span>
                </div>
              </div>
            </Link>

            {/* Tarjeta 2: Información útil -> Consultar dirige a la ventana de Mapa (/mapa) */}
            <Link to="/mapa" className="inicio-feature-card">
              <div className="inicio-feature-card-body">
                <div className="inicio-feature-icon-box" aria-hidden="true">
                  <svg width="14" height="17" viewBox="0 0 14 17" fill="none">
                    <path
                      d="M8.5 0H1.75C0.7875 0 0 0.765 0 1.7V15.3C0 16.235 0.7875 17 1.75 17H12.25C13.2125 17 14 16.235 14 15.3V5.1L8.5 0ZM10.5 13.6H3.5V11.9H10.5V13.6ZM10.5 10.2H3.5V8.5H10.5V10.2ZM7.875 5.95V1.275L12.6875 5.95H7.875Z"
                      fill="#001D14"
                    />
                  </svg>
                </div>

                <div className="inicio-feature-heading-wrap">
                  <h3 className="inicio-feature-heading">Información útil</h3>
                </div>

                <div className="inicio-feature-desc-wrap">
                  <p className="inicio-feature-desc">
                    Consulta horarios, tipos de pruebas disponibles y requisitos de atención.
                  </p>
                </div>
              </div>

              <div className="inicio-feature-margin-bottom">
                <div className="inicio-feature-action-row">
                  <span className="inicio-feature-action-text">Consultar</span>
                  <span className="inicio-feature-action-icon" aria-hidden="true">
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                      <path
                        d="M5.33 0L4.39 0.94L8.11 4.67H0V6H8.11L4.39 9.73L5.33 10.67L10.67 5.33L5.33 0Z"
                        fill="#001D14"
                      />
                    </svg>
                  </span>
                </div>
              </div>
            </Link>

            {/* Tarjeta 3: Agenda tu visita */}
            <a href="#agenda-visita" className="inicio-feature-card">
              <div className="inicio-feature-card-body">
                <div className="inicio-feature-icon-box" aria-hidden="true">
                  <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
                    <path
                      d="M14.1667 1.7H13.2222V0H11.3333V1.7H5.66667V0H3.77778V1.7H2.83333C1.785 1.7 0.944444 2.55 0.944444 3.6V15.3C0.944444 16.35 1.785 17 2.83333 17H14.1667C15.215 17 16.0556 16.35 16.0556 15.3V3.6C16.0556 2.55 15.215 1.7 14.1667 1.7ZM14.1667 15.3H2.83333V6.8H14.1667V15.3Z"
                      fill="#001D14"
                    />
                  </svg>
                </div>

                <div className="inicio-feature-heading-wrap">
                  <h3 className="inicio-feature-heading">Agenda tu visita</h3>
                </div>

                <div className="inicio-feature-desc-wrap">
                  <p className="inicio-feature-desc">
                    Elige una fecha y organiza tu atención médica de manera discreta y segura.
                  </p>
                </div>
              </div>

              <div className="inicio-feature-margin-bottom">
                <div className="inicio-feature-action-row">
                  <span className="inicio-feature-action-text">Agendar</span>
                  <span className="inicio-feature-action-icon" aria-hidden="true">
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                      <path
                        d="M5.33 0L4.39 0.94L8.11 4.67H0V6H8.11L4.39 9.73L5.33 10.67L10.67 5.33L5.33 0Z"
                        fill="#001D14"
                      />
                    </svg>
                  </span>
                </div>
              </div>
            </a>
          </section>
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
