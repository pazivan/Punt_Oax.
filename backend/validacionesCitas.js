/**
 * ============================================================================
 * PUNTOAX - MÓDULO DE VALIDACIONES DE HORARIOS Y PERMISOS DE CITAS (RBAC)
 * Sprint 6 · Jonathan · Issue #57
 *
 * Apoyo y coordinación:
 *  - Iván (#55): Estados, transiciones y relaciones con horarios_atencion.
 *  - Kelly (#56): Rutas y controladores de citas.
 * ============================================================================
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ESTADOS_VALIDOS = new Set(["confirmada", "cancelada", "completada", "no_asistio"]);
const ESTADOS_PERMITIDOS_CLINICA = new Set(["cancelada", "completada", "no_asistio"]);

/**
 * 1. Valida si una cadena es un UUID válido.
 */
function esUuid(valor) {
  return typeof valor === "string" && UUID_RE.test(valor);
}

/**
 * 2. Valida los permisos por rol para acciones de citas (RBAC).
 *
 * Roles permitidos:
 *  - 'usuario': Solicitar citas, consultar sus citas, consultar detalle de su cita, cancelar su cita.
 *  - 'clinica': Consultar agenda institucional, actualizar estado de citas de sus propios servicios.
 *  - 'administrador': Auditoría y gestión central.
 *
 * @param {Object} usuario - Objeto extraído del JWT ({ id, correo, rol })
 * @param {string} accion - Acción a ejecutar
 * @returns {{ permitido: boolean, motivo?: string, status?: number }}
 */
function validarPermisoRol(usuario, accion) {
  if (!usuario || !usuario.rol) {
    return {
      permitido: false,
      status: 401,
      motivo: "Acceso no autorizado: Se requiere una sesión activa con token JWT.",
    };
  }

  const { rol } = usuario;

  switch (accion) {
    case "solicitar_cita":
    case "listar_mis_citas_usuario":
    case "consultar_cita_usuario":
    case "cancelar_cita_usuario":
      if (rol !== "usuario") {
        return {
          permitido: false,
          status: 403,
          motivo: `Acceso denegado: Solo los pacientes con rol 'usuario' pueden ${accion.replace(/_/g, " ")}.`,
        };
      }
      return { permitido: true };

    case "listar_citas_clinica":
    case "actualizar_estado_clinica":
      if (rol !== "clinica") {
        return {
          permitido: false,
          status: 403,
          motivo: `Acceso denegado: Solo el personal institucional con rol 'clinica' puede gestionar la agenda de su sede.`,
        };
      }
      return { permitido: true };

    case "consultar_espacios":
      // Tanto usuarios registrados como personal clínico o administradores pueden ver espacios disponibles
      if (!["usuario", "clinica", "administrador"].includes(rol)) {
        return {
          permitido: false,
          status: 403,
          motivo: "Acceso denegado: Rol no autorizado para consultar horarios disponibles.",
        };
      }
      return { permitido: true };

    default:
      return {
        permitido: false,
        status: 403,
        motivo: "Acción no reconocida en el control de acceso de citas.",
      };
  }
}

/**
 * 3. Valida la pertenencia de una cita para evitar ataques IDOR (Insecure Direct Object Reference).
 *
 * @param {Object} params
 * @param {string} params.rol - Rol del solicitante
 * @param {string} params.idSolicitante - UUID del usuario autenticado en JWT
 * @param {Object} params.cita - Registro de la cita a verificar
 * @returns {{ permitido: boolean, status?: number, motivo?: string }}
 */
function validarPertenenciaCita({ rol, idSolicitante, cita }) {
  if (!cita) {
    return { permitido: false, status: 404, motivo: "Cita no encontrada." };
  }

  if (rol === "usuario") {
    if (cita.id_usuario !== idSolicitante) {
      // Devolver 404 para no filtrar la existencia de citas ajenas
      return { permitido: false, status: 404, motivo: "Cita no encontrada." };
    }
    return { permitido: true };
  }

  if (rol === "clinica") {
    if (cita.id_clinica !== idSolicitante) {
      return { permitido: false, status: 404, motivo: "Cita no encontrada en tu clínica." };
    }
    return { permitido: true };
  }

  return { permitido: false, status: 403, motivo: "Rol no autorizado para acceder a esta cita." };
}

/**
 * 4. Valida la disponibilidad de un horario y previene sobre-reserva / horarios ocupados.
 *
 * Reglas de negocio acordadas con Iván:
 *  - El horario debe existir y estar activo/habilitado.
 *  - La sede debe estar en estado 'aprobada'.
 *  - El horario debe ser estrictamente futuro (fecha_hora_inicio > NOW()).
 *  - El espacio no debe tener ninguna cita activa (estado <> 'cancelada').
 *  - El paciente no debe tener otra cita confirmada en la misma fecha y hora.
 *
 * @param {Object} params
 * @returns {{ valido: boolean, status?: number, error?: string }}
 */
function validarDisponibilidadHorario({
  espacioExiste,
  reservable,
  esFuturo,
  estaOcupado,
  tieneChoqueUsuario,
  dentroDeHorarioClinica = true,
}) {
  if (!espacioExiste) {
    return { valido: false, status: 404, error: "El horario seleccionado no existe." };
  }
  if (!reservable) {
    return { valido: false, status: 409, error: "Este horario ya no está disponible o el centro no está activo." };
  }
  if (!esFuturo) {
    return { valido: false, status: 409, error: "No se puede reservar un horario que ya pasó." };
  }
  if (dentroDeHorarioClinica === false) {
    return { valido: false, status: 409, error: "El horario seleccionado no coincide con los días y horas de atención de la clínica." };
  }
  if (estaOcupado) {
    return { valido: false, status: 409, error: "El horario seleccionado ya fue reservado." };
  }
  if (tieneChoqueUsuario) {
    return { valido: false, status: 409, error: "Ya tienes otra cita a esa misma hora." };
  }

  return { valido: true };
}

/**
 * 5. Valida si una fecha y hora cae dentro de las franjas de atención de la clínica.
 *
 * @param {Date|string} fechaHora - Fecha y hora del turno
 * @param {Array<Object>} horariosAtencion - Franjas de la clínica [{ dia_semana, hora_apertura, hora_cierre, es_24_horas, cruza_medianoche }]
 * @returns {boolean}
 */
function validarEnHorarioAtencion(fechaHora, horariosAtencion) {
  if (!Array.isArray(horariosAtencion) || horariosAtencion.length === 0) {
    // Si la clínica no tiene horarios estructurados cargados, no bloquear
    return true;
  }

  const fecha = new Date(fechaHora);
  if (Number.isNaN(fecha.getTime())) return false;

  const diaSemana = fecha.getUTCDay(); // 0 = Domingo ... 6 = Sábado
  // Formato HH:MM
  const horas = String(fecha.getUTCHours()).padStart(2, "0");
  const minutos = String(fecha.getUTCMinutes()).padStart(2, "0");
  const horaCita = `${horas}:${minutos}`;

  const franjasDia = horariosAtencion.filter((h) => Number(h.dia_semana) === diaSemana);
  if (franjasDia.length === 0) return false;

  return franjasDia.some((h) => {
    if (h.es_24_horas) return true;
    const apertura = String(h.hora_apertura).slice(0, 5);
    const cierre = String(h.hora_cierre).slice(0, 5);

    if (h.cruza_medianoche) {
      return horaCita >= apertura || horaCita < cierre;
    }
    return horaCita >= apertura && horaCita < cierre;
  });
}

/**
 * 6. Valida las transiciones de estado permitidas según rol y temporalidad de la cita.
 *
 * Reglas de transición (Acuerdo Iván #55):
 *  - Solo se puede cambiar una cita si su estado actual es 'confirmada'.
 *  - Rol usuario: Solo puede cambiar a 'cancelada', y solo si es_futura = true.
 *  - Rol clinica:
 *     - 'cancelada': solo si es_futura = true.
 *     - 'completada' / 'no_asistio': solo si es_futura = false (la cita ya ocurrió).
 *  - No se permiten transiciones desde 'cancelada', 'completada' o 'no_asistio'.
 *
 * @param {Object} params
 * @param {'usuario' | 'clinica'} params.rol
 * @param {string} params.estadoActual
 * @param {string} params.nuevoEstado
 * @param {boolean} params.esFutura
 * @returns {{ valida: boolean, status?: number, motivo?: string }}
 */
function validarTransicionEstadoCita({ rol, estadoActual, nuevoEstado, esFutura }) {
  if (!ESTADOS_VALIDOS.has(nuevoEstado)) {
    return {
      valida: false,
      status: 400,
      motivo: `Estado no válido. Estados admitidos: ${Array.from(ESTADOS_VALIDOS).join(", ")}.`,
    };
  }

  const textoActual = String(estadoActual).replace("_", " ");

  if (rol === "usuario") {
    if (estadoActual !== "confirmada") {
      return {
        valida: false,
        status: 409,
        motivo: `La cita ya está ${textoActual} y no se puede cancelar.`,
      };
    }
    if (nuevoEstado !== "cancelada") {
      return {
        valida: false,
        status: 403,
        motivo: "El paciente solo tiene autorización para cancelar su cita.",
      };
    }
    if (!esFutura) {
      return {
        valida: false,
        status: 409,
        motivo: "No se puede cancelar una cita que ya pasó.",
      };
    }
    return { valida: true };
  }

  if (rol === "clinica") {
    if (!ESTADOS_PERMITIDOS_CLINICA.has(nuevoEstado)) {
      return {
        valida: false,
        status: 400,
        motivo: `Estado no válido. Usa: ${Array.from(ESTADOS_PERMITIDOS_CLINICA).join(", ")}.`,
      };
    }

    if (estadoActual !== "confirmada") {
      return {
        valida: false,
        status: 409,
        motivo: `La cita ya está ${textoActual}; no se puede cambiar.`,
      };
    }

    if (nuevoEstado === "cancelada" && !esFutura) {
      return {
        valida: false,
        status: 409,
        motivo: "La cita ya pasó: márcala como completada o no asistió.",
      };
    }

    if (nuevoEstado !== "cancelada" && esFutura) {
      return {
        valida: false,
        status: 409,
        motivo: "Solo puedes marcar completada o no asistió después de la hora de la cita.",
      };
    }

    return { valida: true };
  }

  return {
    valida: false,
    status: 403,
    motivo: "Rol no autorizado para modificar el estado de la cita.",
  };
}

module.exports = {
  esUuid,
  ESTADOS_VALIDOS,
  ESTADOS_PERMITIDOS_CLINICA,
  validarPermisoRol,
  validarPertenenciaCita,
  validarDisponibilidadHorario,
  validarEnHorarioAtencion,
  validarTransicionEstadoCita,
};
