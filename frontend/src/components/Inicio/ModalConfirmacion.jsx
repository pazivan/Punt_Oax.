import { AlertCircle } from 'lucide-react';
import '../../styles/Inicio.css';

/**
 * ModalConfirmacion - Componente reutilizable de ventana emergente de advertencia / confirmación.
 *
 * Contrato de propiedades (Props):
 * @param {Object} props
 * @param {boolean} props.abierto - Indica si el modal se muestra en pantalla.
 * @param {string} [props.titulo='¿Estás seguro de que quieres salir?'] - Título principal del aviso.
 * @param {string} [props.mensaje='Se cerrará tu sesión actual y serás dirigido a la página de iniciar sesión.'] - Texto descriptivo.
 * @param {string} [props.textoCancelar='Cancelar'] - Etiqueta del botón secundario para cancelar.
 * @param {string} [props.textoConfirmar='Sí, salir'] - Etiqueta del botón principal para confirmar.
 * @param {() => void} props.onCancelar - Callback al pulsar el botón de cancelar o cerrar el aviso.
 * @param {() => void} props.onConfirmar - Callback al confirmar la acción.
 */
export default function ModalConfirmacion({
  abierto,
  titulo = '¿Estás seguro de que quieres salir?',
  mensaje = 'Se cerrará tu sesión actual y serás dirigido a la página de iniciar sesión.',
  textoCancelar = 'Cancelar',
  textoConfirmar = 'Sí, salir',
  onCancelar,
  onConfirmar,
}) {
  if (!abierto) return null;

  return (
    <div
      className="inicio-logout-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-confirmacion-titulo"
    >
      <div className="inicio-logout-modal-card">
        <div className="inicio-logout-modal-icon" aria-hidden="true">
          <AlertCircle size={22} color="#001D14" />
        </div>

        <h2 id="modal-confirmacion-titulo" className="inicio-logout-modal-title">
          {titulo}
        </h2>

        <p className="inicio-logout-modal-text">{mensaje}</p>

        <div className="inicio-logout-modal-actions">
          <button
            type="button"
            className="inicio-logout-btn-cancel"
            onClick={onCancelar}
          >
            {textoCancelar}
          </button>
          <button
            type="button"
            className="inicio-logout-btn-confirm"
            onClick={onConfirmar}
          >
            {textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
