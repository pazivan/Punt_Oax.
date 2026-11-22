import { ChevronLeft, ChevronRight } from 'lucide-react'

const TAMANOS_PAGINA = [10, 20, 50]

export default function Paginacion({
  paginaActual,
  totalPaginas,
  totalRegistros,
  limite,
  mostrando,
  onCambiarPagina,
  onCambiarLimite,
  etiquetaRegistros = 'registros',
}) {
  const inicio = totalRegistros === 0 ? 0 : (paginaActual - 1) * limite + 1
  const fin = totalRegistros === 0 ? 0 : Math.min(inicio + mostrando - 1, totalRegistros)

  return (
    <nav className="admin-paginacion" aria-label="Paginación de registros">
      <div className="admin-paginacion-resumen">
        Mostrando <strong>{inicio}</strong>–<strong>{fin}</strong> de <strong>{totalRegistros}</strong> {etiquetaRegistros}
      </div>

      <div className="admin-paginacion-controles">
        <label className="admin-paginacion-limite">
          <span>Por página</span>
          <select
            value={limite}
            onChange={(e) => onCambiarLimite(Number(e.target.value))}
            aria-label="Registros por página"
          >
            {TAMANOS_PAGINA.map((tamano) => (
              <option key={tamano} value={tamano}>{tamano}</option>
            ))}
          </select>
        </label>

        <div className="admin-paginacion-botones">
          <button
            type="button"
            className="admin-btn admin-btn--outline"
            onClick={() => onCambiarPagina(paginaActual - 1)}
            disabled={paginaActual <= 1}
          >
            <ChevronLeft size={16} aria-hidden="true" />
            Anterior
          </button>

          <span className="admin-paginacion-estado" aria-live="polite">
            Página <strong>{paginaActual}</strong> de <strong>{Math.max(1, totalPaginas)}</strong>
          </span>

          <button
            type="button"
            className="admin-btn admin-btn--outline"
            onClick={() => onCambiarPagina(paginaActual + 1)}
            disabled={paginaActual >= totalPaginas}
          >
            Siguiente
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </nav>
  )
}
