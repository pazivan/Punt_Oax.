import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Calendar,
  Check,
  FileText,
  MapPin,
  Star,
  User,
} from 'lucide-react';
import '../../styles/Inicio.css';

/**
 * Inicio - Ventana de inicio para usuario autenticado según diseño de Figma (1280x932).
 *
 * Estructura:
 * - Header (80px): PuntOax, navegación (Inicio activo, Conócenos) y acciones (Mi cuenta, Salir, Avatar).
 * - Main (820px):
 *   - Hero (368px): Badge superior, Heading 1, descripción, botón CTA, 2 indicadores y tarjeta derecha con vista previa + badge Oaxaca.
 *   - Fila de 3 tarjetas (228px): Mapa de centros, Información útil (dirige a /informacion-util) y Agenda tu visita.
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
                <User size={14} color="#FFFFFF" />
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
                  <Star size={14} color="#596763" fill="#596763" />
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
                    <ArrowRight size={14} color="#FFFFFF" />
                  </span>
                </Link>
              </div>

              {/* Indicadores con ícono check (Nimbus Sans 12px) */}
              <div className="inicio-hero-checks-row">
                <div className="inicio-hero-check-item">
                  <span className="inicio-hero-check-icon" aria-hidden="true">
                    <Check size={13} color="#001D14" strokeWidth={2.5} />
                  </span>
                  <span className="inicio-hero-check-text">Consulta confidencial</span>
                </div>

                <div className="inicio-hero-check-item">
                  <span className="inicio-hero-check-icon" aria-hidden="true">
                    <Check size={13} color="#001D14" strokeWidth={2.5} />
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
                    <MapPin size={15} color="#001D14" />
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
                  <MapPin size={16} color="#001D14" />
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
                    <ArrowRight size={13} color="#001D14" />
                  </span>
                </div>
              </div>
            </Link>

            {/* Tarjeta 2: Información útil -> Consultar dirige a la ventana de Información útil (/informacion-util) */}
            <Link to="/informacion-util" className="inicio-feature-card">
              <div className="inicio-feature-card-body">
                <div className="inicio-feature-icon-box" aria-hidden="true">
                  <FileText size={16} color="#001D14" />
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
                    <ArrowRight size={13} color="#001D14" />
                  </span>
                </div>
              </div>
            </Link>

            {/* Tarjeta 3: Agenda tu visita */}
            <a href="#agenda-visita" className="inicio-feature-card">
              <div className="inicio-feature-card-body">
                <div className="inicio-feature-icon-box" aria-hidden="true">
                  <Calendar size={16} color="#001D14" />
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
                    <ArrowRight size={13} color="#001D14" />
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
