import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

/**
 * FiltroDesplegable - Selector desplegable accesible y estilizado con la identidad PuntOax.
 * Soporta búsqueda interna opcional cuando `searchable` es verdadero.
 */
export default function FiltroDesplegable({
  value,
  onChange,
  options = [],
  ariaLabel,
  placeholder = 'Selecciona una opción',
  searchable = false,
  searchPlaceholder = 'Buscar…',
  emptyMessage = 'No se encontraron coincidencias.',
  disabled = false,
  className = '',
}) {
  const [abierto, setAbierto] = useState(false);
  const [indiceActivo, setIndiceActivo] = useState(0);
  const [busqueda, setBusqueda] = useState('');
  const contenedorRef = useRef(null);
  const botonRef = useRef(null);
  const inputBusquedaRef = useRef(null);
  const listaId = useId();

  const opcionActual = options.find((opt) => opt.value === value) || null;
  const opcionesFiltradas = useMemo(() => {
    if (!searchable || !busqueda.trim()) return options;
    const q = busqueda.trim().toLocaleLowerCase('es');
    return options.filter((opt) => String(opt.label || '').toLocaleLowerCase('es').includes(q));
  }, [options, searchable, busqueda]);

  const indiceSeleccionado = Math.max(
    0,
    opcionesFiltradas.findIndex((opt) => opt.value === value)
  );

  useEffect(() => {
    if (!abierto) return undefined;
    if (searchable) {
      requestAnimationFrame(() => inputBusquedaRef.current?.focus());
    }
    const manejarClickFuera = (e) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target)) {
        setAbierto(false);
      }
    };
    const manejarEscape = (e) => {
      if (e.key === 'Escape') {
        setAbierto(false);
        botonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', manejarClickFuera);
    document.addEventListener('keydown', manejarEscape);
    return () => {
      document.removeEventListener('mousedown', manejarClickFuera);
      document.removeEventListener('keydown', manejarEscape);
    };
  }, [abierto, searchable]);

  const seleccionar = (val) => {
    onChange?.(val);
    setAbierto(false);
    setBusqueda('');
    botonRef.current?.focus();
  };

  const manejarTecladoBoton = (e) => {
    if (disabled) return;
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!abierto) {
        setIndiceActivo(indiceSeleccionado);
        setAbierto(true);
      } else if (e.key === 'Enter' || e.key === ' ') {
        const opt = opcionesFiltradas[indiceActivo];
        if (opt) seleccionar(opt.value);
      } else {
        setIndiceActivo((i) => Math.min(Math.max(0, opcionesFiltradas.length - 1), i + 1));
      }
    } else if (e.key === 'ArrowUp' && abierto) {
      e.preventDefault();
      setIndiceActivo((i) => Math.max(0, i - 1));
    }
  };

  return (
    <div
      ref={contenedorRef}
      className={`mapa-dropdown ${abierto ? 'is-open' : ''} ${disabled ? 'is-disabled' : ''} ${className}`.trim()}
    >
      <button
        ref={botonRef}
        type="button"
        className={`mapa-dropdown-trigger ${!opcionActual ? 'is-placeholder' : ''}`}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-controls={listaId}
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setIndiceActivo(indiceSeleccionado);
          setBusqueda('');
          setAbierto((prev) => !prev);
        }}
        onKeyDown={manejarTecladoBoton}
      >
        <span className="mapa-dropdown-label">{opcionActual ? opcionActual.label : placeholder}</span>
        <ChevronDown size={15} className="mapa-dropdown-chevron" aria-hidden="true" />
      </button>

      {abierto && (
        <div className="mapa-dropdown-popover">
          {searchable && (
            <div className="mapa-dropdown-search-wrap">
              <Search size={14} className="mapa-dropdown-search-icon" aria-hidden="true" />
              <input
                ref={inputBusquedaRef}
                type="search"
                value={busqueda}
                onChange={(e) => {
                  setBusqueda(e.target.value);
                  setIndiceActivo(0);
                }}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="mapa-dropdown-search-input"
              />
            </div>
          )}
          <ul
            id={listaId}
            role="listbox"
            aria-label={ariaLabel}
            className="mapa-dropdown-menu"
          >
            {opcionesFiltradas.length === 0 ? (
              <li className="mapa-dropdown-empty">{emptyMessage}</li>
            ) : (
              opcionesFiltradas.map((opt, idx) => {
                const seleccionada = opt.value === value;
                const enfocada = idx === indiceActivo;
                return (
                  <li
                    key={opt.value}
                    role="option"
                    aria-selected={seleccionada}
                    className={`mapa-dropdown-option ${seleccionada ? 'is-selected' : ''} ${enfocada ? 'is-focused' : ''}`}
                    onMouseEnter={() => setIndiceActivo(idx)}
                    onClick={() => seleccionar(opt.value)}
                  >
                    <span className="mapa-dropdown-option-text">{opt.label}</span>
                    {seleccionada && <Check size={14} className="mapa-dropdown-check" aria-hidden="true" />}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
