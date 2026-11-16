const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { leerRegistros } = require('../scripts/importar-filtracion');
const { franjas, planificar } = require('../scripts/habilitar-citas-its');

test('interpreta los horarios de las 26 sedes sin completar horas faltantes', () => {
  const registros = leerRegistros(fs.readFileSync(
    path.resolve(__dirname, '../data/its-coordenadas.csv'), 'utf8'
  ));
  const planes = planificar(registros, new Date('2026-11-15T18:00:00Z'));
  assert.equal(planes.length, 26);
  assert.ok(planes.every((p) => p.espacios.length > 0));
  assert.deepEqual(franjas('Martes y Jueves de 10:00 a 14:00 hrs')[0].dias, [2, 4]);
  const casa = planes.find((p) => p.origen === 'coesdia 11.2');
  assert.ok(!casa.espacios.some((hora) => hora.startsWith('2026-11-16'))); // festivo
  assert.ok(casa.espacios.some((hora) => hora.startsWith('2026-11-17 07:00')));
  assert.ok(casa.espacios.some((hora) => hora.startsWith('2026-11-21 07:00')));
  assert.ok(!casa.espacios.some((hora) => hora.startsWith('2026-11-22')));
  assert.ok(!casa.espacios.some((hora) => hora.endsWith('15:00')));
});

test('el plan omite festivos y no solapa cupos de una hora', () => {
  const fila = { id_origen: 'test', nombre: 'Centro', categoria: 'ITS',
    latitud: '17.06', longitud: '-96.72', horario: 'Lunes a Viernes de 08:30–10:30 hrs' };
  const plan = planificar([fila], new Date('2026-12-24T18:00:00Z'), 4)[0];
  assert.ok(plan.espacios.includes('2026-12-24 08:30'));
  assert.ok(plan.espacios.includes('2026-12-24 09:30'));
  assert.ok(!plan.espacios.some((hora) => hora.startsWith('2026-12-25')));
  assert.equal(plan.espacios.length, new Set(plan.espacios).size);
});
