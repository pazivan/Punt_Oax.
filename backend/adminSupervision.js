const { festivoNacional } = require("./agendaClinica");
const { esUuid } = require("./validacionesCitas");

const ESTADOS_CITA = ["confirmada", "completada", "cancelada", "no_asistio"];
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const respuesta = (status, body) => ({ status, body });

function fechaMexicoDesdeIso(valor) {
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "";
  const partes = new Intl.DateTimeFormat("es-MX", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const obtener = (tipo) => partes.find((p) => p.type === tipo)?.value || "";
  return `${obtener("year")}-${obtener("month")}-${obtener("day")}`;
}

async function obtenerResumenAdmin(db) {
  const [clinicasRes, usuariosRes, citasRes, solicitudesRes] = await Promise.all([
    db.query(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE estado_publicacion = 'aprobada')::int AS aprobadas,
             COUNT(*) FILTER (WHERE estado_publicacion = 'pendiente')::int AS pendientes,
             COUNT(*) FILTER (WHERE estado_publicacion = 'suspendida')::int AS ocultas,
             COUNT(*) FILTER (WHERE estado_publicacion = 'borrador')::int AS borrador,
             COUNT(*) FILTER (WHERE estado_publicacion = 'rechazada')::int AS rechazadas
      FROM clinicas
    `),
    db.query(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE correo_verificado_en IS NOT NULL)::int AS verificados
      FROM usuarios
    `),
    db.query(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE estado = 'confirmada')::int AS programadas,
             COUNT(*) FILTER (WHERE estado = 'completada')::int AS completadas,
             COUNT(*) FILTER (WHERE estado = 'cancelada')::int AS canceladas,
             COUNT(*) FILTER (WHERE estado = 'no_asistio')::int AS no_asistio
      FROM citas
    `),
    db.query(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE estado = 'pendiente')::int AS pendientes,
             COUNT(*) FILTER (WHERE estado = 'aprobada')::int AS aprobadas,
             COUNT(*) FILTER (WHERE estado = 'rechazada')::int AS rechazadas
      FROM solicitudes_clinicas
    `),
  ]);

  return respuesta(200, {
    clinicas: clinicasRes.rows[0] || { total: 0, aprobadas: 0, pendientes: 0, ocultas: 0, borrador: 0, rechazadas: 0 },
    usuarios: usuariosRes.rows[0] || { total: 0, verificados: 0 },
    citas: citasRes.rows[0] || { total: 0, programadas: 0, completadas: 0, canceladas: 0, no_asistio: 0 },
    solicitudes: solicitudesRes.rows[0] || { total: 0, pendientes: 0, aprobadas: 0, rechazadas: 0 },
  });
}

async function listarCitasAdmin(db, { estado, id_clinica, q, page, limit } = {}) {
  const filtro = estado === undefined ? "todas" : estado;
  if (filtro !== "todas" && !ESTADOS_CITA.includes(filtro)) {
    return respuesta(400, { error: `Estado no válido. Usa: ${[...ESTADOS_CITA, "todas"].join(", ")}.` });
  }
  if (id_clinica && !esUuid(id_clinica)) {
    return respuesta(400, { error: "Identificador de clínica no válido." });
  }

  const tope = [10, 20, 50].includes(Number(limit)) ? Number(limit) : 10;
  const paginaActual = Number.isInteger(Number(page)) && Number(page) > 0 ? Number(page) : 1;
  const offset = (paginaActual - 1) * tope;
  const busqueda = typeof q === "string" ? q.trim() : "";

  const condiciones = [];
  const params = [];

  if (filtro !== "todas") {
    params.push(filtro);
    condiciones.push(`ci.estado = $${params.length}::text`);
  }
  if (id_clinica) {
    params.push(id_clinica);
    condiciones.push(`cl.id_clinica = $${params.length}::uuid`);
  }
  if (busqueda) {
    params.push(`%${busqueda}%`);
    condiciones.push(
      `(COALESCE(cl.nombre, '') ILIKE $${params.length} OR COALESCE(s.nombre, '') ILIKE $${params.length} OR COALESCE(u.nombre, '') ILIKE $${params.length} OR COALESCE(u.apellidos, '') ILIKE $${params.length} OR COALESCE(u.correo, '') ILIKE $${params.length})`
    );
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";
  const paramsListado = [...params, tope, offset];

  const [rowsRes, conteoRes, resumenRes] = await Promise.all([
    db.query(
      `SELECT ci.id_cita, ci.estado, ci.fecha_reserva,
              ed.fecha_hora_inicio,
              s.nombre AS nombre_servicio,
              cl.id_clinica, cl.nombre AS nombre_clinica, cl.municipio AS municipio_clinica,
              u.id_usuario, u.nombre AS paciente_nombre, u.apellidos AS paciente_apellidos, u.correo AS paciente_correo
       FROM citas ci
       INNER JOIN espacios_disponibles ed ON ed.id_espacio = ci.id_espacio
       INNER JOIN clinicas_servicios cs ON cs.id_clinica_servicio = ed.id_clinica_servicio
       INNER JOIN servicios s ON s.id_servicio = cs.id_servicio
       INNER JOIN clinicas cl ON cl.id_clinica = cs.id_clinica
       INNER JOIN usuarios u ON u.id_usuario = ci.id_usuario
       ${where}
       ORDER BY ed.fecha_hora_inicio DESC, ci.fecha_reserva DESC, ci.id_cita ASC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      paramsListado
    ),
    db.query(
      `SELECT COUNT(*)::int AS total
       FROM citas ci
       INNER JOIN espacios_disponibles ed ON ed.id_espacio = ci.id_espacio
       INNER JOIN clinicas_servicios cs ON cs.id_clinica_servicio = ed.id_clinica_servicio
       INNER JOIN servicios s ON s.id_servicio = cs.id_servicio
       INNER JOIN clinicas cl ON cl.id_clinica = cs.id_clinica
       INNER JOIN usuarios u ON u.id_usuario = ci.id_usuario
       ${where}`,
      params
    ),
    db.query(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE estado = 'confirmada')::int AS programadas,
             COUNT(*) FILTER (WHERE estado = 'completada')::int AS completadas,
             COUNT(*) FILTER (WHERE estado = 'cancelada')::int AS canceladas,
             COUNT(*) FILTER (WHERE estado = 'no_asistio')::int AS no_asistio
      FROM citas
    `),
  ]);

  const total = conteoRes.rows[0]?.total ?? rowsRes.rows.length;
  return respuesta(200, {
    citas: rowsRes.rows,
    total,
    page: paginaActual,
    limit: tope,
    total_paginas: Math.max(1, Math.ceil(total / tope)),
    resumen: resumenRes.rows[0] || { total: 0, programadas: 0, completadas: 0, canceladas: 0, no_asistio: 0 },
  });
}

async function consultarCalendarioAdmin(db, { id_clinica, fecha, page, limit } = {}) {
  if (id_clinica && !esUuid(id_clinica)) {
    return respuesta(400, { error: "Identificador de clínica no válido." });
  }
  if (fecha !== undefined && fecha !== "" && (typeof fecha !== "string" || !FECHA_RE.test(fecha) || Number.isNaN(Date.parse(fecha)))) {
    return respuesta(400, { error: "El parámetro 'fecha' debe tener formato AAAA-MM-DD." });
  }

  const clinicasRes = await db.query(
    `SELECT id_clinica, nombre, municipio, estado_publicacion
     FROM clinicas
     WHERE estado_publicacion IN ('aprobada', 'suspendida')
     ORDER BY nombre ASC`
  );
  const clinicas = clinicasRes.rows;

  const seleccionada = id_clinica
    ? clinicas.find((c) => c.id_clinica === id_clinica) || null
    : (clinicas[0] || null);

  if (id_clinica && !seleccionada) {
    return respuesta(404, { error: "Clínica no encontrada." });
  }
  if (!seleccionada) {
    return respuesta(200, {
      clinicas: [],
      clinica: null,
      horarios: [],
      espacios: [],
      bloqueados: [],
      festivos: [],
      dias: [],
      hoy: null,
      total: 0,
      page: 1,
      limit: 10,
      total_paginas: 1,
    });
  }

  const [horariosRes, espaciosRes, bloqueadosRes, hoyRes] = await Promise.all([
    db.query(
      `SELECT dia_semana, to_char(hora_apertura, 'HH24:MI') AS apertura,
              to_char(hora_cierre, 'HH24:MI') AS cierre, es_24_horas, cruza_medianoche
       FROM horarios_atencion
       WHERE id_clinica = $1
       ORDER BY dia_semana, hora_apertura`,
      [seleccionada.id_clinica]
    ),
    db.query(
      `SELECT ed.id_espacio, ed.fecha_hora_inicio, ed.habilitado, s.nombre AS nombre_servicio,
              EXISTS (SELECT 1 FROM citas ci WHERE ci.id_espacio = ed.id_espacio AND ci.estado <> 'cancelada') AS ocupado
       FROM espacios_disponibles ed
       INNER JOIN clinicas_servicios cs ON cs.id_clinica_servicio = ed.id_clinica_servicio
       INNER JOIN servicios s ON s.id_servicio = cs.id_servicio
       WHERE cs.id_clinica = $1
         AND ed.fecha_hora_inicio >= NOW()
         AND ed.fecha_hora_inicio < ((NOW() AT TIME ZONE 'America/Mexico_City')::date + 15)::timestamp AT TIME ZONE 'America/Mexico_City'
       ORDER BY ed.fecha_hora_inicio, s.nombre`,
      [seleccionada.id_clinica]
    ),
    db.query(
      `SELECT fecha::text, motivo
       FROM clinicas_dias_bloqueados
       WHERE id_clinica = $1
         AND fecha >= (NOW() AT TIME ZONE 'America/Mexico_City')::date
         AND fecha < (NOW() AT TIME ZONE 'America/Mexico_City')::date + 15
       ORDER BY fecha`,
      [seleccionada.id_clinica]
    ),
    db.query(`SELECT (NOW() AT TIME ZONE 'America/Mexico_City')::date::text AS fecha`),
  ]);

  const hoy = hoyRes.rows[0]?.fecha || null;
  const bloqueadosMap = new Map(bloqueadosRes.rows.map((b) => [b.fecha, b.motivo || null]));
  const festivos = hoy
    ? Array.from({ length: 15 }, (_, i) => {
        const d = new Date(`${hoy}T12:00:00Z`);
        d.setUTCDate(d.getUTCDate() + i);
        const f = d.toISOString().slice(0, 10);
        return { fecha: f, nombre: festivoNacional(f) };
      }).filter((d) => d.nombre)
    : [];
  const festivosMap = new Map(festivos.map((f) => [f.fecha, f.nombre]));

  const conteoPorDia = new Map();
  for (const esp of espaciosRes.rows) {
    const f = fechaMexicoDesdeIso(esp.fecha_hora_inicio);
    if (!f) continue;
    const actual = conteoPorDia.get(f) || { total: 0, disponibles: 0, reservados: 0, deshabilitados: 0 };
    actual.total += 1;
    if (esp.ocupado) actual.reservados += 1;
    else if (esp.habilitado) actual.disponibles += 1;
    else actual.deshabilitados += 1;
    conteoPorDia.set(f, actual);
  }

  const dias = hoy
    ? Array.from({ length: 15 }, (_, i) => {
        const d = new Date(`${hoy}T12:00:00Z`);
        d.setUTCDate(d.getUTCDate() + i);
        const f = d.toISOString().slice(0, 10);
        const conteo = conteoPorDia.get(f) || { total: 0, disponibles: 0, reservados: 0, deshabilitados: 0 };
        return {
          fecha: f,
          ...conteo,
          bloqueado: bloqueadosMap.has(f),
          motivo_bloqueo: bloqueadosMap.get(f) || null,
          festivo: festivosMap.get(f) || null,
        };
      })
    : [];

  const fechaSeleccionada = fecha || null;
  const filtrados = fechaSeleccionada
    ? espaciosRes.rows.filter((esp) => fechaMexicoDesdeIso(esp.fecha_hora_inicio) === fechaSeleccionada)
    : espaciosRes.rows;

  const paginado = page !== undefined || limit !== undefined;
  const tope = [10, 20, 50].includes(Number(limit)) ? Number(limit) : 10;
  const paginaActual = paginado && Number.isInteger(Number(page)) && Number(page) > 0 ? Number(page) : 1;
  const total = filtrados.length;
  const totalPaginas = Math.max(1, Math.ceil(total / tope));
  const paginaSegura = Math.min(paginaActual, totalPaginas);
  const espacios = paginado
    ? filtrados.slice((paginaSegura - 1) * tope, paginaSegura * tope)
    : filtrados;

  return respuesta(200, {
    clinicas,
    clinica: seleccionada,
    horarios: horariosRes.rows,
    espacios,
    bloqueados: bloqueadosRes.rows,
    festivos,
    dias,
    hoy,
    fecha_seleccionada: fechaSeleccionada,
    total,
    page: paginaSegura,
    limit: tope,
    total_paginas: totalPaginas,
  });
}

function registrarRutasAdminSupervision(app, { pool, autenticarToken, requerirRol }) {
  const soloAdmin = [autenticarToken, requerirRol(["administrador"])];
  const manejar = (etiqueta, accion) => async (req, res) => {
    try {
      const resultado = await accion(req);
      return res.status(resultado.status).json(resultado.body);
    } catch (error) {
      console.error(`Error al ${etiqueta}:`, error.message);
      return res.status(500).json({ error: `No se pudo ${etiqueta}.` });
    }
  };

  app.get("/api/admin/resumen", ...soloAdmin,
    manejar("consultar el resumen administrativo", () => obtenerResumenAdmin(pool)));

  app.get("/api/admin/citas", ...soloAdmin,
    manejar("consultar las citas registradas", (req) => listarCitasAdmin(pool, {
      estado: req.query?.estado,
      id_clinica: req.query?.id_clinica,
      q: req.query?.q,
      page: req.query?.page,
      limit: req.query?.limit,
    })));

  app.get("/api/admin/calendarios", ...soloAdmin,
    manejar("consultar los calendarios de clínicas", (req) => consultarCalendarioAdmin(pool, {
      id_clinica: req.query?.id_clinica,
      fecha: req.query?.fecha,
      page: req.query?.page,
      limit: req.query?.limit,
    })));
}

module.exports = {
  registrarRutasAdminSupervision,
  obtenerResumenAdmin,
  listarCitasAdmin,
  consultarCalendarioAdmin,
};
