/**
 * Consulta parametrizada de cercanía en PostGIS (Sprint 8 · Iván).
 * Conectada con el módulo de API de Kelly (backend/cercania.js) y alineada
 * con el contrato completo del catálogo público en main.
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
    c.descripcion,
    c.tipo_institucion,
    c.municipio,
    c.localidad,
    c.direccion,
    c.codigo_postal,
    c.telefono,
    c.correo_contacto,
    c.sitio_web,
    c.region,
    c.fuente_origen AS fuente,
    c.enlaces_informacion,
    c.horario_texto AS horario,
    c.ubicacion_maps_url AS ubicacion_maps,
    c.nivel_atencion,
    c.situacion_ubicacion,
    c.verificacion_datos,
    c.datos_por_confirmar,
    c.revision_catalogo,
    (c.ubicacion_geo IS NOT NULL
      AND c.situacion_ubicacion = 'fija'
      AND c.verificacion_datos = 'verificado') AS ubicacion_confirmada,
    EXISTS (
      SELECT 1
      FROM espacios_disponibles ed
      JOIN clinicas_servicios cs ON cs.id_clinica_servicio = ed.id_clinica_servicio
      JOIN servicios s ON s.id_servicio = cs.id_servicio
      WHERE cs.id_clinica = c.id_clinica
        AND cs.activo = TRUE
        AND s.activo = TRUE
        AND ed.habilitado = TRUE
        AND ed.fecha_hora_inicio > NOW()
        AND NOT EXISTS (
          SELECT 1 FROM citas ci WHERE ci.id_espacio = ed.id_espacio AND ci.estado <> 'cancelada'
        )
    ) AS acepta_citas,
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
    ), '[]'::json) AS servicios,
    COALESCE((
      SELECT string_agg(s.nombre, ', ' ORDER BY s.nombre)
      FROM clinicas_servicios cs
      JOIN servicios s ON s.id_servicio = cs.id_servicio
      WHERE cs.id_clinica = c.id_clinica
        AND cs.activo = TRUE
        AND s.activo = TRUE
    ), '') AS servicios_texto,
    COALESCE((
      SELECT string_agg(DISTINCT BTRIM(cs.requisitos), '; ')
      FROM clinicas_servicios cs
      WHERE cs.id_clinica = c.id_clinica
        AND cs.activo = TRUE
        AND cs.requisitos IS NOT NULL
        AND BTRIM(cs.requisitos) <> ''
    ), '') AS requisitos,
    COALESCE((
      SELECT json_agg(json_build_object(
        'dia_semana', h.dia_semana,
        'apertura', to_char(h.hora_apertura, 'HH24:MI'),
        'cierre', to_char(h.hora_cierre, 'HH24:MI'),
        'es_24_horas', h.es_24_horas,
        'cruza_medianoche', h.cruza_medianoche
      ) ORDER BY h.dia_semana, h.hora_apertura)
      FROM horarios_atencion h
      WHERE h.id_clinica = c.id_clinica
    ), '[]'::json) AS horarios,
    CASE
      WHEN EXISTS (
        SELECT 1 FROM horarios_atencion h
        WHERE h.id_clinica = c.id_clinica AND h.es_24_horas = TRUE
      ) THEN '24-horas'
      WHEN EXISTS (
        SELECT 1 FROM horarios_atencion h
        WHERE h.id_clinica = c.id_clinica AND h.dia_semana IN (0, 6)
      ) THEN 'fines-semana'
      WHEN EXISTS (
        SELECT 1 FROM horarios_atencion h
        WHERE h.id_clinica = c.id_clinica AND h.dia_semana BETWEEN 1 AND 5
      ) THEN 'lunes-viernes'
      ELSE NULL
    END AS modalidad_horario,
    CASE
      WHEN c.links_relacionados IS NULL OR BTRIM(c.links_relacionados) = '' THEN '[]'::json
      ELSE COALESCE((
        SELECT json_agg(DISTINCT BTRIM(enlace))
        FROM regexp_split_to_table(c.links_relacionados, E'[\\n,]+') AS enlace
        WHERE BTRIM(enlace) <> ''
      ), '[]'::json)
    END AS links_relacionados
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
    throw new RangeError("La latitud debe estar entre -90 y 90.");
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new RangeError("La longitud debe estar entre -180 y 180.");
  }
  if (!Number.isFinite(radioKm) || radioKm < 0.5 || radioKm > 100) {
    throw new RangeError("El radio_km debe estar entre 0.5 y 100.");
  }
  if (!Number.isInteger(limite) || limite < 1 || limite > 50) {
    throw new RangeError("El limite debe ser un entero entre 1 y 50.");
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
