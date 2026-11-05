import { ArrowRight, Clock, Heart, MapPin } from 'lucide-react';

/**
 * TarjetaClinica - Tarjeta resumida de sede según diseño de Figma (ventana Mapa)
 * y columnas exactas del archivo Filtración (Unidad de Salud, Municipio, Dirección,
 * Servicios, Horario y Nivel de Atención).
 *
 * Contrato de propiedades (Props):
 * @param {Object} props
 * @param {Object} props.clinica - Datos de la clínica/sede.
 * @param {string|number} props.clinica.id_clinica - Identificador único (columna Id).
 * @param {string} props.clinica.nombre - Nombre del centro (columna Unidad de Salud).
 * @param {string|null} [props.clinica.municipio] - Municipio en Oaxaca (columna Municipio).
 * @param {string|null} [props.clinica.etiqueta_ubicacion] - Etiqueta corta para el badge superior.
 * @param {string|null} [props.clinica.direccion] - Dirección o referencia geográfica (columna Dirección).
 * @param {string[]} [props.clinica.servicios] - Chips de servicios (#C5EBDA).
 * @param {string|null} [props.clinica.horario] - Horario de atención visible en la tarjeta (columna Horario).
 * @param {string|null} [props.clinica.nivel_atencion] - Nivel de atención en la tarjeta (columna Nivel de Atención).
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
  const textoHorario = clinica.horario || 'Horario no especificado';
  const textoNivel = clinica.nivel_atencion
    ? `Nivel: ${clinica.nivel_atencion}`
    : 'Nivel no especificado';

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
            <Heart size={17} color="#001D14" fill="#001D14" />
          </span>
        )}
      </div>

      {/* Heading 3 -> Nombre del centro */}
      <h3 className="mapa-card-heading">{clinica.nombre}</h3>

      {/* Fila de dirección / municipio con ícono de pin */}
      <div className="mapa-card-location-row">
        <span className="mapa-card-pin-icon" aria-hidden="true">
          <MapPin size={13} color="#414845" />
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

      {/* Horario visible en todas las fichas con ícono de reloj */}
      <div className="mapa-card-schedule-row">
        <span className="mapa-card-clock-icon" aria-hidden="true">
          <Clock size={13} color="#596763" />
        </span>
        <span className="mapa-card-schedule-text">{textoHorario}</span>
      </div>

      {/* Pie de tarjeta: Nivel de Atención (del archivo CSV) + Botón Ver detalles */}
      <div className="mapa-card-bottom-row">
        <span className={`mapa-card-cost ${clinica.nivel_atencion ? 'is-free' : 'is-fee'}`}>
          {textoNivel}
        </span>

        <button
          type="button"
          onClick={manejarVerDetalles}
          className={seleccionada ? 'mapa-card-btn-solid' : 'mapa-card-btn-link'}
        >
          <span>Ver detalles</span>
          <span className="mapa-card-btn-arrow" aria-hidden="true">
            <ArrowRight size={13} color={seleccionada ? '#FFFFFF' : '#001D14'} />
          </span>
        </button>
      </div>
    </article>
  );
}
