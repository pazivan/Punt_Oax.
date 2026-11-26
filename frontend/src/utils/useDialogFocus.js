import { useEffect, useRef } from 'react'

export function useDialogFocus(ref, abierto, onCerrar, ocupado = false) {
  const opciones = useRef({ onCerrar, ocupado })
  useEffect(() => { opciones.current = { onCerrar, ocupado } }, [onCerrar, ocupado])
  useEffect(() => {
    if (!abierto || !ref.current) return undefined
    const dialogo = ref.current
    const anterior = document.activeElement
    const controles = () => [...dialogo.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')]
      .filter((el) => el.getClientRects().length > 0)
    const enfocar = () => (controles()[0] || dialogo).focus()
    enfocar()
    const esSuperior = () => [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')]
      .filter((el) => el.getClientRects().length > 0).at(-1) === dialogo
    const tecla = (event) => {
      if (!esSuperior()) return
      if (event.key === 'Escape' && !opciones.current.ocupado) {
        event.preventDefault()
        event.stopPropagation()
        opciones.current.onCerrar?.()
      }
      if (event.key === 'Tab') {
        const lista = controles(), primero = lista[0], ultimo = lista.at(-1)
        if (!primero) { event.preventDefault(); dialogo.focus(); return }
        if (event.shiftKey && (document.activeElement === primero || !dialogo.contains(document.activeElement))) {
          event.preventDefault(); ultimo.focus()
        } else if (!event.shiftKey && (document.activeElement === ultimo || !dialogo.contains(document.activeElement))) {
          event.preventDefault(); primero.focus()
        }
      }
    }
    const foco = (event) => { if (esSuperior() && !dialogo.contains(event.target)) enfocar() }
    document.addEventListener('keydown', tecla, true)
    document.addEventListener('focusin', foco)
    return () => {
      document.removeEventListener('keydown', tecla, true)
      document.removeEventListener('focusin', foco)
      if (anterior?.isConnected) anterior.focus()
    }
  }, [abierto, ref])
}
