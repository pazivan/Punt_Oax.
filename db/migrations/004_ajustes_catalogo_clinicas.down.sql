-- ============================================================================
-- MIGRACIÓN 004 (DOWN): Reversión limpia de ajustes de clínicas, servicios y horarios
-- Restaura el esquema exactamente a su versión previa (003)
-- ============================================================================

-- 1. Eliminar servicios canónicos agregados si no están en uso por clínicas
DELETE FROM servicios 
WHERE nombre IN ('Detección de ITS', 'Interrupción Legal del Embarazo (ILE)')
  AND id_servicio NOT IN (SELECT id_servicio FROM clinicas_servicios);

-- 2. Restaurar restricción previa en horarios_atencion
ALTER TABLE horarios_atencion
    DROP CONSTRAINT IF EXISTS chk_horarios_intervalo;

ALTER TABLE horarios_atencion
    ADD CONSTRAINT chk_horarios_intervalo CHECK (hora_apertura < hora_cierre);

-- Eliminar columnas agregadas a horarios_atencion
ALTER TABLE horarios_atencion
    DROP COLUMN IF EXISTS texto_horario,
    DROP COLUMN IF EXISTS cruza_medianoche,
    DROP COLUMN IF EXISTS es_24_horas;

-- 3. Eliminar columnas agregadas a clinicas_servicios
ALTER TABLE clinicas_servicios
    DROP COLUMN IF EXISTS detalle_servicio,
    DROP COLUMN IF EXISTS costo_texto,
    DROP COLUMN IF EXISTS id_origen;

-- 4. Eliminar índices auxiliares de clinicas
DROP INDEX IF EXISTS idx_clinicas_verificacion_datos;
DROP INDEX IF EXISTS idx_clinicas_situacion_ubicacion;
DROP INDEX IF EXISTS idx_clinicas_id_origen;

-- 5. Eliminar restricciones y columnas agregadas a clinicas
ALTER TABLE clinicas
    DROP CONSTRAINT IF EXISTS chk_clinicas_verificacion_datos,
    DROP CONSTRAINT IF EXISTS chk_clinicas_situacion_ubicacion;

ALTER TABLE clinicas
    DROP COLUMN IF EXISTS datos_por_confirmar,
    DROP COLUMN IF EXISTS verificacion_datos,
    DROP COLUMN IF EXISTS situacion_ubicacion,
    DROP COLUMN IF EXISTS nivel_atencion,
    DROP COLUMN IF EXISTS ubicacion_maps_url,
    DROP COLUMN IF EXISTS horario_texto,
    DROP COLUMN IF EXISTS links_relacionados,
    DROP COLUMN IF EXISTS fuente_origen,
    DROP COLUMN IF EXISTS region,
    DROP COLUMN IF EXISTS id_origen;
