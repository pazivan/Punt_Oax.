// Genera artefactos locales revisables; nunca escribe en la base de datos.
const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const FUENTE = "https://gaia.inegi.org.mx/wscatgeo/v2/mgem/20";

function validarCatalogo(respuesta) {
  if (!Array.isArray(respuesta?.datos) || respuesta.datos.length !== 570) {
    throw new Error("INEGI debe devolver exactamente 570 municipios.");
  }
  const claves = new Set();
  return respuesta.datos.map(({ cvegeo, cve_ent, cve_mun, nomgeo }) => {
    if (typeof cvegeo !== "string" || !/^20\d{3}$/.test(cvegeo) ||
        cve_ent !== "20" || typeof cve_mun !== "string" || !/^\d{3}$/.test(cve_mun) ||
        cvegeo !== cve_ent + cve_mun || claves.has(cvegeo) ||
        typeof nomgeo !== "string" || !nomgeo.trim() || nomgeo.length > 100) {
      throw new Error("Clave duplicada o municipio INEGI inválido.");
    }
    claves.add(cvegeo);
    return { cvegeo, cve_ent, cve_mun, nombre: nomgeo.trim() };
  }).sort((a, b) => a.cvegeo.localeCompare(b.cvegeo));
}

async function main() {
  const archivo = process.argv[2];
  const respuesta = archivo ? await fs.readFile(archivo, "utf8") :
    await fetch(FUENTE, { signal: AbortSignal.timeout(30000) }).then((r) => {
      if (!r.ok) throw new Error(`INEGI: HTTP ${r.status}`);
      return r.text();
    });
  const municipios = validarCatalogo(JSON.parse(respuesta));
  const catalogo = {
    fuente: FUENTE,
    documentacion: "https://www.inegi.org.mx/servicios/catalogoUnico.html",
    obtenido_en: new Date().toISOString(),
    sha256_respuesta: createHash("sha256").update(respuesta).digest("hex"),
    municipios,
  };
  await fs.writeFile(path.resolve(__dirname, "../../frontend/src/data/municipios-oaxaca.json"),
    JSON.stringify(catalogo, null, 2) + "\n");
  console.log(`Catálogo validado: ${municipios.length} municipios. Revisa el diff antes de integrarlo.`);
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exitCode = 1; });
module.exports = { validarCatalogo };
