// Solo lectura: inventario sin direcciones, teléfonos ni información de pacientes.
const fs = require("node:fs");
const { resolverMunicipioHeredado } = require("../../frontend/src/utils/municipios.mjs");

function analizarCentros(centros) {
  return centros.map((c) => {
    const oficial = resolverMunicipioHeredado(c.municipio);
    return {
      id: c.id_clinica || c.id_origen,
      nombre: c.nombre,
      municipio_original: c.municipio,
      municipio_clave: oficial?.cvegeo || null,
      municipio_oficial: oficial?.nombre || null,
      resultado: oficial ? 'relacionable' : 'requiere_revision',
    };
  });
}
async function main() {
  process.env.DOTENV_CONFIG_QUIET = "true";
  let filas;
  if (process.argv[2] === "--csv") {
    const { leerRegistros } = require("./importar-filtracion");
    filas = leerRegistros(fs.readFileSync(process.argv[3], "utf8"));
  } else {
    const pool = require("../db");
    const db = await pool.connect();
    try {
      await db.query("BEGIN READ ONLY");
      filas = (await db.query("SELECT id_clinica, nombre, municipio FROM clinicas ORDER BY nombre")).rows;
      await db.query("COMMIT");
    } finally { db.release(); await pool.end(); }
  }
  console.log(JSON.stringify({ generado_en: new Date().toISOString(), centros: analizarCentros(filas) }, null, 2));
}
if (require.main === module) main().catch((e) => { console.error(e.message); process.exitCode = 1; });
module.exports = { analizarCentros };
