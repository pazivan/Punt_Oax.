/**
 * Revisión de clínicas por el administrador (Sprint 7 · Kelly · issue #66)
 * Control de acceso y restricción de acciones por rol (Sprint 7 · Jonathan · issue #69 · Punto 4.7.4)
 *
 * Apoyo y coordinación:
 *   - Kelly (#66): Rutas, controladores de revisión, transiciones y consulta de documentos.
 *   - Jonathan (#69): Restricción de acciones y protección de rutas con autenticarToken + requerirRol(["administrador"]).
 *
 * La clínica ya envía su postulación con POST /api/clinicas/mi-ficha/postulacion
 * (queda en solicitudes_clinicas con estado 'pendiente' y una copia de la ficha
 * en datos_ficha). Este módulo agrega lo que hace el administrador:
 *
 *   GET   /api/admin/solicitudes                 lista (filtro ?estado=)
 *   GET   /api/admin/solicitudes/:id             detalle con la ficha enviada
 *   GET   /api/admin/documentos/:id              descargar un documento de la clínica
 *   PATCH /api/admin/solicitudes/:id             aprobar o rechazar
 *   PATCH /api/admin/clinicas/:id/visibilidad    ocultar o volver a mostrar
 *
 * Estados (migración 001):
 *   solicitudes_clinicas.estado:   pendiente | aprobada | rechazada
 *   clinicas.estado_publicacion:   borrador | pendiente | aprobada | rechazada | suspendida
 *
 * Transiciones:
 *   aprobar   solicitud pendiente -> aprobada   y clínica -> aprobada  (aparece en el mapa)
 *   rechazar  solicitud pendiente -> rechazada  y clínica -> rechazada (puede corregir y volver a postular)
 *   ocultar   clínica aprobada    -> suspendida (deja de aparecer en el mapa)
 *   mostrar   clínica suspendida  -> aprobada
 */

const fs = require("node:fs/promises");
const { responderErrorEsquema } = require("./erroresEsquema");
const path = require("node:path");

const { ETIQUETAS_AREA } = require("./comparacionFicha");
const NOMBRES_SERVICIOS = {
  its: "Detección de ITS",
  ile: "Interrupción Legal del Embarazo (ILE)",
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ESTADOS_SOLICITUD = ["pendiente", "aprobada", "rechazada", "suspendida"];
const ESTADOS_CLINICA = ["borrador", "pendiente", "aprobada", "rechazada", "suspendida"];
const MIN_OBSERVACIONES_RECHAZO = 10;
const MAX_OBSERVACIONES = 1000;

const esUuid = (valor) => typeof valor === "string" && UUID_RE.test(valor);
const esCoordenadaValida = (valor) =>
  valor !== null && valor !== undefined && valor !== "" && Number.isFinite(Number(valor));
const respuesta = (status, body) => ({ status, body });

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

function limpiarObservaciones(valor) {
  if (valor === undefined || valor === null) return { valor: null };
  if (typeof valor !== "string") return { error: "Las observaciones deben ser texto." };
  const texto = valor.trim();
  if (texto.length > MAX_OBSERVACIONES) {
    return { error: `Las observaciones no pueden pasar de ${MAX_OBSERVACIONES} caracteres.` };
  }
  return { valor: texto || null };
}

// ------------------------------------------------------------------
// 1. Lista de solicitudes
// ------------------------------------------------------------------
async function listarSolicitudes(db, { estado, page, limit, q } = {}) {
  const filtro = estado === undefined ? "pendiente" : estado;
  if (filtro !== "todas" && !ESTADOS_SOLICITUD.includes(filtro)) {
    return respuesta(400, { error: `Estado no válido. Usa: ${[...ESTADOS_SOLICITUD, "todas"].join(", ")}.` });
  }

  const paginado = page !== undefined || limit !== undefined;
  const tope = [10, 20, 50].includes(Number(limit)) ? Number(limit) : 10;
  const paginaActual = Number.isInteger(Number(page)) && Number(page) > 0 ? Number(page) : 1;
  const offset = (paginaActual - 1) * tope;
  const busqueda = typeof q === "string" ? q.trim() : "";

  const condiciones = [];
  const params = [];

  if (filtro === "suspendida") {
    condiciones.push("(sc.estado = 'aprobada' AND c.estado_publicacion = 'suspendida')");
  } else if (filtro === "aprobada") {
    condiciones.push("(sc.estado = 'aprobada' AND c.estado_publicacion <> 'suspendida')");
  } else if (filtro !== "todas") {
    params.push(filtro);
    condiciones.push(`sc.estado = $${params.length}::text`);
  }

  if (busqueda) {
    params.push(`%${busqueda}%`);
    condiciones.push(
      `(COALESCE(c.nombre, '') ILIKE $${params.length} OR COALESCE(c.municipio, '') ILIKE $${params.length} OR COALESCE(c.tipo_institucion, '') ILIKE $${params.length})`
    );
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";
  const paramsListado = [...params];
  const paginacionSql = paginado
    ? `LIMIT $${paramsListado.push(tope)} OFFSET $${paramsListado.push(offset)}`
    : "";

  const { rows } = await db.query(
    `SELECT sc.id_solicitud, sc.estado, sc.fecha_solicitud, sc.fecha_resolucion, sc.observaciones,
            sc.tipo_solicitud, sc.motivo, sc.campos_modificados,
            c.id_clinica, c.nombre AS nombre_clinica, c.municipio, c.tipo_institucion,
            c.estado_publicacion
     FROM solicitudes_clinicas sc
     INNER JOIN clinicas c ON c.id_clinica = sc.id_clinica
     ${where}
     ORDER BY (sc.estado = 'pendiente') DESC, sc.fecha_solicitud DESC, sc.id_solicitud ASC
     ${paginacionSql}`,
    paramsListado
  );

  if (!paginado) {
    return respuesta(200, { solicitudes: rows });
  }

  const [conteoRes, resumenRes] = await Promise.all([
    db.query(
      `SELECT COUNT(*)::int AS total
       FROM solicitudes_clinicas sc
       INNER JOIN clinicas c ON c.id_clinica = sc.id_clinica
       ${where}`,
      params
    ),
    db.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE sc.estado = 'pendiente')::int AS pendientes,
              COUNT(*) FILTER (WHERE sc.estado = 'aprobada')::int AS aprobadas,
              COUNT(*) FILTER (WHERE sc.estado = 'rechazada')::int AS rechazadas
       FROM solicitudes_clinicas sc`
    ),
  ]);

  const total = conteoRes.rows[0]?.total ?? rows.length;
  const resumen = resumenRes.rows[0] || {
    total,
    pendientes: 0,
    aprobadas: 0,
    rechazadas: 0,
  };

  return respuesta(200, {
    solicitudes: rows,
    total,
    page: paginaActual,
    limit: tope,
    total_paginas: Math.max(1, Math.ceil(total / tope)),
    resumen,
  });
}

// ------------------------------------------------------------------
// 2. Detalle de una solicitud
// ------------------------------------------------------------------
async function consultarSolicitud(db, idSolicitud) {
  if (!esUuid(idSolicitud)) return respuesta(400, { error: "Identificador de solicitud no válido." });
  const { rows } = await db.query(
    `SELECT sc.id_solicitud, sc.estado, sc.fecha_solicitud, sc.fecha_resolucion, sc.observaciones,
            sc.tipo_solicitud, sc.motivo, sc.campos_modificados, sc.datos_ficha,
            c.id_clinica, c.nombre AS nombre_clinica, c.municipio, c.tipo_institucion,
            c.estado_publicacion, c.correo_contacto, c.telefono
     FROM solicitudes_clinicas sc
     INNER JOIN clinicas c ON c.id_clinica = sc.id_clinica
     WHERE sc.id_solicitud = $1`,
    [idSolicitud]
  );
  const solicitud = rows[0];
  if (!solicitud) return respuesta(404, { error: "Solicitud no encontrada." });

  // Lista de documentos actuales (sin la ruta privada del archivo).
  const documentos = await db.query(
    `SELECT id_documento, nombre_original, mime, tamano_bytes, fecha_carga
     FROM clinicas_documentos
     WHERE id_clinica = $1
     ORDER BY fecha_carga`,
    [solicitud.id_clinica]
  );
  return respuesta(200, { solicitud, documentos: documentos.rows });
}

// ------------------------------------------------------------------
// 3. Aprobar o rechazar una solicitud
// ------------------------------------------------------------------
async function resolverSolicitud(pool, idSolicitud, cuerpo) {
  if (!esUuid(idSolicitud)) return respuesta(400, { error: "Identificador de solicitud no válido." });
  const decision = cuerpo?.decision;
  if (!["aprobar", "rechazar"].includes(decision)) {
    return respuesta(400, { error: "La decisión debe ser 'aprobar' o 'rechazar'." });
  }
  const obs = limpiarObservaciones(cuerpo?.observaciones);
  if (obs.error) return respuesta(400, { error: obs.error });
  if (decision === "rechazar" && (!obs.valor || obs.valor.length < MIN_OBSERVACIONES_RECHAZO)) {
    return respuesta(400, {
      error: `Para rechazar escribe en 'observaciones' qué debe corregir la clínica (mínimo ${MIN_OBSERVACIONES_RECHAZO} caracteres).`,
    });
  }

  return enTransaccion(pool, async (db) => {
    const { rows } = await db.query(
      `SELECT sc.estado, sc.id_clinica, sc.datos_ficha, sc.tipo_solicitud,
              c.estado_publicacion AS estado_clinica
       FROM solicitudes_clinicas sc
       INNER JOIN clinicas c ON c.id_clinica = sc.id_clinica
       WHERE sc.id_solicitud = $1
       FOR UPDATE OF sc, c`,
      [idSolicitud]
    );
    const actual = rows[0];
    if (!actual) return respuesta(404, { error: "Solicitud no encontrada." });
    if (actual.estado !== "pendiente") {
      return respuesta(409, { error: `Esta solicitud ya fue ${actual.estado}; no se puede volver a resolver.` });
    }

    const nuevoEstado = decision === "aprobar" ? "aprobada" : "rechazada";
    const tipoSolicitud = actual.tipo_solicitud || actual.datos_ficha?.tipo_solicitud || "postulacion";
    const esActualizacionAprobada =
      actual.estado_clinica === "aprobada" &&
      ["actualizacion_ubicacion", "actualizacion_informacion"].includes(tipoSolicitud);
    const ubicacionSolicitada =
      actual.datos_ficha?.ubicacion_solicitada || actual.datos_ficha?.datos_nuevos?.ubicacion;
    const datosNuevos = actual.datos_ficha?.datos_nuevos || {};

    const solicitud = await db.query(
      `UPDATE solicitudes_clinicas
       SET estado = $1,
           observaciones = COALESCE($2, observaciones),
           fecha_resolucion = CURRENT_TIMESTAMP
       WHERE id_solicitud = $3
       RETURNING id_solicitud, estado, fecha_solicitud, fecha_resolucion, observaciones`,
      [nuevoEstado, obs.valor, idSolicitud]
    );

    let clinica;
    if (decision === "aprobar" && esActualizacionAprobada) {
      const sets = ["estado_publicacion = 'aprobada'"];
      const valores = [];
      for (const campo of ["nombre", "tipo_institucion", "municipio", "municipio_clave", "codigo_postal", "direccion"]) {
        if (Object.hasOwn(datosNuevos, campo)) {
          valores.push(datosNuevos[campo]);
          sets.push(`${campo} = $${valores.length}`);
        }
      }
      if (
        ubicacionSolicitada &&
        esCoordenadaValida(ubicacionSolicitada.latitud) &&
        esCoordenadaValida(ubicacionSolicitada.longitud)
      ) {
        valores.push(Number(ubicacionSolicitada.longitud), Number(ubicacionSolicitada.latitud));
        sets.push(
          `ubicacion_geo = ST_SetSRID(ST_MakePoint($${valores.length - 1}, $${valores.length}), 4326)::geography`,
          "situacion_ubicacion = 'fija'",
          "verificacion_datos = 'verificado'"
        );
      }
      valores.push(actual.id_clinica);
      clinica = await db.query(
        `UPDATE clinicas
         SET ${sets.join(", ")}
         WHERE id_clinica = $${valores.length}
         RETURNING id_clinica, nombre, estado_publicacion`,
        valores
      );

      if (Array.isArray(datosNuevos.areas_servicio)) {
        const nombresActivos = datosNuevos.areas_servicio
          .filter((c) => Object.hasOwn(ETIQUETAS_AREA, c))
          .map((c) => NOMBRES_SERVICIOS[c]);
        const srvRes = await db.query(
          "SELECT id_servicio, nombre FROM servicios WHERE activo = TRUE AND nombre = ANY($1::text[])",
          [nombresActivos]
        );
        const idsActivos = srvRes.rows.map((r) => r.id_servicio);
        for (const idSrv of idsActivos) {
          await db.query(
            `INSERT INTO clinicas_servicios (id_clinica, id_servicio, activo)
             VALUES ($1, $2, TRUE)
             ON CONFLICT (id_clinica, id_servicio)
             DO UPDATE SET activo = TRUE`,
            [actual.id_clinica, idSrv]
          );
        }
        if (idsActivos.length > 0) {
          await db.query(
            `UPDATE clinicas_servicios SET activo = FALSE
             WHERE id_clinica = $1 AND NOT (id_servicio = ANY($2::uuid[]))`,
            [actual.id_clinica, idsActivos]
          );
        }
      }
    } else if (
      decision === "aprobar" &&
      ubicacionSolicitada &&
      esCoordenadaValida(ubicacionSolicitada.latitud) &&
      esCoordenadaValida(ubicacionSolicitada.longitud)
    ) {
      clinica = await db.query(
        `UPDATE clinicas
         SET estado_publicacion = 'aprobada',
             ubicacion_geo = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
             situacion_ubicacion = 'fija',
             verificacion_datos = 'verificado'
         WHERE id_clinica = $3
         RETURNING id_clinica, nombre, estado_publicacion`,
        [Number(ubicacionSolicitada.longitud), Number(ubicacionSolicitada.latitud), actual.id_clinica]
      );
    } else if (decision === "rechazar" && esActualizacionAprobada) {
      // Si se rechaza una actualización de una clínica ya aprobada, conserva su publicación actual.
      clinica = await db.query(
        `SELECT id_clinica, nombre, estado_publicacion
         FROM clinicas
         WHERE id_clinica = $1`,
        [actual.id_clinica]
      );
    } else {
      clinica = await db.query(
        `UPDATE clinicas
         SET estado_publicacion = $1::text,
             situacion_ubicacion = CASE
               WHEN $1::text = 'aprobada' AND ubicacion_geo IS NOT NULL AND situacion_ubicacion = 'pendiente' THEN 'fija'
               ELSE situacion_ubicacion
             END,
             verificacion_datos = CASE
               WHEN $1::text = 'aprobada' THEN 'verificado'
               ELSE verificacion_datos
             END
         WHERE id_clinica = $2
         RETURNING id_clinica, nombre, estado_publicacion`,
        [nuevoEstado, actual.id_clinica]
      );
    }
    return respuesta(200, {
      mensaje: decision === "aprobar"
        ? (esActualizacionAprobada
          ? "Actualización aprobada y publicada en el directorio."
          : "Solicitud aprobada. La clínica ya aparece en el directorio público.")
        : (esActualizacionAprobada
          ? "Solicitud rechazada. La clínica conserva su información publicada anterior."
          : "Solicitud rechazada. La clínica puede corregir su ficha y volver a postular."),
      solicitud: solicitud.rows[0],
      clinica: clinica.rows[0],
    });
  });
}

// ------------------------------------------------------------------
// 4. Ocultar o volver a mostrar una clínica publicada
// ------------------------------------------------------------------
async function cambiarVisibilidad(pool, idClinica, cuerpo) {
  if (!esUuid(idClinica)) return respuesta(400, { error: "Identificador de clínica no válido." });
  const accion = cuerpo?.accion;
  if (!["ocultar", "mostrar"].includes(accion)) {
    return respuesta(400, { error: "La acción debe ser 'ocultar' o 'mostrar'." });
  }
  const desde = accion === "ocultar" ? "aprobada" : "suspendida";
  const hacia = accion === "ocultar" ? "suspendida" : "aprobada";

  return enTransaccion(pool, async (db) => {
    const { rows } = await db.query(
      "SELECT estado_publicacion FROM clinicas WHERE id_clinica = $1 FOR UPDATE",
      [idClinica]
    );
    if (!rows[0]) return respuesta(404, { error: "Clínica no encontrada." });
    if (rows[0].estado_publicacion !== desde) {
      return respuesta(409, {
        error: accion === "ocultar"
          ? "Solo se puede ocultar una clínica que está publicada (aprobada)."
          : "Solo se puede volver a mostrar una clínica que fue ocultada (suspendida).",
      });
    }
    const clinica = await db.query(
      `UPDATE clinicas SET estado_publicacion = $1
       WHERE id_clinica = $2
       RETURNING id_clinica, nombre, estado_publicacion`,
      [hacia, idClinica]
    );
    return respuesta(200, {
      mensaje: accion === "ocultar"
        ? "La clínica se ocultó del directorio público."
        : "La clínica vuelve a aparecer en el directorio público.",
      clinica: clinica.rows[0],
    });
  });
}

// ------------------------------------------------------------------
// 5. Descargar un documento (solo administrador)
// ------------------------------------------------------------------
async function obtenerDocumento(db, idDocumento, prepararCarpetaDocumentos) {
  if (!esUuid(idDocumento)) return respuesta(400, { error: "Identificador de documento no válido." });
  const { rows } = await db.query(
    `SELECT clave_almacenamiento, nombre_original, mime
     FROM clinicas_documentos WHERE id_documento = $1`,
    [idDocumento]
  );
  const doc = rows[0];
  if (!doc) return respuesta(404, { error: "Documento no encontrado." });
  const carpeta = await prepararCarpetaDocumentos();
  // La clave es un UUID generado por el servidor: no se puede salir de la carpeta.
  const contenido = await fs.readFile(path.join(carpeta, String(doc.clave_almacenamiento)))
    .catch(() => null);
  if (!contenido) return respuesta(404, { error: "El archivo del documento no está disponible." });
  return { status: 200, archivo: { contenido, mime: doc.mime, nombre: doc.nombre_original } };
}

// ------------------------------------------------------------------
// 6. Listado y detalle directo de clínicas registradas
// ------------------------------------------------------------------
async function listarClinicas(db, { estado, page, limit, q } = {}) {
  const filtro = estado === undefined ? "todas" : estado;
  if (filtro !== "todas" && !ESTADOS_CLINICA.includes(filtro)) {
    return respuesta(400, { error: `Estado no válido. Usa: ${[...ESTADOS_CLINICA, "todas"].join(", ")}.` });
  }

  const tope = [10, 20, 50].includes(Number(limit)) ? Number(limit) : 10;
  const paginaActual = Number.isInteger(Number(page)) && Number(page) > 0 ? Number(page) : 1;
  const offset = (paginaActual - 1) * tope;
  const busqueda = typeof q === "string" ? q.trim() : "";

  const condiciones = [];
  const params = [];
  if (filtro !== "todas") {
    params.push(filtro);
    condiciones.push(`c.estado_publicacion = $${params.length}::text`);
  }
  if (busqueda) {
    params.push(`%${busqueda}%`);
    condiciones.push(
      `(COALESCE(c.nombre, '') ILIKE $${params.length} OR COALESCE(c.municipio, '') ILIKE $${params.length} OR COALESCE(c.tipo_institucion, '') ILIKE $${params.length} OR COALESCE(c.correo_contacto, '') ILIKE $${params.length})`
    );
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";

  const paramsListado = [...params, tope, offset];
  const { rows } = await db.query(
    `SELECT c.id_clinica, c.nombre, c.tipo_institucion, c.municipio, c.estado_publicacion,
            c.telefono, c.correo_contacto, c.fecha_registro,
            (c.ubicacion_geo IS NOT NULL) AS tiene_ubicacion
     FROM clinicas c
     ${where}
     ORDER BY (c.estado_publicacion = 'aprobada') DESC, c.fecha_registro DESC, c.nombre ASC, c.id_clinica ASC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    paramsListado
  );

  const [conteoRes, resumenRes] = await Promise.all([
    db.query(`SELECT COUNT(*)::int AS total FROM clinicas c ${where}`, params),
    db.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE estado_publicacion = 'aprobada')::int AS aprobadas,
              COUNT(*) FILTER (WHERE estado_publicacion = 'suspendida')::int AS suspendidas,
              COUNT(*) FILTER (WHERE estado_publicacion = 'pendiente')::int AS pendientes,
              COUNT(*) FILTER (WHERE estado_publicacion = 'borrador')::int AS borrador,
              COUNT(*) FILTER (WHERE estado_publicacion = 'rechazada')::int AS rechazadas
       FROM clinicas`
    ),
  ]);

  const total = conteoRes.rows[0]?.total ?? rows.length;
  return respuesta(200, {
    clinicas: rows,
    total,
    page: paginaActual,
    limit: tope,
    total_paginas: Math.max(1, Math.ceil(total / tope)),
    resumen: resumenRes.rows[0] || { total, aprobadas: 0, suspendidas: 0, pendientes: 0, borrador: 0, rechazadas: 0 },
  });
}

async function consultarClinica(db, idClinica) {
  if (!esUuid(idClinica)) return respuesta(400, { error: "Identificador de clínica no válido." });

  const { rows } = await db.query(
    `SELECT c.id_clinica, c.nombre, c.tipo_institucion, c.estado_publicacion,
            c.descripcion, c.telefono, c.correo_contacto, c.correo_acceso,
            c.sitio_web, c.municipio, c.localidad, c.direccion, c.codigo_postal,
            c.ubicacion_maps_url, c.enlaces_informacion, c.fecha_registro,
            c.correo_verificado_en IS NOT NULL AS correo_verificado,
            ST_Y(c.ubicacion_geo::geometry) AS latitud,
            ST_X(c.ubicacion_geo::geometry) AS longitud
     FROM clinicas c
     WHERE c.id_clinica = $1`,
    [idClinica]
  );
  const clinica = rows[0];
  if (!clinica) return respuesta(404, { error: "Clínica no encontrada." });

  const [serviciosRes, horariosRes, documentosRes, solicitudRes] = await Promise.all([
    db.query(
      `SELECT s.id_servicio, s.nombre, s.categoria,
              cs.detalle_servicio, cs.costo, cs.costo_texto, cs.requisitos, cs.requiere_cita
       FROM clinicas_servicios cs
       INNER JOIN servicios s ON s.id_servicio = cs.id_servicio
       WHERE cs.id_clinica = $1 AND cs.activo = TRUE AND s.activo = TRUE
       ORDER BY s.nombre`,
      [idClinica]
    ),
    db.query(
      `SELECT dia_semana, to_char(hora_apertura, 'HH24:MI') AS apertura,
              to_char(hora_cierre, 'HH24:MI') AS cierre, es_24_horas, cruza_medianoche
       FROM horarios_atencion
       WHERE id_clinica = $1
       ORDER BY dia_semana, hora_apertura`,
      [idClinica]
    ),
    db.query(
      `SELECT id_documento, nombre_original, mime, tamano_bytes, fecha_carga
       FROM clinicas_documentos
       WHERE id_clinica = $1
       ORDER BY fecha_carga`,
      [idClinica]
    ),
    db.query(
      `SELECT id_solicitud, estado, tipo_solicitud, fecha_solicitud, fecha_resolucion
       FROM solicitudes_clinicas
       WHERE id_clinica = $1
       ORDER BY fecha_solicitud DESC
       LIMIT 1`,
      [idClinica]
    ),
  ]);

  return respuesta(200, {
    clinica: {
      ...clinica,
      enlaces_informacion: Array.isArray(clinica.enlaces_informacion) ? clinica.enlaces_informacion : [],
    },
    servicios: serviciosRes.rows.map((s) => ({ ...s, costo: s.costo === null ? null : Number(s.costo) })),
    horarios: horariosRes.rows,
    documentos: documentosRes.rows,
    ultima_solicitud: solicitudRes.rows[0] || null,
  });
}

// ------------------------------------------------------------------
// Registro de rutas en Express
// ------------------------------------------------------------------
function registrarRutasAdminClinicas(app, { pool, autenticarToken, requerirRol, prepararCarpetaDocumentos }) {
  const soloAdmin = [autenticarToken, requerirRol(["administrador"])];
  const manejar = (etiqueta, accion) => async (req, res) => {
    try {
      const resultado = await accion(req);
      if (resultado.archivo) {
        const nombre = resultado.archivo.nombre.replace(/[^\w.\- ]/g, "_");
        res.set("Content-Type", resultado.archivo.mime);
        res.set("Content-Disposition", `attachment; filename="${nombre}"`);
        res.set("X-Content-Type-Options", "nosniff");
        return res.status(200).send(resultado.archivo.contenido);
      }
      return res.status(resultado.status).json(resultado.body);
    } catch (error) {
      console.error(`Error al ${etiqueta}:`, error.code || "", error.message);
      if (responderErrorEsquema(res, error)) return;
      if (error.status) return res.status(error.status).json({ error: error.message });
      if (error.code === "23505") {
        return res.status(409).json({
          error: `No se pudo ${etiqueta} porque existe un conflicto con otro registro activo.`,
          codigo: "CONFLICTO_REGISTRO",
        });
      }
      if (error.code === "23503") {
        return res.status(409).json({
          error: `No se pudo ${etiqueta} porque falta un registro relacionado requerido.`,
          codigo: "REFERENCIA_NO_DISPONIBLE",
        });
      }
      if (error.code === "23514") {
        return res.status(400).json({
          error: `No se pudo ${etiqueta} porque alguno de los valores no cumple las reglas de validación.`,
          codigo: "VALIDACION_DATOS",
        });
      }
      if (error.code === "22P02") {
        return res.status(400).json({
          error: `No se pudo ${etiqueta} porque uno de los identificadores o valores tiene un formato inválido.`,
          codigo: "FORMATO_INVALIDO",
        });
      }
      return res.status(500).json({
        error: `No se pudo ${etiqueta} por un error interno del servidor. Intenta de nuevo y, si el problema continúa, revisa los registros del servidor.`,
        codigo: "ERROR_INTERNO",
      });
    }
  };

  app.get("/api/admin/solicitudes", ...soloAdmin,
    manejar("consultar las solicitudes", (req) => listarSolicitudes(pool, {
      estado: req.query.estado,
      page: req.query.page,
      limit: req.query.limit,
      q: req.query.q,
    })));

  app.get("/api/admin/solicitudes/:id", ...soloAdmin,
    manejar("consultar la solicitud", (req) => consultarSolicitud(pool, req.params.id)));

  app.patch("/api/admin/solicitudes/:id", ...soloAdmin,
    manejar("resolver la solicitud", (req) => resolverSolicitud(pool, req.params.id, req.body)));

  app.patch("/api/admin/clinicas/:id/visibilidad", ...soloAdmin,
    manejar("cambiar la visibilidad de la clínica", (req) => cambiarVisibilidad(pool, req.params.id, req.body)));

  app.get("/api/admin/clinicas", ...soloAdmin,
    manejar("consultar las clínicas", (req) => listarClinicas(pool, {
      estado: req.query.estado,
      page: req.query.page,
      limit: req.query.limit,
      q: req.query.q,
    })));

  app.get("/api/admin/clinicas/:id", ...soloAdmin,
    manejar("consultar la clínica", (req) => consultarClinica(pool, req.params.id)));

  app.get("/api/admin/documentos/:id", ...soloAdmin,
    manejar("descargar el documento", (req) =>
      obtenerDocumento(pool, req.params.id, prepararCarpetaDocumentos)));
}

// Rutas administrativas protegidas acordadas con Kelly (Issue #66 / Issue #69 · Punto 4.7.4)
const RUTAS_ADMIN_ACORDADAS = [
  "GET /api/admin/solicitudes",
  "GET /api/admin/solicitudes/:id",
  "GET /api/admin/clinicas",
  "GET /api/admin/clinicas/:id",
  "GET /api/admin/documentos/:id",
  "PATCH /api/admin/solicitudes/:id",
  "PATCH /api/admin/clinicas/:id/visibilidad",
];

module.exports = {
  registrarRutasAdminClinicas,
  RUTAS_ADMIN_ACORDADAS,
  listarSolicitudes,
  consultarSolicitud,
  resolverSolicitud,
  cambiarVisibilidad,
  obtenerDocumento,
  listarClinicas,
  consultarClinica,
};
