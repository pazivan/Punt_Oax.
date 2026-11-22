-- 011: Solicitudes de actualización posteriores a la aprobación, motivo,
-- campos modificados y fecha de resolución para historial y comentarios.
-- Incremental sobre 001..010; conserva todas las solicitudes existentes.

ALTER TABLE solicitudes_clinicas
    ADD COLUMN IF NOT EXISTS tipo_solicitud VARCHAR(40) NOT NULL DEFAULT 'postulacion',
    ADD COLUMN IF NOT EXISTS motivo TEXT,
    ADD COLUMN IF NOT EXISTS campos_modificados JSONB,
    ADD COLUMN IF NOT EXISTS fecha_resolucion TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_solicitudes_clinica_fecha
    ON solicitudes_clinicas (id_clinica, fecha_solicitud DESC);
