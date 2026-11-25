const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validarCatalogo } = require("../scripts/importar-municipios");
const { analizarCentros } = require("../scripts/auditar-municipios");
const { municipios, resolverMunicipio, validarMunicipioEntrada } = require("../../frontend/src/utils/municipios.mjs");
const backend = require("../validacionesRegistro");
const { solicitarCita } = require("../citas");
const { calcularCambiosRevisionServidor } = require("../comparacionFicha");

test("importación INEGI: 570 claves de texto únicas y fallos cerrados", () => {
  const datos = municipios.map((m) => ({ ...m, nomgeo: m.nombre }));
  assert.equal(validarCatalogo({ datos }).length, 570);
  assert.equal(datos[0].cve_mun, "001");
  assert.equal(new Set(datos.map((m) => m.cvegeo)).size, 570);
  for (const mal of [
    { datos: datos.slice(1) },
    { datos: [datos[0], ...datos.slice(0, -1)] },
    { datos: [{ ...datos[0], cvegeo: 20001 }, ...datos.slice(1)] },
    { datos: [{ ...datos[0], cve_ent: "21" }, ...datos.slice(1)] },
  ]) assert.throws(() => validarCatalogo(mal));
});

test("municipios: normalización, claves, equivalencias y ambigüedad", () => {
  assert.equal(resolverMunicipio("  OAXACA  DE JUAREZ ").cvegeo, "20067");
  assert.equal(resolverMunicipio("20001").nombre, "Abejones");
  for (const valor of ["Oaxaca", "Juarez", "Inventado", "San Juan Mixtepec", "San Pedro Mixtepec", 20067, null]) assert.equal(resolverMunicipio(valor), null);
  assert.equal(validarMunicipioEntrada({ municipio: "San Juan Mixtepec", municipio_clave: "20208" }).municipio_clave, "20208");
  assert.equal(validarMunicipioEntrada({ municipio: "San Juan Mixtepec", municipio_clave: "20209" }).municipio_clave, "20209");
  assert.ok(validarMunicipioEntrada({ municipio: "San Juan Mixtepec" }).error);
  for (const entrada of [
    { municipio_clave: 20067 }, { municipio_clave: "20999" }, { municipio: null },
    { municipio: "Oaxaca de Juárez", municipio_clave: "20001" },
  ]) assert.ok(validarMunicipioEntrada(entrada).error);
  const reporte = analizarCentros([
    { id_clinica: "1", municipio: "Oxaca de Juarez" },
    { id_clinica: "2", municipio: "Oaxaca" },
    { id_clinica: "3", municipio: "Santa Cruz Xoxocotlán (En proceso de reubicación)" },
  ]);
  assert.equal(reporte[0].municipio_clave, "20067");
  assert.equal(reporte[0].municipio_original, "Oxaca de Juarez");
  assert.equal(reporte[1].resultado, "requiere_revision");
  assert.equal(reporte[2].municipio_clave, null);
});

test("solicitud de actualización: valida clave y conserva nombre oficial", () => {
  const actual = { clinica: { municipio: "Abejones" } };
  const cambio = calcularCambiosRevisionServidor(actual, { municipio_clave: "20067" });
  assert.deepEqual(cambio.errores, {});
  assert.equal(cambio.datosNuevos.municipio, "Oaxaca de Juárez");
  assert.equal(cambio.datosNuevos.municipio_clave, "20067");
  assert.ok(calcularCambiosRevisionServidor(actual, { municipio: "Inventado" }).errores.municipio);
  const homonimo = calcularCambiosRevisionServidor({ clinica: { municipio: "San Juan Mixtepec", municipio_clave: "20208" } },
    { municipio: "San Juan Mixtepec", municipio_clave: "20209" });
  assert.ok(homonimo.cambios.some((c) => c.campo === "municipio_clave"));
  assert.equal(homonimo.datosNuevos.municipio_clave, "20209");
});

test("teléfonos: misma política frontend/backend, E.164, tipos y obligatoriedad", async () => {
  const frontend = await import("../../frontend/src/utils/validaciones.js");
  const validos = ["9511234567", "+52 (951) 123-4567", "55 1234 5678", "33.1234.5678", "81 1122 3344", "9510000000"];
  const invalidos = ["1234567890", "1111111111", "9999999999", "9876543210", "0123456789",
    "123456789", "+1 2025550123", "+52+529511234567", "+5219511234567", "529511234567",
    "9511234567x", "9511234567 ext 2", 9511234567, {}, [], true, "0001234567"];
  for (const valor of validos) {
    assert.equal(backend.validarTelefono(valor), null, valor);
    assert.equal(frontend.validarTelefono(valor), true, valor);
    assert.equal(backend.normalizarTelefono(valor), frontend.normalizarTelefono(valor));
    assert.match(backend.normalizarTelefono(valor), /^\+52\d{10}$/);
  }
  for (const valor of invalidos) {
    assert.ok(backend.validarTelefono(valor), JSON.stringify(valor));
    assert.equal(frontend.validarTelefono(valor), false);
    assert.equal(backend.normalizarTelefono(valor), null);
  }
  for (const valor of ["", "  ", null, undefined]) {
    assert.equal(backend.validarTelefono(valor), null);
    assert.equal(frontend.validarTelefono(valor), true);
    assert.ok(backend.validarTelefono(valor, { requerido: true }));
    assert.equal(frontend.validarTelefono(valor, { requerido: true }), false);
  }
});

test("citas: no se evade el teléfono obligatorio con tipos incorrectos o vacío", async () => {
  const pool = { connect() { throw new Error("No debe escribir"); } };
  for (const telefono of [undefined, null, "", " ", 9511234567, {}, [], "1234567890", "+5219511234567"]) {
    const r = await solicitarCita(pool, "paciente", {
      id_espacio: "33333333-3333-4333-8333-333333333333", telefono,
    });
    assert.equal(r.status, 400, JSON.stringify(telefono));
  }
});
