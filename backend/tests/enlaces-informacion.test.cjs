const test = require("node:test");
const assert = require("node:assert/strict");
const { validarEnlacesInformacion, actualizarEnlacesInformacion } = require("../enlacesInformacion");

function clienteFalso({ estado = "aprobada", pendiente = false, existe = true } = {}) {
  const consultas = [];
  return {
    consultas,
    async query(sql, valores) {
      consultas.push({ sql, valores });
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [] };
      if (sql.includes("FROM clinicas")) {
        return { rows: existe ? [{ estado_publicacion: estado }] : [] };
      }
      if (sql.includes("FROM solicitudes_clinicas")) {
        return { rows: pendiente ? [{ existe: 1 }] : [] };
      }
      if (sql.includes("UPDATE clinicas")) {
        return { rows: [{ enlaces_informacion: JSON.parse(valores[0]) }] };
      }
      throw new Error(`Consulta inesperada: ${sql}`);
    },
    release() {},
  };
}

test("una postulación pendiente no puede alterar las fuentes revisadas", async () => {
  const cliente = clienteFalso({ pendiente: true });
  const r = await actualizarEnlacesInformacion(
    { connect: async () => cliente }, "clinica-1",
    { enlaces: [{ titulo: "Fuente", url: "https://example.com/guia" }] }
  );
  assert.equal(r.status, 409);
  assert.ok(cliente.consultas.some(({ sql }) => sql === "ROLLBACK"));
  assert.ok(!cliente.consultas.some(({ sql }) => sql.includes("UPDATE clinicas")));
});

test("una clínica sin postulación pendiente guarda la URL normalizada", async () => {
  const cliente = clienteFalso();
  const r = await actualizarEnlacesInformacion(
    { connect: async () => cliente }, "clinica-1",
    { enlaces: [{ titulo: "  Fuente  ", url: "https://example.com" }] }
  );
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.enlaces, [{ titulo: "Fuente", url: "https://example.com/" }]);
  assert.ok(cliente.consultas.some(({ sql }) => sql === "COMMIT"));
});

test("una clínica inexistente no crea fuentes", async () => {
  const cliente = clienteFalso({ existe: false });
  const r = await actualizarEnlacesInformacion(
    { connect: async () => cliente }, "clinica-1", { enlaces: [] }
  );
  assert.equal(r.status, 404);
  assert.ok(!cliente.consultas.some(({ sql }) => sql.includes("UPDATE clinicas")));
});

test("permite añadir, editar y eliminar fuentes con títulos y URLs limpias", () => {
  assert.deepEqual(validarEnlacesInformacion({ enlaces: [
    { titulo: "  Secretaría de Salud  ", url: " https://salud.gob.mx/info " },
  ] }).enlaces, [{ titulo: "Secretaría de Salud", url: "https://salud.gob.mx/info" }]);
  assert.deepEqual(validarEnlacesInformacion({ enlaces: [] }).enlaces, []);
});

test("rechaza protocolos inseguros, datos incompletos y listas excesivas", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,hi", "https://", "https:example.com/guia", "https://user:pass@example.com"]) {
    assert.ok(validarEnlacesInformacion({ enlaces: [{ titulo: "Prueba", url }] }).error);
  }
  assert.ok(validarEnlacesInformacion({ enlaces: [{ titulo: "", url: "https://example.com" }] }).error);
  assert.ok(validarEnlacesInformacion({ enlaces: Array(21).fill({ titulo: "x", url: "https://example.com" }) }).error);
  assert.ok(validarEnlacesInformacion({ enlaces: "https://example.com" }).error);
});
