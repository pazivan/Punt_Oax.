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
  limits: { fileSize: 5 * 1024 * 1024, files: 5, fields: 1, fieldSize: 32000, parts: 6 },
}).array("documentos", 5);

function prepararRegistro(req, res, next) {
  if (!req.is("multipart/form-data")) {
    return res.status(415).json({ error: "Envía la ficha y los documentos en un formulario multipart." });
  }
  recibirDocumentos(req, res, (error) => {
    if (error) return res.status(400).json({ error: "Máximo cinco documentos de 5 MB cada uno; revisa el formulario." });
    if (!Array.isArray(req.files) || req.files.length === 0) {
      return res.status(400).json({ error: "Adjunta al menos un archivo de respaldo." });
    }
    try {
      req.fichaClinica = JSON.parse(req.body.ficha);
    } catch {
      return res.status(400).json({ error: "La ficha de clínica no es válida." });
    }
    if (!req.fichaClinica || typeof req.fichaClinica !== "object" || Array.isArray(req.fichaClinica)) {
      return res.status(400).json({ error: "La ficha de clínica no es válida." });
    }
    const firmas = req.files.every((archivo) => {
      const bytes = archivo.buffer;
      return bytes.length > 0 && archivo.originalname.length <= 255 &&
        ((archivo.mimetype === "application/pdf" && bytes.subarray(0, 5).toString() === "%PDF-") ||
        (archivo.mimetype === "image/png" && bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) ||
        (archivo.mimetype === "image/jpeg" && bytes.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"))));
    });
    if (!firmas) return res.status(400).json({ error: "Solo se admiten PDF, PNG o JPG válidos de hasta 5 MB." });
    next();
  });
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
// REGISTRO DE CUENTA INSTITUCIONAL (Sprint 4)
// Crea la cuenta de acceso de una clínica en estado "borrador".
// No publica la clínica ni crea una solicitud administrativa (Sprint 7).
// ==========================================
app.post("/api/auth/registro-clinica", prepararRegistro, async (req, res) => {
  const { nombre, correo, password, tipo_institucion, municipio, direccion, telefono,
    codigo_postal, descripcion, servicios = [], horarios = [] } = req.fichaClinica;

  if (typeof nombre !== "string" || !nombre.trim() ||
      typeof correo !== "string" || !correo.trim() ||
      typeof password !== "string" || !password ||
      ![municipio, direccion, telefono].every((valor) => typeof valor === "string" && valor.trim()) ||
      !["publica", "privada", "ong", "otra"].includes(tipo_institucion)) {
    return res.status(400).json({
      error: "Nombre, correo, contraseña, tipo de institución, municipio, dirección y teléfono son obligatorios.",
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

  const correoValido = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(correoLimpio);
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

  // bcrypt trunca en 72 bytes: rechazar en lugar de guardar una clave parcial.
  if (Buffer.byteLength(password, "utf8") > 72) {
    return res.status(400).json({
      error: "La contraseña no puede superar los 72 caracteres.",
    });
  }

  const municipioLimpio = municipio.trim();
  const direccionLimpia = direccion.trim();
  const telefonoLimpio = telefono.trim();
  const cpLimpio = codigo_postal == null ? null : typeof codigo_postal === "string" ? codigo_postal.trim() : null;
  const descripcionLimpia = descripcion == null ? null : typeof descripcion === "string" ? descripcion.trim() : null;
  if (municipioLimpio.length > 100 || direccionLimpia.length > 500 ||
      telefonoLimpio.length > 20 || !/^[+\d()\s.-]+$/.test(telefonoLimpio) ||
      (codigo_postal != null && (cpLimpio === null || (cpLimpio && !/^\d{5}$/.test(cpLimpio)))) ||
      (descripcion != null && (descripcionLimpia === null || descripcionLimpia.length > 2000))) {
    return res.status(400).json({ error: "Revisa municipio, dirección, teléfono, código postal y descripción." });
  }

  const nombresPrincipales = {
    its: "Detección de ITS",
    ile: "Interrupción Legal del Embarazo (ILE)",
  };
  if (!Array.isArray(servicios) || servicios.length === 0 || servicios.length > 2 ||
      servicios.some((servicio) => !servicio || typeof servicio !== "object" ||
        !Object.hasOwn(nombresPrincipales, servicio.categoria) ||
        typeof servicio.detalle !== "string" || !servicio.detalle.trim() ||
        servicio.detalle.trim().length > 2000) ||
      new Set(servicios.map((servicio) => servicio.categoria)).size !== servicios.length ||
      !Array.isArray(horarios) || horarios.length === 0 || horarios.length > 14 ||
      horarios.some((h) => !h || !Number.isInteger(h.dia_semana) ||
        h.dia_semana < 0 || h.dia_semana > 6 ||
        typeof h.apertura !== "string" || typeof h.cierre !== "string" ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(h.apertura) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(h.cierre) ||
        h.apertura >= h.cierre)) {
    return res.status(400).json({ error: "Selecciona un área de atención, describe sus servicios y elige un día con horario válido." });
  }
  const horariosOrdenados = [...horarios].sort((a, b) => a.dia_semana - b.dia_semana ||
    a.apertura.localeCompare(b.apertura));
  if (horariosOrdenados.some((h, i) => i > 0 &&
      h.dia_semana === horariosOrdenados[i - 1].dia_semana &&
      h.apertura < horariosOrdenados[i - 1].cierre)) {
    return res.status(400).json({ error: "Los horarios de un mismo día no deben solaparse." });
  }

  let client;
  const archivosGuardados = [];
  try {
    const carpeta = process.env.DOCUMENTS_PRIVATE_DIR;
    if (!carpeta || !path.isAbsolute(carpeta) ||
        path.resolve(carpeta).startsWith(path.resolve(__dirname, "../frontend") + path.sep)) {
      return res.status(503).json({ error: "El almacenamiento privado de documentos no está configurado." });
    }
    await fs.mkdir(carpeta, { recursive: true, mode: 0o700 });
    const infoCarpeta = await fs.lstat(carpeta);
    if (!infoCarpeta.isDirectory() || infoCarpeta.mode & 0o077) {
      return res.status(503).json({ error: "El almacenamiento privado de documentos no es seguro." });
    }
    const hash = await hashearPassword(password);

    client = await pool.connect();
    await client.query("BEGIN");
    const { rows: serviciosActivos } = await client.query(
      "SELECT id_servicio, nombre FROM servicios WHERE activo = TRUE AND nombre = ANY($1::text[])",
      [servicios.map(({ categoria }) => nombresPrincipales[categoria])]
    );
    if (serviciosActivos.length !== servicios.length) {
      await client.query("ROLLBACK");
      return res.status(503).json({ error: "Las áreas de atención aún no están disponibles en el servidor." });
    }
    const { rows: columnas } = await client.query(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'clinicas_servicios' AND column_name = 'detalle_servicio'
      ) AS disponible`
    );
    if (!columnas[0].disponible) {
      await client.query("ROLLBACK");
      return res.status(503).json({ error: "El registro de servicios específicos aún no está habilitado en el servidor." });
    }

    // El estado se fija en el servidor: el cliente no puede publicar la clínica.
    const { rows } = await client.query(
      `INSERT INTO clinicas
        (nombre, correo_acceso, password_hash, tipo_institucion, municipio, direccion,
         telefono, codigo_postal, descripcion, estado_publicacion)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'borrador')
       RETURNING id_clinica, nombre, correo_acceso, estado_publicacion, fecha_registro`,
      [nombreLimpio, correoLimpio, hash, tipo_institucion, municipioLimpio,
        direccionLimpia, telefonoLimpio, cpLimpio || null, descripcionLimpia || null]
    );

    const clinica = rows[0];
    for (const servicio of servicios) {
      const idServicio = serviciosActivos.find((item) => item.nombre === nombresPrincipales[servicio.categoria]).id_servicio;
      await client.query(
        "INSERT INTO clinicas_servicios (id_clinica, id_servicio, detalle_servicio) VALUES ($1, $2, $3)",
        [clinica.id_clinica, idServicio, servicio.detalle.trim()]
      );
    }
    for (const horario of horariosOrdenados) {
      await client.query(
        `INSERT INTO horarios_atencion (id_clinica, dia_semana, hora_apertura, hora_cierre)
         VALUES ($1, $2, $3, $4)`,
        [clinica.id_clinica, horario.dia_semana, horario.apertura, horario.cierre]
      );
    }
    for (const archivo of req.files) {
      const clave = randomUUID();
      const ruta = path.join(carpeta, clave);
      archivosGuardados.push(ruta);
      await fs.writeFile(ruta, archivo.buffer, { flag: "wx", mode: 0o600 });
      await client.query(
        `INSERT INTO clinicas_documentos
          (id_clinica, clave_almacenamiento, nombre_original, mime, tamano_bytes, sha256)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [clinica.id_clinica, clave, path.basename(archivo.originalname), archivo.mimetype,
          archivo.size, createHash("sha256").update(archivo.buffer).digest("hex")]
      );
    }
    await client.query("COMMIT");

    // Sin JWT: el flujo acordado es crear la cuenta y después iniciar sesión.
    return res.status(201).json({
      mensaje: "Cuenta de clínica creada correctamente.",
      clinica: {
        id: clinica.id_clinica,
        nombre: clinica.nombre,
        correo: clinica.correo_acceso,
        rol: "clinica",
        estado_publicacion: clinica.estado_publicacion,
      },
    });
  } catch (error) {
    if (client) {
      try { await client.query("ROLLBACK"); } catch { /* Conservar el error original. */ }
    }
    await Promise.allSettled(archivosGuardados.map((ruta) => fs.unlink(ruta)));
    if (error.code === "23505") {
      return res.status(409).json({
        error: "El correo ya se encuentra registrado.",
      });
    }

    console.error("Error al registrar clínica:", error.message);

    return res.status(500).json({
      error: "Error interno al registrar la clínica.",
    });
  } finally {
    client?.release();
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
