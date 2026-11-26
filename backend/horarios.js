const DURACION_CITA_MINUTOS = 60;
const ZONA_HORARIA = "America/Mexico_City";

function fechaValida(fecha) {
  if (typeof fecha !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const valor = new Date(`${fecha}T12:00:00Z`);
  return Number.isFinite(valor.getTime()) && valor.toISOString().slice(0, 10) === fecha;
}

// Las expresiones son identificadores SQL internos, nunca entrada del cliente.
// Se considera también el día anterior: 02:00 pertenece al turno 22:00–06:00
// iniciado el día previo, no al nocturno que aún no comienza ese mismo día.
function enHorarioSql(inicio, clinica) {
  return `EXISTS (
    SELECT 1 FROM horarios_atencion h
    CROSS JOIN LATERAL (
      SELECT date_trunc('day', (${inicio}) AT TIME ZONE '${ZONA_HORARIA}')
             + paso * INTERVAL '1 day' AS dia
      FROM generate_series(-1, 0) AS paso
    ) base
    WHERE h.id_clinica = ${clinica}
      AND h.dia_semana = EXTRACT(DOW FROM base.dia)
      AND (${inicio}) >= (base.dia::date + CASE WHEN h.es_24_horas THEN '00:00'::time ELSE h.hora_apertura END) AT TIME ZONE '${ZONA_HORARIA}'
      AND (${inicio}) + INTERVAL '${DURACION_CITA_MINUTOS} minutes' <=
        (base.dia::date + CASE WHEN h.es_24_horas THEN '00:00'::time ELSE h.hora_cierre END +
          CASE WHEN h.es_24_horas OR h.cruza_medianoche
            THEN INTERVAL '1 day' ELSE INTERVAL '0 days' END)
        AT TIME ZONE '${ZONA_HORARIA}'
  )`;
}

module.exports = { DURACION_CITA_MINUTOS, ZONA_HORARIA, fechaValida, enHorarioSql };
