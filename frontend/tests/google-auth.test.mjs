import { test } from 'node:test'
import assert from 'node:assert/strict'
import { enviarGoogle } from '../src/api/auth.js'

test('Google envía JSON con protección CSRF, cookie same-origin y sin poner credenciales en URL', async () => {
  let peticion
  const previo = globalThis.fetch
  globalThis.fetch = async (url, opciones) => {
    peticion = { url, opciones }
    return { ok: true, json: async () => ({ token: 'sesion-puntoax' }) }
  }
  try {
    const datos = { credential: 'credencial-google', csrf: 'csrf', desafio: 'desafio' }
    assert.equal((await enviarGoogle('', datos)).token, 'sesion-puntoax')
    assert.equal(peticion.url, '/api/auth/google')
    assert.equal(peticion.opciones.credentials, 'same-origin')
    assert.equal(peticion.opciones.headers['X-Puntoax-Google'], '1')
    assert.equal(peticion.opciones.headers['Content-Type'], 'application/json')
    assert.deepEqual(JSON.parse(peticion.opciones.body), datos)
  } finally { globalThis.fetch = previo }
})

test('vinculación conserva el desafío del backend; errores de Google y cancelación son manejables', async () => {
  const previo = globalThis.fetch
  try {
    globalThis.fetch = async () => ({
      ok: false, status: 409, json: async () => ({
        codigo: 'GOOGLE_VINCULACION_REQUERIDA', error: 'Confirma tu contraseña original.',
        vinculacion: 'un-solo-uso', correo: 'paciente@example.com',
      }),
    })
    await assert.rejects(enviarGoogle('', {}), (e) =>
      e.codigo === 'GOOGLE_VINCULACION_REQUERIDA' && e.vinculacion === 'un-solo-uso' &&
      e.correo === 'paciente@example.com')
    globalThis.fetch = async () => { throw new DOMException('Cancelado', 'AbortError') }
    await assert.rejects(enviarGoogle('/desafio', {}), (e) => e.name === 'AbortError')
    globalThis.fetch = async () => { throw new TypeError('sin conexión') }
    await assert.rejects(enviarGoogle('/desafio', {}), /No se pudo conectar con el servidor/)
  } finally { globalThis.fetch = previo }
})

test('el intercambio Google no deja esperando indefinidamente ante una API sin respuesta', async (t) => {
  const previo = globalThis.fetch
  t.mock.timers.enable({ apis: ['setTimeout'] })
  globalThis.fetch = (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Cancelado', 'AbortError')))
  })
  try {
    const pendiente = assert.rejects(enviarGoogle('', {}), /Google tardó demasiado/)
    t.mock.timers.tick(20000)
    await pendiente
  } finally { globalThis.fetch = previo; t.mock.timers.reset() }
})
