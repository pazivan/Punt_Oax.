const test = require("node:test");
const assert = require("node:assert/strict");
const { validarEnlacesInformacion } = require("../enlacesInformacion");

test("permite añadir, editar y eliminar fuentes con títulos y URLs limpias", () => {
  assert.deepEqual(validarEnlacesInformacion({ enlaces: [
    { titulo: "  Secretaría de Salud  ", url: " https://salud.gob.mx/info " },
  ] }).enlaces, [{ titulo: "Secretaría de Salud", url: "https://salud.gob.mx/info" }]);
  assert.deepEqual(validarEnlacesInformacion({ enlaces: [] }).enlaces, []);
});

test("rechaza protocolos inseguros, datos incompletos y listas excesivas", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,hi", "https://", "https://user:pass@example.com"]) {
    assert.ok(validarEnlacesInformacion({ enlaces: [{ titulo: "Prueba", url }] }).error);
  }
  assert.ok(validarEnlacesInformacion({ enlaces: [{ titulo: "", url: "https://example.com" }] }).error);
  assert.ok(validarEnlacesInformacion({ enlaces: Array(21).fill({ titulo: "x", url: "https://example.com" }) }).error);
  assert.ok(validarEnlacesInformacion({ enlaces: "https://example.com" }).error);
});
