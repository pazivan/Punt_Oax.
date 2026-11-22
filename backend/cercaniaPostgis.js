/**
 * Consulta parametrizada de cercanía en PostGIS (Sprint 8 · Iván).
 * Diseñada para conectarse directamente con el módulo de API de Kelly (cercania.js).
 */

const PUNTO_REFERENCIA_OAXACA = Object.freeze({
  lat: 17.0654,
  lng: -96.7236,
  radio_km: 10,
  limite: 10,
});

const CONSULTA_CENTROS_CERCANOS = `
  WITH origen AS (
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
      FROM clinicas_servicios cs
      JOIN servicios s ON s.id_servicio = cs.id_servicio
      WHERE cs.id_clinica = c.id_clinica
        AND cs.activo = TRUE
        AND s.activo = TRUE
        AND s.categoria IS NOT NULL
    ), '[]'::json) AS categorias,
    COALESCE((
      SELECT json_agg(s.nombre ORDER BY s.nombre)
      FROM clinicas_servicios cs
      JOIN servicios s ON s.id_servicio = cs.id_servicio
      WHERE cs.id_clinica = c.id_clinica
        AND cs.activo = TRUE
        AND s.activo = TRUE
    ), '[]'::json) AS servicios
  FROM clinicas c, origen o
  WHERE c.estado_publicacion = 'aprobada'
    AND c.ubicacion_geo IS NOT NULL
    AND c.situacion_ubicacion = 'fija'
    AND c.verificacion_datos = 'verificado'
    AND ST_DWithin(c.ubicacion_geo, o.punto, $3)
    AND (
      $4::text[] IS NULL OR EXISTS (
        SELECT 1
        FROM clinicas_servicios cs
        JOIN servicios s ON s.id_servicio = cs.id_servicio
        WHERE cs.id_clinica = c.id_clinica
          AND cs.activo = TRUE
          AND s.activo = TRUE
          AND LOWER(COALESCE(s.categoria, '')) = ANY($4::text[])
      )
    )
  ORDER BY distancia_km ASC, c.nombre ASC
  LIMIT $5
`;

function esCoordenadaOaxaca(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= 15.5 &&
    lat <= 18.8 &&
    lng >= -98.7 &&
    lng <= -93.8
  );
}

/**
 * Ejecuta la consulta geoespacial parametrizada sobre la tabla `clinicas`.
 * Omite automáticamente centros sin coordenadas, no aprobados o con ubicación no confirmada.
 */
async function consultarCentrosCercanos(
  db,
  { lat, lng, radio_km: radioKm = 10, limite = 10, servicios = null }
) {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new RangeError('La latitud debe estar entre -90 y 90.');
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new RangeError('La longitud debe estar entre -180 y 180.');
  }
  if (!Number.isFinite(radioKm) || radioKm < 0.5 || radioKm > 100) {
    throw new RangeError('El radio_km debe estar entre 0.5 y 100.');
  }
  if (!Number.isInteger(limite) || limite < 1 || limite > 50) {
    throw new RangeError('El limite debe ser un entero entre 1 y 50.');
  }

  const filtroServicios = Array.isArray(servicios) && servicios.length ? servicios : null;
  const { rows } = await db.query(CONSULTA_CENTROS_CERCANOS, [
    lat,
    lng,
    radioKm * 1000,
    filtroServicios,
    limite,
  ]);
  return rows;
}

module.exports = {
  CONSULTA_CENTROS_CERCANOS,
  PUNTO_REFERENCIA_OAXACA,
  consultarCentrosCercanos,
  esCoordenadaOaxaca,
};
