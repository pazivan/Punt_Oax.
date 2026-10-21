const express = require("express");
const cors = require("cors");
const pool = require("./db");

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

app.listen(PUERTO, () => {
  console.log(`Servidor listo en http://localhost:${PUERTO}`);
});
