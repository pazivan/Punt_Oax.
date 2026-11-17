import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cerrarSesion, guardarSesion, leerSesion } from '../src/api/auth.js'

const comun = new Map()
let pestaña = new Map()
globalThis.localStorage = {
  getItem: (clave) => comun.get(clave) ?? null,
  setItem: (clave, valor) => comun.set(clave, valor),
  removeItem: (clave) => comun.delete(clave),
}
globalThis.sessionStorage = {
  getItem: (clave) => pestaña.get(clave) ?? null,
  setItem: (clave, valor) => pestaña.set(clave, valor),
  removeItem: (clave) => pestaña.delete(clave),
}

test('tres pestañas comparten una sesión y no se reabre tras salir en otra', () => {
  const primera = pestaña
  guardarSesion({ token: 'jwt-usuario', usuario: { rol: 'usuario' } }, 'usuario')
  const segunda = new Map()
  pestaña = segunda
  assert.equal(leerSesion().token, 'jwt-usuario')
  const tercera = new Map()
  pestaña = tercera
  assert.equal(leerSesion().token, 'jwt-usuario')
  pestaña = primera
  cerrarSesion()
  for (const otra of [segunda, tercera]) {
    pestaña = otra
    assert.equal(leerSesion(), null)
  }
})
