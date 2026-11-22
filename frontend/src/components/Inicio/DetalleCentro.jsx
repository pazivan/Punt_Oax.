import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Clock,
  ExternalLink,
  Heart,
  Mail,
  MapPin,
  Phone,
} from 'lucide-react';
import EncabezadoUsuario from './EncabezadoUsuario.jsx';
import PiePagina from './PiePagina.jsx';
import MapaLeaflet from './MapaLeaflet.jsx';
import EncabezadoClinica from '../Clinica/EncabezadoClinica.jsx';
import '../../styles/Inicio.css';
import { normalizarUrlExterna, urlEnTexto } from '../../utils/enlaces.js';
import { ubicacionConfirmada } from '../../utils/centros.js';
import { formatearDistanciaKm } from '../../utils/cercania.js';

/**
 * DetalleCentro - Ventana "Detalle de centro - PuntoOax" según diseño oficial de Figma (1280x1218),
 * mostrando única y exclusivamente las columnas existentes en el archivo oficial de Filtración:
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
  sinEncabezado = false,
  esFavorita = false,
  onAlternarFavorito,
}) {
  if (!clinica) return null;

  const esUsuario = !sesion || sesion.tipo === 'usuario';
  const servicios = Array.isArray(clinica.servicios) ? clinica.servicios : [];
  const linksRelacionados = Array.isArray(clinica.links_relacionados)
    ? clinica.links_relacionados.filter(Boolean)
    : [];
  const fuenteUrl = urlEnTexto(clinica.fuente);
  const enlacesGestionados = Array.isArray(clinica.enlaces_informacion)
    ? clinica.enlaces_informacion : [];
  const fuentes = [
    ...(fuenteUrl ? [{ titulo: 'Fuente original', url: fuenteUrl }] : []),
    ...linksRelacionados.map((texto, indice) => ({
      titulo: `Enlace relacionado ${indice + 1}`, url: urlEnTexto(texto),
    })),
    ...enlacesGestionados,
  ].filter(({ url }) => normalizarUrlExterna(url));
  const mapaUrl = normalizarUrlExterna(clinica.ubicacion_maps);
  const correoContacto = typeof clinica.correo_contacto === 'string'
    ? clinica.correo_contacto.trim()
    : '';
  const tieneUrlMaps = Boolean(mapaUrl);
  const etiquetaDistancia = formatearDistanciaKm(clinica.distancia_km);
  const tieneUbicacionConfirmada = ubicacionConfirmada(clinica);
  const clinicaAutenticadaId =
    sesion?.tipo === 'clinica' ? (sesion?.cuenta?.id_clinica || sesion?.cuenta?.id || null) : null;

  return (
    <div className="detalle-page">
      {/* Header (80px) */}
      {!sinEncabezado && (
        sesion?.tipo === 'clinica' ? (
          <EncabezadoClinica sesion={sesion} onSalir={onSalir} />
        ) : (
          <EncabezadoUsuario
            sesion={sesion}
            onSalir={onSalir}
            seccionActiva="mapa"
            onClicMapa={onVolverAlMapa}
          />
        )
      )}

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
                <span className="detalle-back-text">Volver al mapa</span>
              </button>
            </div>
          </div>

          {/* Header Title & Subtitle:margin */}
          <div className="detalle-header-margin">
            <div className="detalle-header-block">
              <div className="detalle-header-top-row">
                <h1 className="detalle-heading-title">{clinica.nombre}</h1>
                {typeof onAlternarFavorito === 'function' && (
                  <button
                    type="button"
                    className={`detalle-fav-btn ${esFavorita ? 'is-favorite' : ''}`}
                    aria-pressed={esFavorita}
                    onClick={() => onAlternarFavorito(clinica)}
                  >
                    <Heart
                      size={15}
                      color={esFavorita ? '#FFFFFF' : '#C0262D'}
                      fill={esFavorita ? '#FFFFFF' : 'none'}
                      aria-hidden="true"
                    />
                    <span>{esFavorita ? 'En favoritos' : 'Agregar a favoritos'}</span>
                  </button>
                )}
              </div>
              <p className="detalle-heading-subtitle">
                {`${clinica.municipio || 'No especificado'} · ${clinica.entidad_federativa || 'Oaxaca'}${etiquetaDistancia ? ` · ${etiquetaDistancia}` : ''}`}
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
                      {correoContacto
                        ? <a href={`mailto:${correoContacto}`}>{correoContacto}</a>
                        : 'No especificado'}
                    </p>
                  </div>
                </div>

                {/* Fila 3: Municipio / Entidad Federativa */}
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
                    <span className="detalle-data-label">Fuentes de información</span>
                  </div>
                  {clinica.fuente && !fuenteUrl && (
                    <p className="detalle-data-value">{clinica.fuente}</p>
                  )}
                  {fuenteUrl && clinica.fuente !== fuenteUrl && (
                    <p className="detalle-data-value">{clinica.fuente}</p>
                  )}
                  {fuentes.length ? (
                    <div className="detalle-fuentes-lista">
                      {fuentes.map(({ titulo, url }, indice) => (
                        <a key={`${indice}-${url}`} href={normalizarUrlExterna(url)}
                          target="_blank" rel="noopener noreferrer"
                          className="info-util-source-link detalle-fuente-boton">
                          <span>{titulo}</span>
                          <ExternalLink size={14} aria-hidden="true" />
                        </a>
                      ))}
                    </div>
                  ) : !clinica.fuente && (
                    <p className="detalle-data-value">No especificadas</p>
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

              {/* Mapa real centrado en la clínica solo cuando la ubicación está confirmada */}
              <div className="detalle-map-view">
                <MapaLeaflet
                  clinicas={tieneUbicacionConfirmada ? [clinica] : []}
                  clinicaSeleccionada={tieneUbicacionConfirmada ? clinica : null}
                  clinicaAutenticadaId={clinicaAutenticadaId}
                  mostrarLeyenda={false}
                  zoomInicial={15}
                />
              </div>

              {/* Ubicacion maps (columna Ubicacion maps del archivo CSV) */}
              {tieneUrlMaps ? (
                <a
                  href={mapaUrl}
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

              {/* Solo pacientes pueden agendar; administración y clínicas no. */}
              {esUsuario && <>
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
              </>}
            </aside>
          </div>
        </div>
      </main>

      <PiePagina />
    </div>
  );
}
