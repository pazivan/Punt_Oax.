const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID, createHash } = require("node:crypto");
const pool = require("./db");
const { listarCitasClinica } = require("./citasClinica");
const { fichaPublica } = require("./catalogoPublico");
const { actualizarEnlacesInformacion } = require("./enlacesInformacion");
const { responderErrorEsquema } = require("./erroresEsquema");
const { hashearPassword, verificarPassword, generarToken, autenticarToken, requerirRol } = require("./auth");
const { registrarRutasCitas } = require("./citas");
const { registrarRutasAdminClinicas } = require("./adminClinicas");
const { registrarRutasAdminUsuarios } = require("./adminUsuarios");
const { registrarRutasAdminSupervision } = require("./adminSupervision");
const { registrarRutasAsistente } = require("./asistenteIA");
const { registrarRutasAgendaClinica } = require("./agendaClinica");
const { registrarRutasCercania } = require("./cercania");
const { registrarRutasDatosClinica } = require("./datosClinica");
const { calcularCambiosRevisionServidor } = require("./comparacionFicha");
const { validarCoordenadas } = require("./ubicacion");
const {
  consultarEstadoClinica,
  esEstadoOperativo,
  respuestaNoAprobada,
} = require("./clinicasEstado");
const { registrarRutasCorreo, permitido } = require("./correo");
const {
  MENSAJE_TELEFONO,
  validarPassword,
  validarTelefono,
  verificarDominioCorreo,
} = require("./validacionesRegistro");

const app = express();
const PUERTO = process.env.PORT || 3000;

// Confía únicamente en proxies locales/internos (nginx/Docker) para obtener req.ip real sin permitir suplantación externa.
app.set("trust proxy", "loopback, linklocal, uniquelocal");
app.use(cors());
app.use(express.json());
const { enviarDesafio, proveedor: proveedorCorreo, limiteIp: limiteCorreo } = registrarRutasCorreo(app, { pool, hashearPassword, validarPassword });
// Registrar las rutas estáticas de la agenda antes de /api/clinicas/:id.
registrarRutasAgendaClinica(app, { pool, autenticarToken, requerirRol });
// Centros cercanos (Sprint 8 · #94 y #95). Debe ir antes de /api/clinicas/:id.
registrarRutasCercania(app, { pool });

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
    const es24 = Boolean(item.es_24_horas);
    const cruza = Boolean(item.cruza_medianoche) && !es24;
    const apertura = es24 ? "00:00" : item.apertura;
    const cierre = es24 ? "00:00" : item.cierre;
    if (typeof apertura !== "string" || typeof cierre !== "string" ||
        !REGEX_HORA.test(apertura) || !REGEX_HORA.test(cierre)) {
      return { error: "Cada horario debe usar horas válidas en formato HH:MM." };
    }
    if (!es24 && !cruza && apertura >= cierre) {
      return { error: "La hora de apertura debe ser anterior a la de cierre. Los turnos nocturnos requieren activar la opción correspondiente." };
    }
    if (cruza && apertura <= cierre) {
      return { error: "Un turno nocturno debe iniciar después de la hora de cierre." };
    }
    horarios.push({
      dia_semana: item.dia_semana,
      apertura,
      cierre,
      es_24_horas: es24,
      cruza_medianoche: cruza,
    });
  }
  const ordenados = [...horarios].sort((a, b) => a.dia_semana - b.dia_semana ||
    a.apertura.localeCompare(b.apertura));
  for (let i = 1; i < ordenados.length; i += 1) {
    const prev = ordenados[i - 1];
    const curr = ordenados[i];
    if (curr.dia_semana === prev.dia_semana) {
      if (prev.es_24_horas || curr.es_24_horas) {
        return { error: "Un día con horario de 24 horas no admite franjas adicionales." };
      }
      if (prev.cruza_medianoche || curr.apertura < prev.cierre) {
        return { error: "Las franjas de un mismo día no deben solaparse." };
      }
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
  opcional("telefono", 20, (v) => !validarTelefono(v, { requerido: true }), MENSAJE_TELEFONO);
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

  // La ubicación se guarda como punto PostGIS solo cuando el usuario la
  // confirmó en el mapa. Se exige el par completo para no almacenar puntos
  // incompletos ni coordenadas iniciales del mapa.
  if (tiene("latitud") || tiene("longitud")) {
    if (!tiene("latitud") || !tiene("longitud")) {
      errores.ubicacion = "Confirma la latitud y la longitud juntas.";
    } else {
      const coordenadas = validarCoordenadas(body.latitud, body.longitud);
      if (coordenadas.error) errores.ubicacion = coordenadas.error;
      else cambios.ubicacion = coordenadas;
    }
  }

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
  if (clinica.latitud == null || clinica.longitud == null) {
    faltantes.push("Confirma la ubicación de la clínica en el mapa");
  }
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
       c.codigo_postal, c.ubicacion_maps_url, c.enlaces_informacion,
       c.estado_publicacion, c.fecha_registro,
       ST_Y(c.ubicacion_geo::geometry) AS latitud,
       ST_X(c.ubicacion_geo::geometry) AS longitud
     FROM clinicas c
     WHERE c.id_clinica = $1`,
    [idClinica]
  );
  if (!clinicaResultado.rows.length) return null;

  const [solicitudResultado, serviciosResultado, horariosResultado, documentosResultado] = await Promise.all([
    db.query(
      `SELECT id_solicitud, estado, fecha_solicitud, fecha_resolucion, observaciones,
              tipo_solicitud, motivo, campos_modificados,
              datos_ficha->'ubicacion_solicitada' AS ubicacion_solicitada
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
         to_char(hora_cierre, 'HH24:MI') AS cierre,
         es_24_horas, cruza_medianoche
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
  const latitud = clinica.latitud == null ? null : Number(clinica.latitud);
  const longitud = clinica.longitud == null ? null : Number(clinica.longitud);
  clinica.latitud = latitud;
  clinica.longitud = longitud;
  clinica.ubicacion_confirmada = latitud !== null && longitud !== null;
  const postulacion = solicitudResultado.rows[0] || null;
  const ubicacionPendiente = postulacion?.estado === "pendiente" && postulacion.ubicacion_solicitada
    ? postulacion.ubicacion_solicitada
    : null;
  if (postulacion) delete postulacion.ubicacion_solicitada;
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
    ubicacion_pendiente: ubicacionPendiente,
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
      `INSERT INTO horarios_atencion (id_clinica, dia_semana, hora_apertura, hora_cierre, es_24_horas, cruza_medianoche)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        idClinica,
        horario.dia_semana,
        horario.apertura,
        horario.cierre,
        Boolean(horario.es_24_horas),
        Boolean(horario.cruza_medianoche),
      ]
    );
  }
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

// Agenda de la clínica autenticada: nunca aceptar id_clinica desde el navegador.
app.get(
  "/api/clinicas/mi-citas",
  autenticarToken,
  requerirRol(["clinica"]),
  async (req, res) => {
    try {
      const estado = await consultarEstadoClinica(pool, req.usuario.id);
      if (!estado) {
        return res.status(404).json({ error: "No se encontró tu clínica." });
      }
      if (!esEstadoOperativo(estado)) {
        return res.status(403).json(respuestaNoAprobada(estado));
      }
      const citas = await listarCitasClinica(pool, req.usuario.id);
      return res.json({ citas });
    } catch (error) {
      console.error("Error al consultar citas de clínica:", error.message);
      return res.status(500).json({ error: "No se pudieron consultar las citas de tu clínica." });
    }
  }
);

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

// Las fuentes se pueden mantener sin modificar la ficha sujeta a revisión.
app.put(
  "/api/clinicas/mi-ficha/enlaces",
  autenticarToken,
  requerirRol(["clinica"]),
  async (req, res) => {
    try {
      const { status, body } = await actualizarEnlacesInformacion(
        pool, req.usuario.id, req.body
      );
      return res.status(status).json(body);
    } catch (err) {
      console.error("Error al guardar fuentes de información:", err.message);
      if (responderErrorEsquema(res, err)) return;
      return res.status(500).json({ error: "No se pudieron guardar las fuentes de información." });
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
        (campo) => !["servicios", "horarios", "ubicacion"].includes(campo)
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
      if (cambios.ubicacion) {
        // PostGIS recibe longitud primero y latitud después.
        await client.query(
          `UPDATE clinicas
           SET ubicacion_geo = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
           WHERE id_clinica = $3`,
          [cambios.ubicacion.longitud, cambios.ubicacion.latitud, req.usuario.id]
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

// Historial de solicitudes de la clínica autenticada (postulaciones y actualizaciones).
app.get(
  "/api/clinicas/mi-ficha/solicitudes",
  autenticarToken,
  requerirRol(["clinica"]),
  async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT id_solicitud, tipo_solicitud, estado, fecha_solicitud, fecha_resolucion,
                motivo, observaciones, campos_modificados, datos_ficha
         FROM solicitudes_clinicas
         WHERE id_clinica = $1
         ORDER BY fecha_solicitud DESC`,
        [req.usuario.id]
      );
      const solicitudes = rows.map((row) => ({
        id_solicitud: row.id_solicitud,
        tipo_solicitud: row.tipo_solicitud || row.datos_ficha?.tipo_solicitud || "postulacion",
        estado: row.estado,
        fecha_solicitud: row.fecha_solicitud,
        fecha_resolucion: row.fecha_resolucion || null,
        motivo: row.motivo ?? row.datos_ficha?.motivo ?? null,
        observaciones: row.observaciones || null,
        campos_modificados: row.campos_modificados || row.datos_ficha?.campos_modificados || [],
        datos_anteriores: row.datos_ficha?.datos_anteriores || null,
        datos_nuevos: row.datos_ficha?.datos_nuevos || null,
      }));
      return res.json({ solicitudes });
    } catch (error) {
      console.error("Error al consultar historial de solicitudes:", error.message);
      return res.status(500).json({ error: "No se pudo consultar el historial de solicitudes." });
    }
  }
);

// Solicitud de actualización de información para clínica ya aprobada: verifica cambios reales
// contra la versión publicada, exige motivo y conserva los datos públicos hasta su aprobación.
app.post(
  "/api/clinicas/mi-ficha/solicitud-actualizacion",
  autenticarToken,
  requerirRol(["clinica"]),
  async (req, res) => {
    const motivoRaw = typeof req.body?.motivo === "string" ? req.body.motivo.trim() : "";
    if (!motivoRaw) {
      return res.status(400).json({ error: "El motivo de la solicitud es obligatorio." });
    }
    if (motivoRaw.length > 500) {
      return res.status(400).json({ error: "El motivo no puede superar los 500 caracteres." });
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
      if (rows[0].estado_publicacion !== "aprobada") {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: "Solo las clínicas aprobadas pueden enviar solicitudes de actualización.",
        });
      }

      const ficha = await cargarFicha(req.usuario.id, client);
      if (ficha.postulacion?.estado === "pendiente") {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: "Ya tienes una solicitud pendiente de revisión. Espera la respuesta del administrador.",
        });
      }

      const { errores, cambios, datosAnteriores, datosNuevos, ubicacionSolicitada } =
        calcularCambiosRevisionServidor(ficha, req.body);

      if (Object.keys(errores).length > 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "Revisa los datos enviados.", campos: errores });
      }
      if (cambios.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          error: "No se detectaron modificaciones que requieran revisión administrativa.",
        });
      }

      const tipoSolicitud =
        cambios.length === 1 && cambios[0].campo === "ubicacion"
          ? "actualizacion_ubicacion"
          : "actualizacion_informacion";

      const snapshot = {
        clinica: ficha.clinica,
        servicios: ficha.servicios,
        horarios: ficha.horarios,
        documentos: ficha.documentos,
        tipo_solicitud: tipoSolicitud,
        motivo: motivoRaw,
        campos_modificados: cambios,
        datos_anteriores: datosAnteriores,
        datos_nuevos: datosNuevos,
        ...(ubicacionSolicitada ? { ubicacion_solicitada: ubicacionSolicitada } : {}),
      };

      const { rows: solicitudes } = await client.query(
        `INSERT INTO solicitudes_clinicas
           (id_clinica, estado, tipo_solicitud, motivo, campos_modificados, datos_ficha)
         VALUES ($1, 'pendiente', $2, $3, $4::jsonb, $5::jsonb)
         RETURNING id_solicitud, tipo_solicitud, estado, fecha_solicitud, motivo, campos_modificados`,
        [req.usuario.id, tipoSolicitud, motivoRaw, JSON.stringify(cambios), JSON.stringify(snapshot)]
      );
      await client.query("COMMIT");
      return res.status(201).json({
        mensaje: "Solicitud de actualización enviada para revisión administrativa. Tus datos publicados se mantienen visibles hasta su aprobación.",
        solicitud: solicitudes[0],
        ...(ubicacionSolicitada ? { ubicacion_pendiente: ubicacionSolicitada } : {}),
      });
    } catch (error) {
      if (client) {
        try { await client.query("ROLLBACK"); } catch { /* Conservar el error original. */ }
      }
      console.error("Error al enviar solicitud de actualización:", error.message);
      if (error.code === "23505") {
        return res.status(409).json({ error: "Ya tienes una solicitud pendiente de revisión." });
      }
      if (responderErrorEsquema(res, error)) return;
      return res.status(500).json({ error: "No se pudo enviar la solicitud de actualización." });
    } finally {
      client?.release();
    }
  }
);

// Solicitud de cambio de ubicación para clínica ya aprobada: requiere revisión administrativa
// y conserva la ubicación pública actual hasta su aprobación.
app.post(
  "/api/clinicas/mi-ficha/ubicacion",
  autenticarToken,
  requerirRol(["clinica"]),
  async (req, res) => {
    const coords = validarCoordenadas(req.body?.latitud, req.body?.longitud);
    if (coords.error) {
      return res.status(400).json({ error: coords.error });
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
      if (rows[0].estado_publicacion !== "aprobada") {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: "Solo las clínicas aprobadas pueden solicitar un cambio de ubicación publicado.",
        });
      }
      const ficha = await cargarFicha(req.usuario.id, client);
      if (ficha.postulacion?.estado === "pendiente") {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: "Ya tienes una solicitud pendiente de revisión. Espera la respuesta del administrador.",
        });
      }

      const ubicacionSolicitada = { latitud: coords.latitud, longitud: coords.longitud };
      const snapshot = {
        clinica: ficha.clinica,
        servicios: ficha.servicios,
        horarios: ficha.horarios,
        documentos: ficha.documentos,
        tipo_solicitud: "actualizacion_ubicacion",
        ubicacion_solicitada: ubicacionSolicitada,
      };
      const { rows: solicitudes } = await client.query(
        `INSERT INTO solicitudes_clinicas (id_clinica, estado, datos_ficha)
         VALUES ($1, 'pendiente', $2)
         RETURNING id_solicitud, estado, fecha_solicitud`,
        [req.usuario.id, snapshot]
      );
      await client.query("COMMIT");
      return res.status(201).json({
        mensaje: "Solicitud de cambio de ubicación enviada para revisión. Tu ubicación pública actual se mantiene visible hasta ser aprobada.",
        solicitud: solicitudes[0],
        ubicacion_pendiente: ubicacionSolicitada,
      });
    } catch (error) {
      if (client) {
        try { await client.query("ROLLBACK"); } catch { /* Conservar el error original. */ }
      }
      console.error("Error al solicitar cambio de ubicación:", error.message);
      if (error.code === "23505") {
        return res.status(409).json({ error: "Ya tienes una solicitud pendiente de revisión." });
      }
      if (responderErrorEsquema(res, error)) return;
      return res.status(500).json({ error: "No se pudo enviar el cambio de ubicación." });
    } finally {
      client?.release();
    }
  }
);

app.get("/api/clinicas", async (req, res) => {
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
    // ITS/ILE se comparan contra el nombre o la categoría canónica.
    // Aborto es un alias de ILE y Ambos exige que la sede ofrezca las dos áreas.
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

      const solicitados = new Set();
      let requiereAmbos = false;
      for (const servicio of listaServicios) {
        if (servicio === "ambos") requiereAmbos = true;
        else if (servicio === "aborto" || servicio === "ile") solicitados.add("ile");
        else solicitados.add(servicio);
      }

      const agregarCondicionServicio = (categorias) => {
        valores.push(categorias);
        condiciones.push(`
          EXISTS (
            SELECT 1
            FROM clinicas_servicios cs
            INNER JOIN servicios s
              ON s.id_servicio = cs.id_servicio
            WHERE cs.id_clinica = c.id_clinica
              AND cs.activo = TRUE
              AND s.activo = TRUE
              AND EXISTS (
                SELECT 1
                FROM unnest($${valores.length}::text[]) AS buscado
                WHERE LOWER(TRIM(COALESCE(s.categoria, ''))) = buscado
                   OR LOWER(s.nombre) LIKE '%' || buscado || '%'
              )
          )
        `);
      };

      if (requiereAmbos) {
        agregarCondicionServicio(["its"]);
        agregarCondicionServicio(["ile"]);
      } else if (solicitados.size > 0) {
        agregarCondicionServicio([...solicitados]);
      }
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
        c.id_origen,
        c.clues,
        c.revision_catalogo,
        c.region,
        c.fuente_origen AS fuente,
        c.enlaces_informacion,
        c.horario_texto AS horario,
        c.ubicacion_maps_url AS ubicacion_maps,
        c.nivel_atencion,
        c.situacion_ubicacion,
        c.verificacion_datos,
        c.datos_por_confirmar,
        (c.ubicacion_geo IS NOT NULL
          AND c.situacion_ubicacion = 'fija'
          AND c.verificacion_datos = 'verificado') AS ubicacion_confirmada,
        EXISTS (
          SELECT 1
          FROM espacios_disponibles ed
          JOIN clinicas_servicios cs ON cs.id_clinica_servicio = ed.id_clinica_servicio
          JOIN servicios s ON s.id_servicio = cs.id_servicio
          WHERE cs.id_clinica = c.id_clinica
            AND cs.activo = TRUE
            AND s.activo = TRUE
            AND ed.habilitado = TRUE
            AND ed.fecha_hora_inicio > NOW()
            AND NOT EXISTS (
              SELECT 1 FROM citas ci WHERE ci.id_espacio = ed.id_espacio AND ci.estado <> 'cancelada'
            )
        ) AS acepta_citas,
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
            'cierre', to_char(h.hora_cierre, 'HH24:MI'),
            'es_24_horas', h.es_24_horas,
            'cruza_medianoche', h.cruza_medianoche
          ) ORDER BY h.dia_semana, h.hora_apertura)
          FROM horarios_atencion h
          WHERE h.id_clinica = c.id_clinica
        ), '[]'::json) AS horarios,
        COALESCE((
          SELECT json_agg(DISTINCT s.categoria ORDER BY s.categoria)
          FROM clinicas_servicios cs
          JOIN servicios s ON s.id_servicio = cs.id_servicio
          WHERE cs.id_clinica = c.id_clinica AND cs.activo = TRUE AND s.activo = TRUE
            AND s.categoria IS NOT NULL
        ), '[]'::json) AS categorias,
        COALESCE((
          SELECT string_agg(s.nombre, ', ' ORDER BY s.nombre)
          FROM clinicas_servicios cs
          JOIN servicios s ON s.id_servicio = cs.id_servicio
          WHERE cs.id_clinica = c.id_clinica AND cs.activo = TRUE AND s.activo = TRUE
        ), '') AS servicios_texto,
        COALESCE((
          SELECT string_agg(DISTINCT BTRIM(cs.requisitos), '; ')
          FROM clinicas_servicios cs
          WHERE cs.id_clinica = c.id_clinica AND cs.activo = TRUE
            AND cs.requisitos IS NOT NULL AND BTRIM(cs.requisitos) <> ''
        ), '') AS requisitos,
        CASE
          WHEN EXISTS (
            SELECT 1 FROM horarios_atencion h
            WHERE h.id_clinica = c.id_clinica AND h.es_24_horas = TRUE
          ) THEN '24-horas'
          WHEN EXISTS (
            SELECT 1 FROM horarios_atencion h
            WHERE h.id_clinica = c.id_clinica AND h.dia_semana IN (0, 6)
          ) THEN 'fines-semana'
          WHEN EXISTS (
            SELECT 1 FROM horarios_atencion h
            WHERE h.id_clinica = c.id_clinica AND h.dia_semana BETWEEN 1 AND 5
          ) THEN 'lunes-viernes'
          ELSE NULL
        END AS modalidad_horario,
        CASE
          WHEN c.links_relacionados IS NULL OR BTRIM(c.links_relacionados) = '' THEN '[]'::json
          ELSE COALESCE((
            SELECT json_agg(DISTINCT BTRIM(enlace))
            FROM regexp_split_to_table(c.links_relacionados, E'[\\n,]+') AS enlace
            WHERE BTRIM(enlace) <> ''
          ), '[]'::json)
        END AS links_relacionados
      FROM clinicas c
      WHERE ${condiciones.join(" AND ")}
      ORDER BY c.nombre;
    `;

    const resultado = await pool.query(consulta, valores);

    return res.json(resultado.rows.map(fichaPublica));
  } catch (error) {
    console.error("Error al consultar clínicas:", error.message);

    return res.status(500).json({
      error: "No se pudieron obtener las clínicas.",
    });
  }
});

// La ficha solo expone centros aprobados y usa el identificador real de la sede.
app.get("/api/clinicas/:id", async (req, res) => {
  const { id } = req.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return res.status(400).json({ error: "Identificador de clínica no válido" });
  }
  try {
    const resultado = await pool.query(`
      SELECT c.id_clinica, c.nombre, c.descripcion, c.tipo_institucion,
        c.telefono, c.correo_contacto, c.sitio_web,
        c.municipio, c.localidad, c.direccion, c.codigo_postal,
        c.id_origen, c.clues, c.revision_catalogo, c.region, c.fuente_origen AS fuente,
        c.enlaces_informacion,
        c.horario_texto AS horario, c.ubicacion_maps_url AS ubicacion_maps,
        c.nivel_atencion, c.situacion_ubicacion, c.verificacion_datos,
        c.datos_por_confirmar,
        CASE
          WHEN c.links_relacionados IS NULL OR BTRIM(c.links_relacionados) = '' THEN '[]'::json
          ELSE COALESCE((
            SELECT json_agg(DISTINCT BTRIM(enlace))
            FROM regexp_split_to_table(c.links_relacionados, E'[\\n,]+') AS enlace
            WHERE BTRIM(enlace) <> ''
          ), '[]'::json)
        END AS links_relacionados,
        (c.ubicacion_geo IS NOT NULL
          AND c.situacion_ubicacion = 'fija'
          AND c.verificacion_datos = 'verificado') AS ubicacion_confirmada,
        EXISTS (
          SELECT 1
          FROM espacios_disponibles ed
          JOIN clinicas_servicios cs ON cs.id_clinica_servicio = ed.id_clinica_servicio
          JOIN servicios s ON s.id_servicio = cs.id_servicio
          WHERE cs.id_clinica = c.id_clinica
            AND cs.activo = TRUE
            AND s.activo = TRUE
            AND ed.habilitado = TRUE
            AND ed.fecha_hora_inicio > NOW()
            AND NOT EXISTS (
              SELECT 1 FROM citas ci WHERE ci.id_espacio = ed.id_espacio AND ci.estado <> 'cancelada'
            )
        ) AS acepta_citas,
        COALESCE((
          SELECT string_agg(DISTINCT BTRIM(cs.requisitos), '; ')
          FROM clinicas_servicios cs
          WHERE cs.id_clinica = c.id_clinica AND cs.activo = TRUE
            AND cs.requisitos IS NOT NULL AND BTRIM(cs.requisitos) <> ''
        ), '') AS requisitos,
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
        SELECT cs.id_clinica_servicio, s.nombre, s.descripcion, s.categoria,
          to_jsonb(cs)->>'detalle_servicio' AS detalle_servicio,
          cs.costo, cs.requisitos, cs.requiere_cita
        FROM clinicas_servicios cs JOIN servicios s ON s.id_servicio = cs.id_servicio
        WHERE cs.id_clinica = $1 AND cs.activo = TRUE AND s.activo = TRUE
        ORDER BY s.nombre
      `, [id]),
      pool.query(`
        SELECT dia_semana, to_char(hora_apertura, 'HH24:MI') AS apertura,
          to_char(hora_cierre, 'HH24:MI') AS cierre,
          es_24_horas, cruza_medianoche
        FROM horarios_atencion
        WHERE id_clinica = $1
        ORDER BY dia_semana, hora_apertura
      `, [id]),
    ]);
    return res.json(fichaPublica({ ...resultado.rows[0], servicios: servicios.rows, horarios: horarios.rows }));
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
    if (!permitido(correo) || !proveedorCorreo.listo()) {
      return res.status(503).json({ error: "El correo no está disponible. Inténtalo más tarde." });
    }
    if (!await limiteCorreo(req, 'verificar')) return res.status(429).json({ error: 'Demasiadas solicitudes.' });

    const errorPassword = validarPassword(password);
    if (errorPassword) {
      return res.status(400).json({ error: errorPassword });
    }

    const errorTelefono = validarTelefono(telefono);
    if (errorTelefono) {
      return res.status(400).json({ error: errorTelefono });
    }

    const verificacionCorreo = await verificarDominioCorreo(correo);
    if (!verificacionCorreo.ok) {
      return res.status(400).json({ error: verificacionCorreo.error });
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
      [
        nombre,
        apellidos,
        correo,
        hash,
        typeof telefono === "string" ? telefono.trim() || null : null,
      ]
    );

    const nuevoUsuario = rows[0];

    try {
      await enviarDesafio({ rol: 'usuario', correo: nuevoUsuario.correo }, 'verificacion');
    } catch {
      await pool.query('DELETE FROM usuarios WHERE id_usuario=$1 AND correo_verificado_en IS NULL', [nuevoUsuario.id_usuario]);
      return res.status(503).json({ error: "No se pudo enviar el código. Inténtalo de nuevo." });
    }

    // 5. Respuesta exitosa
    return res.status(201).json({
      usuario: nuevoUsuario,
      requiere_verificacion: true,
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
  if (!permitido(correoLimpio) || !proveedorCorreo.listo()) {
    return res.status(503).json({ error: "El correo no está disponible. Inténtalo más tarde." });
  }
  try {
    if (!await limiteCorreo(req, 'verificar')) return res.status(429).json({ error: 'Demasiadas solicitudes.' });
  } catch {
    return res.status(503).json({ error: 'El correo no está disponible.' });
  }

  const errorPassword = validarPassword(password);
  if (errorPassword) {
    return res.status(400).json({ error: errorPassword });
  }

  const verificacionCorreo = await verificarDominioCorreo(correoLimpio);
  if (!verificacionCorreo.ok) {
    return res.status(400).json({ error: verificacionCorreo.error });
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
    try {
      await enviarDesafio({ rol: 'clinica', correo: clinica.correo_acceso }, 'verificacion');
    } catch {
      await pool.query('DELETE FROM clinicas WHERE id_clinica=$1 AND correo_verificado_en IS NULL', [clinica.id_clinica]);
      return res.status(503).json({ error: "No se pudo enviar el código. Inténtalo de nuevo." });
    }

    // Sin JWT: se crea la cuenta y después se inicia sesión.
    return res.status(201).json({
      mensaje: "Cuenta creada. Verifica tu correo para poder iniciar sesión.",
      requiere_verificacion: true,
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
      "SELECT id_usuario, correo, password_hash, nombre, apellidos, correo_verificado_en, version_sesion, activo FROM usuarios WHERE correo = LOWER(TRIM($1))",
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
    if (usuario.activo === false) {
      return res.status(403).json({ error: "Tu cuenta está desactivada. Contacta al administrador.", codigo: "CUENTA_DESACTIVADA" });
    }
    if (!usuario.correo_verificado_en) return res.status(403).json({ error: "Verifica tu correo antes de iniciar sesión.", requiere_verificacion: true });

    const token = generarToken({
      id: usuario.id_usuario,
      correo: usuario.correo,
      rol: "usuario",
      version_sesion: usuario.version_sesion,
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
      "SELECT id_clinica, correo_acceso, password_hash, nombre, correo_verificado_en, version_sesion, estado_publicacion FROM clinicas WHERE correo_acceso = LOWER(TRIM($1))",
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
    if (!clinica.correo_verificado_en) return res.status(403).json({ error: "Verifica tu correo antes de iniciar sesión.", requiere_verificacion: true });

    const token = generarToken({
      id: clinica.id_clinica,
      correo: clinica.correo_acceso,
      rol: "clinica",
      version_sesion: clinica.version_sesion,
    });

    res.json({
      token,
      clinica: {
        id: clinica.id_clinica,
        nombre: clinica.nombre,
        correo: clinica.correo_acceso,
        rol: "clinica",
        estado_publicacion: clinica.estado_publicacion,
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
      "SELECT id_administrador, correo, password_hash, nombre, version_sesion FROM administradores WHERE correo = LOWER(TRIM($1))",
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
      version_sesion: admin.version_sesion,
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

// Cambio de contraseña para la cuenta autenticada. Verifica la contraseña
// actual antes de reemplazarla; no invalida la sesión en curso.
app.patch("/api/auth/cambiar-password", autenticarToken, async (req, res) => {
  const { passwordActual, passwordNueva } = req.body || {};

  if (typeof passwordActual !== "string" || !passwordActual ||
      typeof passwordNueva !== "string" || !passwordNueva) {
    return res.status(400).json({ error: "Ingresa tu contraseña actual y la nueva." });
  }

  const mensajePolitica = validarPassword(passwordNueva);
  if (mensajePolitica) return res.status(400).json({ error: mensajePolitica });

  if (passwordActual === passwordNueva) {
    return res.status(400).json({ error: "La nueva contraseña debe ser diferente a la actual." });
  }

  const cuentas = {
    usuario: ['usuarios', 'id_usuario'],
    clinica: ['clinicas', 'id_clinica'],
    administrador: ['administradores', 'id_administrador'],
  };
  const cuenta = cuentas[req.usuario.rol];
  if (!cuenta) return res.status(403).json({ error: "Sesión inválida." });

  try {
    const { rows } = await pool.query(
      `SELECT password_hash FROM ${cuenta[0]} WHERE ${cuenta[1]}=$1`,
      [req.usuario.id]
    );
    if (!rows[0]) return res.status(403).json({ error: "Sesión inválida." });

    if (!await verificarPassword(passwordActual, rows[0].password_hash)) {
      return res.status(401).json({ error: "La contraseña actual no es correcta." });
    }

    const hash = await hashearPassword(passwordNueva);
    await pool.query(
      `UPDATE ${cuenta[0]} SET password_hash=$1 WHERE ${cuenta[1]}=$2`,
      [hash, req.usuario.id]
    );
    res.json({ mensaje: "Contraseña actualizada correctamente." });
  } catch (error) {
    console.error("Error en cambiar-password:", error.message);
    res.status(500).json({ error: "Error interno del servidor." });
  }
});

// Cerrar sesión invalida todos los JWT previos de esta cuenta (también los
// abiertos en otras ventanas o dispositivos). No modifica su rol ni contraseña.
app.post("/api/auth/cerrar-sesion", autenticarToken, async (req, res) => {
  const cuentas = {
    usuario: ['usuarios', 'id_usuario'],
    clinica: ['clinicas', 'id_clinica'],
    administrador: ['administradores', 'id_administrador'],
  };
  const cuenta = cuentas[req.usuario.rol];
  if (!cuenta) return res.status(403).json({ error: "Sesión inválida." });
  try {
    const { rowCount } = await pool.query(
      `UPDATE ${cuenta[0]} SET version_sesion = version_sesion + 1
       WHERE ${cuenta[1]} = $1 AND version_sesion = $2`,
      [req.usuario.id, req.usuario.version_sesion ?? 0]
    );
    if (!rowCount) return res.status(403).json({ error: "Sesión inválida." });
    return res.json({ mensaje: "Sesión cerrada." });
  } catch {
    return res.status(503).json({ error: "No se pudo cerrar la sesión en el servidor." });
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

   // Rutas de citas (Sprint 6 · issue #56). Ver backend/citas.js
    registrarRutasCitas(app, { pool, autenticarToken, requerirRol });
   
   // Revisión de clínicas por el administrador (Sprint 7 · issue #66). Ver backend/adminClinicas.js
registrarRutasAdminClinicas(app, { pool, autenticarToken, requerirRol, prepararCarpetaDocumentos });

// Listado de usuarios registrados para el administrador (solo lectura).
registrarRutasAdminUsuarios(app, { pool, autenticarToken, requerirRol });

// Supervisión administrativa de resumen, citas y calendarios.
registrarRutasAdminSupervision(app, { pool, autenticarToken, requerirRol });

// Agente de ayuda híbrido con Gemini Function Calling (experimental).
registrarRutasAsistente(app, { pool });

// Datos de la clínica publicada desde su panel (Sprint 7 · issue #65). Ver backend/datosClinica.js
registrarRutasDatosClinica(app, { pool, autenticarToken, requerirRol });
app.listen(PUERTO, () => {
  console.log(`Servidor listo en http://localhost:${PUERTO}`);
});

// Aviso si la base no tiene administradores: la semilla 002 (cuentas demo)
// no se aplica por defecto, así que /admin no tendría con qué iniciar sesión.
pool
  .query("SELECT 1 FROM administradores LIMIT 1")
  .then(({ rowCount }) => {
    if (rowCount === 0) {
      console.warn(
        "Aviso: no hay administradores en la base de datos. " +
          "Crea uno con: npm run admin:crear -- --correo=... --password='...'"
      );
    }
  })
  .catch((error) => {
    console.warn("No se pudo verificar si existen administradores:", error.message);
  });
