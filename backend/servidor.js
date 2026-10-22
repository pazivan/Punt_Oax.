const express = require("express");
const cors = require("cors");
const pool = require("./db");
const { hashearPassword, generarToken } = require("./auth");

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
  const { nombre, apellidos, correo, password, telefono } = req.body;

  try {
    // 1. Validar campos obligatorios
    if (!nombre || !correo || !password) {
      return res.status(400).json({
        error: "Nombre, correo y contraseña son obligatorios.",
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

    console.error("Error al registrar usuario:", error);

    return res.status(500).json({
      error: "Error interno al registrar usuario.",
    });
  }
});

app.listen(PUERTO, () => {
  console.log(`Servidor listo en http://localhost:${PUERTO}`);
});
