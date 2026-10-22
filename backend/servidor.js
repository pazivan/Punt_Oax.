const express = require("express");
const cors = require("cors");
const pool = require("./db");
const {
  verificarPassword,
  generarToken,
  autenticarToken,
  requerirRol,
} = require("./auth");

const app = express();
const PUERTO = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Verificación de estado del servidor
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ==========================================
// RUTAS DE AUTENTICACIÓN (Issue #15 - Jonathan)
// ==========================================

// 1. Login para Usuarios / Pacientes
app.post("/api/auth/login-usuario", async (req, res) => {
  const { correo, password } = req.body;

  if (!correo || !password) {
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
  const { correo, password } = req.body;

  if (!correo || !password) {
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
  const { correo, password } = req.body;

  if (!correo || !password) {
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

// ==========================================
// RUTAS PÚBLICAS
// ==========================================

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

app.listen(PUERTO, () => {
  console.log(`Servidor listo en http://localhost:${PUERTO}`);
});