const { esUuid } = require('./validacionesCitas');

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const HORA_CON_SEGUNDOS = /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/;
const MAX_FRANJAS_HORARIO = 14;
const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function formatearHorario(fila) {
  return {
    ...fila,
    dia_nombre: DIAS_SEMANA[fila.dia_semana] || 'Día',
  };
}

function normalizarHora(valor) {
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim();
  if (HORA.test(limpio)) return limpio;
  if (HORA_CON_SEGUNDOS.test(limpio)) return limpio.slice(0, 5);
  return null;
}

function validarFranjaHorario(entrada) {
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) {
    return { error: 'Cada horario debe ser un objeto válido.' };
  }
  const diaRaw = entrada.dia_semana;
  const dia = typeof diaRaw === 'string' && /^\d+$/.test(diaRaw.trim()) ? Number(diaRaw.trim()) : diaRaw;
  if (!Number.isInteger(dia) || dia < 0 || dia > 6) {
    return { error: 'El día de la semana debe estar entre 0 (domingo) y 6 (sábado).' };
  }
  const es24Horas = Boolean(entrada.es_24_horas);
  if (es24Horas) {
    return { franja: { dia_semana: dia, apertura: '00:00', cierre: '00:00', es_24_horas: true } };
  }
  const apertura = normalizarHora(entrada.apertura ?? entrada.hora_apertura);
  const cierre = normalizarHora(entrada.cierre ?? entrada.hora_cierre);
  if (!apertura || !cierre) {
    return { error: 'Indica hora de apertura y cierre válidas en formato HH:MM.' };
  }
  if (apertura >= cierre) {
    return { error: 'La hora de apertura debe ser anterior a la de cierre.' };
  }
  return { franja: { dia_semana: dia, apertura, cierre, es_24_horas: false } };
}

function franjasSeSolapan(a, b) {
  if (a.dia_semana !== b.dia_semana) return false;
  if (a.es_24_horas || b.es_24_horas) return true;
  return a.apertura < b.cierre && b.apertura < a.cierre;
}

async function verificarClinicaAprobada(client, idClinica) {
  const { rows } = await client.query(
    'SELECT estado_publicacion FROM clinicas WHERE id_clinica = $1 FOR UPDATE',
    [idClinica]
  );
  if (!rows.length) return { status: 404, error: 'Clínica no encontrada.' };
  if (rows[0].estado_publicacion !== 'aprobada') {
    return { status: 409, error: 'Estos horarios se editan desde la ficha hasta que la clínica sea aprobada.' };
  }
  return { ok: true };
}

async function deshabilitarEspaciosFueraDeHorario(client, idClinica) {
  const { rows: deshabilitados } = await client.query(`UPDATE espacios_disponibles ed SET habilitado = FALSE
    FROM clinicas_servicios cs WHERE cs.id_clinica_servicio = ed.id_clinica_servicio
      AND cs.id_clinica = $1 AND ed.habilitado AND ed.fecha_hora_inicio > NOW()
      AND NOT EXISTS (SELECT 1 FROM citas ci WHERE ci.id_espacio = ed.id_espacio AND ci.estado <> 'cancelada')
      AND NOT EXISTS (SELECT 1 FROM horarios_atencion h WHERE h.id_clinica = cs.id_clinica
        AND h.dia_semana = EXTRACT(DOW FROM ed.fecha_hora_inicio AT TIME ZONE 'America/Mexico_City')
        AND (h.es_24_horas OR (NOT h.cruza_medianoche
          AND (ed.fecha_hora_inicio AT TIME ZONE 'America/Mexico_City')::time >= h.hora_apertura
          AND (ed.fecha_hora_inicio AT TIME ZONE 'America/Mexico_City')::time < h.hora_cierre)))
    RETURNING ed.id_espacio`, [idClinica]);
  return deshabilitados.length;
}

const SELECT_HORARIOS_CLINICA = `SELECT id_horario, dia_semana, to_char(hora_apertura, 'HH24:MI') AS apertura,
  to_char(hora_cierre, 'HH24:MI') AS cierre, es_24_horas, cruza_medianoche
  FROM horarios_atencion
  WHERE id_clinica = $1
  ORDER BY dia_semana, hora_apertura`;

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
    try { await accion(req, res); }
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
      pool.query(SELECT_HORARIOS_CLINICA, [id]),
    ]);
    const inicio = new Date(`${hoy.rows[0].fecha}T12:00:00Z`);
    const festivos = Array.from({ length: 15 }, (_, i) => {
      const d = new Date(inicio);
      d.setUTCDate(d.getUTCDate() + i);
      const fecha = d.toISOString().slice(0, 10);
      return { fecha, nombre: festivoNacional(fecha) };
    }).filter((d) => d.nombre);
    responder(res, 200, { servicios: servicios.rows, espacios: espacios.rows,
      bloqueados: bloqueados.rows, horarios: horarios.rows.map(formatearHorario), festivos, hoy: hoy.rows[0].fecha });
  }));

  app.get('/api/clinicas/mi-agenda/horarios', ...soloClinica, envolver(async (req, res) => {
    const [clinicaRes, horariosRes] = await Promise.all([
      pool.query(
        'SELECT estado_publicacion, horario_texto FROM clinicas WHERE id_clinica = $1',
        [req.usuario.id]
      ),
      pool.query(SELECT_HORARIOS_CLINICA, [req.usuario.id]),
    ]);
    const clinica = clinicaRes.rows[0];
    if (!clinica) return responder(res, 404, { error: 'Clínica no encontrada.' });
    const horarios = horariosRes.rows.map(formatearHorario);
    return responder(res, 200, {
      estado_publicacion: clinica.estado_publicacion,
      puede_editar_horarios: clinica.estado_publicacion === 'aprobada',
      horario_texto: clinica.horario_texto || null,
      total: horarios.length,
      maximo_franjas: MAX_FRANJAS_HORARIO,
      horarios,
    });
  }));

  app.post('/api/clinicas/mi-agenda/horarios', ...soloClinica, envolver(async (req, res) => {
    const validacion = validarFranjaHorario(req.body);
    if (validacion.error) return responder(res, 400, { error: validacion.error });
    const nueva = validacion.franja;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const estado = await verificarClinicaAprobada(client, req.usuario.id);
      if (!estado.ok) return responder(res, estado.status, { error: estado.error });
      const { rows: existentes } = await client.query(
        `SELECT id_horario, dia_semana, to_char(hora_apertura, 'HH24:MI') AS apertura,
         to_char(hora_cierre, 'HH24:MI') AS cierre, es_24_horas
         FROM horarios_atencion WHERE id_clinica = $1 FOR UPDATE`,
        [req.usuario.id]
      );
      if (existentes.length >= MAX_FRANJAS_HORARIO) {
        return responder(res, 400, { error: `No se admiten más de ${MAX_FRANJAS_HORARIO} franjas horarias.` });
      }
      if (existentes.some((item) => franjasSeSolapan(nueva, item))) {
        return responder(res, 409, { error: 'La franja horaria se solapa con otra existente en el mismo día.' });
      }
      const { rows: insertados } = await client.query(
        `INSERT INTO horarios_atencion (id_clinica, dia_semana, hora_apertura, hora_cierre, es_24_horas)
         VALUES ($1, $2, $3::time, $4::time, $5)
         RETURNING id_horario, dia_semana, to_char(hora_apertura, 'HH24:MI') AS apertura,
           to_char(hora_cierre, 'HH24:MI') AS cierre, es_24_horas, cruza_medianoche`,
        [req.usuario.id, nueva.dia_semana, nueva.apertura, nueva.cierre, nueva.es_24_horas]
      );
      await client.query('COMMIT');
      return responder(res, 201, { mensaje: 'Horario guardado.', horario: formatearHorario(insertados[0]) });
    } finally { await client.query('ROLLBACK').catch(() => {}); client.release(); }
  }));

  app.put('/api/clinicas/mi-agenda/horarios', ...soloClinica, envolver(async (req, res) => {
    const entrada = req.body?.horarios;
    if (!Array.isArray(entrada) || entrada.length > MAX_FRANJAS_HORARIO) {
      return responder(res, 400, { error: `Envía hasta ${MAX_FRANJAS_HORARIO} franjas válidas dentro del mismo día.` });
    }
    const franjas = [];
    for (const item of entrada) {
      const validacion = validarFranjaHorario(item);
      if (validacion.error) return responder(res, 400, { error: validacion.error });
      franjas.push(validacion.franja);
    }
    const ordenados = [...franjas].sort((a, b) => a.dia_semana - b.dia_semana || a.apertura.localeCompare(b.apertura));
    if (ordenados.some((h, i) => i > 0 && franjasSeSolapan(h, ordenados[i - 1]))) {
      return responder(res, 400, { error: 'Las franjas del mismo día no pueden solaparse.' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const estado = await verificarClinicaAprobada(client, req.usuario.id);
      if (!estado.ok) return responder(res, estado.status, { error: estado.error });
      // Los bloques con reserva quedan intactos. Los libres fuera del nuevo horario se deshabilitan.
      await client.query('DELETE FROM horarios_atencion WHERE id_clinica = $1', [req.usuario.id]);
      const guardados = [];
      for (const h of ordenados) {
        const { rows: insertados } = await client.query(
          `INSERT INTO horarios_atencion (id_clinica, dia_semana, hora_apertura, hora_cierre, es_24_horas)
           VALUES ($1, $2, $3::time, $4::time, $5)
           RETURNING id_horario, dia_semana, to_char(hora_apertura, 'HH24:MI') AS apertura,
             to_char(hora_cierre, 'HH24:MI') AS cierre, es_24_horas, cruza_medianoche`,
          [req.usuario.id, h.dia_semana, h.apertura, h.cierre, h.es_24_horas]
        );
        guardados.push(insertados[0]);
      }
      const cuposDeshabilitados = await deshabilitarEspaciosFueraDeHorario(client, req.usuario.id);
      await client.query('COMMIT');
      return responder(res, 200, {
        mensaje: 'Horario actualizado; las citas existentes se conservan.',
        cupos_deshabilitados: cuposDeshabilitados,
        horarios: guardados.map(formatearHorario),
      });
    } finally { await client.query('ROLLBACK').catch(() => {}); client.release(); }
  }));

  app.put('/api/clinicas/mi-agenda/horarios/:id', ...soloClinica, envolver(async (req, res) => {
    if (!esUuid(req.params.id)) return responder(res, 400, { error: 'Identificador de horario no válido.' });
    const validacion = validarFranjaHorario(req.body);
    if (validacion.error) return responder(res, 400, { error: validacion.error });
    const actualizado = validacion.franja;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const estado = await verificarClinicaAprobada(client, req.usuario.id);
      if (!estado.ok) return responder(res, estado.status, { error: estado.error });
      const { rows: existentes } = await client.query(
        `SELECT id_horario, dia_semana, to_char(hora_apertura, 'HH24:MI') AS apertura,
         to_char(hora_cierre, 'HH24:MI') AS cierre, es_24_horas
         FROM horarios_atencion WHERE id_clinica = $1 FOR UPDATE`,
        [req.usuario.id]
      );
      if (!existentes.some((item) => item.id_horario === req.params.id)) {
        return responder(res, 404, { error: 'Horario no encontrado en tu clínica.' });
      }
      if (existentes.some((item) => item.id_horario !== req.params.id && franjasSeSolapan(actualizado, item))) {
        return responder(res, 409, { error: 'La franja horaria se solapa con otra existente en el mismo día.' });
      }
      const { rows: editados } = await client.query(
        `UPDATE horarios_atencion
         SET dia_semana = $3, hora_apertura = $4::time, hora_cierre = $5::time, es_24_horas = $6
         WHERE id_horario = $1 AND id_clinica = $2
         RETURNING id_horario, dia_semana, to_char(hora_apertura, 'HH24:MI') AS apertura,
           to_char(hora_cierre, 'HH24:MI') AS cierre, es_24_horas, cruza_medianoche`,
        [req.params.id, req.usuario.id, actualizado.dia_semana, actualizado.apertura, actualizado.cierre, actualizado.es_24_horas]
      );
      const cuposDeshabilitados = await deshabilitarEspaciosFueraDeHorario(client, req.usuario.id);
      await client.query('COMMIT');
      return responder(res, 200, {
        mensaje: 'Horario actualizado; las citas existentes se conservan.',
        horario: formatearHorario(editados[0]),
        cupos_deshabilitados: cuposDeshabilitados,
      });
    } finally { await client.query('ROLLBACK').catch(() => {}); client.release(); }
  }));

  app.delete('/api/clinicas/mi-agenda/horarios/:id', ...soloClinica, envolver(async (req, res) => {
    if (!esUuid(req.params.id)) return responder(res, 400, { error: 'Identificador de horario no válido.' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const estado = await verificarClinicaAprobada(client, req.usuario.id);
      if (!estado.ok) return responder(res, estado.status, { error: estado.error });
      const { rows: eliminados } = await client.query(
        'DELETE FROM horarios_atencion WHERE id_horario = $1 AND id_clinica = $2 RETURNING id_horario',
        [req.params.id, req.usuario.id]
      );
      if (!eliminados.length) return responder(res, 404, { error: 'Horario no encontrado en tu clínica.' });
      const cuposDeshabilitados = await deshabilitarEspaciosFueraDeHorario(client, req.usuario.id);
      await client.query('COMMIT');
      return responder(res, 200, {
        mensaje: 'Horario eliminado; las citas existentes se conservan.',
        cupos_deshabilitados: cuposDeshabilitados,
      });
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

module.exports = {
  registrarRutasAgendaClinica,
  festivoNacional,
  normalizarHora,
  validarFranjaHorario,
  franjasSeSolapan,
};
