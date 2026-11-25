// Deriva la carga SQL de la misma fuente local que utilizan API y formularios.
const fs = require("node:fs");
const path = require("node:path");
const catalogo = require("../../frontend/src/data/municipios-oaxaca.json");
const equivalencias = require("../../frontend/src/data/municipios-equivalencias.json");
const { validarCatalogo } = require("./importar-municipios");
validarCatalogo({ datos: catalogo.municipios.map((m) => ({ ...m, nomgeo: m.nombre })) });
const literal = (v) => `'${v.replace(/'/g, "''")}'`;
const filas = catalogo.municipios.map((m) =>
  `(${[m.cvegeo, m.cve_ent, m.cve_mun, m.nombre, catalogo.fuente, catalogo.obtenido_en].map(literal).join(", ")})`);
const plantilla = fs.readFileSync(path.join(__dirname, "municipios-migracion.sql"), "utf8");
const aliases = equivalencias.map((m) => `(${[m.variante, m.cvegeo, m.motivo].map(literal).join(", ")})`);
fs.writeFileSync(path.resolve(__dirname, "../../db/migrations/014_municipios_oaxaca.up.sql"),
  plantilla.replace("-- CATALOGO_GENERADO", filas.join(",\n") + ";")
    .replace("-- EQUIVALENCIAS_GENERADAS", aliases.join(",\n") + ";"));
