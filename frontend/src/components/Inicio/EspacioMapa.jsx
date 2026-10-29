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
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path
                d="M7.5 0C3.91 0 1 2.91 1 6.5C1 11.375 7.5 15 7.5 15C7.5 15 14 11.375 14 6.5C14 2.91 11.09 0 7.5 0ZM7.5 9C6.12 9 5 7.88 5 6.5C5 5.12 6.12 4 7.5 4C8.88 4 10 5.12 10 6.5C10 7.88 8.88 9 7.5 9Z"
                fill="#001D14"
              />
            </svg>
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
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M6 0C2.69 0 0 2.69 0 6C0 9.31 2.69 12 6 12C9.31 12 12 9.31 12 6C12 2.69 9.31 0 6 0ZM6 8C4.9 8 4 7.1 4 6C4 4.9 4.9 4 6 4C7.1 4 8 4.9 8 6C8 7.1 7.1 8 6 8Z"
                    fill={esVerde ? '#789C8D' : '#FFFFFF'}
                  />
                </svg>
              </span>
            </button>
          );
        })}

        {/* Controles de zoom inferior derecho (width: 40px, height: 88px, gap: 8px) */}
        <div className="mapa-zoom-controls">
          <button type="button" className="mapa-zoom-btn" aria-label="Acercar mapa">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M14 8H8V14H6V8H0V6H6V0H8V6H14V8Z" fill="#001D14" />
            </svg>
          </button>
          <button type="button" className="mapa-zoom-btn" aria-label="Alejar mapa">
            <svg width="14" height="2" viewBox="0 0 14 2" fill="none">
              <rect width="14" height="2" fill="#001D14" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
