import { Trash2 } from 'lucide-react'
import { DIAS } from '../../utils/centros.js'
import SelectorHorario from './SelectorHorario.jsx'

const DIAS_SEMANA = DIAS.map((nombre, numero) => ({ numero, nombre }))

/**
 * EditorHorarios - Componente reutilizable para editar franjas horarias por día.
 * Soporta horarios normales, turnos nocturnos (cruzan medianoche) y 24 horas.
 */
export default function EditorHorarios({
  horarios = [],
  onChange,
  errores = {},
  idPrefijo = 'ficha',
  disabled = false,
  className = '',
}) {
  const franjasDelDia = (dia) =>
    horarios
      .map((horario, indice) => ({ ...horario, indice }))
      .filter((horario) => Number(horario.dia_semana) === dia)

  const alternarDia = (dia) => {
    const franjas = franjasDelDia(dia)
    if (franjas.length) {
      onChange(horarios.filter((h) => Number(h.dia_semana) !== dia))
    } else {
      onChange([
        ...horarios,
        { dia_semana: dia, apertura: '09:00', cierre: '17:00', es_24_horas: false, cruza_medianoche: false },
      ])
    }
  }

  const agregarFranja = (dia) => {
    const franjas = franjasDelDia(dia)
    if (franjas.some((f) => f.es_24_horas)) return
    onChange([
      ...horarios,
      { dia_semana: dia, apertura: '18:00', cierre: '20:00', es_24_horas: false, cruza_medianoche: false },
    ])
  }

  const actualizarFranja = (indice, parche) => {
    onChange(
      horarios.map((h, pos) => (pos === indice ? { ...h, ...parche } : h))
    )
  }

  const eliminarFranja = (indice) => {
    onChange(horarios.filter((_, pos) => pos !== indice))
  }

  return (
    <div className={`ficha-days ${className}`.trim()}>
      {DIAS_SEMANA.map((dia) => {
        const franjas = franjasDelDia(dia.numero)
        const tiene24Horas = franjas.some((f) => f.es_24_horas)

        return (
          <div className={`ficha-day-card ${franjas.length ? 'is-selected' : ''}`} key={dia.numero}>
            <div className="ficha-day-header">
              <label className="ficha-check-row">
                <input
                  id={`${idPrefijo}-dia-${dia.numero}`}
                  type="checkbox"
                  checked={franjas.length > 0}
                  disabled={disabled}
                  onChange={() => alternarDia(dia.numero)}
                />
                <span><strong>{dia.nombre}</strong></span>
              </label>
              {franjas.length > 0 && !tiene24Horas && (
                <button
                  type="button"
                  className="ficha-link-button"
                  disabled={disabled || horarios.length >= 14}
                  onClick={() => agregarFranja(dia.numero)}
                >
                  + Agregar franja
                </button>
              )}
            </div>

            {franjas.map((franja) => {
              const claveError = `horario:${franja.indice}`
              const mensajeError = errores[claveError]
              const es24 = Boolean(franja.es_24_horas)
              const cruza = Boolean(franja.cruza_medianoche)

              return (
                <div className="ficha-time-row-wrap" key={franja.indice}>
                  <div className={`ficha-time-row ${mensajeError ? 'has-error' : ''}`}>
                    {es24 ? (
                      <div className="ficha-24h-badge">
                        Atención continua las 24 horas
                      </div>
                    ) : (
                      <>
                        <div className={`ficha-field ${mensajeError ? 'has-error' : ''}`}>
                          <label htmlFor={`${idPrefijo}-apertura-${franja.indice}`}>Apertura</label>
                          <SelectorHorario
                            id={`${idPrefijo}-apertura-${franja.indice}`}
                            value={franja.apertura || '09:00'}
                            disabled={disabled}
                            invalid={Boolean(mensajeError)}
                            ariaLabel={`Hora de apertura del ${dia.nombre}`}
                            ariaDescribedBy={mensajeError ? `error-horario-${franja.indice}` : undefined}
                            onChange={(nuevoValor) =>
                              actualizarFranja(franja.indice, { apertura: nuevoValor })
                            }
                          />
                        </div>
                        <div className={`ficha-field ${mensajeError ? 'has-error' : ''}`}>
                          <label htmlFor={`${idPrefijo}-cierre-${franja.indice}`}>Cierre</label>
                          <SelectorHorario
                            id={`${idPrefijo}-cierre-${franja.indice}`}
                            value={franja.cierre || '17:00'}
                            disabled={disabled}
                            invalid={Boolean(mensajeError)}
                            ariaLabel={`Hora de cierre del ${dia.nombre}`}
                            ariaDescribedBy={mensajeError ? `error-horario-${franja.indice}` : undefined}
                            onChange={(nuevoValor) =>
                              actualizarFranja(franja.indice, { cierre: nuevoValor })
                            }
                          />
                        </div>
                      </>
                    )}

                    {franjas.length > 1 && (
                      <button
                        type="button"
                        className="ficha-icon-button"
                        disabled={disabled}
                        onClick={() => eliminarFranja(franja.indice)}
                        aria-label={`Eliminar franja del ${dia.nombre}`}
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    )}
                  </div>

                  <div className="ficha-time-options">
                    {franjas.length === 1 && (
                      <label className="ficha-time-option-check">
                        <input
                          type="checkbox"
                          checked={es24}
                          disabled={disabled}
                          onChange={(e) => {
                            const activo = e.target.checked
                            actualizarFranja(franja.indice, {
                              es_24_horas: activo,
                              cruza_medianoche: false,
                              apertura: activo ? '00:00' : '09:00',
                              cierre: activo ? '00:00' : '17:00',
                            })
                          }}
                        />
                        <span>24 horas</span>
                      </label>
                    )}

                    {!es24 && (
                      <label className="ficha-time-option-check">
                        <input
                          type="checkbox"
                          checked={cruza}
                          disabled={disabled}
                          onChange={(e) =>
                            actualizarFranja(franja.indice, { cruza_medianoche: e.target.checked })
                          }
                        />
                        <span>Turno nocturno (cierra al día siguiente)</span>
                      </label>
                    )}
                  </div>

                  {mensajeError && (
                    <p className="ficha-field-error" id={`error-horario-${franja.indice}`} role="alert">
                      {mensajeError}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
