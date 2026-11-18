import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizarUrlExterna, urlEnTexto } from '../src/utils/enlaces.js'

test('las fuentes importadas conservan el enlace aunque incluyan texto', () => {
  assert.equal(urlEnTexto('COESIDA Oaxaca https://www.oaxaca.gob.mx/detalle-portal/coesida/'),
    'https://www.oaxaca.gob.mx/detalle-portal/coesida/')
  assert.equal(urlEnTexto('https://www.oaxaca.gob.mx/coesida/ (Gob. Oaxaca)'),
    'https://www.oaxaca.gob.mx/coesida/')
})

test('solo se abren URLs externas HTTP o HTTPS', () => {
  assert.equal(normalizarUrlExterna('www.oaxaca.gob.mx/info'), 'https://www.oaxaca.gob.mx/info')
  assert.equal(normalizarUrlExterna('javascript:alert(1)'), null)
  assert.equal(normalizarUrlExterna('https://user:pass@example.com'), null)
})
