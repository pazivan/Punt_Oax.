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
const path = require("node:path");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ESTADOS_SOLICITUD = ["pendiente", "aprobada", "rechazada"];
const MIN_OBSERVACIONES_RECHAZO = 10;
const MAX_OBSERVACIONES = 1000;

const esUuid = (valor) => typeof valor === "string" && UUID_RE.test(valor);
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
async function listarSolicitudes(db, { estado } = {}) {
  const filtro = estado === undefined ? "pendiente" : estado;
  if (filtro !== "todas" && !ESTADOS_SOLICITUD.includes(filtro)) {
    return respuesta(400, { error: `Estado no válido. Usa: ${[...ESTADOS_SOLICITUD, "todas"].join(", ")}.` });
  }
  const { rows } = await db.query(
    `SELECT sc.id_solicitud, sc.estado, sc.fecha_solicitud, sc.observaciones,
            c.id_clinica, c.nombre AS nombre_clinica, c.municipio, c.tipo_institucion,
            c.estado_publicacion
     FROM solicitudes_clinicas sc
     INNER JOIN clinicas c ON c.id_clinica = sc.id_clinica
     WHERE ($1::text = 'todas' OR sc.estado = $1::text)
     ORDER BY (sc.estado = 'pendiente') DESC, sc.fecha_solicitud DESC`,
    [filtro]
  );
  return respuesta(200, { solicitudes: rows });
}

// ------------------------------------------------------------------
// 2. Detalle de una solicitud
// ------------------------------------------------------------------
async function consultarSolicitud(db, idSolicitud) {
  if (!esUuid(idSolicitud)) return respuesta(400, { error: "Identificador de solicitud no válido." });
  const { rows } = await db.query(
    `SELECT sc.id_solicitud, sc.estado, sc.fecha_solicitud, sc.observaciones, sc.datos_ficha,
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
      `SELECT sc.estado, sc.id_clinica, sc.datos_ficha, c.estado_publicacion AS estado_clinica
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
    const esCambioUbicacion =
      actual.datos_ficha?.tipo_solicitud === "actualizacion_ubicacion" &&
      actual.estado_clinica === "aprobada";
    const ubicacionSolicitada = actual.datos_ficha?.ubicacion_solicitada;

    const solicitud = await db.query(
      `UPDATE solicitudes_clinicas
       SET estado = $1, observaciones = COALESCE($2, observaciones)
       WHERE id_solicitud = $3
       RETURNING id_solicitud, estado, fecha_solicitud, observaciones`,
      [nuevoEstado, obs.valor, idSolicitud]
    );

    let clinica;
    if (
      decision === "aprobar" &&
      ubicacionSolicitada &&
      Number.isFinite(Number(ubicacionSolicitada.latitud)) &&
      Number.isFinite(Number(ubicacionSolicitada.longitud))
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
    } else if (decision === "rechazar" && esCambioUbicacion) {
      // Si se rechaza un cambio de ubicación de una clínica ya aprobada, conserva su publicación actual.
      clinica = await db.query(
        `SELECT id_clinica, nombre, estado_publicacion
         FROM clinicas
         WHERE id_clinica = $1`,
        [actual.id_clinica]
      );
    } else {
      clinica = await db.query(
        `UPDATE clinicas
         SET estado_publicacion = $1,
             situacion_ubicacion = CASE
               WHEN $1 = 'aprobada' AND ubicacion_geo IS NOT NULL AND situacion_ubicacion = 'pendiente' THEN 'fija'
               ELSE situacion_ubicacion
             END,
             verificacion_datos = CASE
               WHEN $1 = 'aprobada' THEN 'verificado'
               ELSE verificacion_datos
             END
         WHERE id_clinica = $2
         RETURNING id_clinica, nombre, estado_publicacion`,
        [nuevoEstado, actual.id_clinica]
      );
    }
    return respuesta(200, {
      mensaje: decision === "aprobar"
        ? (esCambioUbicacion
          ? "Ubicación aprobada y actualizada en el directorio público."
          : "Solicitud aprobada. La clínica ya aparece en el directorio público.")
        : (esCambioUbicacion
          ? "Cambio de ubicación rechazado. La clínica conserva su ubicación aprobada anterior."
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
      console.error(`Error al ${etiqueta}:`, error.message);
      if (error.status) return res.status(error.status).json({ error: error.message });
      return res.status(500).json({ error: `No se pudo ${etiqueta}.` });
    }
  };

  app.get("/api/admin/solicitudes", ...soloAdmin,
    manejar("consultar las solicitudes", (req) => listarSolicitudes(pool, { estado: req.query.estado })));

  app.get("/api/admin/solicitudes/:id", ...soloAdmin,
    manejar("consultar la solicitud", (req) => consultarSolicitud(pool, req.params.id)));

  app.patch("/api/admin/solicitudes/:id", ...soloAdmin,
    manejar("resolver la solicitud", (req) => resolverSolicitud(pool, req.params.id, req.body)));

  app.patch("/api/admin/clinicas/:id/visibilidad", ...soloAdmin,
    manejar("cambiar la visibilidad de la clínica", (req) => cambiarVisibilidad(pool, req.params.id, req.body)));

  app.get("/api/admin/documentos/:id", ...soloAdmin,
    manejar("descargar el documento", (req) =>
      obtenerDocumento(pool, req.params.id, prepararCarpetaDocumentos)));
}

// Rutas administrativas protegidas acordadas con Kelly (Issue #66 / Issue #69 · Punto 4.7.4)
const RUTAS_ADMIN_ACORDADAS = [
  "GET /api/admin/solicitudes",
  "GET /api/admin/solicitudes/:id",
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
};
