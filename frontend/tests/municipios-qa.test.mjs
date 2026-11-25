import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizarYUnificarClinicas } from '../src/data/clinicasDemo.js'
import { resolverMunicipio } from '../src/utils/municipios.mjs'
import { compararFichaConFormulario } from '../src/utils/comparacionFicha.js'

test('agendamiento y mapa conservan claves de municipios homónimos sin fusionarlos', () => {
  const centros = normalizarYUnificarClinicas([
    { id_clinica: 'uno', nombre: 'Centro', municipio: 'San Juan Mixtepec', municipio_clave: '20208' },
    { id_clinica: 'dos', nombre: 'Centro', municipio: 'San Juan Mixtepec', municipio_clave: '20209' },
  ])
  assert.equal(centros.length, 2)
  assert.equal(resolverMunicipio(centros[0].municipio_clave).cvegeo, '20208')
  assert.equal(resolverMunicipio(centros[1].municipio_clave).cvegeo, '20209')
  assert.equal(resolverMunicipio(centros[1].municipio), null)
})

test('cambiar entre municipios homónimos requiere revisión, aunque el nombre no cambie', () => {
  const ficha = { clinica: { municipio: 'San Juan Mixtepec', municipio_clave: '20208' }, servicios: [], horarios: [] }
  const resultado = compararFichaConFormulario(ficha, {
    municipio: 'San Juan Mixtepec', municipio_clave: '20209', servicios: {}, horarios: [],
  })
  assert.equal(resultado.hayCambiosRevision, true)
  assert.ok(resultado.cambiosRevision.some((c) => c.campo === 'municipio_clave' && c.raw_nuevo === '20209'))
})
