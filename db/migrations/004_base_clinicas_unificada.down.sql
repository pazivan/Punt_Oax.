-- La reversión solo está permitida cuando no borraría información registrada.
-- Se mantienen los servicios canónicos: podrían haber existido antes de 004.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM clinicas_documentos) THEN
        RAISE EXCEPTION 'Hay documentos asociados a clínicas; no se puede revertir sin perder metadatos';
    END IF;
    IF EXISTS (SELECT 1 FROM clinicas_servicios WHERE detalle_servicio IS NOT NULL) THEN
        RAISE EXCEPTION 'Hay detalles capturados; revertir eliminaría datos';
    END IF;
    IF EXISTS (SELECT 1 FROM clinicas_servicios WHERE id_origen IS NOT NULL OR costo_texto IS NOT NULL) THEN
        RAISE EXCEPTION 'Hay datos de procedencia o costos; revertir eliminaría datos';
    END IF;
    IF EXISTS (SELECT 1 FROM horarios_atencion WHERE es_24_horas OR cruza_medianoche OR texto_horario IS NOT NULL) THEN
        RAISE EXCEPTION 'Hay horarios especiales; revertir eliminaría datos';
    END IF;
    IF EXISTS (SELECT 1 FROM clinicas WHERE id_origen IS NOT NULL OR region IS NOT NULL OR
        fuente_origen IS NOT NULL OR links_relacionados IS NOT NULL OR horario_texto IS NOT NULL OR
        ubicacion_maps_url IS NOT NULL OR nivel_atencion IS NOT NULL OR datos_por_confirmar IS NOT NULL OR
        situacion_ubicacion <> 'pendiente' OR verificacion_datos <> 'por_confirmar') THEN
        RAISE EXCEPTION 'Hay datos de mapeo o verificación; revertir eliminaría datos';
    END IF;
END $$;
DROP TABLE clinicas_documentos;
ALTER TABLE clinicas_servicios DROP CONSTRAINT chk_detalle_servicio_longitud;
ALTER TABLE clinicas_servicios
    DROP COLUMN detalle_servicio, DROP COLUMN costo_texto, DROP COLUMN id_origen;

ALTER TABLE horarios_atencion DROP CONSTRAINT chk_horarios_intervalo;
ALTER TABLE horarios_atencion ADD CONSTRAINT chk_horarios_intervalo CHECK (hora_apertura < hora_cierre);
ALTER TABLE horarios_atencion
    DROP COLUMN texto_horario, DROP COLUMN cruza_medianoche, DROP COLUMN es_24_horas;

DROP INDEX idx_clinicas_verificacion_datos;
DROP INDEX idx_clinicas_situacion_ubicacion;
DROP INDEX idx_clinicas_id_origen;
ALTER TABLE clinicas
    DROP CONSTRAINT chk_clinicas_situacion_ubicacion,
    DROP CONSTRAINT chk_clinicas_verificacion_datos,
    DROP COLUMN datos_por_confirmar,
    DROP COLUMN verificacion_datos,
    DROP COLUMN situacion_ubicacion,
    DROP COLUMN nivel_atencion,
    DROP COLUMN ubicacion_maps_url,
    DROP COLUMN horario_texto,
    DROP COLUMN links_relacionados,
    DROP COLUMN fuente_origen,
    DROP COLUMN region,
    DROP COLUMN id_origen;
