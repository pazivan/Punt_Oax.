-- ==============================================================================
-- Migración 006: Relaciones del Modelo de Citas (Sprint 6 - Iván)
-- Relaciona las citas con usuarios, clínicas, servicios y horarios de atención,
-- optimiza consultas con índices y expone la vista canónica v_citas_detalladas.
-- ==============================================================================

-- 1. Índices relacionales para optimizar la agenda y consultas de citas
CREATE INDEX IF NOT EXISTS idx_citas_usuario_estado
    ON citas (id_usuario, estado);

CREATE INDEX IF NOT EXISTS idx_citas_fecha_reserva
    ON citas (fecha_reserva DESC);

CREATE INDEX IF NOT EXISTS idx_espacios_clinica_servicio_inicio
    ON espacios_disponibles (id_clinica_servicio, fecha_hora_inicio);

CREATE INDEX IF NOT EXISTS idx_espacios_habilitado_fecha
    ON espacios_disponibles (habilitado, fecha_hora_inicio);

-- 2. Vista canónica: v_citas_detalladas
-- Une la cita con su usuario paciente, el espacio reservado, el servicio,
-- la clínica responsable y la franja de horarios_atencion coincidente.
CREATE OR REPLACE VIEW v_citas_detalladas AS
SELECT
    ci.id_cita,
    ci.id_usuario,
    u.nombre AS usuario_nombre,
    u.apellidos AS usuario_apellidos,
    u.correo AS usuario_correo,
    u.telefono AS usuario_telefono,
    ci.id_espacio,
    ed.fecha_hora_inicio,
    ed.habilitado AS espacio_habilitado,
    cs.id_clinica_servicio,
    cl.id_clinica,
    cl.nombre AS clinica_nombre,
    cl.municipio AS clinica_municipio,
    cl.direccion AS clinica_direccion,
    cl.telefono AS clinica_telefono,
    cl.tipo_institucion AS clinica_tipo,
    s.id_servicio,
    s.nombre AS servicio_nombre,
    s.categoria AS servicio_categoria,
    ci.estado,
    ci.fecha_reserva,
    ha.id_horario,
    ha.hora_apertura AS horario_apertura,
    ha.hora_cierre AS horario_cierre,
    (ed.fecha_hora_inicio <= CURRENT_TIMESTAMP) AS es_pasada,
    (ed.fecha_hora_inicio > CURRENT_TIMESTAMP) AS es_futura
FROM citas ci
INNER JOIN espacios_disponibles ed ON ed.id_espacio = ci.id_espacio
INNER JOIN clinicas_servicios cs ON cs.id_clinica_servicio = ed.id_clinica_servicio
INNER JOIN clinicas cl ON cl.id_clinica = cs.id_clinica
INNER JOIN servicios s ON s.id_servicio = cs.id_servicio
INNER JOIN usuarios u ON u.id_usuario = ci.id_usuario
LEFT JOIN horarios_atencion ha
    ON ha.id_clinica = cl.id_clinica
   AND ha.dia_semana = EXTRACT(DOW FROM (ed.fecha_hora_inicio AT TIME ZONE 'America/Mexico_City'))::smallint
   AND (ed.fecha_hora_inicio AT TIME ZONE 'America/Mexico_City')::time >= ha.hora_apertura
   AND (ed.fecha_hora_inicio AT TIME ZONE 'America/Mexico_City')::time < ha.hora_cierre;

-- 3. Documentación formal de los estados de la cita
COMMENT ON COLUMN citas.estado IS
'Estados permitidos:
- confirmada: Cita reservada y activa. Ocupa el turno gracias al índice uq_citas_espacio_activa.
- cancelada: Cancelada por usuario o clínica antes de iniciar. Libera automáticamente el espacio.
- completada: Atención realizada en clínica una vez transcurrida la hora (fecha_hora_inicio <= NOW()).
- no_asistio: El paciente no acudió a la cita programada (fecha_hora_inicio <= NOW()).';

