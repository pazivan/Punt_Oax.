import { useRef, useState } from 'react'
import { insertarDigitos } from './codigoVerificacion'

export default function CodigoVerificacion({ digitos, onChange, error, correcto, disabled }) {
  const cajas = useRef([])
  const [enfocado, setEnfocado] = useState(-1)
  function escribir(indice, entrada) {
    if (!entrada) {
      const siguientes = [...digitos]
      siguientes[indice] = ''
      onChange(siguientes)
      return
    }
    const valor = entrada.length === 2 && entrada.startsWith(digitos[indice]) ? entrada.at(-1) : entrada
    const { digitos: siguientes, siguiente } = insertarDigitos(digitos, indice, valor)
    onChange(siguientes)
    if (entrada.replace(/\D/g, '')) cajas.current[siguiente]?.focus()
  }
  function pegar(e, indice) {
    e.preventDefault()
    escribir(indice, e.clipboardData.getData('text'))
  }
  function tecla(e, indice) {
    if (e.key === 'Backspace') {
      e.preventDefault()
      const siguiente = [...digitos]
      const destino = digitos[indice] ? indice : Math.max(indice - 1, 0)
      siguiente[destino] = ''
      onChange(siguiente)
      cajas.current[destino]?.focus()
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault()
      cajas.current[Math.max(0, Math.min(5, indice + (e.key === 'ArrowLeft' ? -1 : 1)))]?.focus()
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault()
      cajas.current[e.key === 'Home' ? 0 : 5]?.focus()
    }
  }
  return <div className="auth-input-group">
    <span className="auth-label" id="codigo-etiqueta">Código de verificación</span>
    <div className={`auth-codigo-casillas${error ? ' tiene-error' : ''}${correcto ? ' es-correcto' : ''}`}
      role="group" aria-labelledby="codigo-etiqueta" aria-describedby={error ? 'codigo-error' : 'codigo-ayuda'}>
      {digitos.map((digito, indice) => <input
        key={indice}
        ref={(elemento) => { cajas.current[indice] = elemento }}
        className={`auth-codigo-casilla${enfocado === indice ? ' enfocada' : ''}`}
        type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} autoComplete={indice === 0 ? 'one-time-code' : 'off'}
        aria-label={`Dígito ${indice + 1} de 6`}
        aria-invalid={Boolean(error)}
        disabled={disabled}
        value={digito}
        onFocus={(e) => { setEnfocado(indice); e.target.select() }}
        onBlur={() => setEnfocado((actual) => actual === indice ? -1 : actual)}
        onChange={(e) => escribir(indice, e.target.value)}
        onKeyDown={(e) => tecla(e, indice)}
        onPaste={(e) => pegar(e, indice)}
      />)}
    </div>
    <small id="codigo-ayuda">Puedes escribir los dígitos, pegarlos juntos o usar las flechas del teclado.</small>
  </div>
}
