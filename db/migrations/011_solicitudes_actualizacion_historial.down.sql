DROP INDEX IF EXISTS idx_solicitudes_clinica_fecha;

ALTER TABLE solicitudes_clinicas
    DROP COLUMN IF EXISTS fecha_resolucion,
    DROP COLUMN IF EXISTS campos_modificados,
    DROP COLUMN IF EXISTS motivo,
    DROP COLUMN IF EXISTS tipo_solicitud;
