const express = require("express");
const cors = require("cors");
const pool = require("./db");
const { hashearPassword, verificarPassword, generarToken, autenticarToken, requerirRol } = require("./auth");

const app = express();
const PUERTO = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/api/clinicas", async (req, res) => {
  try {
    const resultado = await pool.query(`
      SELECT
        id_clinica,
        nombre,
        descripcion,
        tipo_institucion,
        telefono,
        correo_contacto,
        sitio_web,
        imagen_portada_url,
        municipio,
        localidad,
        direccion,
        codigo_postal,
        estado_publicacion,
        ST_Y(ubicacion_geo::geometry) AS latitud,
        ST_X(ubicacion_geo::geometry) AS longitud
      FROM clinicas
      WHERE estado_publicacion = 'aprobada'
      ORDER BY nombre;
    `);

    res.json(resultado.rows);
  } catch (error) {
    console.error("Error al consultar clínicas:", error.message);
    res.status(500).json({
      error: "No se pudieron obtener las clínicas",
    });
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

  try {
    const hash = await hashearPassword(password);

    // El estado se fija en el servidor: el cliente no puede publicar la clínica.
    const { rows } = await pool.query(
      `INSERT INTO clinicas
        (nombre, correo_acceso, password_hash, estado_publicacion)
       VALUES ($1, $2, $3, 'borrador')
       RETURNING id_clinica, nombre, correo_acceso, estado_publicacion, fecha_registro`,
      [nombreLimpio, correoLimpio, hash]
    );

    const clinica = rows[0];

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
