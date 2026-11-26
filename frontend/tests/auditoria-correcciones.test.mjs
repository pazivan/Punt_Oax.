import test from 'node:test'
import assert from 'node:assert/strict'
import { areasDesdeServicios, categoriaServicio } from '../src/utils/servicios.mjs'
import { compararFichaConFormulario } from '../src/utils/comparacionFicha.js'
import { construirPayloadFicha } from '../src/utils/validacionFicha.js'
import { errorNombre, limpiarTextoNombre } from '../src/utils/nombres.mjs'

test('H02: categorías históricas y detalle sobreviven a recarga y serialización', () => {
  const servicios = areasDesdeServicios([{ categoria: 'ITS', detalle_servicio: 'Detalle ITS' }, { categoria: 'ILE', detalle_servicio: 'Detalle ILE' }])
  assert.equal(servicios.its.seleccionado, true)
  assert.equal(servicios.ile.seleccionado, true)
  const campos = Object.fromEntries(['descripcion', 'telefono', 'correo_contacto', 'sitio_web', 'direccion', 'codigo_postal', 'ubicacion_maps_url', 'municipio', 'nombre'].map((campo) => [campo, '']))
  const payload = construirPayloadFicha({ ...campos, servicios, horarios: [] })
  assert.deepEqual(payload.servicios, [{ categoria: 'its', detalle: 'Detalle ITS' }, { categoria: 'ile', detalle: 'Detalle ILE' }])
  assert.equal(categoriaServicio(' Aborto '), 'ile')
})
test('H02: categorías desconocidas no crean áreas ni cambios de revisión ficticios', () => {
  assert.equal(areasDesdeServicios([{ categoria: '__proto__' }]).its.seleccionado, false)
  const ficha = { clinica: {}, servicios: [{ categoria: 'ITS', detalle_servicio: 'Consulta' }] }
  const form = { servicios: areasDesdeServicios(ficha.servicios) }
  assert.equal(compararFichaConFormulario(ficha, form).cambiosRevision.some((c) => c.campo === 'areas_servicio'), false)
})
test('H15: nombres Unicode, acentos, guiones, apóstrofos y límites compartidos', () => {
  for (const valor of ['María José', "D'Ávila", 'Jean-Luc', 'O\u0301scar', '李明', 'A'.repeat(60)]) assert.equal(errorNombre(valor), null, valor)
  for (const valor of [{}, [], 12, 'X', 'A'.repeat(61), '<script>', 'Ana--María']) assert.ok(errorNombre(valor))
  assert.equal(errorNombre('A'.repeat(80), { apellidos: true }), null)
  assert.ok(errorNombre('A'.repeat(81), { apellidos: true }))
  assert.equal(errorNombre(null), null, 'el registro mantiene nombre opcional')
  assert.equal(limpiarTextoNombre('李明', 60), '李明')
})
