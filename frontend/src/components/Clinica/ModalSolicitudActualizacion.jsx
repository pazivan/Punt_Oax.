import { useEffect, useRef, useState } from 'react'
import { AlertCircle, LoaderCircle, Send, ShieldCheck, X } from 'lucide-react'

const MAX_MOTIVO = 500

/**
 * ModalSolicitudActualizacion - Ventana de confirmación previa al envío de una
 * solicitud de actualización de datos institucionales o ubicación.
 */
export default function ModalSolicitudActualizacion({
  abierto,
  cambios = [],
  enviando = false,
  errorServidor = '',
  onCancelar,
  onConfirmar,
}) {
  const [motivo, setMotivo] = useState('')
  const [errorLocal, setErrorLocal] = useState('')
  const textareaRef = useRef(null)

  useEffect(() => {
    if (!abierto) return undefined
    const id = requestAnimationFrame(() => textareaRef.current?.focus())
    const manejarTecla = (e) => {
      if (e.key === 'Escape' && !enviando) {
        setErrorLocal('')
        onCancelar?.()
      }
    }
    window.addEventListener('keydown', manejarTecla)
    return () => {
      cancelAnimationFrame(id)
      window.removeEventListener('keydown', manejarTecla)
    }
  }, [abierto, enviando, onCancelar])

  if (!abierto) return null

  const motivoLimpio = motivo.trim()
  const errorMostrado = errorLocal || errorServidor

  const manejarEnvio = (e) => {
    e.preventDefault()
    if (enviando) return
    if (!motivoLimpio) {
      setErrorLocal('El motivo de la solicitud es obligatorio.')
      textareaRef.current?.focus()
      return
    }
    setErrorLocal('')
    onConfirmar?.(motivoLimpio)
  }

  return (
    <div
      className="ficha-modal-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !enviando) onCancelar?.()
      }}
    >
      <div
        className="ficha-modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-solicitud-titulo"
        aria-describedby="modal-solicitud-desc"
      >
        <div className="ficha-modal-header">
          <div className="ficha-modal-title-wrap">
            <span className="ficha-modal-icon" aria-hidden="true">
              <ShieldCheck size={20} color="#103328" />
            </span>
            <h2 id="modal-solicitud-titulo" className="ficha-modal-title">
              Solicitar actualización de información
            </h2>
          </div>
          <button
            type="button"
            className="ficha-modal-close"
            onClick={onCancelar}
            disabled={enviando}
            aria-label="Cerrar ventana"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <p id="modal-solicitud-desc" className="ficha-modal-desc">
          Los cambios seleccionados serán revisados por un administrador antes de publicarse.
          Mientras tanto, tu información aprobada actual permanecerá visible en el directorio.
        </p>

        <div className="ficha-modal-changes" aria-label="Resumen de campos modificados">
          <strong className="ficha-modal-changes-title">
            Campos modificados ({cambios.length})
          </strong>
          <ul className="ficha-modal-changes-list">
            {cambios.map((item) => (
              <li key={item.campo} className="ficha-modal-change-item">
                <span className="ficha-modal-change-label">{item.etiqueta}</span>
                <div className="ficha-modal-change-values">
                  <span className="is-old" title={item.valor_anterior}>
                    Anterior: {item.valor_anterior}
                  </span>
                  <span className="is-new" title={item.valor_nuevo}>
                    Nuevo: {item.valor_nuevo}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <form onSubmit={manejarEnvio} noValidate>
          <div className="ficha-field">
            <label htmlFor="solicitud-motivo-input">
              Motivo de la solicitud <span aria-hidden="true">*</span>
            </label>
            <textarea
              ref={textareaRef}
              id="solicitud-motivo-input"
              className={`ficha-input ficha-textarea ${errorMostrado ? 'is-invalid' : ''}`}
              rows={3}
              maxLength={MAX_MOTIVO}
              value={motivo}
              disabled={enviando}
              placeholder="Describe por qué necesitas actualizar esta información"
              aria-required="true"
              aria-invalid={Boolean(errorMostrado)}
              onChange={(e) => {
                setMotivo(e.target.value)
                if (errorLocal) setErrorLocal('')
              }}
            />
            <small>{motivo.length}/{MAX_MOTIVO} caracteres</small>
          </div>

          {errorMostrado && (
            <div className="ficha-alert ficha-alert-error" role="alert" style={{ marginTop: '10px' }}>
              <AlertCircle size={16} aria-hidden="true" />
              <p>{errorMostrado}</p>
            </div>
          )}

          <div className="ficha-modal-actions">
            <button
              type="button"
              className="panel-clinica-btn-secondary"
              onClick={onCancelar}
              disabled={enviando}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="panel-clinica-btn-primary"
              disabled={enviando}
            >
              {enviando ? (
                <>
                  <LoaderCircle size={15} className="admin-girar" aria-hidden="true" />
                  <span>Enviando solicitud…</span>
                </>
              ) : (
                <>
                  <Send size={15} aria-hidden="true" />
                  <span>Enviar solicitud</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
