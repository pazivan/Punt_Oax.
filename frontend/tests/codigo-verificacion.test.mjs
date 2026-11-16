import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ocultarCorreo, insertarDigitos } from '../src/components/Auth/codigoVerificacion.js'

test('el correo se muestra parcialmente oculto sin alterar la dirección original', () => {
  assert.equal(ocultarCorreo('miguel@gmail.com'), 'migu***@gmail.com')
  assert.equal(ocultarCorreo('a@ejemplo.mx'), 'a***@ejemplo.mx')
  assert.equal(ocultarCorreo(''), 'Correo no indicado')
})

test('permite un dígito, pegado de seis y relleno automático desde cualquier casilla', () => {
  const vacio = Array(6).fill('')
  assert.deepEqual(insertarDigitos(vacio, 0, '4'), {
    digitos: ['4', '', '', '', '', ''], siguiente: 1,
  })
  assert.deepEqual(insertarDigitos(vacio, 0, '12 34-56').digitos, ['1', '2', '3', '4', '5', '6'])
  assert.deepEqual(insertarDigitos(vacio, 3, '123456').digitos, ['1', '2', '3', '4', '5', '6'])
  assert.deepEqual(insertarDigitos(vacio, 4, '78').digitos, ['', '', '', '', '7', '8'])
})
