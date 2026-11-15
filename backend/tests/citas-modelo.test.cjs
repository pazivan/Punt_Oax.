const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RUTA_MIG_UP = path.resolve(__dirname, '../../db/migrations/006_relaciones_citas_modelo.up.sql');
const RUTA_MIG_DOWN = path.resolve(__dirname, '../../db/migrations/006_relaciones_citas_modelo.down.sql');
const RUTA_DOC = path.resolve(__dirname, '../../docs/acuerdo-citas-modelo-relaciones.md');

test('los archivos de la migración 006 (.up.sql y .down.sql) existen y son válidos', () => {
  assert.ok(fs.existsSync(RUTA_MIG_UP), 'Debe existir 006_relaciones_citas_modelo.up.sql');
  assert.ok(fs.existsSync(RUTA_MIG_DOWN), 'Debe existir 006_relaciones_citas_modelo.down.sql');

  const upSql = fs.readFileSync(RUTA_MIG_UP, 'utf8');
  assert.ok(upSql.includes('v_citas_detalladas'), 'La migración 006 debe crear la vista v_citas_detalladas');
  assert.ok(upSql.includes('idx_citas_usuario_estado'), 'Debe indexar id_usuario y estado');
  assert.ok(upSql.includes('idx_espacios_clinica_servicio_inicio'), 'Debe indexar espacios disponibles por servicio y fecha');

  const downSql = fs.readFileSync(RUTA_MIG_DOWN, 'utf8');
  assert.ok(downSql.includes('DROP VIEW IF EXISTS v_citas_detalladas'), 'El down.sql debe eliminar la vista');
  assert.ok(downSql.includes('DROP INDEX IF EXISTS idx_citas_usuario_estado'), 'El down.sql debe eliminar los índices');
});

test('el acuerdo técnico documenta las relaciones de citas con usuarios, clínicas, horarios y sus 4 estados', () => {
  assert.ok(fs.existsSync(RUTA_DOC), 'Debe existir docs/acuerdo-citas-modelo-relaciones.md');
  const doc = fs.readFileSync(RUTA_DOC, 'utf8');

  // Relaciones
  assert.ok(doc.includes('usuarios'), 'Debe documentar relación con usuarios');
  assert.ok(doc.includes('clinicas'), 'Debe documentar relación con clínicas');
  assert.ok(doc.includes('horarios_atencion'), 'Debe documentar relación con horarios de atención');
  assert.ok(doc.includes('espacios_disponibles'), 'Debe documentar espacios disponibles');

  // Estados
  const estados = ['confirmada', 'cancelada', 'completada', 'no_asistio'];
  for (const estado of estados) {
    assert.ok(doc.includes(estado), `El documento debe describir el estado '${estado}'`);
  }

  // Regla crítica del índice único condicional
  assert.ok(doc.includes('uq_citas_espacio_activa'), 'Debe explicar la regla del índice único uq_citas_espacio_activa');
});

test('valida las reglas de transición y estados permitidos para citas', () => {
  const ESTADOS_VALIDOS = new Set(['confirmada', 'cancelada', 'completada', 'no_asistio']);

  function validarTransicion({ rol, estadoActual, nuevoEstado, esFutura }) {
    if (!ESTADOS_VALIDOS.has(nuevoEstado)) {
      return { permitida: false, motivo: 'Estado no válido' };
    }
    if (estadoActual !== 'confirmada') {
      return { permitida: false, motivo: `La cita ya está ${estadoActual} y no se puede cambiar` };
    }
    if (rol === 'usuario') {
      if (nuevoEstado !== 'cancelada') {
        return { permitida: false, motivo: 'El usuario solo puede cancelar su cita' };
      }
      if (!esFutura) {
        return { permitida: false, motivo: 'No se puede cancelar una cita que ya pasó' };
      }
      return { permitida: true };
    }
    if (rol === 'clinica') {
      if (nuevoEstado === 'cancelada') {
        if (!esFutura) return { permitida: false, motivo: 'La cita ya pasó' };
        return { permitida: true };
      }
      if (nuevoEstado === 'completada' || nuevoEstado === 'no_asistio') {
        if (esFutura) return { permitida: false, motivo: 'Solo se puede marcar después de la cita' };
        return { permitida: true };
      }
    }
    return { permitida: false, motivo: 'Rol no autorizado' };
  }

  // Usuario cancela cita futura -> OK
  assert.equal(validarTransicion({ rol: 'usuario', estadoActual: 'confirmada', nuevoEstado: 'cancelada', esFutura: true }).permitida, true);
  // Usuario cancela cita pasada -> Error
  assert.equal(validarTransicion({ rol: 'usuario', estadoActual: 'confirmada', nuevoEstado: 'cancelada', esFutura: false }).permitida, false);
  // Usuario intenta marcar completada -> Error
  assert.equal(validarTransicion({ rol: 'usuario', estadoActual: 'confirmada', nuevoEstado: 'completada', esFutura: false }).permitida, false);

  // Clínica cancela cita futura -> OK
  assert.equal(validarTransicion({ rol: 'clinica', estadoActual: 'confirmada', nuevoEstado: 'cancelada', esFutura: true }).permitida, true);
  // Clínica completa cita que ya pasó -> OK
  assert.equal(validarTransicion({ rol: 'clinica', estadoActual: 'confirmada', nuevoEstado: 'completada', esFutura: false }).permitida, true);
  // Clínica marca no asistió en cita futura -> Error
  assert.equal(validarTransicion({ rol: 'clinica', estadoActual: 'confirmada', nuevoEstado: 'no_asistio', esFutura: true }).permitida, false);
  // Cita ya cancelada no puede pasar a completada -> Error
  assert.equal(validarTransicion({ rol: 'clinica', estadoActual: 'cancelada', nuevoEstado: 'completada', esFutura: false }).permitida, false);
});

test('simula la regla del índice único condicional: cancelar libera el espacio para una nueva cita', () => {
  const citasEnBD = [];

  function intentarAgendar({ id_espacio, id_usuario }) {
    // Regla del índice único uq_citas_espacio_activa: WHERE estado <> 'cancelada'
    const conflicto = citasEnBD.some(c => c.id_espacio === id_espacio && c.estado !== 'cancelada');
    if (conflicto) {
      throw new Error('23505: El horario seleccionado ya fue reservado.');
    }
    const nuevaCita = {
      id_cita: `cita-${citasEnBD.length + 1}`,
      id_espacio,
      id_usuario,
      estado: 'confirmada',
    };
    citasEnBD.push(nuevaCita);
    return nuevaCita;
  }

  // 1. Usuario 1 agenda en espacio A
  const cita1 = intentarAgendar({ id_espacio: 'espacio-A', id_usuario: 'user-01' });
  assert.equal(cita1.estado, 'confirmada');

  // 2. Usuario 2 intenta agendar en el mismo espacio A -> Rebota por duplicado
  assert.throws(() => {
    intentarAgendar({ id_espacio: 'espacio-A', id_usuario: 'user-02' });
  }, /23505/);

  // 3. Usuario 1 cancela su cita
  cita1.estado = 'cancelada';

  // 4. Usuario 2 vuelve a intentar agendar en espacio A -> Debe ser exitoso porque el turno quedó libre
  const cita2 = intentarAgendar({ id_espacio: 'espacio-A', id_usuario: 'user-02' });
  assert.equal(cita2.estado, 'confirmada');
  assert.equal(cita2.id_usuario, 'user-02');
});

test('la vista canónica v_citas_detalladas define todas las columnas para los contratos de API', () => {
  const upSql = fs.readFileSync(RUTA_MIG_UP, 'utf8');

  const columnasEsperadas = [
    'id_cita',
    'id_usuario',
    'usuario_nombre',
    'usuario_telefono',
    'id_espacio',
    'fecha_hora_inicio',
    'id_clinica',
    'clinica_nombre',
    'clinica_municipio',
    'id_servicio',
    'servicio_nombre',
    'estado',
    'fecha_reserva',
    'horario_apertura',
    'horario_cierre',
    'es_pasada',
    'es_futura',
  ];

  for (const col of columnasEsperadas) {
    assert.ok(upSql.includes(col), `La vista debe proyectar la columna '${col}'`);
  }
});
