import test from 'node:test'
import assert from 'node:assert/strict'
import {
  nombrePaciente, folioCita, esProxima, filtrarCitas, formatearFechaCita,
} from '../src/utils/citasClinica.js'

const pasado = '2026-11-05T08:00:00.000Z'
const futuro = '2026-11-10T15:00:00.000Z'
const ahora = new Date('2026-11-07T00:00:00Z').getTime()
const citas = [
  { id_cita: 'b', fecha_hora_inicio: pasado, estado: 'confirmada' },
  { id_cita: 'a', fecha_hora_inicio: futuro, estado: 'confirmada' },
  { id_cita: 'c', fecha_hora_inicio: futuro, estado: 'cancelada' },
]

test('clasifica próximas e historial sin alterar las reservas originales', () => {
  assert.deepEqual(filtrarCitas(citas, 'proximas', ahora).map(c => c.id_cita), ['a'])
  assert.deepEqual(filtrarCitas(citas, 'historial', ahora).map(c => c.id_cita), ['c', 'b'])
  assert.equal(filtrarCitas(citas, 'todas', ahora).length, 3)
  assert.equal(esProxima(citas[2], ahora), false)
  assert.equal(citas[0].id_cita, 'b')
})

test('datos opcionales se muestran como pendientes, no inventados', () => {
  assert.equal(nombrePaciente({ paciente_nombre: null, paciente_apellidos: null }), 'Paciente sin nombre registrado')
  assert.equal(nombrePaciente({ paciente_nombre: 'María', paciente_apellidos: 'Pérez' }), 'María Pérez')
  assert.equal(folioCita({ id_cita: 'abcd0123-1234' }), 'ABCD0123')
  assert.equal(formatearFechaCita('mal'), 'Fecha no registrada')
})

test('formatea fechas en hora local de México, no en hora del servidor', () => {
  assert.match(formatearFechaCita('2026-11-10T15:00:00.000Z'), /09:00/)
})
