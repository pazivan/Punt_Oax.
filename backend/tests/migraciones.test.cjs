const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DIR_MIGRACIONES = path.resolve(__dirname, '../../db/migrations');

test('todas las migraciones deben tener su archivo .up.sql y .down.sql correspondiente', () => {
  const archivos = fs.readdirSync(DIR_MIGRACIONES);
  const upFiles = archivos.filter(f => f.endsWith('.up.sql'));
  const downFiles = archivos.filter(f => f.endsWith('.down.sql'));

  assert.ok(upFiles.length >= 6, `Se esperaban al menos 6 migraciones .up.sql, hay ${upFiles.length}`);
  assert.equal(upFiles.length, downFiles.length, 'Cada migración .up debe tener un archivo .down equivalente');

  for (const up of upFiles) {
    const base = up.replace('.up.sql', '');
    assert.ok(
      downFiles.includes(`${base}.down.sql`),
      `Falta archivo .down.sql para la migración ${base}`
    );
  }
});

test('la migración 006 formaliza las relaciones de citas, horarios y la vista detallada', () => {
  const mig006Up = fs.readFileSync(path.join(DIR_MIGRACIONES, '006_relaciones_citas_modelo.up.sql'), 'utf8');
  assert.ok(mig006Up.includes('v_citas_detalladas'), 'La migración 006 debe crear la vista v_citas_detalladas');
  assert.ok(mig006Up.includes('idx_citas_usuario_estado'), 'Debe incluir índice idx_citas_usuario_estado');
  assert.ok(mig006Up.includes('idx_espacios_clinica_servicio_inicio'), 'Debe incluir índice idx_espacios_clinica_servicio_inicio');

  const mig006Down = fs.readFileSync(path.join(DIR_MIGRACIONES, '006_relaciones_citas_modelo.down.sql'), 'utf8');
  assert.ok(mig006Down.includes('DROP VIEW IF EXISTS v_citas_detalladas'), 'El down debe revertir la vista');
});

test('el acuerdo técnico de citas documenta los 4 estados y las relaciones', () => {
  const docPath = path.resolve(__dirname, '../../docs/acuerdo-citas-modelo-relaciones.md');
  if (!fs.existsSync(docPath)) return;
  const contenido = fs.readFileSync(docPath, 'utf8');
  assert.ok(contenido.includes('confirmada'));
  assert.ok(contenido.includes('cancelada'));
  assert.ok(contenido.includes('completada'));
  assert.ok(contenido.includes('no_asistio'));
  assert.ok(contenido.includes('horarios_atencion'));
});

