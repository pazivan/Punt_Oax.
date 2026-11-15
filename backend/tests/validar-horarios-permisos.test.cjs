/**
 * ============================================================================
 * PRUEBAS DE VALIDACIÓN DE HORARIOS Y PERMISOS DE CITAS (RBAC)
 * Sprint 6 · Jonathan · Issue #57
 * ============================================================================
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  esUuid,
  validarPermisoRol,
  validarPertenenciaCita,
  validarDisponibilidadHorario,
  validarEnHorarioAtencion,
  validarTransicionEstadoCita,
} = require("../validacionesCitas");
const {
  registrarRutasCitas,
  solicitarCita,
  cancelarCitaUsuario,
  actualizarEstadoCitaClinica,
} = require("../citas");

function mockApp() {
  const rutas = {};
  const registrar = (metodo) => (ruta, ...handlers) => {
    rutas[`${metodo} ${ruta}`] = handlers;
  };
  return {
    rutas,
    get: registrar("GET"),
    post: registrar("POST"),
    patch: registrar("PATCH"),
  };
}

function mockRes() {
  return {
    codigo: 200,
    cuerpo: null,
    status(c) {
      this.codigo = c;
      return this;
    },
    json(b) {
      this.cuerpo = b;
      return this;
    },
  };
}

// ============================================================================
// 1. VALIDACIONES DE HORARIOS OCUPADOS Y FRANJAS DE ATENCIÓN (con Iván #55)
// ============================================================================

test("validarEnHorarioAtencion comprueba si un turno encaja en los días y horarios de la clínica", () => {
  const horariosClinica = [
    // Lunes a Viernes: 08:00 a 14:00 (dia_semana 1..5)
    { dia_semana: 1, hora_apertura: "08:00:00", hora_cierre: "14:00:00", es_24_horas: false, cruza_medianoche: false },
    { dia_semana: 2, hora_apertura: "08:00:00", hora_cierre: "14:00:00", es_24_horas: false, cruza_medianoche: false },
    { dia_semana: 3, hora_apertura: "08:00:00", hora_cierre: "14:00:00", es_24_horas: false, cruza_medianoche: false },
    { dia_semana: 4, hora_apertura: "08:00:00", hora_cierre: "14:00:00", es_24_horas: false, cruza_medianoche: false },
    { dia_semana: 5, hora_apertura: "08:00:00", hora_cierre: "14:00:00", es_24_horas: false, cruza_medianoche: false },
  ];

  // Turno un lunes a las 09:30 UTC -> Dentro del horario
  // 2026-11-16 es Lunes
  assert.equal(validarEnHorarioAtencion("2026-11-16T09:30:00.000Z", horariosClinica), true);

  // Turno un lunes a las 15:30 UTC -> Fuera de horario (cierra a las 14:00)
  assert.equal(validarEnHorarioAtencion("2026-11-16T15:30:00.000Z", horariosClinica), false);

  // Turno un domingo (2026-11-15) -> La clínica no abre en domingo
  assert.equal(validarEnHorarioAtencion("2026-11-15T10:00:00.000Z", horariosClinica), false);

  // Clínica de 24 horas (cualquier hora es válida)
  const horario24h = [{ dia_semana: 1, es_24_horas: true }];
  assert.equal(validarEnHorarioAtencion("2026-11-16T03:15:00.000Z", horario24h), true);

  // Si la clínica no tiene horarios definidos, no se bloquea
  assert.equal(validarEnHorarioAtencion("2026-11-16T10:00:00.000Z", []), true);
});

test("validarDisponibilidadHorario previene citas en horarios ocupados o con choque", () => {
  // Horario disponible normal
  const ok = validarDisponibilidadHorario({
    espacioExiste: true,
    reservable: true,
    esFuturo: true,
    estaOcupado: false,
    tieneChoqueUsuario: false,
    dentroDeHorarioClinica: true,
  });
  assert.equal(ok.valido, true);

  // Horario ya reservado por otro usuario -> 409
  const ocupado = validarDisponibilidadHorario({
    espacioExiste: true,
    reservable: true,
    esFuturo: true,
    estaOcupado: true,
    tieneChoqueUsuario: false,
  });
  assert.equal(ocupado.valido, false);
  assert.equal(ocupado.status, 409);
  assert.match(ocupado.error, /ya fue reservado/);

  // Choque de horario: el mismo usuario ya tiene otra cita a esa hora -> 409
  const choque = validarDisponibilidadHorario({
    espacioExiste: true,
    reservable: true,
    esFuturo: true,
    estaOcupado: false,
    tieneChoqueUsuario: true,
  });
  assert.equal(choque.valido, false);
  assert.equal(choque.status, 409);
  assert.match(choque.error, /otra cita a esa misma hora/);

  // Horario en el pasado -> 409
  const pasado = validarDisponibilidadHorario({
    espacioExiste: true,
    reservable: true,
    esFuturo: false,
    estaOcupado: false,
    tieneChoqueUsuario: false,
  });
  assert.equal(pasado.valido, false);
  assert.equal(pasado.status, 409);
  assert.match(pasado.error, /ya pasó/);

  // Fuera del horario de atención de la clínica -> 409
  const fueraHorario = validarDisponibilidadHorario({
    espacioExiste: true,
    reservable: true,
    esFuturo: true,
    estaOcupado: false,
    tieneChoqueUsuario: false,
    dentroDeHorarioClinica: false,
  });
  assert.equal(fueraHorario.valido, false);
  assert.equal(fueraHorario.status, 409);
  assert.match(fueraHorario.error, /no coincide con los días y horas de atención/);
});

test("solicitarCita rechaza con 409 si el turno ya fue tomado o cae fuera de horario", async () => {
  const idEspacio = "44444444-4444-4444-8444-444444444444";
  const idUsuario = "55555555-5555-4555-8555-555555555555";
  const idClinica = "66666666-6666-4666-8666-666666666666";

  // Caso 1: Espacio ya ocupado
  let clienteOcupado = {
    async query(sql) {
      if (/FOR UPDATE OF ed/.test(sql)) {
        return {
          rows: [{
            fecha_hora_inicio: new Date(Date.now() + 86400000),
            reservable: true,
            es_futuro: true,
            id_clinica: idClinica,
          }],
        };
      }
      if (/FROM citas WHERE id_espacio = \$1/.test(sql)) {
        return { rows: [{ id_cita: "cita-existente" }] }; // Ocupado
      }
      return { rows: [] };
    },
    release() {},
  };
  const poolOcupado = { connect: async () => clienteOcupado };
  const resOcupado = await solicitarCita(poolOcupado, idUsuario, { id_espacio: idEspacio });
  assert.equal(resOcupado.status, 409);
  assert.match(resOcupado.body.error, /ya fue reservado/);

  // Caso 2: El usuario ya tiene otra cita en esa misma franja
  let clienteChoque = {
    async query(sql) {
      if (/FOR UPDATE OF ed/.test(sql)) {
        return {
          rows: [{
            fecha_hora_inicio: new Date(Date.now() + 86400000),
            reservable: true,
            es_futuro: true,
            id_clinica: idClinica,
          }],
        };
      }
      if (/FROM citas WHERE id_espacio = \$1/.test(sql)) return { rows: [] }; // Libre
      if (/WHERE ci\.id_usuario = \$1 AND ci\.estado = 'confirmada'/.test(sql)) {
        return { rows: [{ id_cita: "cita-choque" }] }; // Choque del mismo usuario
      }
      return { rows: [] };
    },
    release() {},
  };
  const poolChoque = { connect: async () => clienteChoque };
  const resChoque = await solicitarCita(poolChoque, idUsuario, { id_espacio: idEspacio });
  assert.equal(resChoque.status, 409);
  assert.match(resChoque.body.error, /Ya tienes otra cita/);
});

// ============================================================================
// 2. VALIDACIONES DE PERMISOS POR ROL Y PROTECCIÓN RBAC (con Kelly #56)
// ============================================================================

test("validarPermisoRol garantiza que cada rol solo realice las acciones autorizadas", () => {
  // 1. Acciones exclusivas del paciente (rol 'usuario')
  assert.equal(validarPermisoRol({ rol: "usuario" }, "solicitar_cita").permitido, true);
  assert.equal(validarPermisoRol({ rol: "usuario" }, "listar_mis_citas_usuario").permitido, true);
  assert.equal(validarPermisoRol({ rol: "usuario" }, "cancelar_cita_usuario").permitido, true);

  // Rol clínica intentando actuar como paciente -> 403
  const clinicaSolicita = validarPermisoRol({ rol: "clinica" }, "solicitar_cita");
  assert.equal(clinicaSolicita.permitido, false);
  assert.equal(clinicaSolicita.status, 403);
  assert.match(clinicaSolicita.motivo, /Solo los pacientes/);

  // 2. Acciones exclusivas de la clínica (rol 'clinica')
  assert.equal(validarPermisoRol({ rol: "clinica" }, "listar_citas_clinica").permitido, true);
  assert.equal(validarPermisoRol({ rol: "clinica" }, "actualizar_estado_clinica").permitido, true);

  // Rol usuario intentando gestionar agenda institucional -> 403
  const usuarioModificaClinica = validarPermisoRol({ rol: "usuario" }, "actualizar_estado_clinica");
  assert.equal(usuarioModificaClinica.permitido, false);
  assert.equal(usuarioModificaClinica.status, 403);
  assert.match(usuarioModificaClinica.motivo, /Solo el personal institucional/);

  // 3. Usuario anónimo / sin rol -> 401
  const anonimo = validarPermisoRol(null, "solicitar_cita");
  assert.equal(anonimo.permitido, false);
  assert.equal(anonimo.status, 401);
});

test("validarPertenenciaCita previene IDOR: usuarios y clínicas solo ven lo suyo", () => {
  const idUsuarioA = "11111111-1111-4111-8111-111111111111";
  const idUsuarioB = "22222222-2222-4222-8222-222222222222";
  const idClinicaA = "33333333-3333-4333-8333-333333333333";
  const idClinicaB = "44444444-4444-4444-8444-444444444444";

  const citaDeA = {
    id_cita: "cita-1",
    id_usuario: idUsuarioA,
    id_clinica: idClinicaA,
  };

  // Usuario A accede a su propia cita -> OK
  assert.equal(
    validarPertenenciaCita({ rol: "usuario", idSolicitante: idUsuarioA, cita: citaDeA }).permitido,
    true
  );

  // Usuario B intenta acceder a la cita de A -> 404 (ocultamiento por seguridad)
  const intentoB = validarPertenenciaCita({
    rol: "usuario",
    idSolicitante: idUsuarioB,
    cita: citaDeA,
  });
  assert.equal(intentoB.permitido, false);
  assert.equal(intentoB.status, 404);

  // Clínica A accede a la cita asignada a su sede -> OK
  assert.equal(
    validarPertenenciaCita({ rol: "clinica", idSolicitante: idClinicaA, cita: citaDeA }).permitido,
    true
  );

  // Clínica B intenta modificar la cita de Clínica A -> 404
  const intentoClinicaB = validarPertenenciaCita({
    rol: "clinica",
    idSolicitante: idClinicaB,
    cita: citaDeA,
  });
  assert.equal(intentoClinicaB.permitido, false);
  assert.equal(intentoClinicaB.status, 404);
});

// ============================================================================
// 3. VALIDACIÓN DE TRANSICIONES TEMPORALES Y ESTADOS DE CITA (Acuerdo Iván)
// ============================================================================

test("validarTransicionEstadoCita respeta la matriz temporal y de roles", () => {
  // Usuario: Solo puede cancelar citas futuras
  assert.equal(
    validarTransicionEstadoCita({ rol: "usuario", estadoActual: "confirmada", nuevoEstado: "cancelada", esFutura: true }).valida,
    true
  );
  // Usuario cancelando cita pasada -> 409
  const usuarioCancelaPasada = validarTransicionEstadoCita({
    rol: "usuario",
    estadoActual: "confirmada",
    nuevoEstado: "cancelada",
    esFutura: false,
  });
  assert.equal(usuarioCancelaPasada.valida, false);
  assert.equal(usuarioCancelaPasada.status, 409);
  assert.match(usuarioCancelaPasada.motivo, /ya pasó/);

  // Usuario intentando marcar completada -> 403
  const usuarioCompletar = validarTransicionEstadoCita({
    rol: "usuario",
    estadoActual: "confirmada",
    nuevoEstado: "completada",
    esFutura: false,
  });
  assert.equal(usuarioCompletar.valida, false);
  assert.equal(usuarioCompletar.status, 403);

  // Clínica: Puede completar citas pasadas
  assert.equal(
    validarTransicionEstadoCita({ rol: "clinica", estadoActual: "confirmada", nuevoEstado: "completada", esFutura: false }).valida,
    true
  );

  // Clínica intentando completar una cita antes de que ocurra -> 409
  const clinicaCompletaFutura = validarTransicionEstadoCita({
    rol: "clinica",
    estadoActual: "confirmada",
    nuevoEstado: "completada",
    esFutura: true,
  });
  assert.equal(clinicaCompletaFutura.valida, false);
  assert.equal(clinicaCompletaFutura.status, 409);
  assert.match(clinicaCompletaFutura.motivo, /después de la hora de la cita/);

  // Clínica cancelando cita futura -> OK
  assert.equal(
    validarTransicionEstadoCita({ rol: "clinica", estadoActual: "confirmada", nuevoEstado: "cancelada", esFutura: true }).valida,
    true
  );

  // Clínica cancelando cita pasada -> 409
  assert.equal(
    validarTransicionEstadoCita({ rol: "clinica", estadoActual: "confirmada", nuevoEstado: "cancelada", esFutura: false }).status,
    409
  );

  // Cita ya cancelada no se puede volver a modificar -> 409
  const reintento = validarTransicionEstadoCita({
    rol: "clinica",
    estadoActual: "cancelada",
    nuevoEstado: "completada",
    esFutura: false,
  });
  assert.equal(reintento.valida, false);
  assert.equal(reintento.status, 409);
  assert.match(reintento.motivo, /ya está cancelada/);
});
