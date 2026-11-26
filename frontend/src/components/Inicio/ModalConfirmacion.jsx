import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle } from 'lucide-react';
import { bloquearScrollFondo } from '../../utils/uiOverlays.js';
import '../../styles/Inicio.css';
import { useDialogFocus } from '../../utils/useDialogFocus.js';

/**
 * ModalConfirmacion - Componente reutilizable de ventana emergente de advertencia / confirmación.
 */
export default function ModalConfirmacion({
  abierto,
  titulo = '¿Estás seguro de que quieres salir?',
  mensaje = 'Se cerrará tu sesión actual y serás dirigido a la página de iniciar sesión.',
  textoCancelar = 'Cancelar',
  textoConfirmar = 'Sí, salir',
  onCancelar,
  onConfirmar,
  deshabilitarAcciones = false,
}) {
  const dialogoRef = useRef(null);
  const tituloId = useId();
  useDialogFocus(dialogoRef, abierto, onCancelar, deshabilitarAcciones);
  useEffect(() => {
    if (!abierto) return undefined;
    return bloquearScrollFondo();
  }, [abierto]);

  if (!abierto) return null;

  const contenido = (
    <div
      ref={dialogoRef}
      tabIndex={-1}
      className="inicio-logout-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={tituloId}
    >
      <div className="inicio-logout-modal-card">
        <div className="inicio-logout-modal-icon" aria-hidden="true">
          <AlertCircle size={22} color="#001D14" />
        </div>

        <h2 id={tituloId} className="inicio-logout-modal-title">
          {titulo}
        </h2>

        <p className="inicio-logout-modal-text">{mensaje}</p>

        <div className="inicio-logout-modal-actions">
          <button
            type="button"
            className="inicio-logout-btn-cancel"
            onClick={onCancelar}
            disabled={deshabilitarAcciones}
          >
            {textoCancelar}
          </button>
          <button
            type="button"
            className="inicio-logout-btn-confirm"
            onClick={onConfirmar}
            disabled={deshabilitarAcciones}
          >
            {textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(contenido, document.body);
  }
  return contenido;
}
