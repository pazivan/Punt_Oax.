const test = require("node:test");
const assert = require("node:assert/strict");
const {
  CONSULTA_CENTROS_CERCANOS,
  PUNTO_REFERENCIA_OAXACA,
  consultarCentrosCercanos,
  esCoordenadaOaxaca,
} = require("../cercaniaPostgis");

test("la consulta SQL PostGIS usa parametros ($1-$5), orden (lng, lat) y filtra ubicacion confirmada", () => {
  assert.match(CONSULTA_CENTROS_CERCANOS, /ST_MakePoint\(\$2,\s*\$1\)/);
  assert.match(CONSULTA_CENTROS_CERCANOS, /ST_DWithin\(c\.ubicacion_geo,\s*o\.punto,\s*\$3\)/);
  assert.match(CONSULTA_CENTROS_CERCANOS, /c\.estado_publicacion = 'aprobada'/);
  assert.match(CONSULTA_CENTROS_CERCANOS, /c\.ubicacion_geo IS NOT NULL/);
  assert.match(CONSULTA_CENTROS_CERCANOS, /c\.situacion_ubicacion = 'fija'/);
  assert.match(CONSULTA_CENTROS_CERCANOS, /c\.verificacion_datos = 'verificado'/);
  assert.match(CONSULTA_CENTROS_CERCANOS, /ORDER BY distancia_km ASC,\s*c\.nombre ASC/);
  assert.match(CONSULTA_CENTROS_CERCANOS, /LIMIT \$5/);
});

test("esCoordenadaOaxaca valida la envolvente de Oaxaca y rechaza coordenadas invertidas o nulas", () => {
  assert.equal(esCoordenadaOaxaca(PUNTO_REFERENCIA_OAXACA.lat, PUNTO_REFERENCIA_OAXACA.lng), true);
  assert.equal(esCoordenadaOaxaca(-96.7236, 17.0654), false); // invertidas
  assert.equal(esCoordenadaOaxaca(19.4326, -99.1332), false); // CDMX
  assert.equal(esCoordenadaOaxaca(NaN, -96.72), false);
});

test("consultarCentrosCercanos valida rangos antes de tocar la base de datos", async () => {
  const dbSinConexion = {
    query: async () => {
      throw new Error("No debería consultar BD con parámetros inválidos");
    },
  };

  await assert.rejects(
    () => consultarCentrosCercanos(dbSinConexion, { lat: 95, lng: -96.72 }),
    RangeError
  );
  await assert.rejects(
    () => consultarCentrosCercanos(dbSinConexion, { lat: 17.06, lng: -181 }),
    RangeError
  );
  await assert.rejects(
    () => consultarCentrosCercanos(dbSinConexion, { lat: 17.06, lng: -96.72, radio_km: 200 }),
    RangeError
  );
  await assert.rejects(
    () => consultarCentrosCercanos(dbSinConexion, { lat: 17.06, lng: -96.72, limite: 1.5 }),
    RangeError
  );
});

test("consultarCentrosCercanos envia parametros en metros y devuelve filas ordenadas alrededor del punto de prueba", async () => {
  const llamadas = [];
  const filasEsperadas = [
    {
      id_clinica: "11111111-1111-4111-8111-111111111111",
      nombre: "Unidad de Control Sanitario",
      distancia_km: "0.65",
    },
    {
      id_clinica: "22222222-2222-4222-8222-222222222222",
      nombre: "Hospital General de Zona - UMAA No. 1",
      distancia_km: "0.79",
    },
  ];

  const db = {
    async query(sql, params) {
      llamadas.push({ sql, params });
      return { rows: filasEsperadas };
    },
  };

  const resultado = await consultarCentrosCercanos(db, {
    ...PUNTO_REFERENCIA_OAXACA,
    servicios: ["its", "ile"],
  });

  assert.equal(llamadas.length, 1);
  assert.deepEqual(llamadas[0].params, [17.0654, -96.7236, 10000, ["its", "ile"], 10]);
  assert.deepEqual(resultado, filasEsperadas);
});
