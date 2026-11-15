const test = require('node:test');
const assert = require('node:assert/strict');
const { listarCitasClinica } = require('../citasClinica');

test('las citas se consultan solo para el ID de la clínica autenticada', async () => {
  const idClinica = 'f6fa1268-2f89-4eef-bd86-c6ee15b71aba';
  const registros = [{ id_cita: 'abc', estado: 'confirmada' }];
  const db = {
    async query(sql, params) {
      assert.match(sql, /WHERE cs\.id_clinica = \$1/);
      assert.match(sql, /JOIN espacios_disponibles/i);
      assert.match(sql, /JOIN clinicas_servicios/i);
      assert.match(sql, /JOIN usuarios/i);
      assert.deepEqual(params, [idClinica]);
      return { rows: registros };
    },
  };
  assert.deepEqual(await listarCitasClinica(db, idClinica), registros);
});
