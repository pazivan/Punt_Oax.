import assert from 'node:assert/strict'
import { test } from 'node:test'
import { normalizarUrlExterna } from '../src/utils/enlaces.js'

test('convierte en enlaces clicables las URLs sin protocolo', () => {
  assert.equal(normalizarUrlExterna('https://ejemplo.com'), 'https://ejemplo.com')
  assert.equal(normalizarUrlExterna('  http://ejemplo.com/ruta  '), 'http://ejemplo.com/ruta')
  assert.equal(normalizarUrlExterna('www.ejemplo.com'), 'https://www.ejemplo.com')
  assert.equal(normalizarUrlExterna('ejemplo.com/ruta?x=1'), 'https://ejemplo.com/ruta?x=1')
  assert.equal(normalizarUrlExterna('sub.ejemplo.gob.mx'), 'https://sub.ejemplo.gob.mx')
})

test('no crea enlaces con esquemas peligrosos ni texto suelto', () => {
  for (const invalido of [
    '',
    '   ',
    null,
    42,
    'javascript:alert(1)',
    'data:text/html,hola',
    'mailto:algo@ejemplo.com',
    'sin puntos',
    'Fuente: Secretaría de Salud',
  ]) {
    assert.equal(normalizarUrlExterna(invalido), null, `debería rechazar ${String(invalido)}`)
  }
})
