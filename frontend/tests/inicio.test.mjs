import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CLINICAS_DEMO,
  MODO_DEMOSTRACION_ACTIVO,
  normalizarYUnificarClinicas,
} from '../src/data/clinicasDemo.js'

test('los datos de demostración están identificados y no duplican sedes entre categorías', () => {
  assert.equal(MODO_DEMOSTRACION_ACTIVO, true)
  assert.ok(Array.isArray(CLINICAS_DEMO) && CLINICAS_DEMO.length > 0)

  const unificadas = normalizarYUnificarClinicas(CLINICAS_DEMO)
  const claves = new Set(unificadas.map((c) => `${c.nombre.toLowerCase()}::${(c.municipio || '').toLowerCase()}`))
  assert.equal(claves.size, unificadas.length, 'no debe haber sedes duplicadas')

  for (const sede of unificadas) {
    assert.equal(sede.es_demostracion, true)
    assert.ok(typeof sede.nombre === 'string' && sede.nombre.length > 0)
    assert.ok(Array.isArray(sede.servicios))
    assert.ok(Array.isArray(sede.categorias))
  }
})

test('normalizarYUnificarClinicas fusiona servicios y categorías de una misma sede sin inventar datos faltantes', () => {
  const registrosSeparados = [
    {
      nombre: 'Centro de Salud Urbano No. 1',
      municipio: 'Oaxaca de Juárez',
      categoria: 'ITS',
      servicio: 'Pruebas rápidas de VIH',
      direccion: null,
      telefono: null,
    },
    {
      nombre: 'Centro de Salud Urbano No. 1',
      municipio: 'Oaxaca de Juárez',
      categoria: 'Aborto',
      servicio: 'Orientación en ILE',
      direccion: null,
      telefono: null,
    },
  ]

  const resultado = normalizarYUnificarClinicas(registrosSeparados)
  assert.equal(resultado.length, 1, 'debe unificar la misma sede en una sola tarjeta')
  assert.deepEqual(resultado[0].categorias, ['ITS', 'Aborto'])
  assert.deepEqual(resultado[0].servicios, ['Pruebas rápidas de VIH', 'Orientación en ILE'])
  assert.equal(resultado[0].direccion, null, 'no debe inventar dirección faltante')
  assert.equal(resultado[0].telefono, null, 'no debe inventar teléfono faltante')
  assert.equal(resultado[0].latitud, null, 'no debe inventar coordenadas faltantes')
})

