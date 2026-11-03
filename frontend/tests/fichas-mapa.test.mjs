import assert from 'node:assert/strict'
import { test } from 'node:test'
import { coordenadas, enlaceComoLlegar, filtrarCentros, horarioTexto } from '../src/utils/centros.js'

const centros = [
  { id_clinica: 'a', nombre: 'Clínica Norte', municipio: 'Oaxaca de Juárez', servicios: ['Detección ITS', 'Orientación'], latitud: '17.0', longitud: '-96.7' },
  { id_clinica: 'b', nombre: 'Clínica Sur', municipio: 'Tlalixtac', servicios: ['Consulta'], latitud: null, longitud: null },
]

test('filtra por nombre, municipio y servicio, sin alterar lista original', () => {
  assert.deepEqual(filtrarCentros(centros, { busqueda: 'orientación' }).map(c => c.id_clinica), ['a'])
  assert.deepEqual(filtrarCentros(centros, { municipio: 'Tlalixtac', servicio: 'Consulta' }).map(c => c.id_clinica), ['b'])
  assert.equal(filtrarCentros(centros, { servicio: 'No existe' }).length, 0)
  assert.equal(centros.length, 2)
})
test('solo dibuja marcadores con coordenadas válidas', () => {
  assert.deepEqual(coordenadas(centros[0]), [17, -96.7])
  assert.equal(coordenadas(centros[1]), null)
  assert.equal(coordenadas({ latitud: '999', longitud: '0' }), null)
})
test('enlace de ruta y horario no inventan datos', () => {
  assert.equal(enlaceComoLlegar(centros[1]), null)
  assert.match(enlaceComoLlegar(centros[0]), /destination=17%2C-96.7/)
  assert.equal(horarioTexto([]), 'Horario por confirmar')
  assert.match(horarioTexto([{dia_semana: 1, apertura: '08:00', cierre: '14:00'}]), /Lunes 08:00–14:00/)
})
