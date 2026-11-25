import { ChevronLeft, ChevronRight } from 'lucide-react';
import TarjetaClinica from './TarjetaClinica.jsx';

/**
 * ListadoClinicas - Columna de tarjetas resumidas en la ventana Mapa.
 * Soporta paginación móvil (máx. 5 fichas por página) conservando el conteo total
 * de centros filtrados.
 */
export default function ListadoClinicas({
  clinicas = [],
  totalClinicas = null,
  paginacion = null,
  contenedorRef = null,
  clinicaSeleccionadaId = null,
  favoritosIds = [],
  onAlternarFavorito,
  onSeleccionarClinica,
  onVerDetallesClinica,
  cargando = false,
  vacioTexto = 'No hay centros disponibles.',
}) {
  const totalReal = typeof totalClinicas === 'number' ? totalClinicas : clinicas.length;
  const mostrarPaginacion = Boolean(
    !cargando &&
    paginacion &&
    totalReal > paginacion.porPagina &&
    paginacion.totalPaginas > 1
  );

  const inicioRango = totalReal === 0 || !paginacion
    ? 0
    : (paginacion.paginaActual - 1) * paginacion.porPagina + 1;
  const finRango = totalReal === 0 || !paginacion
    ? 0
    : Math.min(inicioRango + clinicas.length - 1, totalReal);

  return (
    <div ref={contenedorRef} className="mapa-listado-column">
      <div className="mapa-listado-counter-wrap">
        <span className="mapa-listado-counter-text" role="status">
          {cargando
            ? 'Cargando centros…'
            : mostrarPaginacion
              ? `${totalReal} ${totalReal === 1 ? 'centro encontrado' : 'centros encontrados'} · Mostrando ${inicioRango}–${finRango}`
              : `${totalReal} ${totalReal === 1 ? 'centro disponible' : 'centros disponibles'}`}
        </span>
      </div>

      <div className="mapa-listado-cards-stack" role="list">
        {!cargando && clinicas.length === 0 && <p role="status">{vacioTexto}</p>}
        {clinicas.map((clinica) => (
          <div key={clinica.id_clinica} role="listitem" className="mapa-listado-item">
            <TarjetaClinica
              clinica={clinica}
              seleccionada={clinicaSeleccionadaId === clinica.id_clinica}
              esFavorita={favoritosIds.includes(clinica.id_clinica)}
              onAlternarFavorito={onAlternarFavorito}
              onSeleccionar={onSeleccionarClinica}
              onVerDetalles={onVerDetallesClinica}
            />
          </div>
        ))}
      </div>

      {mostrarPaginacion && (
        <nav className="mapa-paginacion" aria-label="Paginación de centros encontrados">
          <button
            type="button"
            className="mapa-paginacion-btn"
            onClick={() => paginacion.onCambiarPagina(paginacion.paginaActual - 1)}
            disabled={paginacion.paginaActual <= 1}
            aria-label="Página anterior de centros"
          >
            <ChevronLeft size={16} aria-hidden="true" />
            <span>Anterior</span>
          </button>

          <span className="mapa-paginacion-info" aria-live="polite">
            Página <strong>{paginacion.paginaActual}</strong> de <strong>{paginacion.totalPaginas}</strong>
          </span>

          <button
            type="button"
            className="mapa-paginacion-btn"
            onClick={() => paginacion.onCambiarPagina(paginacion.paginaActual + 1)}
            disabled={paginacion.paginaActual >= paginacion.totalPaginas}
            aria-label="Página siguiente de centros"
          >
            <span>Siguiente</span>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </nav>
      )}
    </div>
  );
}
