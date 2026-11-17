import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  borrarVerificacionPendiente, guardarVerificacionPendiente, leerVerificacionPendiente,
} from '../src/api/verificacionPendiente.js'

const almacen = new Map()
globalThis.sessionStorage = {
  getItem: (clave) => almacen.get(clave) ?? null,
  setItem: (clave, valor) => almacen.set(clave, valor),
  removeItem: (clave) => almacen.delete(clave),
}

test('conserva únicamente rol y correo para retomar la verificación en la pestaña', () => {
  assert.equal(guardarVerificacionPendiente('usuario', '  Prueba@Ejemplo.MX  '), true)
  assert.deepEqual(leerVerificacionPendiente(), { rol: 'usuario', correo: 'prueba@ejemplo.mx' })
  const datos = JSON.stringify([...almacen.values()])
  assert.doesNotMatch(datos, /password|codigo|token|clave/i)
  borrarVerificacionPendiente()
  assert.equal(leerVerificacionPendiente(), null)
})

test('rechaza datos corruptos, roles ajenos y registros vencidos', () => {
  assert.equal(guardarVerificacionPendiente('administrador', 'a@ejemplo.mx'), false)
  assert.equal(guardarVerificacionPendiente('clinica', 'sin-correo'), false)
  assert.equal(leerVerificacionPendiente(), null)
  almacen.set('puntoax-verificacion-pendiente', JSON.stringify({
    rol: 'clinica', correo: 'c@ejemplo.mx', creadaEn: Date.now() - 25 * 60 * 60 * 1000,
  }))
  assert.equal(leerVerificacionPendiente(), null)
  assert.equal(almacen.size, 0)
})
