/**
 * API de citas (Sprint 6 · Kelly · issue #56)
 *
 * Reglas de seguridad:
 *  - El usuario y la clínica se identifican SIEMPRE desde el JWT (req.usuario.id),
 *    nunca desde el cuerpo, la URL o la query.
 *  - Un usuario solo ve y cancela sus propias citas.
 *  - Una clínica solo cambia el estado de citas de sus propios servicios.
 *
 * Estados (tabla citas, migración 001): confirmada | cancelada | completada | no_asistio
 * Transiciones permitidas (solo desde 'confirmada'):
 *  - usuario  -> cancelada                    (solo si la cita aún no empieza)
 *  - clínica  -> cancelada                    (solo si la cita aún no empieza)
 *  - clínica  -> completada | no_asistio      (solo si la hora de la cita ya pasó)
 */

const {
  esUuid,
  ESTADOS_VALIDOS,
  ESTADOS_PERMITIDOS_CLINICA,
  validarPermisoRol,
  validarPertenenciaCita,
  validarDisponibilidadHorario,
  validarEnHorarioAtencion,
  validarTransicionEstadoCita,
} = require("./validacionesCitas");

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const ESTADOS = Array.from(ESTADOS_VALIDOS);
const ESTADOS_CLINICA = Array.from(ESTADOS_PERMITIDOS_CLINICA);
const MAX_DIAS_CONSULTA = 60;

const respuesta = (status, body) => ({ status, body });
const textoEstado = (estado) => String(estado).replace("_", " ");

// Columnas que se devuelven al usuario (mismos nombres que usa Citlalli en "Mis citas").
const COLUMNAS_CITA = `
  ci.id_cita,
  ci.estado,
  ci.fecha_reserva,
  ed.id_espacio,
  ed.fecha_hora_inicio,
  s.nombre AS nombre_servicio,
  cl.id_clinica,
  cl.nombre AS nombre_clinica,
  cl.municipio AS municipio_clinica,
  cl.direccion AS direccion_clinica,
  cl.telefono AS telefono_clinica
`;

const JOINS_CITA = `
  FROM citas ci
  INNER JOIN espacios_disponibles ed ON ed.id_espacio = ci.id_espacio
  INNER JOIN clinicas_servicios cs ON cs.id_clinica_servicio = ed.id_clinica_servicio
  INNER JOIN servicios s ON s.id_servicio = cs.id_servicio
  INNER JOIN clinicas cl ON cl.id_clinica = cs.id_clinica
`;

async function obtenerCitaDeUsuario(db, idUsuario, idCita) {
  const { rows } = await db.query(
    `SELECT ${COLUMNAS_CITA} ${JOINS_CITA}
     WHERE ci.id_cita = $1 AND ci.id_usuario = $2`,
    [idCita, idUsuario]
  );
  return rows[0] || null;
}

// Ejecuta el trabajo dentro de una transacción y siempre libera la conexión.
async function enTransaccion(pool, trabajo) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const resultado = await trabajo(client);
    await client.query(resultado.status < 400 ? "COMMIT" : "ROLLBACK");
    return resultado;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// ------------------------------------------------------------------
// 1. Horarios libres de una clínica (para que el usuario elija)
// ------------------------------------------------------------------
async function listarEspaciosDisponibles(db, idClinica, { desde, hasta, servicio } = {}) {
  if (!esUuid(idClinica)) return respuesta(400, { error: "Identificador de clínica no válido." });
  if (servicio !== undefined && !esUuid(servicio)) {
    return respuesta(400, { error: "Identificador de servicio no válido." });
  }
  for (const [nombre, valor] of [["desde", desde], ["hasta", hasta]]) {
    if (valor !== undefined &&
        (typeof valor !== "string" || !FECHA_RE.test(valor) || Number.isNaN(Date.parse(valor)))) {
      return respuesta(400, { error: `El parámetro '${nombre}' debe tener el formato AAAA-MM-DD.` });
    }
  }
  if (desde && hasta) {
    const dias = (Date.parse(hasta) - Date.parse(desde)) / 86400000;
    if (dias < 0) return respuesta(400, { error: "'desde' no puede ser posterior a 'hasta'." });
    if (dias > MAX_DIAS_CONSULTA) {
      return respuesta(400, { error: `Consulta como máximo ${MAX_DIAS_CONSULTA} días a la vez.` });
    }
  }

  const clinica = await db.query(
    "SELECT 1 FROM clinicas WHERE id_clinica = $1 AND estado_publicacion = 'aprobada'",
    [idClinica]
  );
  if (!clinica.rows.length) return respuesta(404, { error: "Centro no encontrado." });

  // Fechas en hora de México; sin 'desde'/'hasta' se muestran los próximos 30 días.
  const { rows } = await db.query(
    `SELECT ed.id_espacio, ed.fecha_hora_inicio, cs.id_clinica_servicio,
            s.id_servicio, s.nombre AS nombre_servicio
     FROM espacios_disponibles ed
     INNER JOIN clinicas_servicios cs ON cs.id_clinica_servicio = ed.id_clinica_servicio
     INNER JOIN servicios s ON s.id_servicio = cs.id_servicio
     WHERE cs.id_clinica = $1
       AND ($2::uuid IS NULL OR s.id_servicio = $2::uuid)
       AND ed.habilitado = TRUE AND cs.activo = TRUE AND s.activo = TRUE
       AND ed.fecha_hora_inicio > NOW()
       AND ed.fecha_hora_inicio >= COALESCE($3::date::timestamp AT TIME ZONE 'America/Mexico_City', NOW())
       AND ed.fecha_hora_inicio < COALESCE(($4::date + 1)::timestamp AT TIME ZONE 'America/Mexico_City',
                                           NOW() + INTERVAL '30 days')
       AND NOT EXISTS (
         SELECT 1 FROM citas ci WHERE ci.id_espacio = ed.id_espacio AND ci.estado <> 'cancelada'
       )
     ORDER BY ed.fecha_hora_inicio, s.nombre`,
    [idClinica, servicio ?? null, desde ?? null, hasta ?? null]
  );
  return respuesta(200, { espacios: rows });
}

// ------------------------------------------------------------------
// 2. Solicitar una cita (usuario)
// ------------------------------------------------------------------
async function solicitarCita(pool, idUsuario, cuerpo) {
  const idEspacio = cuerpo?.id_espacio;
  if (!esUuid(idEspacio)) return respuesta(400, { error: "Envía un 'id_espacio' válido." });

  try {
    return await enTransaccion(pool, async (db) => {
      // Bloquea el horario para que dos personas no lo reserven al mismo tiempo.
      const espacio = await db.query(
        `SELECT ed.fecha_hora_inicio,
                (ed.habilitado AND cs.activo AND s.activo AND cl.estado_publicacion = 'aprobada') AS reservable,
                ed.fecha_hora_inicio > NOW() AS es_futuro,
                cl.id_clinica
         FROM espacios_disponibles ed
         INNER JOIN clinicas_servicios cs ON cs.id_clinica_servicio = ed.id_clinica_servicio
         INNER JOIN servicios s ON s.id_servicio = cs.id_servicio
         INNER JOIN clinicas cl ON cl.id_clinica = cs.id_clinica
         WHERE ed.id_espacio = $1
         FOR UPDATE OF ed`,
        [idEspacio]
      );
      const e = espacio.rows[0];
      if (!e) return respuesta(404, { error: "El horario seleccionado no existe." });
      if (!e.reservable) return respuesta(409, { error: "Este horario ya no está disponible." });
      if (!e.es_futuro) return respuesta(409, { error: "No se puede reservar un horario que ya pasó." });

      const ocupado = await db.query(
        "SELECT 1 FROM citas WHERE id_espacio = $1 AND estado <> 'cancelada'",
        [idEspacio]
      );
      if (ocupado.rows.length) return respuesta(409, { error: "El horario seleccionado ya fue reservado." });

      const choque = await db.query(
        `SELECT 1 FROM citas ci
         INNER JOIN espacios_disponibles ed ON ed.id_espacio = ci.id_espacio
         WHERE ci.id_usuario = $1 AND ci.estado = 'confirmada' AND ed.fecha_hora_inicio = $2`,
        [idUsuario, e.fecha_hora_inicio]
      );
      if (choque.rows.length) return respuesta(409, { error: "Ya tienes otra cita a esa misma hora." });

      // Validar si la clínica tiene franjas de horarios_atencion y si el turno cae dentro de ellas
      if (e.id_clinica) {
        const { rows: horariosClinica } = await db.query(
          `SELECT dia_semana, hora_apertura, hora_cierre, es_24_horas, cruza_medianoche
           FROM horarios_atencion WHERE id_clinica = $1`,
          [e.id_clinica]
        );
        if (horariosClinica.length > 0 &&
            !validarEnHorarioAtencion(e.fecha_hora_inicio, horariosClinica, "America/Mexico_City")) {
          return respuesta(409, {
            error: "El horario seleccionado no coincide con los días y horas de atención de la clínica.",
          });
        }
      }

      const creada = await db.query(
        `INSERT INTO citas (id_usuario, id_espacio, estado)
         VALUES ($1, $2, 'confirmada')
         RETURNING id_cita`,
        [idUsuario, idEspacio]
      );
      const cita = await obtenerCitaDeUsuario(db, idUsuario, creada.rows[0].id_cita);
      return respuesta(201, { mensaje: "Cita agendada.", cita });
    });
  } catch (error) {
    // Índice único uq_citas_espacio_activa: otra persona ganó el horario.
    if (error.code === "23505") return respuesta(409, { error: "El horario seleccionado ya fue reservado." });
    throw error;
  }
}

// ------------------------------------------------------------------
// 3. Consultar citas del usuario autenticado
// ------------------------------------------------------------------
async function listarCitasUsuario(db, idUsuario, { estado } = {}) {
  if (estado !== undefined && !ESTADOS.includes(estado)) {
    return respuesta(400, { error: `Estado no válido. Usa: ${ESTADOS.join(", ")}.` });
  }
  const { rows } = await db.query(
    `SELECT ${COLUMNAS_CITA} ${JOINS_CITA}
     WHERE ci.id_usuario = $1 AND ($2::text IS NULL OR ci.estado = $2::text)
     ORDER BY ed.fecha_hora_inicio DESC, ci.fecha_reserva DESC`,
    [idUsuario, estado ?? null]
  );
  return respuesta(200, { citas: rows });
}

async function consultarCitaUsuario(db, idUsuario, idCita) {
  if (!esUuid(idCita)) return respuesta(400, { error: "Identificador de cita no válido." });
  const cita = await obtenerCitaDeUsuario(db, idUsuario, idCita);
  // 404 también si la cita es de otra persona: no revelamos que existe.
  if (!cita) return respuesta(404, { error: "Cita no encontrada." });
  return respuesta(200, { cita });
}

// ------------------------------------------------------------------
// 4. Cancelar cita (usuario)
// ------------------------------------------------------------------
async function cancelarCitaUsuario(pool, idUsuario, idCita) {
  if (!esUuid(idCita)) return respuesta(400, { error: "Identificador de cita no válido." });
  return enTransaccion(pool, async (db) => {
    const { rows } = await db.query(
      `SELECT ci.estado, ed.fecha_hora_inicio > NOW() AS es_futura
       FROM citas ci
       INNER JOIN espacios_disponibles ed ON ed.id_espacio = ci.id_espacio
       WHERE ci.id_cita = $1 AND ci.id_usuario = $2
       FOR UPDATE OF ci`,
      [idCita, idUsuario]
    );
    const actual = rows[0];
    if (!actual) return respuesta(404, { error: "Cita no encontrada." });

    const validacion = validarTransicionEstadoCita({
      rol: "usuario",
      estadoActual: actual.estado,
      nuevoEstado: "cancelada",
      esFutura: actual.es_futura,
    });
    if (!validacion.valida) {
      return respuesta(validacion.status, { error: validacion.motivo });
    }

    await db.query("UPDATE citas SET estado = 'cancelada' WHERE id_cita = $1", [idCita]);
    const cita = await obtenerCitaDeUsuario(db, idUsuario, idCita);
    return respuesta(200, { mensaje: "Cita cancelada. El horario quedó libre.", cita });
  });
}

// ------------------------------------------------------------------
// 5. Actualizar estado de una cita (clínica)
// ------------------------------------------------------------------
async function actualizarEstadoCitaClinica(pool, idClinica, idCita, cuerpo) {
  const nuevoEstado = cuerpo?.estado;
  if (!esUuid(idCita)) return respuesta(400, { error: "Identificador de cita no válido." });
  if (!ESTADOS_CLINICA.includes(nuevoEstado)) {
    return respuesta(400, { error: `Estado no válido. Usa: ${ESTADOS_CLINICA.join(", ")}.` });
  }
  return enTransaccion(pool, async (db) => {
    const { rows } = await db.query(
      `SELECT ci.estado, ed.fecha_hora_inicio > NOW() AS es_futura
       FROM citas ci
       INNER JOIN espacios_disponibles ed ON ed.id_espacio = ci.id_espacio
       INNER JOIN clinicas_servicios cs ON cs.id_clinica_servicio = ed.id_clinica_servicio
       WHERE ci.id_cita = $1 AND cs.id_clinica = $2
       FOR UPDATE OF ci`,
      [idCita, idClinica]
    );
    const actual = rows[0];
    if (!actual) return respuesta(404, { error: "Cita no encontrada en tu clínica." });

    const validacion = validarTransicionEstadoCita({
      rol: "clinica",
      estadoActual: actual.estado,
      nuevoEstado,
      esFutura: actual.es_futura,
    });
    if (!validacion.valida) {
      return respuesta(validacion.status, { error: validacion.motivo });
    }

    const actualizada = await db.query(
      `UPDATE citas SET estado = $1 WHERE id_cita = $2
       RETURNING id_cita, estado, fecha_reserva`,
      [nuevoEstado, idCita]
    );
    return respuesta(200, { mensaje: "Estado de la cita actualizado.", cita: actualizada.rows[0] });
  });
}

// ------------------------------------------------------------------
// Registro de rutas en Express
// ------------------------------------------------------------------
function registrarRutasCitas(app, { pool, autenticarToken, requerirRol }) {
  const manejar = (etiqueta, accion) => async (req, res) => {
    try {
      const { status, body } = await accion(req);
      return res.status(status).json(body);
    } catch (error) {
      console.error(`Error al ${etiqueta}:`, error.message);
      return res.status(500).json({ error: `No se pudo ${etiqueta}.` });
    }
  };
  const soloUsuario = [autenticarToken, requerirRol(["usuario"])];
  const soloClinica = [autenticarToken, requerirRol(["clinica"])];

  app.get("/api/clinicas/:id/espacios", autenticarToken,
    manejar("consultar los horarios disponibles", (req) =>
      listarEspaciosDisponibles(pool, req.params.id, {
        desde: req.query.desde, hasta: req.query.hasta, servicio: req.query.servicio,
      })));

  app.post("/api/citas", ...soloUsuario,
    manejar("registrar la cita", (req) => solicitarCita(pool, req.usuario.id, req.body)));

  app.get("/api/citas", ...soloUsuario,
    manejar("consultar tus citas", (req) =>
      listarCitasUsuario(pool, req.usuario.id, { estado: req.query.estado })));

  app.get("/api/citas/:id", ...soloUsuario,
    manejar("consultar la cita", (req) => consultarCitaUsuario(pool, req.usuario.id, req.params.id)));

  app.patch("/api/citas/:id/cancelar", ...soloUsuario,
    manejar("cancelar la cita", (req) => cancelarCitaUsuario(pool, req.usuario.id, req.params.id)));

  app.patch("/api/citas/:id/estado", ...soloClinica,
    manejar("actualizar el estado de la cita", (req) =>
      actualizarEstadoCitaClinica(pool, req.usuario.id, req.params.id, req.body)));
}

module.exports = {
  registrarRutasCitas,
  listarEspaciosDisponibles,
  solicitarCita,
  listarCitasUsuario,
  consultarCitaUsuario,
  cancelarCitaUsuario,
  actualizarEstadoCitaClinica,
  ...require("./validacionesCitas"),
};
