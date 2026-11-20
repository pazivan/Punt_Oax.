/**
 * API de centros cercanos (Sprint 8 · Kelly · issues #94 y #95)
 * Contrato: docs/contrato-api-cercania.md
 *
 *   GET /api/clinicas/cercanas?lat=&lng=&radio_km=10&limite=10&servicios=its,ile
 *
 * - Pública, igual que GET /api/clinicas.
 * - Solo clínicas aprobadas con ubicación confirmada (fija y verificada).
 * - Ordenadas por distancia en línea recta (PostGIS, geography).
 * - PRIVACIDAD: las coordenadas recibidas no se guardan ni se escriben en logs.
 *
 * La consulta SQL está separada en consultarCentrosCercanos() para que Iván (#93)
 * pueda revisarla o reemplazarla sin tocar la validación ni la ruta.
 */

const { fichaPublica } = require("./catalogoPublico");

const RADIO_PREDETERMINADO_KM = 10;
const LIMITE_PREDETERMINADO = 10;
const NUMERO_DECIMAL = /^-?\d+(\.\d+)?$/;
const ENTERO = /^\d+$/;
const SERVICIOS_PERMITIDOS = ["its", "ile"];

const respuesta = (status, body) => ({ status, body });

// ------------------------------------------------------------------
// 1. Validación de parámetros (sección 2 y 6 del contrato)
// ------------------------------------------------------------------
function validarParametros(query = {}) {
  const campos = {};
  const valores = {};

  for (const nombre of ["lat", "lng", "radio_km", "limite", "servicios"]) {
    if (Array.isArray(query[nombre])) campos[nombre] = "Envía este parámetro una sola vez.";
  }

  const numero = (nombre, min, max, mensaje, { obligatorio, predeterminado, entero } = {}) => {
    if (campos[nombre]) return;
    const crudo = query[nombre];
    if (crudo === undefined || (typeof crudo === "string" && crudo.trim() === "")) {
      if (obligatorio) campos[nombre] = "Envía la latitud y la longitud de tu ubicación.";
      else valores[nombre] = predeterminado;
      return;
    }
    const texto = String(crudo).trim();
    const valido = (entero ? ENTERO : NUMERO_DECIMAL).test(texto);
    const valor = Number(texto);
    if (!valido || !Number.isFinite(valor) || valor < min || valor > max) {
      campos[nombre] = mensaje;
      return;
    }
    valores[nombre] = valor;
  };

  numero("lat", -90, 90, "La latitud debe ser un número entre -90 y 90.", { obligatorio: true });
  numero("lng", -180, 180, "La longitud debe ser un número entre -180 y 180.", { obligatorio: true });
  numero("radio_km", 0.5, 100, "El radio debe estar entre 0.5 y 100 km.", { predeterminado: RADIO_PREDETERMINADO_KM });
  numero("limite", 1, 50, "El límite debe ser un número entero entre 1 y 50.", {
    predeterminado: LIMITE_PREDETERMINADO, entero: true,
  });

  if (!campos.servicios) {
    const crudo = query.servicios;
    if (crudo === undefined || String(crudo).trim() === "") {
      valores.servicios = null;
    } else {
      const lista = [...new Set(String(crudo).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean))];
      if (!lista.length || lista.some((s) => !SERVICIOS_PERMITIDOS.includes(s))) {
        campos.servicios = "Los servicios permitidos son its e ile.";
      } else {
        valores.servicios = lista;
      }
    }
  }

  if (Object.keys(campos).length) return { campos };
  // 4 decimales (~11 m) bastan para calcular distancias.
  valores.lat = Math.round(valores.lat * 10000) / 10000;
  valores.lng = Math.round(valores.lng * 10000) / 10000;
  return { valores };
}

// ------------------------------------------------------------------
// 2. Consulta PostGIS (sección 3 del contrato) — parte de Iván (#93)
// ------------------------------------------------------------------
async function consultarCentrosCercanos(db, { lat, lng, radio_km: radioKm, limite, servicios }) {
  const { rows } = await db.query(
    `WITH origen AS (
       SELECT ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography AS punto
     )
     SELECT
       c.id_clinica,
       c.nombre,
       c.municipio,
       c.direccion,
       c.telefono,
       c.horario_texto AS horario,
       c.revision_catalogo,
       ST_Y(c.ubicacion_geo::geometry) AS latitud,
       ST_X(c.ubicacion_geo::geometry) AS longitud,
       ROUND((ST_Distance(c.ubicacion_geo, o.punto) / 1000)::numeric, 2) AS distancia_km,
       COALESCE((
         SELECT json_agg(DISTINCT LOWER(s.categoria) ORDER BY LOWER(s.categoria))
         FROM clinicas_servicios cs JOIN servicios s ON s.id_servicio = cs.id_servicio
         WHERE cs.id_clinica = c.id_clinica AND cs.activo AND s.activo AND s.categoria IS NOT NULL
       ), '[]'::json) AS categorias,
       COALESCE((
         SELECT json_agg(s.nombre ORDER BY s.nombre)
         FROM clinicas_servicios cs JOIN servicios s ON s.id_servicio = cs.id_servicio
         WHERE cs.id_clinica = c.id_clinica AND cs.activo AND s.activo
       ), '[]'::json) AS servicios
     FROM clinicas c, origen o
     WHERE c.estado_publicacion = 'aprobada'
       AND c.ubicacion_geo IS NOT NULL
       AND c.situacion_ubicacion = 'fija'
       AND c.verificacion_datos = 'verificado'
       AND ST_DWithin(c.ubicacion_geo, o.punto, $3)
       AND (
         $4::text[] IS NULL OR EXISTS (
           SELECT 1 FROM clinicas_servicios cs JOIN servicios s ON s.id_servicio = cs.id_servicio
           WHERE cs.id_clinica = c.id_clinica AND cs.activo AND s.activo
             AND LOWER(COALESCE(s.categoria, '')) = ANY($4::text[])
         )
       )
     ORDER BY distancia_km, c.nombre
     LIMIT $5`,
    [lat, lng, radioKm * 1000, servicios, limite]
  );
  return rows;
}

// ------------------------------------------------------------------
// 3. Armar la respuesta (secciones 4 y 5 del contrato)
// ------------------------------------------------------------------
const CAMPOS_PUBLICOS = [
  "id_clinica", "nombre", "municipio", "direccion", "latitud", "longitud",
  "distancia_km", "categorias", "servicios", "telefono", "horario",
];

function formatearCentro(fila) {
  // fichaPublica oculta teléfono/horario si el catálogo los marca como pendientes.
  const publica = fichaPublica({ ...fila, horarios: [] });
  const centro = {};
  for (const campo of CAMPOS_PUBLICOS) centro[campo] = publica[campo] ?? null;
  centro.latitud = Number(centro.latitud);
  centro.longitud = Number(centro.longitud);
  centro.distancia_km = Number(centro.distancia_km);
  return centro;
}

async function buscarCentrosCercanos(db, query) {
  const { campos, valores } = validarParametros(query);
  if (campos) return respuesta(400, { error: "Revisa los datos de ubicación enviados.", campos });

  const filas = await consultarCentrosCercanos(db, valores);
  const centros = filas.map(formatearCentro);
  const cuerpo = {
    origen: { lat: valores.lat, lng: valores.lng },
    radio_km: valores.radio_km,
    total: centros.length,
    centros,
  };
  if (!centros.length) {
    cuerpo.mensaje = `No encontramos centros con ubicación confirmada a menos de ${valores.radio_km} km. ` +
      "Prueba con un radio mayor o consulta el mapa completo.";
  }
  return respuesta(200, cuerpo);
}

// ------------------------------------------------------------------
// Registro de la ruta (debe ir ANTES de GET /api/clinicas/:id)
// ------------------------------------------------------------------
function registrarRutasCercania(app, { pool }) {
  app.get("/api/clinicas/cercanas", async (req, res) => {
    try {
      const { status, body } = await buscarCentrosCercanos(pool, req.query);
      return res.status(status).json(body);
    } catch (error) {
      // Privacidad: no se registran las coordenadas, solo el error.
      console.error("Error al consultar centros cercanos:", error.message);
      return res.status(500).json({ error: "No se pudieron consultar los centros cercanos." });
    }
  });
}

module.exports = {
  registrarRutasCercania,
  buscarCentrosCercanos,
  consultarCentrosCercanos,
  validarParametros,
};
