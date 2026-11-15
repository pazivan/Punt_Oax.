/**
 * Agenda institucional. El identificador de clínica procede exclusivamente
 * de la sesión JWT validada en el controlador; nunca de un parámetro cliente.
 */
async function listarCitasClinica(db, idClinica) {
  const { rows } = await db.query(`
    SELECT
      ci.id_cita,
      ci.estado,
      ci.fecha_reserva,
      ed.fecha_hora_inicio,
      s.nombre AS nombre_servicio,
      u.nombre AS paciente_nombre,
      u.apellidos AS paciente_apellidos,
      u.telefono AS paciente_telefono,
      cl.nombre AS nombre_clinica,
      cl.municipio AS municipio_clinica
    FROM citas ci
    INNER JOIN espacios_disponibles ed ON ed.id_espacio = ci.id_espacio
    INNER JOIN clinicas_servicios cs ON cs.id_clinica_servicio = ed.id_clinica_servicio
    INNER JOIN servicios s ON s.id_servicio = cs.id_servicio
    INNER JOIN usuarios u ON u.id_usuario = ci.id_usuario
    INNER JOIN clinicas cl ON cl.id_clinica = cs.id_clinica
    WHERE cs.id_clinica = $1
    ORDER BY ed.fecha_hora_inicio DESC, ci.fecha_reserva DESC
  `, [idClinica]);
  return rows;
}

module.exports = { listarCitasClinica };
