import { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

/**
 * FiltroDesplegable - Selector desplegable accesible y estilizado con la identidad PuntOax.
 */
export default function FiltroDesplegable({
  value,
  onChange,
  options = [],
  ariaLabel,
  className = '',
}) {
  const [abierto, setAbierto] = useState(false);
  const [indiceActivo, setIndiceActivo] = useState(0);
  const contenedorRef = useRef(null);
  const botonRef = useRef(null);
  const listaId = useId();

  const indiceSeleccionado = Math.max(
    0,
    options.findIndex((opt) => opt.value === value)
  );
  const opcionActual = options[indiceSeleccionado] || options[0] || { label: '', value: '' };

  useEffect(() => {
    if (!abierto) return undefined;
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
  }, [abierto]);

  const seleccionar = (val) => {
    onChange?.(val);
    setAbierto(false);
    botonRef.current?.focus();
  };

  const manejarTecladoBoton = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!abierto) {
        setIndiceActivo(indiceSeleccionado);
        setAbierto(true);
      } else if (e.key === 'Enter' || e.key === ' ') {
        const opt = options[indiceActivo];
        if (opt) seleccionar(opt.value);
      } else {
        setIndiceActivo((i) => Math.min(options.length - 1, i + 1));
      }
    } else if (e.key === 'ArrowUp' && abierto) {
      e.preventDefault();
      setIndiceActivo((i) => Math.max(0, i - 1));
    }
  };

  return (
    <div
      ref={contenedorRef}
      className={`mapa-dropdown ${abierto ? 'is-open' : ''} ${className}`.trim()}
    >
      <button
        ref={botonRef}
        type="button"
        className="mapa-dropdown-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-controls={listaId}
        onClick={() => {
          setIndiceActivo(indiceSeleccionado);
          setAbierto((prev) => !prev);
        }}
        onKeyDown={manejarTecladoBoton}
      >
        <span className="mapa-dropdown-label">{opcionActual.label}</span>
        <ChevronDown size={15} className="mapa-dropdown-chevron" aria-hidden="true" />
      </button>

      {abierto && (
        <ul
          id={listaId}
          role="listbox"
          aria-label={ariaLabel}
          className="mapa-dropdown-menu"
        >
          {options.map((opt, idx) => {
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
          })}
        </ul>
      )}
    </div>
  );
}
