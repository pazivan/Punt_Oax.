const { esUuid } = require('./validacionesCitas');
const { consultarEstadoClinica, esEstadoOperativo, respuestaNoAprobada } = require('./clinicasEstado');

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function fechaValida(fecha) {
  if (typeof fecha !== 'string' || !FECHA.test(fecha)) return false;
  const d = new Date(`${fecha}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === fecha;
}

function festivoNacional(fecha) {
  if (!fechaValida(fecha)) return null;
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const fijo = { '01-01': 'Año Nuevo', '05-01': 'Día del Trabajo', '09-16': 'Independencia', '12-25': 'Navidad' };
  const clave = fecha.slice(5);
  if (fijo[clave]) return fijo[clave];
  const lunes = (n) => 1 + ((8 - new Date(Date.UTC(anio, mes - 1, 1)).getUTCDay()) % 7) + 7 * (n - 1);
  if (mes === 2 && dia === lunes(1)) return 'Día de la Constitución';
  if (mes === 3 && dia === lunes(3)) return 'Natalicio de Benito Juárez';
  if (mes === 11 && dia === lunes(3)) return 'Revolución Mexicana';
  if (mes === 10 && dia === 1 && (anio - 2024) % 6 === 0) return 'Transmisión del Poder Ejecutivo';
  return null;
}

const responder = (res, status, body) => res.status(status).json(body);

function registrarRutasAgendaClinica(app, { pool, autenticarToken, requerirRol }) {
  const soloClinica = [autenticarToken, requerirRol(['clinica'])];
  const envolver = (accion) => async (req, res) => {
    try {
      const estado = await consultarEstadoClinica(pool, req.usuario.id);
      if (!estado) return responder(res, 404, { error: 'No se encontró tu clínica.' });
      if (!esEstadoOperativo(estado)) return responder(res, 403, respuestaNoAprobada(estado));
      await accion(req, res);
    }
    catch (error) {
      console.error('Error en agenda clínica:', error);
      responder(res, 500, { error: 'No se pudo actualizar la agenda.' });
    }
  };

  app.get('/api/clinicas/mi-agenda', ...soloClinica, envolver(async (req, res) => {
    const id = req.usuario.id;
    const [servicios, espacios, bloqueados, hoy, horarios] = await Promise.all([
      pool.query(`SELECT cs.id_clinica_servicio, s.nombre FROM clinicas_servicios cs
        JOIN servicios s ON s.id_servicio = cs.id_servicio
        WHERE cs.id_clinica = $1 AND cs.activo AND s.activo ORDER BY s.nombre`, [id]),
      pool.query(`SELECT ed.id_espacio, ed.id_clinica_servicio, ed.fecha_hora_inicio, ed.habilitado,
        EXISTS (SELECT 1 FROM citas ci WHERE ci.id_espacio = ed.id_espacio AND ci.estado <> 'cancelada') AS ocupado
        FROM espacios_disponibles ed JOIN clinicas_servicios cs ON cs.id_clinica_servicio = ed.id_clinica_servicio
        WHERE cs.id_clinica = $1 AND ed.fecha_hora_inicio >= NOW()
          AND ed.fecha_hora_inicio < ((NOW() AT TIME ZONE 'America/Mexico_City')::date + 15)::timestamp AT TIME ZONE 'America/Mexico_City'
        ORDER BY ed.fecha_hora_inicio`, [id]),
      pool.query(`SELECT fecha::text, motivo FROM clinicas_dias_bloqueados WHERE id_clinica = $1
        AND fecha >= (NOW() AT TIME ZONE 'America/Mexico_City')::date
        AND fecha < (NOW() AT TIME ZONE 'America/Mexico_City')::date + 15 ORDER BY fecha`, [id]),
      pool.query(`SELECT (NOW() AT TIME ZONE 'America/Mexico_City')::date::text AS fecha`),
      pool.query(`SELECT dia_semana, to_char(hora_apertura, 'HH24:MI') AS apertura,
        to_char(hora_cierre, 'HH24:MI') AS cierre, es_24_horas, cruza_medianoche
        FROM horarios_atencion
        WHERE id_clinica = $1 ORDER BY dia_semana, hora_apertura`, [id]),
    ]);
    const inicio = new Date(`${hoy.rows[0].fecha}T12:00:00Z`);
    const festivos = Array.from({ length: 15 }, (_, i) => {
      const d = new Date(inicio);
      d.setUTCDate(d.getUTCDate() + i);
      const fecha = d.toISOString().slice(0, 10);
      return { fecha, nombre: festivoNacional(fecha) };
    }).filter((d) => d.nombre);
    responder(res, 200, { servicios: servicios.rows, espacios: espacios.rows,
      bloqueados: bloqueados.rows, horarios: horarios.rows, festivos, hoy: hoy.rows[0].fecha });
  }));

  app.put('/api/clinicas/mi-agenda/horarios', ...soloClinica, envolver(async (req, res) => {
    const horarios = req.body?.horarios;
    if (!Array.isArray(horarios) || horarios.length > 14) {
      return responder(res, 400, { error: 'Envía hasta 14 franjas válidas.' });
    }
    const normalizados = [];
    for (const h of horarios) {
      if (!Number.isInteger(h?.dia_semana) || h.dia_semana < 0 || h.dia_semana > 6) {
        return responder(res, 400, { error: 'Cada horario debe indicar un día válido de la semana.' });
      }
      const es24 = Boolean(h.es_24_horas);
      const cruza = Boolean(h.cruza_medianoche) && !es24;
      const apertura = es24 ? '00:00' : h.apertura;
      const cierre = es24 ? '00:00' : h.cierre;
      if (typeof apertura !== 'string' || !HORA.test(apertura) || typeof cierre !== 'string' || !HORA.test(cierre)) {
        return responder(res, 400, { error: 'Cada horario debe usar horas válidas en formato HH:MM.' });
      }
      if (!es24 && !cruza && apertura >= cierre) {
        return responder(res, 400, { error: 'La apertura debe ser anterior al cierre, o marca el turno como nocturno.' });
      }
      if (cruza && apertura <= cierre) {
        return responder(res, 400, { error: 'Un turno nocturno debe iniciar después de la hora de cierre.' });
      }
      normalizados.push({
        dia_semana: h.dia_semana,
        apertura,
        cierre,
        es_24_horas: es24,
        cruza_medianoche: cruza,
      });
    }
    const ordenados = [...normalizados].sort((a, b) => a.dia_semana - b.dia_semana || a.apertura.localeCompare(b.apertura));
    for (let i = 1; i < ordenados.length; i += 1) {
      const prev = ordenados[i - 1];
      const curr = ordenados[i];
      if (curr.dia_semana === prev.dia_semana) {
        if (prev.es_24_horas || curr.es_24_horas) {
          return responder(res, 400, { error: 'Un día con horario de 24 horas no admite franjas adicionales.' });
        }
        if (prev.cruza_medianoche || curr.apertura < prev.cierre) {
          return responder(res, 400, { error: 'Las franjas del mismo día no pueden solaparse.' });
        }
      }
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: clinicas } = await client.query('SELECT estado_publicacion FROM clinicas WHERE id_clinica = $1 FOR UPDATE', [req.usuario.id]);
      if (!clinicas.length) return responder(res, 404, { error: 'Clínica no encontrada.' });
      if (clinicas[0].estado_publicacion !== 'aprobada') return responder(res, 409, { error: 'Estos horarios se editan desde la ficha hasta que la clínica sea aprobada.' });
      // Los bloques con reserva quedan intactos. Los libres fuera del nuevo horario se deshabilitan.
      await client.query('DELETE FROM horarios_atencion WHERE id_clinica = $1', [req.usuario.id]);
      for (const h of ordenados) {
        await client.query(
          `INSERT INTO horarios_atencion (id_clinica, dia_semana, hora_apertura, hora_cierre, es_24_horas, cruza_medianoche)
           VALUES ($1, $2, $3::time, $4::time, $5, $6)`,
          [req.usuario.id, h.dia_semana, h.apertura, h.cierre, h.es_24_horas, h.cruza_medianoche]
        );
      }
      const { rows: deshabilitados } = await client.query(`UPDATE espacios_disponibles ed SET habilitado = FALSE
        FROM clinicas_servicios cs WHERE cs.id_clinica_servicio = ed.id_clinica_servicio
          AND cs.id_clinica = $1 AND ed.habilitado AND ed.fecha_hora_inicio > NOW()
          AND NOT EXISTS (SELECT 1 FROM citas ci WHERE ci.id_espacio = ed.id_espacio AND ci.estado <> 'cancelada')
          AND NOT EXISTS (SELECT 1 FROM horarios_atencion h WHERE h.id_clinica = cs.id_clinica
            AND h.dia_semana = EXTRACT(DOW FROM ed.fecha_hora_inicio AT TIME ZONE 'America/Mexico_City')
            AND (h.es_24_horas OR (NOT h.cruza_medianoche
              AND (ed.fecha_hora_inicio AT TIME ZONE 'America/Mexico_City')::time >= h.hora_apertura
              AND (ed.fecha_hora_inicio AT TIME ZONE 'America/Mexico_City')::time < h.hora_cierre)))
        RETURNING ed.id_espacio`, [req.usuario.id]);
      await client.query('COMMIT');
      return responder(res, 200, { mensaje: 'Horario actualizado; las citas existentes se conservan.',
        cupos_deshabilitados: deshabilitados.length });
    } finally { await client.query('ROLLBACK').catch(() => {}); client.release(); }
  }));

  app.post('/api/clinicas/mi-agenda/espacios', ...soloClinica, envolver(async (req, res) => {
    const { id_clinica_servicio: servicio, fecha, hora } = req.body || {};
    if (!esUuid(servicio) || !fechaValida(fecha) || typeof hora !== 'string' || !HORA.test(hora)) {
      return responder(res, 400, { error: 'Selecciona servicio, fecha válida y hora HH:MM.' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(`SELECT cs.id_clinica_servicio, cl.estado_publicacion,
        ((($2::date + $3::time) AT TIME ZONE 'America/Mexico_City') > NOW()) AS futuro,
        ($2::date >= (NOW() AT TIME ZONE 'America/Mexico_City')::date
          AND $2::date < (NOW() AT TIME ZONE 'America/Mexico_City')::date + 15) AS en_ventana,
        EXISTS (SELECT 1 FROM horarios_atencion h WHERE h.id_clinica = cs.id_clinica
          AND h.dia_semana = EXTRACT(DOW FROM $2::date)
          AND (h.es_24_horas OR (NOT h.cruza_medianoche AND $3::time >= h.hora_apertura AND $3::time < h.hora_cierre))) AS en_horario,
        EXISTS (SELECT 1 FROM clinicas_dias_bloqueados b WHERE b.id_clinica = cs.id_clinica AND b.fecha = $2::date) AS bloqueado
        FROM clinicas_servicios cs JOIN clinicas cl ON cl.id_clinica = cs.id_clinica
        JOIN servicios s ON s.id_servicio = cs.id_servicio
        WHERE cs.id_clinica_servicio = $1 AND cs.id_clinica = $4 AND cs.activo AND s.activo
        FOR UPDATE OF cl`, [servicio, fecha, hora, req.usuario.id]);
      const registro = rows[0];
      if (!registro) return responder(res, 404, { error: 'Servicio no encontrado en tu clínica.' });
      if (registro.estado_publicacion !== 'aprobada') return responder(res, 409, { error: 'Tu clínica debe estar aprobada para ofrecer cupos.' });
      if (!registro.futuro || !registro.en_ventana) return responder(res, 400, { error: 'Elige una hora futura dentro de los próximos 15 días.' });
      if (!registro.en_horario) return responder(res, 409, { error: 'La hora no coincide con el horario de atención.' });
      if (registro.bloqueado || festivoNacional(fecha)) return responder(res, 409, { error: 'No se pueden ofrecer cupos en un día no laborable.' });
      const { rows: espacios } = await client.query(`INSERT INTO espacios_disponibles (id_clinica_servicio, fecha_hora_inicio)
        VALUES ($1, ($2::date + $3::time) AT TIME ZONE 'America/Mexico_City')
        ON CONFLICT (id_clinica_servicio, fecha_hora_inicio) DO NOTHING RETURNING id_espacio`, [servicio, fecha, hora]);
      if (!espacios.length) return responder(res, 409, { error: 'Ya existe un cupo de este servicio a esa hora.' });
      await client.query('COMMIT');
      return responder(res, 201, { mensaje: 'Cupo publicado.', id_espacio: espacios[0].id_espacio });
    } finally { await client.query('ROLLBACK').catch(() => {}); client.release(); }
  }));

  app.patch('/api/clinicas/mi-agenda/espacios/:id', ...soloClinica, envolver(async (req, res) => {
    if (!esUuid(req.params.id) || typeof req.body?.habilitado !== 'boolean')
      return responder(res, 400, { error: 'Cupo o estado no válido.' });
    const { rows } = await pool.query(`UPDATE espacios_disponibles ed SET habilitado = $3
      FROM clinicas_servicios cs WHERE ed.id_clinica_servicio = cs.id_clinica_servicio
        AND cs.id_clinica = $1 AND ed.id_espacio = $2 AND ed.fecha_hora_inicio > NOW()
        AND NOT EXISTS (SELECT 1 FROM citas ci WHERE ci.id_espacio = ed.id_espacio AND ci.estado <> 'cancelada')
        AND NOT EXISTS (SELECT 1 FROM clinicas_dias_bloqueados b WHERE b.id_clinica = cs.id_clinica
          AND b.fecha = (ed.fecha_hora_inicio AT TIME ZONE 'America/Mexico_City')::date)
        AND ($3 = FALSE OR EXISTS (SELECT 1 FROM horarios_atencion h WHERE h.id_clinica = cs.id_clinica
          AND h.dia_semana = EXTRACT(DOW FROM ed.fecha_hora_inicio AT TIME ZONE 'America/Mexico_City')
          AND (h.es_24_horas OR (NOT h.cruza_medianoche
            AND (ed.fecha_hora_inicio AT TIME ZONE 'America/Mexico_City')::time >= h.hora_apertura
            AND (ed.fecha_hora_inicio AT TIME ZONE 'America/Mexico_City')::time < h.hora_cierre))))
      RETURNING ed.id_espacio`, [req.usuario.id, req.params.id, req.body.habilitado]);
    return rows.length ? responder(res, 200, { mensaje: 'Cupo actualizado.' })
      : responder(res, 409, { error: 'No se puede modificar este cupo (reservado, bloqueado o inexistente).' });
  }));

  app.post('/api/clinicas/mi-agenda/bloqueos', ...soloClinica, envolver(async (req, res) => {
    const { fecha, motivo } = req.body || {};
    if (!fechaValida(fecha) || (motivo != null && (typeof motivo !== 'string' || motivo.length > 200)))
      return responder(res, 400, { error: 'Fecha o motivo no válido.' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: rango } = await client.query(`SELECT $1::date >= (NOW() AT TIME ZONE 'America/Mexico_City')::date
        AND $1::date < (NOW() AT TIME ZONE 'America/Mexico_City')::date + 15 AS valido`, [fecha]);
      if (!rango[0].valido) return responder(res, 400, { error: 'Elige un día dentro de los próximos 15 días.' });
      await client.query('SELECT id_clinica FROM clinicas WHERE id_clinica = $1 FOR UPDATE', [req.usuario.id]);
      // Bloquear los cupos antes de cancelar: una reserva concurrente usa el mismo bloqueo.
      await client.query(`SELECT ed.id_espacio FROM espacios_disponibles ed
        JOIN clinicas_servicios cs ON cs.id_clinica_servicio = ed.id_clinica_servicio
        WHERE cs.id_clinica = $1 AND ed.fecha_hora_inicio > NOW()
          AND (ed.fecha_hora_inicio AT TIME ZONE 'America/Mexico_City')::date = $2::date
        ORDER BY ed.id_espacio FOR UPDATE OF ed`, [req.usuario.id, fecha]);
      const { rows: insertados } = await client.query(`INSERT INTO clinicas_dias_bloqueados (id_clinica, fecha, motivo)
        VALUES ($1, $2::date, $3) ON CONFLICT DO NOTHING RETURNING fecha`, [req.usuario.id, fecha, motivo?.trim() || null]);
      if (!insertados.length) return responder(res, 409, { error: 'Este día ya está bloqueado.' });
      const { rows: canceladas } = await client.query(`UPDATE citas ci SET estado = 'cancelada'
        FROM espacios_disponibles ed JOIN clinicas_servicios cs ON cs.id_clinica_servicio = ed.id_clinica_servicio
        WHERE ci.id_espacio = ed.id_espacio AND cs.id_clinica = $1 AND ci.estado = 'confirmada'
          AND ed.fecha_hora_inicio > NOW()
          AND (ed.fecha_hora_inicio AT TIME ZONE 'America/Mexico_City')::date = $2::date
        RETURNING ci.id_cita`, [req.usuario.id, fecha]);
      await client.query(`UPDATE espacios_disponibles ed SET habilitado = FALSE FROM clinicas_servicios cs
        WHERE cs.id_clinica_servicio = ed.id_clinica_servicio AND cs.id_clinica = $1
          AND (ed.fecha_hora_inicio AT TIME ZONE 'America/Mexico_City')::date = $2::date`, [req.usuario.id, fecha]);
      await client.query('COMMIT');
      return responder(res, 201, { mensaje: 'Día bloqueado.', citas_canceladas: canceladas.length });
    } finally { await client.query('ROLLBACK').catch(() => {}); client.release(); }
  }));
}

module.exports = { registrarRutasAgendaClinica, festivoNacional };
