import assert from 'node:assert/strict'
import { test } from 'node:test'

async function entorno(t) {
  const anteriores = { window: globalThis.window, document: globalThis.document }
  const scripts = []
  globalThis.window = {}
  globalThis.document = {
    createElement: () => ({ remove() { this.retirado = true } }),
    head: { appendChild(script) { scripts.push(script) } },
  }
  t.mock.timers.enable({ apis: ['setTimeout'] })
  t.after(() => {
    t.mock.timers.reset()
    if (anteriores.window === undefined) delete globalThis.window
    else globalThis.window = anteriores.window
    if (anteriores.document === undefined) delete globalThis.document
    else globalThis.document = anteriores.document
  })
  const { cargarGoogleIdentity } = await import(`../src/utils/googleIdentity.js?caso=${encodeURIComponent(t.name)}`)
  const completar = () => {
    const id = { initialize() {}, renderButton() {} }
    window.google = { accounts: { id } }
    scripts.at(-1).onload()
    return id
  }
  return { cargarGoogleIdentity, scripts, completar }
}

test('SDK lento: una carga de trece segundos termina sin crear otro script', async (t) => {
  const { cargarGoogleIdentity, scripts, completar } = await entorno(t)
  const primera = cargarGoogleIdentity()
  const segunda = cargarGoogleIdentity()
  assert.equal(primera, segunda)
  assert.equal(scripts.length, 1)
  t.mock.timers.tick(13000)
  assert.notEqual(scripts[0].retirado, true)
  const id = completar()
  assert.equal(await primera, id)
  assert.equal(await segunda, id)
  assert.equal(await cargarGoogleIdentity(), id)
  assert.equal(scripts.length, 1)
})

test('fallo de red: limpia el intento y permite volver a cargar sin refrescar', async (t) => {
  const { cargarGoogleIdentity, scripts, completar } = await entorno(t)
  const error = assert.rejects(cargarGoogleIdentity(), /No se pudo cargar Google/)
  scripts[0].onerror()
  await error
  assert.equal(scripts[0].retirado, true)
  assert.equal(scripts[0].onload, null)
  const siguiente = cargarGoogleIdentity()
  assert.equal(scripts.length, 2)
  const id = completar()
  assert.equal(await siguiente, id)
})

test('la carga bloqueada tiene un plazo finito y permite reintentar', async (t) => {
  const { cargarGoogleIdentity, scripts, completar } = await entorno(t)
  const pendiente = cargarGoogleIdentity()
  const error = assert.rejects(pendiente, /Revisa tu conexión/)
  t.mock.timers.tick(30000)
  await error
  assert.equal(scripts[0].retirado, true)
  const reintento = cargarGoogleIdentity()
  const id = completar()
  assert.equal(await reintento, id)
})

test('un objeto Google incompleto no se toma como un SDK listo', async (t) => {
  const { cargarGoogleIdentity, scripts } = await entorno(t)
  window.google = { accounts: { id: {} } }
  const error = assert.rejects(cargarGoogleIdentity(), /No se pudo cargar Google/)
  assert.equal(scripts.length, 1)
  scripts[0].onload()
  await error
})
