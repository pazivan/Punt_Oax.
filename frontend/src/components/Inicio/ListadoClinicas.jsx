import TarjetaClinica from './TarjetaClinica.jsx';

/**
 * ListadoClinicas - Columna izquierda de tarjetas resumidas en la ventana Mapa.
 *
 * Contrato de propiedades (Props):
 * @param {Object} props
 * @param {Array<Object>} props.clinicas - Lista de clínicas filtradas y sin duplicados.
 * @param {string|number|null} [props.clinicaSeleccionadaId] - ID de la clínica seleccionada.
 * @param {(clinica: Object) => void} [props.onSeleccionarClinica] - Función al elegir una tarjeta.
 * @param {(clinica: Object) => void} [props.onVerDetallesClinica] - Función al pulsar "Ver detalles".
 * @param {boolean} [props.cargando=false] - Estado de carga.
 */
export default function ListadoClinicas({
  clinicas = [],
  clinicaSeleccionadaId = null,
  onSeleccionarClinica,
  onVerDetallesClinica,
  cargando = false,
}) {
  return (
    <div className="mapa-listado-column">
      <div className="mapa-listado-counter-wrap">
        <span className="mapa-listado-counter-text" role="status">
          {cargando
            ? 'Cargando centros…'
            : `${clinicas.length} ${clinicas.length === 1 ? 'centro disponible' : 'centros disponibles'}`}
        </span>
      </div>

      <div className="mapa-listado-cards-stack" role="list">
        {clinicas.map((clinica) => (
          <div key={clinica.id_clinica} role="listitem">
            <TarjetaClinica
              clinica={clinica}
              seleccionada={clinicaSeleccionadaId === clinica.id_clinica}
              onSeleccionar={onSeleccionarClinica}
              onVerDetalles={onVerDetallesClinica}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
