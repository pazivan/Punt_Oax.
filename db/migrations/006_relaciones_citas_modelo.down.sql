-- Reversión de la migración 006 (Relaciones del Modelo de Citas)

DROP VIEW IF EXISTS v_citas_detalladas;

DROP INDEX IF EXISTS idx_espacios_habilitado_fecha;
DROP INDEX IF EXISTS idx_espacios_clinica_servicio_inicio;
DROP INDEX IF EXISTS idx_citas_fecha_reserva;
DROP INDEX IF EXISTS idx_citas_usuario_estado;
