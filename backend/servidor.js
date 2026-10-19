const express = require("express");
const pool = require("./db");

const app = express();
const PUERTO = 3000;

app.get("/api/clinicas", async (req, res) => {
  try {
    const resultado = await pool.query(`
      SELECT
        id_clinica,
        nombre,
        descripcion,
        requisitos_generales,
        tipo_institucion,
        telefono,
        correo_contacto,
        sitio_web,
        imagen_portada_url,
        estado_federativo,
        municipio,
        localidad,
        direccion,
        codigo_postal
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
