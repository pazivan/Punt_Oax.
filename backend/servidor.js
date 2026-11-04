const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID, createHash } = require("node:crypto");
const pool = require("./db");
const { hashearPassword, verificarPassword, generarToken, autenticarToken, requerirRol } = require("./auth");

const app = express();
const PUERTO = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const recibirDocumentos = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 5, fields: 0, parts: 5 },
}).array("documentos", 5);

const MAX_DOCUMENTOS = 5;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIPOS_INSTITUCION = new Set(["publica", "privada", "ong", "otra"]);
const NOMBRES_PRINCIPALES = {
  its: "Detección de ITS",
  ile: "Interrupción Legal del Embarazo (ILE)",
};
const REGEX_CORREO = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
const REGEX_TELEFONO = /^[+\d()\s.-]+$/;
const REGEX_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function procesarDocumentos(req, res, next) {
  if (!req.is("multipart/form-data")) {
    return res.status(415).json({ error: "Envía los documentos como un formulario multipart." });
  }
  recibirDocumentos(req, res, (error) => {
    if (error) {
      return res.status(400).json({ error: "Máximo cinco documentos de 5 MB cada uno; revisa el formulario." });
    }
    if (!Array.isArray(req.files) || req.files.length === 0) {
      return res.status(400).json({ error: "Adjunta al menos un archivo de respaldo." });
    }
    const firmas = req.files.every((archivo) => {
      const bytes = archivo.buffer;
      return bytes.length > 0 && archivo.originalname.length <= 255 &&
        ((archivo.mimetype === "application/pdf" && bytes.subarray(0, 5).toString() === "%PDF-") ||
        (archivo.mimetype === "image/png" && bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) ||
        (archivo.mimetype === "image/jpeg" && bytes.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"))));
    });
    if (!firmas) {
      return res.status(400).json({ error: "Solo se admiten PDF, PNG o JPG válidos de hasta 5 MB." });
    }
    next();
  });
}

function validarServicios(valor, { permitirVacio }) {
  if (!Array.isArray(valor)) return { error: "Los servicios deben enviarse como una lista." };
  if (valor.length > Object.keys(NOMBRES_PRINCIPALES).length) {
    return { error: "Solo se admiten las áreas de ITS e ILE." };
  }
  if (!permitirVacio && valor.length === 0) {
    return { error: "Selecciona al menos un área de atención." };
  }
  const categorias = new Set();
  const servicios = [];
  for (const item of valor) {
    if (!item || typeof item !== "object" || Array.isArray(item) ||
        !Object.hasOwn(NOMBRES_PRINCIPALES, item.categoria)) {
      return { error: "Selecciona únicamente las áreas de ITS o ILE." };
    }
    if (categorias.has(item.categoria)) {
      return { error: "No repitas la misma área de atención." };
    }
    const detalle = item.detalle == null ? "" : item.detalle;
    if (typeof detalle !== "string") {
      return { error: "La descripción de cada servicio debe ser texto." };
    }
    const detalleLimpio = detalle.trim();
    if (detalleLimpio.length > 2000) {
      return { error: "La descripción de cada servicio no puede superar los 2000 caracteres." };
    }
    if (!permitirVacio && !detalleLimpio) {
      return { error: "Describe específicamente los servicios de cada área seleccionada." };
    }
    categorias.add(item.categoria);
    servicios.push({ categoria: item.categoria, detalle: detalleLimpio || null });
  }
  return { servicios };
}

function validarHorarios(valor, { permitirVacio }) {
  if (!Array.isArray(valor)) return { error: "Los horarios deben enviarse como una lista." };
  if (valor.length > 14) return { error: "No se admiten más de 14 franjas horarias." };
  if (!permitirVacio && valor.length === 0) {
    return { error: "Selecciona al menos un día con horario de atención." };
  }
  const horarios = [];
  for (const item of valor) {
    if (!item || typeof item !== "object" || Array.isArray(item) ||
        !Number.isInteger(item.dia_semana) || item.dia_semana < 0 || item.dia_semana > 6) {
      return { error: "Cada horario debe indicar un día válido de la semana." };
    }
    if (typeof item.apertura !== "string" || typeof item.cierre !== "string" ||
        !REGEX_HORA.test(item.apertura) || !REGEX_HORA.test(item.cierre)) {
      return { error: "Cada horario debe usar horas válidas en formato HH:MM." };
    }
    if (item.apertura >= item.cierre) {
      return { error: "La hora de apertura debe ser anterior a la de cierre. Los turnos nocturnos aún no están disponibles." };
    }
    horarios.push({
      dia_semana: item.dia_semana,
      apertura: item.apertura,
      cierre: item.cierre,
    });
  }
  const ordenados = [...horarios].sort((a, b) => a.dia_semana - b.dia_semana ||
    a.apertura.localeCompare(b.apertura));
  for (let i = 1; i < ordenados.length; i += 1) {
    if (ordenados[i].dia_semana === ordenados[i - 1].dia_semana &&
        ordenados[i].apertura < ordenados[i - 1].cierre) {
      return { error: "Las franjas de un mismo día no deben solaparse." };
    }
  }
  return { horarios: ordenados };
}

function validarEntradaFicha(body) {
  const errores = {};
  const cambios = {};
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { errores: { ficha: "La ficha enviada no es válida." }, cambios };
  }
  const tiene = (campo) => Object.hasOwn(body, campo);

  if (tiene("nombre")) {
    const nombre = body.nombre;
    if (typeof nombre !== "string" || !nombre.trim()) {
      errores.nombre = "El nombre de la clínica es obligatorio.";
    } else if (nombre.trim().length > 255) {
      errores.nombre = "El nombre no puede superar los 255 caracteres.";
    } else {
      cambios.nombre = nombre.trim();
    }
  }

  const opcional = (campo, max, validar, mensaje) => {
    if (!tiene(campo)) return;
    const valor = body[campo];
    if (valor === null || valor === undefined || valor === "") {
      cambios[campo] = null;
      return;
    }
    if (typeof valor !== "string") {
      errores[campo] = "Debe ser texto.";
      return;
    }
    const limpio = valor.trim();
    if (!limpio) {
      cambios[campo] = null;
      return;
    }
    if (limpio.length > max) {
      errores[campo] = `No puede superar los ${max} caracteres.`;
      return;
    }
    if (validar && !validar(limpio)) {
      errores[campo] = mensaje || "El formato no es válido.";
      return;
    }
    cambios[campo] = limpio;
  };

  opcional("tipo_institucion", 30, (v) => TIPOS_INSTITUCION.has(v), "Selecciona un tipo de institución válido.");
  opcional("descripcion", 2000);
  opcional("telefono", 20, (v) => REGEX_TELEFONO.test(v), "Usa únicamente números, espacios y los signos + ( ) . -.");
  opcional("correo_contacto", 255, (v) => REGEX_CORREO.test(v), "El correo de contacto no es válido.");
  opcional("sitio_web", 1000, (v) => {
    try {
      return ["http:", "https:"].includes(new URL(v).protocol);
    } catch {
      return false;
    }
  }, "El sitio web debe iniciar con http:// o https://.");
  opcional("municipio", 100);
  opcional("localidad", 100);
  opcional("direccion", 500);
  opcional("codigo_postal", 5, (v) => /^\d{5}$/.test(v), "El código postal debe tener 5 dígitos.");
  opcional("ubicacion_maps_url", 1000, (v) => {
    try {
      return ["http:", "https:"].includes(new URL(v).protocol);
    } catch {
      return false;
    }
  }, "El enlace de Google Maps debe iniciar con http:// o https://.");

  if (tiene("servicios")) {
    const resultado = validarServicios(body.servicios, { permitirVacio: true });
    if (resultado.error) errores.servicios = resultado.error;
    else cambios.servicios = resultado.servicios;
  }
  if (tiene("horarios")) {
    const resultado = validarHorarios(body.horarios, { permitirVacio: true });
    if (resultado.error) errores.horarios = resultado.error;
    else cambios.horarios = resultado.horarios;
  }

  return { errores, cambios };
}

function evaluarFaltantes(clinica, servicios, horarios, documentos) {
  const faltantes = [];
  if (!clinica.nombre) faltantes.push("Nombre de la clínica");
  if (!clinica.tipo_institucion) faltantes.push("Tipo de institución");
  if (!clinica.descripcion) faltantes.push("Descripción de la clínica");
  if (!clinica.telefono) faltantes.push("Teléfono de contacto");
  if (!clinica.correo_contacto) faltantes.push("Correo de contacto");
  if (!clinica.municipio) faltantes.push("Municipio");
  if (!clinica.direccion) faltantes.push("Dirección");
  if (servicios.length === 0) faltantes.push("Al menos un área de atención (ITS o ILE)");
  else if (servicios.some((servicio) => !servicio.detalle_servicio)) {
    faltantes.push("La descripción de cada servicio seleccionado");
  }
  if (horarios.length === 0) faltantes.push("Al menos una franja horaria");
  if (documentos.length === 0) faltantes.push("Al menos un documento de respaldo");
  return faltantes;
}

async function cargarFicha(idClinica, db = pool) {
  const clinicaResultado = await db.query(
    `SELECT c.id_clinica, c.nombre, c.correo_acceso, c.descripcion, c.tipo_institucion,
       c.telefono, c.correo_contacto, c.sitio_web, c.municipio, c.localidad, c.direccion,
       c.codigo_postal, c.ubicacion_maps_url, c.estado_publicacion, c.fecha_registro
     FROM clinicas c
     WHERE c.id_clinica = $1`,
    [idClinica]
  );
  if (!clinicaResultado.rows.length) return null;

  const [solicitudResultado, serviciosResultado, horariosResultado, documentosResultado] = await Promise.all([
    db.query(
      `SELECT id_solicitud, estado, fecha_solicitud, observaciones
       FROM solicitudes_clinicas
       WHERE id_clinica = $1
       ORDER BY fecha_solicitud DESC
       LIMIT 1`,
      [idClinica]
    ),
    db.query(
      `SELECT s.id_servicio, s.categoria, s.nombre, cs.detalle_servicio
       FROM clinicas_servicios cs
       JOIN servicios s ON s.id_servicio = cs.id_servicio
       WHERE cs.id_clinica = $1 AND cs.activo = TRUE AND s.activo = TRUE
       ORDER BY s.nombre`,
      [idClinica]
    ),
    db.query(
      `SELECT dia_semana, to_char(hora_apertura, 'HH24:MI') AS apertura,
         to_char(hora_cierre, 'HH24:MI') AS cierre
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
  ]);

  const clinica = clinicaResultado.rows[0];
  const postulacion = solicitudResultado.rows[0] || null;
  const pendiente = postulacion?.estado === "pendiente";
  const faltantes = evaluarFaltantes(
    clinica,
    serviciosResultado.rows,
    horariosResultado.rows,
    documentosResultado.rows
  );
  const puedeEditar = !pendiente && !["aprobada", "suspendida"].includes(clinica.estado_publicacion);
  let estadoFicha = "incompleta";
  if (pendiente) estadoFicha = "pendiente_revision";
  else if (clinica.estado_publicacion === "aprobada") estadoFicha = "aprobada";
  else if (clinica.estado_publicacion === "rechazada") estadoFicha = "rechazada";
  else if (faltantes.length === 0) estadoFicha = "completa";

  return {
    clinica: {
      ...clinica,
      estado_ficha: estadoFicha,
      puede_editar: puedeEditar,
      puede_postular: puedeEditar && faltantes.length === 0,
    },
    faltantes,
    servicios: serviciosResultado.rows,
    horarios: horariosResultado.rows,
    documentos: documentosResultado.rows,
    postulacion,
  };
}

async function prepararCarpetaDocumentos() {
  const carpeta = process.env.DOCUMENTS_PRIVATE_DIR;
  if (!carpeta || !path.isAbsolute(carpeta) ||
      path.resolve(carpeta).startsWith(path.resolve(__dirname, "../frontend") + path.sep)) {
    const error = new Error("El almacenamiento privado de documentos no está configurado.");
    error.status = 503;
    throw error;
  }
  await fs.mkdir(carpeta, { recursive: true, mode: 0o700 });
  const infoCarpeta = await fs.lstat(carpeta);
  if (!infoCarpeta.isDirectory() || infoCarpeta.mode & 0o077) {
    const error = new Error("El almacenamiento privado de documentos no es seguro.");
    error.status = 503;
    throw error;
  }
  return carpeta;
}

async function guardarServicios(client, idClinica, servicios) {
  const { rows: columnas } = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'clinicas_servicios' AND column_name = 'detalle_servicio'
     ) AS disponible`
  );
  if (!columnas[0].disponible) {
    const error = new Error("El registro de servicios específicos aún no está habilitado en el servidor.");
    error.status = 503;
    throw error;
  }
  let serviciosActivos = [];
  if (servicios.length) {
    const resultado = await client.query(
      "SELECT id_servicio, nombre FROM servicios WHERE activo = TRUE AND nombre = ANY($1::text[])",
      [servicios.map(({ categoria }) => NOMBRES_PRINCIPALES[categoria])]
    );
    serviciosActivos = resultado.rows;
    if (serviciosActivos.length !== servicios.length) {
      const error = new Error("Las áreas de atención aún no están disponibles en el servidor.");
      error.status = 503;
      throw error;
    }
  }

  const idsSeleccionados = [];
  for (const servicio of servicios) {
    const idServicio = serviciosActivos.find(
      (item) => item.nombre === NOMBRES_PRINCIPALES[servicio.categoria]
    ).id_servicio;
    idsSeleccionados.push(idServicio);
    await client.query(
      `INSERT INTO clinicas_servicios (id_clinica, id_servicio, detalle_servicio)
       VALUES ($1, $2, $3)
       ON CONFLICT (id_clinica, id_servicio)
       DO UPDATE SET detalle_servicio = EXCLUDED.detalle_servicio, activo = TRUE`,
      [idClinica, idServicio, servicio.detalle]
    );
  }
  if (idsSeleccionados.length) {
    await client.query(
      `UPDATE clinicas_servicios
       SET activo = FALSE
       WHERE id_clinica = $1 AND NOT (id_servicio = ANY($2::uuid[]))`,
      [idClinica, idsSeleccionados]
    );
  } else {
    await client.query("UPDATE clinicas_servicios SET activo = FALSE WHERE id_clinica = $1", [idClinica]);
  }
}

async function guardarHorarios(client, idClinica, horarios) {
  await client.query("DELETE FROM horarios_atencion WHERE id_clinica = $1", [idClinica]);
  for (const horario of horarios) {
    await client.query(
      `INSERT INTO horarios_atencion (id_clinica, dia_semana, hora_apertura, hora_cierre)
       VALUES ($1, $2, $3, $4)`,
      [idClinica, horario.dia_semana, horario.apertura, horario.cierre]
    );
  }
}

function responderErrorEsquema(res, error) {
  if (error.code === "42703" || error.code === "42P01") {
    res.status(503).json({
      error: "La ficha institucional aún no está habilitada en la base de datos. Aplica las migraciones 004 y 005.",
    });
    return true;
  }
  return false;
}

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Catálogo real para el formulario institucional; nunca crea servicios nuevos desde el cliente.
app.get("/api/servicios", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id_servicio, nombre, categoria FROM servicios WHERE activo = TRUE ORDER BY nombre"
    );
    return res.json(rows);
  } catch (error) {
    console.error("Error al consultar servicios:", error.message);
    return res.status(500).json({ error: "No se pudo obtener el catálogo de servicios." });
  }
});

// ==========================================
// FICHA INSTITUCIONAL DE LA CLÍNICA AUTENTICADA
// La clínica se identifica SIEMPRE desde el JWT, nunca desde el cuerpo o la URL.
// ==========================================

app.get(
  "/api/clinicas/mi-ficha",
  autenticarToken,
  requerirRol(["clinica"]),
  async (req, res) => {
    try {
      const ficha = await cargarFicha(req.usuario.id);
      if (!ficha) return res.status(404).json({ error: "No se encontró la ficha de tu clínica." });
      return res.json(ficha);
    } catch (error) {
      console.error("Error al consultar la ficha de la clínica:", error.message);
      if (responderErrorEsquema(res, error)) return;
      return res.status(500).json({ error: "No se pudo obtener la ficha de tu clínica." });
    }
  }
);

app.get(
  "/api/clinicas/mi-postulacion",
  autenticarToken,
  requerirRol(["clinica"]),
  async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT id_solicitud, estado, fecha_solicitud, observaciones
         FROM solicitudes_clinicas
         WHERE id_clinica = $1
         ORDER BY fecha_solicitud DESC
         LIMIT 1`,
        [req.usuario.id]
      );
      return res.json({ solicitud: rows[0] || null });
    } catch (error) {
      console.error("Error al consultar la postulación:", error.message);
      return res.status(500).json({ error: "No se pudo obtener el estado de tu postulación." });
    }
  }
);

app.put(
  "/api/clinicas/mi-ficha",
  autenticarToken,
  requerirRol(["clinica"]),
  async (req, res) => {
    const { cambios, errores } = validarEntradaFicha(req.body);
    if (Object.keys(errores).length) {
      return res.status(400).json({
        error: "Revisa los campos marcados. Puedes guardar un borrador incompleto, pero no con datos inválidos.",
        campos: errores,
      });
    }

    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      const { rows } = await client.query(
        "SELECT id_clinica, estado_publicacion FROM clinicas WHERE id_clinica = $1 FOR UPDATE",
        [req.usuario.id]
      );
      if (!rows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "No se encontró la ficha de tu clínica." });
      }
      const { rows: pendientes } = await client.query(
        "SELECT 1 FROM solicitudes_clinicas WHERE id_clinica = $1 AND estado = 'pendiente' LIMIT 1",
        [req.usuario.id]
      );
      if (pendientes.length || ["aprobada", "suspendida"].includes(rows[0].estado_publicacion)) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: "La ficha no se puede editar mientras la postulación esté pendiente o la clínica ya esté publicada.",
        });
      }

      const columnas = Object.keys(cambios).filter(
        (campo) => campo !== "servicios" && campo !== "horarios"
      );
      if (columnas.length) {
        const asignaciones = columnas.map((campo, indice) => `${campo} = $${indice + 1}`);
        const valores = columnas.map((campo) => cambios[campo]);
        valores.push(req.usuario.id);
        await client.query(
          `UPDATE clinicas SET ${asignaciones.join(", ")} WHERE id_clinica = $${valores.length}`,
          valores
        );
      }
      if (cambios.servicios !== undefined) {
        await guardarServicios(client, req.usuario.id, cambios.servicios);
      }
      if (cambios.horarios !== undefined) {
        await guardarHorarios(client, req.usuario.id, cambios.horarios);
      }
      await client.query("COMMIT");

      const ficha = await cargarFicha(req.usuario.id);
      return res.json({ mensaje: "Borrador guardado correctamente.", ...ficha });
    } catch (error) {
      if (client) {
        try { await client.query("ROLLBACK"); } catch { /* Conservar el error original. */ }
      }
      console.error("Error al guardar la ficha de la clínica:", error.message);
      if (error.status) return res.status(error.status).json({ error: error.message });
      if (responderErrorEsquema(res, error)) return;
      return res.status(500).json({ error: "No se pudo guardar el borrador de la ficha." });
    } finally {
      client?.release();
    }
  }
);

app.post(
  "/api/clinicas/mi-ficha/documentos",
  autenticarToken,
  requerirRol(["clinica"]),
  procesarDocumentos,
  async (req, res) => {
    let client;
    const archivosGuardados = [];
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      const { rows } = await client.query(
        "SELECT estado_publicacion FROM clinicas WHERE id_clinica = $1 FOR UPDATE",
        [req.usuario.id]
      );
      if (!rows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "No se encontró la ficha de tu clínica." });
      }
      const { rows: pendientes } = await client.query(
        "SELECT 1 FROM solicitudes_clinicas WHERE id_clinica = $1 AND estado = 'pendiente' LIMIT 1",
        [req.usuario.id]
      );
      if (pendientes.length || ["aprobada", "suspendida"].includes(rows[0].estado_publicacion)) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: "No se pueden agregar documentos mientras la postulación esté pendiente o la clínica ya esté publicada.",
        });
      }
      const { rows: existentes } = await client.query(
        "SELECT COUNT(*)::int AS total FROM clinicas_documentos WHERE id_clinica = $1",
        [req.usuario.id]
      );
      if (existentes[0].total + req.files.length > MAX_DOCUMENTOS) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: `Puedes adjuntar hasta ${MAX_DOCUMENTOS} documentos en total.`,
        });
      }

      const carpeta = await prepararCarpetaDocumentos();
      for (const archivo of req.files) {
        const clave = randomUUID();
        const ruta = path.join(carpeta, clave);
        await fs.writeFile(ruta, archivo.buffer, { flag: "wx", mode: 0o600 });
        archivosGuardados.push(ruta);
        await client.query(
          `INSERT INTO clinicas_documentos
            (id_clinica, clave_almacenamiento, nombre_original, mime, tamano_bytes, sha256)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [req.usuario.id, clave, path.basename(archivo.originalname), archivo.mimetype,
            archivo.size, createHash("sha256").update(archivo.buffer).digest("hex")]
        );
      }
      await client.query("COMMIT");

      const ficha = await cargarFicha(req.usuario.id);
      return res.status(201).json({ mensaje: "Documentos guardados correctamente.", ...ficha });
    } catch (error) {
      if (client) {
        try { await client.query("ROLLBACK"); } catch { /* Conservar el error original. */ }
      }
      await Promise.allSettled(archivosGuardados.map((ruta) => fs.unlink(ruta)));
      console.error("Error al guardar documentos de la clínica:", error.message);
      if (error.status) return res.status(error.status).json({ error: error.message });
      if (responderErrorEsquema(res, error)) return;
      return res.status(500).json({ error: "No se pudieron guardar los documentos." });
    } finally {
      client?.release();
    }
  }
);

app.delete(
  "/api/clinicas/mi-ficha/documentos/:id",
  autenticarToken,
  requerirRol(["clinica"]),
  async (req, res) => {
    const { id } = req.params;
    if (!UUID_RE.test(id)) {
      return res.status(400).json({ error: "Identificador de documento no válido." });
    }
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      const { rows } = await client.query(
        "SELECT estado_publicacion FROM clinicas WHERE id_clinica = $1 FOR UPDATE",
        [req.usuario.id]
      );
      if (!rows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "No se encontró la ficha de tu clínica." });
      }
      const { rows: pendientes } = await client.query(
        "SELECT 1 FROM solicitudes_clinicas WHERE id_clinica = $1 AND estado = 'pendiente' LIMIT 1",
        [req.usuario.id]
      );
      if (pendientes.length || ["aprobada", "suspendida"].includes(rows[0].estado_publicacion)) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: "No se pueden eliminar documentos mientras la postulación esté pendiente o la clínica ya esté publicada.",
        });
      }
      const eliminado = await client.query(
        `DELETE FROM clinicas_documentos
         WHERE id_documento = $1 AND id_clinica = $2
         RETURNING clave_almacenamiento`,
        [id, req.usuario.id]
      );
      if (!eliminado.rows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Documento no encontrado." });
      }
      await client.query("COMMIT");
      const carpeta = await prepararCarpetaDocumentos();
      await fs.unlink(path.join(carpeta, eliminado.rows[0].clave_almacenamiento)).catch((error) => {
        console.error("No se pudo eliminar el archivo privado:", error.message);
      });
      return res.json({ mensaje: "Documento eliminado correctamente." });
    } catch (error) {
      if (client) {
        try { await client.query("ROLLBACK"); } catch { /* Conservar el error original. */ }
      }
      console.error("Error al eliminar documento de la clínica:", error.message);
      if (error.status) return res.status(error.status).json({ error: error.message });
      if (responderErrorEsquema(res, error)) return;
      return res.status(500).json({ error: "No se pudo eliminar el documento." });
    } finally {
      client?.release();
    }
  }
);

app.post(
  "/api/clinicas/mi-ficha/postulacion",
  autenticarToken,
  requerirRol(["clinica"]),
  async (req, res) => {
    let client;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      const { rows } = await client.query(
        "SELECT id_clinica, estado_publicacion FROM clinicas WHERE id_clinica = $1 FOR UPDATE",
        [req.usuario.id]
      );
      if (!rows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "No se encontró la ficha de tu clínica." });
      }
      const ficha = await cargarFicha(req.usuario.id, client);
      if (ficha.postulacion?.estado === "pendiente") {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: "Tu postulación ya fue enviada y está pendiente de revisión. No es necesario enviarla de nuevo.",
        });
      }
      if (["aprobada", "suspendida"].includes(rows[0].estado_publicacion)) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "La clínica ya no puede enviar una nueva postulación en su estado actual." });
      }
      if (ficha.faltantes.length) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: "Completa la información obligatoria antes de enviar tu postulación.",
          faltantes: ficha.faltantes,
        });
      }

      const snapshot = {
        clinica: ficha.clinica,
        servicios: ficha.servicios,
        horarios: ficha.horarios,
        documentos: ficha.documentos,
      };
      const { rows: solicitudes } = await client.query(
        `INSERT INTO solicitudes_clinicas (id_clinica, estado, datos_ficha)
         VALUES ($1, 'pendiente', $2)
         RETURNING id_solicitud, estado, fecha_solicitud`,
        [req.usuario.id, snapshot]
      );
      await client.query(
        "UPDATE clinicas SET estado_publicacion = 'pendiente' WHERE id_clinica = $1",
        [req.usuario.id]
      );
      await client.query("COMMIT");

      return res.status(201).json({
        mensaje: "Tu postulación fue enviada correctamente y está pendiente de revisión.",
        solicitud: solicitudes[0],
      });
    } catch (error) {
      if (client) {
        try { await client.query("ROLLBACK"); } catch { /* Conservar el error original. */ }
      }
      console.error("Error al enviar la postulación de la clínica:", error.message);
      if (error.code === "23505") {
        return res.status(409).json({
          error: "Tu postulación ya fue enviada y está pendiente de revisión.",
        });
      }
      if (responderErrorEsquema(res, error)) return;
      return res.status(500).json({ error: "No se pudo enviar la postulación." });
    } finally {
      client?.release();
    }
  }
);

app.get("/api/clinicas", autenticarToken, async (req, res) => {
  try {
    const { nombre, municipio, servicios } = req.query;

    // Validar parámetros
    if (Array.isArray(nombre) || Array.isArray(municipio) || Array.isArray(servicios)) {
      return res.status(400).json({
        error: "Los parámetros nombre, municipio y servicios deben enviarse una sola vez.",
      });
    }

    const condiciones = ["c.estado_publicacion = 'aprobada'"];
    const valores = [];

    // Filtro por nombre
    if (typeof nombre === "string" && nombre.trim()) {
      valores.push(`%${nombre.trim()}%`);
      condiciones.push(`c.nombre ILIKE $${valores.length}`);
    }

    // Filtro por municipio
    if (typeof municipio === "string" && municipio.trim()) {
      valores.push(municipio.trim());
      condiciones.push(`LOWER(TRIM(c.municipio)) = LOWER(TRIM($${valores.length}))`);
    }

    // Filtro por uno o varios servicios.
    // Ejemplo: ?servicios=ITS
    // Ejemplo: ?servicios=ITS,ILE
    if (typeof servicios === "string" && servicios.trim()) {
      const listaServicios = servicios
        .split(",")
        .map((servicio) => servicio.trim().toLowerCase())
        .filter(Boolean);

      if (listaServicios.length === 0) {
        return res.status(400).json({
          error: "El parámetro servicios no contiene valores válidos.",
        });
      }

      valores.push(listaServicios);

      condiciones.push(`
        EXISTS (
          SELECT 1
          FROM clinicas_servicios cs
          INNER JOIN servicios s
            ON s.id_servicio = cs.id_servicio
          WHERE cs.id_clinica = c.id_clinica
            AND cs.activo = TRUE
            AND s.activo = TRUE
            AND (
              LOWER(TRIM(s.nombre)) = ANY($${valores.length}::text[])
              OR LOWER(TRIM(COALESCE(s.categoria, ''))) = ANY($${valores.length}::text[])
            )
        )
      `);
    }

    const consulta = `
      SELECT
        c.id_clinica,
        c.nombre,
        c.descripcion,
        c.tipo_institucion,
        c.telefono,
        c.correo_contacto,
        c.sitio_web,
        c.imagen_portada_url,
        c.municipio,
        c.localidad,
        c.direccion,
        c.codigo_postal,
        c.estado_publicacion,
        ST_Y(c.ubicacion_geo::geometry) AS latitud,
        ST_X(c.ubicacion_geo::geometry) AS longitud,
        COALESCE((
          SELECT json_agg(s.nombre ORDER BY s.nombre)
          FROM clinicas_servicios cs
          JOIN servicios s ON s.id_servicio = cs.id_servicio
          WHERE cs.id_clinica = c.id_clinica AND cs.activo = TRUE AND s.activo = TRUE
        ), '[]'::json) AS servicios,
        COALESCE((
          SELECT json_agg(json_build_object(
            'dia_semana', h.dia_semana,
            'apertura', to_char(h.hora_apertura, 'HH24:MI'),
            'cierre', to_char(h.hora_cierre, 'HH24:MI')
          ) ORDER BY h.dia_semana, h.hora_apertura)
          FROM horarios_atencion h
          WHERE h.id_clinica = c.id_clinica
        ), '[]'::json) AS horarios
      FROM clinicas c
      WHERE ${condiciones.join(" AND ")}
      ORDER BY c.nombre;
    `;

    const resultado = await pool.query(consulta, valores);

    return res.json(resultado.rows);
  } catch (error) {
    console.error("Error al consultar clínicas:", error.message);

    return res.status(500).json({
      error: "No se pudieron obtener las clínicas.",
    });
  }
});

// La ficha solo expone centros aprobados y usa el identificador real de la sede.
app.get("/api/clinicas/:id", autenticarToken, async (req, res) => {
  const { id } = req.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return res.status(400).json({ error: "Identificador de clínica no válido" });
  }
  try {
    const resultado = await pool.query(`
      SELECT c.id_clinica, c.nombre, c.descripcion, c.tipo_institucion,
        c.telefono, c.correo_contacto, c.sitio_web,
        c.municipio, c.localidad, c.direccion, c.codigo_postal,
        ST_Y(c.ubicacion_geo::geometry) AS latitud,
        ST_X(c.ubicacion_geo::geometry) AS longitud
      FROM clinicas c
      WHERE c.id_clinica = $1 AND c.estado_publicacion = 'aprobada'
    `, [id]);
    if (!resultado.rows.length) {
      return res.status(404).json({ error: "Centro no encontrado" });
    }
    const [servicios, horarios] = await Promise.all([
      pool.query(`
        SELECT cs.id_clinica_servicio, s.nombre, s.descripcion,
          to_jsonb(cs)->>'detalle_servicio' AS detalle_servicio,
          cs.costo, cs.requisitos, cs.requiere_cita
        FROM clinicas_servicios cs JOIN servicios s ON s.id_servicio = cs.id_servicio
        WHERE cs.id_clinica = $1 AND cs.activo = TRUE AND s.activo = TRUE
        ORDER BY s.nombre
      `, [id]),
      pool.query(`
        SELECT dia_semana, to_char(hora_apertura, 'HH24:MI') AS apertura,
          to_char(hora_cierre, 'HH24:MI') AS cierre
        FROM horarios_atencion
        WHERE id_clinica = $1
        ORDER BY dia_semana, hora_apertura
      `, [id]),
    ]);
    return res.json({ ...resultado.rows[0], servicios: servicios.rows, horarios: horarios.rows });
  } catch (error) {
    console.error("Error al consultar ficha de clínica:", error.message);
    return res.status(500).json({ error: "No se pudo obtener la ficha del centro" });
  }
});

app.post("/api/auth/registro-usuario", async (req, res) => {
  const { nombre, apellidos, correo, password, telefono } = req.body || {};

  try {
    if (typeof correo !== 'string' || !correo.trim() ||
        typeof password !== 'string' || !password) {
      return res.status(400).json({
        error: "Correo y contraseña son obligatorios.",
      });
    }

    const correoValido = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(correo);
    if (!correoValido) {
      return res.status(400).json({
        error: "El formato del correo electrónico no es válido.",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: "La contraseña debe tener al menos 8 caracteres.",
      });
    }
    // 2. Hashear la contraseña
    const hash = await hashearPassword(password);

    // 3. Insertar usuario en la base de datos
    const { rows } = await pool.query(
      `INSERT INTO usuarios
        (nombre, apellidos, correo, password_hash, telefono)
       VALUES ($1, $2, LOWER(TRIM($3)), $4, $5)
       RETURNING
        id_usuario,
        nombre,
        apellidos,
        correo,
        telefono,
        fecha_registro`,
      [nombre, apellidos, correo, hash, telefono]
    );

    const nuevoUsuario = rows[0];

    // 4. Generar token JWT
    const token = generarToken({
      id: nuevoUsuario.id_usuario,
      correo: nuevoUsuario.correo,
      rol: "usuario",
    });

    // 5. Respuesta exitosa
    return res.status(201).json({
      usuario: nuevoUsuario,
      token,
    });
  } catch (error) {
    // Correo duplicado
    if (error.code === "23505") {
      return res.status(409).json({
        error: "El correo ya se encuentra registrado.",
      });
    }

    console.error("Error al registrar usuario:", error.message);

    return res.status(500).json({
      error: "Error interno al registrar usuario.",
    });
  }
});

// ==========================================
// REGISTRO DE CUENTA INSTITUCIONAL
// Crea únicamente la identidad y cuenta de acceso de la clínica.
// La ficha institucional se completa después, en estado borrador.
// ==========================================
app.post("/api/auth/registro-clinica", async (req, res) => {
  const { nombre, correo, password } = req.body || {};

  if (typeof nombre !== "string" || !nombre.trim() ||
      typeof correo !== "string" || !correo.trim() ||
      typeof password !== "string" || !password) {
    return res.status(400).json({
      error: "Nombre de la clínica, correo y contraseña son obligatorios.",
    });
  }

  const nombreLimpio = nombre.trim();
  if (nombreLimpio.length > 255) {
    return res.status(400).json({
      error: "El nombre de la clínica no puede superar los 255 caracteres.",
    });
  }

  const correoLimpio = correo.trim().toLowerCase();
  if (correoLimpio.length > 255) {
    return res.status(400).json({
      error: "El correo electrónico no puede superar los 255 caracteres.",
    });
  }
  if (!REGEX_CORREO.test(correoLimpio)) {
    return res.status(400).json({
      error: "El formato del correo electrónico no es válido.",
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      error: "La contraseña debe tener al menos 8 caracteres.",
    });
  }
  // bcrypt trunca en 72 bytes: rechazar en lugar de guardar una clave parcial.
  if (Buffer.byteLength(password, "utf8") > 72) {
    return res.status(400).json({
      error: "La contraseña no puede superar los 72 caracteres.",
    });
  }

  try {
    const hash = await hashearPassword(password);

    // El estado y el rol se fijan en el servidor. El cliente no puede publicar
    // la clínica ni convertir la cuenta en administrador.
    const { rows } = await pool.query(
      `INSERT INTO clinicas (nombre, correo_acceso, password_hash, estado_publicacion)
       VALUES ($1, $2, $3, 'borrador')
       RETURNING id_clinica, nombre, correo_acceso, estado_publicacion, fecha_registro`,
      [nombreLimpio, correoLimpio, hash]
    );
    const clinica = rows[0];

    // Sin JWT: se crea la cuenta y después se inicia sesión.
    return res.status(201).json({
      mensaje: "Cuenta de clínica creada correctamente. Ya puedes iniciar sesión y completar los datos de tu clínica.",
      clinica: {
        id: clinica.id_clinica,
        nombre: clinica.nombre,
        correo: clinica.correo_acceso,
        rol: "clinica",
        estado_publicacion: clinica.estado_publicacion,
      },
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        error: "El correo ya se encuentra registrado.",
      });
    }
    console.error("Error al registrar clínica:", error.message);
    return res.status(500).json({
      error: "Error interno al registrar la clínica.",
    });
  }
});

// ==========================================
// RUTAS DE AUTENTICACIÓN (Issue #15 - Jonathan)
// ==========================================

// 1. Login para Usuarios / Pacientes
app.post("/api/auth/login-usuario", async (req, res) => {
  const { correo, password } = req.body || {};

  if (typeof correo !== 'string' || !correo.trim() ||
      typeof password !== 'string' || !password) {
    return res.status(400).json({ error: "Correo y contraseña requeridos." });
  }

  try {
    const { rows } = await pool.query(
      "SELECT id_usuario, correo, password_hash, nombre, apellidos FROM usuarios WHERE correo = LOWER(TRIM($1))",
      [correo]
    );

    // Mensaje genérico para evitar enumeración de usuarios
    if (rows.length === 0 || !rows[0].password_hash) {
      return res.status(401).json({ error: "Credenciales inválidas." });
    }

    const usuario = rows[0];
    const passwordValido = await verificarPassword(password, usuario.password_hash);

    if (!passwordValido) {
      return res.status(401).json({ error: "Credenciales inválidas." });
    }

    const token = generarToken({
      id: usuario.id_usuario,
      correo: usuario.correo,
      rol: "usuario",
    });

    res.json({
      token,
      usuario: {
        id: usuario.id_usuario,
        nombre: usuario.nombre,
        apellidos: usuario.apellidos,
        correo: usuario.correo,
        rol: "usuario",
      },
    });
  } catch (error) {
    console.error("Error en login-usuario:", error.message);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// 2. Login para Clínicas / Sedes
app.post("/api/auth/login-clinica", async (req, res) => {
  const { correo, password } = req.body || {};

  if (typeof correo !== 'string' || !correo.trim() ||
      typeof password !== 'string' || !password) {
    return res.status(400).json({ error: "Correo y contraseña requeridos." });
  }

  try {
    const { rows } = await pool.query(
      "SELECT id_clinica, correo_acceso, password_hash, nombre FROM clinicas WHERE correo_acceso = LOWER(TRIM($1))",
      [correo]
    );

    if (rows.length === 0 || !rows[0].password_hash) {
      return res.status(401).json({ error: "Credenciales inválidas." });
    }

    const clinica = rows[0];
    const passwordValido = await verificarPassword(password, clinica.password_hash);

    if (!passwordValido) {
      return res.status(401).json({ error: "Credenciales inválidas." });
    }

    const token = generarToken({
      id: clinica.id_clinica,
      correo: clinica.correo_acceso,
      rol: "clinica",
    });

    res.json({
      token,
      clinica: {
        id: clinica.id_clinica,
        nombre: clinica.nombre,
        correo: clinica.correo_acceso,
        rol: "clinica",
      },
    });
  } catch (error) {
    console.error("Error en login-clinica:", error.message);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// 3. Login para Administradores
app.post("/api/auth/login-admin", async (req, res) => {
  const { correo, password } = req.body || {};

  if (typeof correo !== 'string' || !correo.trim() ||
      typeof password !== 'string' || !password) {
    return res.status(400).json({ error: "Correo y contraseña requeridos." });
  }

  try {
    const { rows } = await pool.query(
      "SELECT id_administrador, correo, password_hash, nombre FROM administradores WHERE correo = LOWER(TRIM($1))",
      [correo]
    );

    if (rows.length === 0 || !rows[0].password_hash) {
      return res.status(401).json({ error: "Credenciales inválidas." });
    }

    const admin = rows[0];
    const passwordValido = await verificarPassword(password, admin.password_hash);

    if (!passwordValido) {
      return res.status(401).json({ error: "Credenciales inválidas." });
    }

    const token = generarToken({
      id: admin.id_administrador,
      correo: admin.correo,
      rol: "administrador",
    });

    res.json({
      token,
      admin: {
        id: admin.id_administrador,
        nombre: admin.nombre,
        correo: admin.correo,
        rol: "administrador",
      },
    });
  } catch (error) {
    console.error("Error en login-admin:", error.message);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// 4. Ruta protegida: Consulta de perfil actual (Cualquier rol autenticado)
app.get("/api/auth/perfil", autenticarToken, (req, res) => {
  res.json({
    mensaje: "Token verificado con éxito.",
    usuarioAutenticado: req.usuario,
  });
});

// 5. Ruta de prueba protegida: Solo Administradores (Criterio de autorización por rol)
app.get(
  "/api/admin/panel-prueba",
  autenticarToken,
  requerirRol(["administrador"]),
  (req, res) => {
    res.json({
      mensaje: "Acceso autorizado al panel de administración central.",
      admin: req.usuario,
    });
  }
);

app.listen(PUERTO, () => {
  console.log(`Servidor listo en http://localhost:${PUERTO}`);
});
