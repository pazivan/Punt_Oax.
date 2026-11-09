import { MapPin, Minus, Plus } from 'lucide-react';

/**
 * EspacioMapa - Contenedor reservado y contrato de propiedades para el mapa de Jonathan.
 *
 * Implementa el diseño oficial de Figma para el bloque derecho de la ventana Mapa
 * (670.67px x 700px, #EDEEED, border-radius 16px, badge superior con blur,
 * marcadores circulares con anillo #C5EBDA y botones de zoom +/-).
 *
 * Contrato de propiedades (Props) para el mapa de Jonathan:
 * @param {Object} props
 * @param {Array<Object>} props.clinicas - Centros filtrados a representar en el mapa.
 * @param {Object|null} [props.clinicaSeleccionada=null] - Centro activo seleccionado.
 * @param {(clinica: Object) => void} [props.onSeleccionarClinica] - Callback al pulsar un marcador.
 * @param {(clinica: Object) => void} [props.onVerDetallesClinica] - Callback para abrir la ficha del centro.
 * @param {string} [props.filtroServicio=''] - Servicio activo en el filtro.
 * @param {string} [props.filtroMunicipio=''] - Municipio activo en el filtro.
 * @param {string} [props.terminoBusqueda=''] - Texto del buscador.
 * @param {React.ComponentType} [props.ComponenteMapa] - Componente de mapa de Jonathan (opcional).
 * @param {React.ReactNode} [props.children] - Contenido hijo alternativo.
 */
export default function EspacioMapa({
  clinicas = [],
  clinicaSeleccionada = null,
  onSeleccionarClinica,
  onVerDetallesClinica,
  filtroServicio = '',
  filtroMunicipio = '',
  terminoBusqueda = '',
  ComponenteMapa = null,
  children,
}) {
  if (ComponenteMapa) {
    return (
      <div className="mapa-right-column">
        <div className="mapa-canvas-card">
          <ComponenteMapa
            clinicas={clinicas}
            clinicaSeleccionada={clinicaSeleccionada}
            onSeleccionarClinica={onSeleccionarClinica}
            onVerDetallesClinica={onVerDetallesClinica}
            filtroServicio={filtroServicio}
            filtroMunicipio={filtroMunicipio}
            terminoBusqueda={terminoBusqueda}
          />
        </div>
      </div>
    );
  }

  if (children) {
    return (
      <div className="mapa-right-column">
        <div className="mapa-canvas-card">{children}</div>
      </div>
    );
  }

  // Posiciones por defecto de los 4 marcadores según el frame de Figma
  const posicionesPorDefecto = [
    { left: '25%', top: '33.33%', variante: 'dark' },
    { left: '50%', top: '50%', variante: 'green' },
    { left: '70.42%', top: '62.1%', variante: 'dark' },
    { left: '33.33%', top: '70.43%', variante: 'dark' },
  ];

  return (
    <div className="mapa-right-column" aria-label="Mapa de centros en Oaxaca">
      <div className="mapa-canvas-card">
        <div className="mapa-canvas-image" aria-hidden="true" />
        <div className="mapa-canvas-gradient" aria-hidden="true" />

        {/* Overlay+OverlayBlur superior izquierdo (251.34px x 36px) */}
        <div className="mapa-top-overlay-pill">
          <span className="mapa-top-overlay-icon" aria-hidden="true">
            <MapPin size={15} color="#001D14" />
          </span>
          <span className="mapa-top-overlay-text">
            {clinicaSeleccionada ? clinicaSeleccionada.nombre : 'Mapa interactivo · Oaxaca'}
          </span>
        </div>

        {/* Marcadores del mapa según Figma */}
        {clinicas.slice(0, 4).map((clinica, idx) => {
          const pos = clinica.posicion_mapa || posicionesPorDefecto[idx % posicionesPorDefecto.length];
          const esVerde = pos.variante === 'green';

          return (
            <button
              key={clinica.id_clinica}
              type="button"
              className={`mapa-marker-pin ${esVerde ? 'variant-green' : 'variant-dark'}`}
              style={{ left: pos.left, top: pos.top }}
              onClick={() => onSeleccionarClinica && onSeleccionarClinica(clinica)}
              title={clinica.nombre}
              aria-label={`Seleccionar ${clinica.nombre} en el mapa`}
            >
              <span className="mapa-marker-icon" aria-hidden="true">
                <MapPin size={13} color={esVerde ? '#789C8D' : '#FFFFFF'} />
              </span>
            </button>
          );
        })}

        {/* Controles de zoom inferior derecho (width: 40px, height: 88px, gap: 8px) */}
        <div className="mapa-zoom-controls">
          <button type="button" className="mapa-zoom-btn" aria-label="Acercar mapa">
            <Plus size={15} color="#001D14" />
          </button>
          <button type="button" className="mapa-zoom-btn" aria-label="Alejar mapa">
            <Minus size={15} color="#001D14" />
          </button>
        </div>
      </div>
    </div>
  );
}
