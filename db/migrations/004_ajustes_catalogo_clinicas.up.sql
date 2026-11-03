-- ============================================================================
-- MIGRACIÓN 004 (UP): Ajustes mínimos al Catálogo de Clínicas, Servicios y Horarios
-- Compatible con modelo v1.3, diseño Figma (Directorio, Ficha y Registro) y Google Sheets
-- Respeta arquitectura PostgreSQL + PostGIS existente (sin public.puntos/Supabase)
-- ============================================================================

-- 1. Campos de origen, región, verificación y situación operativa en clinicas
-- Nota: id_origen conserva el Id textual de la hoja (ej. 'coesdia 1', 'coesdia 11.10', 'imss 2', '36').
-- Nunca se utiliza 'N.º de origen' como clave ni sustituto.
ALTER TABLE clinicas
    ADD COLUMN IF NOT EXISTS id_origen VARCHAR(50),
    ADD COLUMN IF NOT EXISTS region VARCHAR(100),
    ADD COLUMN IF NOT EXISTS fuente_origen TEXT,
    ADD COLUMN IF NOT EXISTS links_relacionados TEXT,
    ADD COLUMN IF NOT EXISTS horario_texto TEXT,
    ADD COLUMN IF NOT EXISTS ubicacion_maps_url TEXT,
    ADD COLUMN IF NOT EXISTS nivel_atencion VARCHAR(50),
    ADD COLUMN IF NOT EXISTS situacion_ubicacion VARCHAR(20) NOT NULL DEFAULT 'fija',
    ADD COLUMN IF NOT EXISTS verificacion_datos VARCHAR(20) NOT NULL DEFAULT 'por_confirmar',
    ADD COLUMN IF NOT EXISTS datos_por_confirmar TEXT;

-- 2. Restricciones de integridad para situacion_ubicacion y verificacion_datos
-- Separa estado_publicacion (visibilidad pública) de verificacion_datos (certeza del dato)
ALTER TABLE clinicas
    DROP CONSTRAINT IF EXISTS chk_clinicas_situacion_ubicacion,
    ADD CONSTRAINT chk_clinicas_situacion_ubicacion
        CHECK (situacion_ubicacion IN ('fija', 'pendiente', 'itinerante', 'reubicacion'));

ALTER TABLE clinicas
    DROP CONSTRAINT IF EXISTS chk_clinicas_verificacion_datos,
    ADD CONSTRAINT chk_clinicas_verificacion_datos
        CHECK (verificacion_datos IN ('pendiente', 'por_confirmar', 'parcial', 'verificado', 'inconsistente'));

-- 3. Índices para búsquedas optimizadas y filtros de auditoría
CREATE INDEX IF NOT EXISTS idx_clinicas_id_origen
    ON clinicas (id_origen)
    WHERE id_origen IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clinicas_situacion_ubicacion
    ON clinicas (situacion_ubicacion);

CREATE INDEX IF NOT EXISTS idx_clinicas_verificacion_datos
    ON clinicas (verificacion_datos);

-- 4. Trazabilidad por fila, modalidad de costo y detalle específico en clinicas_servicios
-- Permite que una misma sede física ofrezca uno o ambos servicios estandarizados (Detección de ITS e ILE)
-- conservando el Id de origen, la etiqueta de costo ('Gratuito', 'Costo accesible', etc.)
-- y el detalle literal para la interfaz de Figma y el importador.
ALTER TABLE clinicas_servicios
    ADD COLUMN IF NOT EXISTS id_origen VARCHAR(50),
    ADD COLUMN IF NOT EXISTS costo_texto VARCHAR(100),
    ADD COLUMN IF NOT EXISTS detalle_servicio TEXT;

-- 5. Soporte para horarios de 24 horas y cruces de medianoche en horarios_atencion
ALTER TABLE horarios_atencion
    ADD COLUMN IF NOT EXISTS es_24_horas BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS cruza_medianoche BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS texto_horario TEXT;

-- Reemplazar la restricción rígida previa (que impedía turnos 24h y cruces de medianoche como Sáb 20:00 a Dom 09:00)
ALTER TABLE horarios_atencion
    DROP CONSTRAINT IF EXISTS chk_horarios_intervalo;

ALTER TABLE horarios_atencion
    ADD CONSTRAINT chk_horarios_intervalo CHECK (
        (es_24_horas = TRUE AND cruza_medianoche = FALSE) OR
        (es_24_horas = FALSE AND cruza_medianoche = FALSE AND hora_apertura < hora_cierre) OR
        (es_24_horas = FALSE AND cruza_medianoche = TRUE AND hora_apertura > hora_cierre)
    );

-- 6. Estandarización del Catálogo Canónico de Servicios: Detección de ITS e Interrupción Legal del Embarazo (ILE)
-- Todo centro ofrecerá Detección de ITS, ILE o ambos.
INSERT INTO servicios (nombre, descripcion, categoria, activo)
VALUES 
    (
        'Detección de ITS',
        'Detección oportuna confidencial y gratuita mediante pruebas rápidas de VIH, Sífilis y Hepatitis C, entrega de insumos preventivos y orientación.',
        'ITS',
        TRUE
    ),
    (
        'Interrupción Legal del Embarazo (ILE)',
        'Atención médica, orientación y acompañamiento seguro, legal y confidencial para la interrupción del embarazo conforme al marco legal de Oaxaca.',
        'ILE',
        TRUE
    )
ON CONFLICT (nombre) DO UPDATE SET 
    categoria = EXCLUDED.categoria,
    activo = TRUE;
