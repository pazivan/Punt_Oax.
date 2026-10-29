/**
 * TarjetaClinica - Tarjeta resumida de sede según diseño de Figma (ventana Mapa).
 *
 * Contrato de propiedades (Props):
 * @param {Object} props
 * @param {Object} props.clinica - Datos de la clínica/sede.
 * @param {string|number} props.clinica.id_clinica - Identificador único.
 * @param {string} props.clinica.nombre - Nombre del centro (ej. "Punto Fijo de Detección – Dirección de Sanidad").
 * @param {string|null} [props.clinica.municipio] - Municipio en Oaxaca.
 * @param {string|null} [props.clinica.etiqueta_ubicacion] - Etiqueta corta para el badge superior.
 * @param {string|null} [props.clinica.direccion] - Dirección o referencia geográfica.
 * @param {string[]} [props.clinica.servicios] - Chips de servicios (#C5EBDA).
 * @param {string|null} [props.clinica.horario] - Horario de atención (ej. "Lun. a vie. · 09:00 - 13:00 h").
 * @param {string} [props.clinica.costo] - Indicador de costo (ej. "Gratuito").
 * @param {boolean} [props.seleccionada=false] - Si está activa (borde 2px #C5EBDA y botón oscuro).
 * @param {(clinica: Object) => void} [props.onSeleccionar] - Callback al seleccionar la tarjeta en el mapa.
 * @param {(clinica: Object) => void} [props.onVerDetalles] - Callback al pulsar el botón "Ver detalles".
 */
export default function TarjetaClinica({
  clinica,
  seleccionada = false,
  onSeleccionar,
  onVerDetalles,
}) {
  if (!clinica) return null;

  const servicios = Array.isArray(clinica.servicios) ? clinica.servicios : [];
  const etiquetaSuperior = clinica.etiqueta_ubicacion || clinica.municipio || 'Oaxaca';
  const textoUbicacion = clinica.direccion || clinica.municipio || 'Oaxaca';
  const textoCosto = clinica.costo || 'Gratuito';
  const esGratuito = textoCosto.toLowerCase() === 'gratuito';

  const manejarSeleccion = () => {
    if (typeof onSeleccionar === 'function') {
      onSeleccionar(clinica);
    }
  };

  const manejarVerDetalles = (e) => {
    e.stopPropagation();
    if (typeof onVerDetalles === 'function') {
      onVerDetalles(clinica);
    } else if (typeof onSeleccionar === 'function') {
      onSeleccionar(clinica);
    }
  };

  return (
    <article
      className={`mapa-card ${seleccionada ? 'is-selected' : ''}`}
      onClick={manejarSeleccion}
      aria-label={clinica.nombre}
    >
      {/* Fila superior: Badge de municipio/zona + ícono en tarjeta seleccionada */}
      <div className="mapa-card-top-row">
        <span className="mapa-card-pill-badge">{etiquetaSuperior}</span>

        {seleccionada && (
          <span className="mapa-card-fav-icon" aria-hidden="true">
            <svg width="19" height="18" viewBox="0 0 19 18" fill="none">
              <path
                d="M9.5 17.5L8.17 16.29C3.45 12.01 0.33 9.18 0.33 5.71C0.33 2.88 2.55 0.67 5.37 0.67C6.97 0.67 8.5 1.41 9.5 2.58C10.5 1.41 12.03 0.67 13.63 0.67C16.45 0.67 18.67 2.88 18.67 5.71C18.67 9.18 15.55 12.01 10.83 16.3L9.5 17.5Z"
                fill="#001D14"
              />
            </svg>
          </span>
        )}
      </div>

      {/* Heading 3 -> Nombre del centro */}
      <h3 className="mapa-card-heading">{clinica.nombre}</h3>

      {/* Fila de dirección / municipio con ícono de pin */}
      <div className="mapa-card-location-row">
        <span className="mapa-card-pin-icon" aria-hidden="true">
          <svg width="11" height="14" viewBox="0 0 11 14" fill="none">
            <path
              d="M5.33 0C2.39 0 0 2.39 0 5.33C0 9.33 5.33 13.33 5.33 13.33C5.33 13.33 10.67 9.33 10.67 5.33C10.67 2.39 8.28 0 5.33 0ZM5.33 7.2C4.3 7.2 3.47 6.36 3.47 5.33C3.47 4.3 4.3 3.47 5.33 3.47C6.36 3.47 7.2 4.3 7.2 5.33C7.2 6.36 6.36 7.2 5.33 7.2Z"
              fill="#414845"
            />
          </svg>
        </span>
        <span className="mapa-card-location-text">{textoUbicacion}</span>
      </div>

      {/* Chips de servicios (#C5EBDA) */}
      {servicios.length > 0 && (
        <div className="mapa-card-tags-margin">
          <div className="mapa-card-tags-row">
            {servicios.map((servicio) => (
              <span key={servicio} className="mapa-card-service-tag">
                {servicio}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Horario (ej. Lun. a vie. · 09:00 - 13:00 h) */}
      {clinica.horario && (
        <div className="mapa-card-schedule-row">
          <span className="mapa-card-schedule-text">{clinica.horario}</span>
        </div>
      )}

      {/* Pie de tarjeta: Costo + Botón Ver detalles */}
      <div className="mapa-card-bottom-row">
        <span className={`mapa-card-cost ${esGratuito ? 'is-free' : 'is-fee'}`}>
          {textoCosto}
        </span>

        <button
          type="button"
          onClick={manejarVerDetalles}
          className={seleccionada ? 'mapa-card-btn-solid' : 'mapa-card-btn-link'}
        >
          <span>Ver detalles</span>
          <span className="mapa-card-btn-arrow" aria-hidden="true">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path
                d="M5.33 0L4.39 0.94L8.11 4.67H0V6H8.11L4.39 9.73L5.33 10.67L10.67 5.33L5.33 0Z"
                fill={seleccionada ? '#FFFFFF' : '#001D14'}
              />
            </svg>
          </span>
        </button>
      </div>
    </article>
  );
}
