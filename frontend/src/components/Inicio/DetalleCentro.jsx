import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Clock,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
  User,
} from 'lucide-react';
import '../../styles/Inicio.css';

/**
 * DetalleCentro - Ventana "Detalle de centro - PuntoOax" según diseño oficial de Figma (1280x1218),
 * mostrando única y exclusivamente las columnas existentes en el archivo oficial de Filtración:
 * - Id
 * - Entidad Federativa y Municipio
 * - Unidad de Salud (nombre)
 * - Nivel de Atención
 * - Dirección
 * - Teléfono
 * - Horario
 * - Correo electrónico
 * - Servicios
 * - Requisitos
 * - Fuente
 * - Ubicacion maps
 * - Links relacionados
 * Si una celda viene vacía en el archivo (null), se indica explícitamente "No especificado".
 *
 * Contrato de propiedades (Props):
 * @param {Object} props
 * @param {Object} props.clinica - Sede seleccionada para mostrar su información completa.
 * @param {Object|null} [props.sesion] - Sesión activa del usuario.
 * @param {() => void} [props.onSalir] - Función para cerrar sesión.
 * @param {() => void} [props.onVolverAlMapa] - Callback para regresar a la ventana de Mapa.
 * @param {(clinica: Object) => void} [props.onAgendarCita] - Callback al pulsar el botón "Agendar cita".
 */
export default function DetalleCentro({
  clinica,
  sesion,
  onSalir,
  onVolverAlMapa,
  onAgendarCita,
}) {
  if (!clinica) return null;

  const nombreOCorreo = sesion?.cuenta?.nombre || sesion?.cuenta?.correo || 'Mi cuenta';
  const servicios = Array.isArray(clinica.servicios) ? clinica.servicios : [];
  const linksRelacionados = Array.isArray(clinica.links_relacionados)
    ? clinica.links_relacionados.filter(Boolean)
    : [];
  const tieneUrlMaps =
    typeof clinica.ubicacion_maps === 'string' &&
    clinica.ubicacion_maps.trim().startsWith('http');

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

            <nav className="inicio-nav agendar-header-nav" aria-label="Navegación principal">
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
              <Link to="/agendar-cita" className="inicio-nav-link">
                Agendar cita
              </Link>
              <Link to="/informacion-util" className="inicio-nav-link">
                Información útil
              </Link>
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
                  <ArrowLeft size={14} color="#001D14" />
                </span>
                <span className="detalle-back-text">Volver al directorio</span>
              </button>
            </div>
          </div>

          {/* Header Title & Subtitle:margin */}
          <div className="detalle-header-margin">
            <div className="detalle-header-block">
              <h1 className="detalle-heading-title">{clinica.nombre}</h1>
              <p className="detalle-heading-subtitle">
                {`${clinica.municipio || 'No especificado'} · ${clinica.entidad_federativa || 'Oaxaca'}`}
              </p>
            </div>
          </div>

          {/* Main Content Grid */}
          <div className="detalle-content-grid">
            {/* Left Column: General Info & Center Details */}
            <section className="detalle-left-card" aria-label="Información general y datos del centro">
              {/* Category Tag + Nivel de Atención (si existe en el CSV) */}
              <div className="detalle-category-tag-wrap" style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '8px' }}>
                <span className="detalle-category-pill">
                  {clinica.etiqueta_categoria || 'ATENCIÓN EN SALUD'}
                </span>
                {clinica.nivel_atencion && (
                  <span className="detalle-category-pill">
                    {`Nivel de atención: ${clinica.nivel_atencion}`}
                  </span>
                )}
              </div>

              {/* Servicios registrados en la columna "Servicios" del archivo */}
              <div className="detalle-general-info">
                <h2 className="detalle-section-h2">Servicios registrados</h2>
                <p className="detalle-general-desc">
                  {clinica.servicios_texto || 'No especificados'}
                </p>
              </div>

              {/* Chips de servicios */}
              {servicios.length > 0 && (
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
              )}

              {/* Center Data Grid (Columnas exactas del archivo Filtración) */}
              <div className="detalle-data-grid-section">
                <h3 className="detalle-section-h3">Datos del centro</h3>

                {/* Fila 1: Horario y Nivel de Atención */}
                <div className="detalle-data-row">
                  <div className="detalle-data-box">
                    <div className="detalle-data-label-row">
                      <span className="detalle-data-icon" aria-hidden="true">
                        <Clock size={14} color="#414845" />
                      </span>
                      <span className="detalle-data-label">Horario</span>
                    </div>
                    <p className="detalle-data-value">
                      {clinica.horario || 'No especificado'}
                    </p>
                  </div>

                  <div className="detalle-data-box">
                    <div className="detalle-data-label-row">
                      <span className="detalle-data-icon" aria-hidden="true">
                        <Building2 size={14} color="#414845" />
                      </span>
                      <span className="detalle-data-label">Nivel de Atención</span>
                    </div>
                    <p className="detalle-data-value">
                      {clinica.nivel_atencion || 'No especificado'}
                    </p>
                  </div>
                </div>

                {/* Fila 2: Teléfono y Correo electrónico */}
                <div className="detalle-data-row">
                  <div className="detalle-data-box">
                    <div className="detalle-data-label-row">
                      <span className="detalle-data-icon" aria-hidden="true">
                        <Phone size={13} color="#414845" />
                      </span>
                      <span className="detalle-data-label">Teléfono</span>
                    </div>
                    <p className="detalle-data-value">
                      {clinica.telefono || 'No especificado'}
                    </p>
                  </div>

                  <div className="detalle-data-box">
                    <div className="detalle-data-label-row">
                      <span className="detalle-data-icon" aria-hidden="true">
                        <Mail size={14} color="#414845" />
                      </span>
                      <span className="detalle-data-label">Correo electrónico</span>
                    </div>
                    <p className="detalle-data-value">
                      {clinica.correo_contacto || 'No especificado'}
                    </p>
                  </div>
                </div>

                {/* Fila 3: Municipio / Entidad Federativa e Id de registro */}
                <div className="detalle-data-row">
                  <div className="detalle-data-box">
                    <div className="detalle-data-label-row">
                      <span className="detalle-data-icon" aria-hidden="true">
                        <MapPin size={14} color="#414845" />
                      </span>
                      <span className="detalle-data-label">Municipio y Entidad Federativa</span>
                    </div>
                    <p className="detalle-data-value">
                      {clinica.municipio || 'No especificado'}, {clinica.entidad_federativa || 'Oaxaca'}
                    </p>
                  </div>

                  <div className="detalle-data-box">
                    <div className="detalle-data-label-row">
                      <span className="detalle-data-label">ID de registro</span>
                    </div>
                    <p className="detalle-data-value">
                      {clinica.id_clinica || 'No especificado'}
                    </p>
                  </div>
                </div>

                {/* Fila 4: Dirección (columna Dirección) */}
                <div className="detalle-data-box detalle-data-box-full">
                  <div className="detalle-data-label-row">
                    <span className="detalle-data-icon" aria-hidden="true">
                      <MapPin size={14} color="#414845" />
                    </span>
                    <span className="detalle-data-label">Dirección</span>
                  </div>
                  <p className="detalle-data-value">
                    {clinica.direccion || 'No especificada'}
                  </p>
                </div>

                {/* Fila 5: Fuente y Links relacionados */}
                <div className="detalle-data-box detalle-data-box-full">
                  <div className="detalle-data-label-row">
                    <span className="detalle-data-label">Fuente y Links relacionados</span>
                  </div>
                  <p className="detalle-data-value" style={{ wordBreak: 'break-word' }}>
                    {clinica.fuente || 'No especificada'}
                  </p>
                  {linksRelacionados.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
                      {linksRelacionados.map((url) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="info-util-source-link"
                          style={{ padding: '6px 12px', fontSize: '12px' }}
                        >
                          <span>Abrir link relacionado</span>
                          <ExternalLink size={12} aria-hidden="true" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Requisitos (columna Requisitos del archivo CSV) */}
              <div className="detalle-before-visit">
                <h3 className="detalle-before-visit-title">Requisitos</h3>
                <p className="detalle-before-visit-text">
                  {clinica.requisitos || 'No especificados'}
                </p>
              </div>
            </section>

            {/* Right Column: Location Map & Appointment Scheduling */}
            <aside className="detalle-right-card" aria-label="Ubicación y organización de visita">
              {/* Ubicación Title & Address */}
              <div className="detalle-ubicacion-header">
                <h2 className="detalle-section-h2">Ubicación</h2>
                <p className="detalle-ubicacion-address">
                  {clinica.direccion || 'No especificada'}
                </p>
              </div>

              {/* Map View (389.33px x 288px) */}
              <div className="detalle-map-view">
                <div className="detalle-map-floating-pin" aria-hidden="true">
                  <MapPin size={15} color="#FFFFFF" />
                </div>
              </div>

              {/* Ubicacion maps (columna Ubicacion maps del archivo CSV) */}
              {tieneUrlMaps ? (
                <a
                  href={clinica.ubicacion_maps}
                  target="_blank"
                  rel="noreferrer"
                  className="info-util-source-link"
                  style={{ width: '100%', justifyContent: 'center', boxSizing: 'border-box' }}
                >
                  <span>Abrir ubicación en Google Maps</span>
                  <ExternalLink size={13} aria-hidden="true" />
                </a>
              ) : (
                clinica.ubicacion_maps && (
                  <p className="detalle-ubicacion-address" style={{ fontSize: '13px' }}>
                    {clinica.ubicacion_maps}
                  </p>
                )
              )}

              {/* Visit Organization */}
              <div className="detalle-visit-org">
                <h3 className="detalle-before-visit-title">Organiza tu visita</h3>
                <p className="detalle-ubicacion-address">
                  Elige la fecha y el horario que mejor se adapten a ti.
                </p>
              </div>

              {/* Action Button -> Button (height: 52px) */}
              {typeof onAgendarCita === 'function' ? (
                <button
                  type="button"
                  onClick={() => onAgendarCita(clinica)}
                  className="detalle-schedule-btn"
                >
                  <span className="detalle-schedule-btn-text">Agendar cita</span>
                  <span className="detalle-schedule-btn-icon" aria-hidden="true">
                    <ArrowRight size={14} color="#FFFFFF" />
                  </span>
                </button>
              ) : (
                <Link
                  to="/agendar-cita"
                  className="detalle-schedule-btn"
                  style={{ textDecoration: 'none' }}
                >
                  <span className="detalle-schedule-btn-text">Agendar cita</span>
                  <span className="detalle-schedule-btn-icon" aria-hidden="true">
                    <ArrowRight size={14} color="#FFFFFF" />
                  </span>
                </Link>
              )}
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
