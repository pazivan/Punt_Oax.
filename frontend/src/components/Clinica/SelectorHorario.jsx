import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

function parsearHora(valor) {
  if (typeof valor === 'string' && /^([01]\d|2[0-3]):([0-5]\d)$/.test(valor.trim())) {
    const [h, m] = valor.trim().split(':').map(Number)
    return { horas: h, minutos: m }
  }
  return { horas: 9, minutos: 0 }
}

function formatearDosDigitos(numero) {
  return String(numero).padStart(2, '0')
}

/**
 * SelectorHorario - Selector de hora reutilizable (HH:MM) con flechas de incremento/decremento
 * para horas y minutos, entrada manual por teclado y controles táctiles accesibles.
 */
export default function SelectorHorario({
  id,
  value = '09:00',
  onChange,
  disabled = false,
  invalid = false,
  ariaDescribedBy,
  ariaLabel = 'Selector de horario',
}) {
  const { horas, minutos } = parsearHora(value)
  const [borradorHora, setBorradorHora] = useState(null)
  const [borradorMinuto, setBorradorMinuto] = useState(null)

  const textoHora = borradorHora !== null ? borradorHora : formatearDosDigitos(horas)
  const textoMinuto = borradorMinuto !== null ? borradorMinuto : formatearDosDigitos(minutos)

  const emitir = (nuevaHora, nuevoMinuto) => {
    const h = ((nuevaHora % 24) + 24) % 24
    const m = ((nuevoMinuto % 60) + 60) % 60
    onChange?.(`${formatearDosDigitos(h)}:${formatearDosDigitos(m)}`)
  }

  const manejarCambioHora = (e) => {
    const soloDigitos = e.target.value.replace(/\D/g, '').slice(0, 2)
    setBorradorHora(soloDigitos)
    if (soloDigitos.length === 2) {
      const n = Number(soloDigitos)
      if (n >= 0 && n <= 23) emitir(n, minutos)
    }
  }

  const confirmarHora = () => {
    if (borradorHora !== null) {
      const n = Number(borradorHora)
      const valida = borradorHora !== '' && Number.isFinite(n) ? Math.min(23, Math.max(0, n)) : horas
      emitir(valida, minutos)
      setBorradorHora(null)
    }
  }

  const manejarCambioMinuto = (e) => {
    const soloDigitos = e.target.value.replace(/\D/g, '').slice(0, 2)
    setBorradorMinuto(soloDigitos)
    if (soloDigitos.length === 2) {
      const n = Number(soloDigitos)
      if (n >= 0 && n <= 59) emitir(horas, n)
    }
  }

  const confirmarMinuto = () => {
    if (borradorMinuto !== null) {
      const n = Number(borradorMinuto)
      const valida = borradorMinuto !== '' && Number.isFinite(n) ? Math.min(59, Math.max(0, n)) : minutos
      emitir(horas, valida)
      setBorradorMinuto(null)
    }
  }

  const manejarTeclaHora = (e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setBorradorHora(null)
      emitir(horas + 1, minutos)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setBorradorHora(null)
      emitir(horas - 1, minutos)
    }
  }

  const manejarTeclaMinuto = (e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setBorradorMinuto(null)
      emitir(horas, minutos + 1)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setBorradorMinuto(null)
      emitir(horas, minutos - 1)
    }
  }

  return (
    <div
      className={`selector-horario ${invalid ? 'is-invalid' : ''} ${disabled ? 'is-disabled' : ''}`}
      role="group"
      aria-label={ariaLabel}
    >
      <div className="selector-horario-col">
        <button
          type="button"
          className="selector-horario-btn"
          onClick={() => { setBorradorHora(null); emitir(horas + 1, minutos) }}
          disabled={disabled}
          aria-label="Aumentar hora"
          tabIndex={-1}
        >
          <ChevronUp size={15} aria-hidden="true" />
        </button>
        <input
          id={id}
          type="text"
          inputMode="numeric"
          role="spinbutton"
          aria-label="Horas"
          aria-valuemin={0}
          aria-valuemax={23}
          aria-valuenow={horas}
          aria-invalid={invalid || undefined}
          aria-describedby={ariaDescribedBy}
          className="selector-horario-input"
          value={textoHora}
          disabled={disabled}
          maxLength={2}
          onChange={manejarCambioHora}
          onBlur={confirmarHora}
          onKeyDown={manejarTeclaHora}
        />
        <button
          type="button"
          className="selector-horario-btn"
          onClick={() => { setBorradorHora(null); emitir(horas - 1, minutos) }}
          disabled={disabled}
          aria-label="Disminuir hora"
          tabIndex={-1}
        >
          <ChevronDown size={15} aria-hidden="true" />
        </button>
      </div>

      <span className="selector-horario-sep" aria-hidden="true">:</span>

      <div className="selector-horario-col">
        <button
          type="button"
          className="selector-horario-btn"
          onClick={() => { setBorradorMinuto(null); emitir(horas, minutos + 5) }}
          disabled={disabled}
          aria-label="Aumentar minutos"
          tabIndex={-1}
        >
          <ChevronUp size={15} aria-hidden="true" />
        </button>
        <input
          type="text"
          inputMode="numeric"
          role="spinbutton"
          aria-label="Minutos"
          aria-valuemin={0}
          aria-valuemax={59}
          aria-valuenow={minutos}
          aria-invalid={invalid || undefined}
          className="selector-horario-input"
          value={textoMinuto}
          disabled={disabled}
          maxLength={2}
          onChange={manejarCambioMinuto}
          onBlur={confirmarMinuto}
          onKeyDown={manejarTeclaMinuto}
        />
        <button
          type="button"
          className="selector-horario-btn"
          onClick={() => { setBorradorMinuto(null); emitir(horas, minutos - 5) }}
          disabled={disabled}
          aria-label="Disminuir minutos"
          tabIndex={-1}
        >
          <ChevronDown size={15} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
