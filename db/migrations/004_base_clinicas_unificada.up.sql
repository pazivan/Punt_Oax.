-- 004 única: modelo v1.3 + mapeo de Iván + ficha institucional Sprint 4.
-- No modificar servicios ya existentes ni su estado mediante un UPSERT.
INSERT INTO servicios (nombre, categoria)
VALUES ('Detección de ITS', 'ITS'),
       ('Interrupción Legal del Embarazo (ILE)', 'ILE')
ON CONFLICT (nombre) DO NOTHING;

-- Los valores por defecto indican falta de verificación, nunca sede fija o aprobada.
ALTER TABLE clinicas
    ADD COLUMN id_origen VARCHAR(50),
    ADD COLUMN region VARCHAR(100),
    ADD COLUMN fuente_origen TEXT,
    ADD COLUMN links_relacionados TEXT,
    ADD COLUMN horario_texto TEXT,
    ADD COLUMN ubicacion_maps_url TEXT,
    ADD COLUMN nivel_atencion VARCHAR(50),
    ADD COLUMN situacion_ubicacion VARCHAR(20) NOT NULL DEFAULT 'pendiente',
    ADD COLUMN verificacion_datos VARCHAR(20) NOT NULL DEFAULT 'por_confirmar',
    ADD COLUMN datos_por_confirmar TEXT,
    ADD CONSTRAINT chk_clinicas_situacion_ubicacion
        CHECK (situacion_ubicacion IN ('fija', 'pendiente', 'itinerante', 'reubicacion')),
    ADD CONSTRAINT chk_clinicas_verificacion_datos
        CHECK (verificacion_datos IN ('pendiente', 'por_confirmar', 'parcial', 'verificado', 'inconsistente'));

CREATE INDEX idx_clinicas_id_origen ON clinicas (id_origen) WHERE id_origen IS NOT NULL;
CREATE INDEX idx_clinicas_situacion_ubicacion ON clinicas (situacion_ubicacion);
CREATE INDEX idx_clinicas_verificacion_datos ON clinicas (verificacion_datos);

-- La descripción libre pertenece a esta sede, no a la descripción global del catálogo.
ALTER TABLE clinicas_servicios
    ADD COLUMN id_origen VARCHAR(50),
    ADD COLUMN costo_texto VARCHAR(100),
    ADD COLUMN detalle_servicio TEXT;
ALTER TABLE clinicas_servicios ADD CONSTRAINT chk_detalle_servicio_longitud
    CHECK (detalle_servicio IS NULL OR LENGTH(detalle_servicio) <= 2000);

-- Franjas regulares existentes conservan su interpretación (ambas banderas FALSE).
ALTER TABLE horarios_atencion
    ADD COLUMN es_24_horas BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN cruza_medianoche BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN texto_horario TEXT;
ALTER TABLE horarios_atencion DROP CONSTRAINT chk_horarios_intervalo;
ALTER TABLE horarios_atencion ADD CONSTRAINT chk_horarios_intervalo CHECK (
    (es_24_horas = TRUE AND cruza_medianoche = FALSE AND hora_apertura = hora_cierre) OR
    (es_24_horas = FALSE AND cruza_medianoche = FALSE AND hora_apertura < hora_cierre) OR
    (es_24_horas = FALSE AND cruza_medianoche = TRUE AND hora_apertura > hora_cierre)
);

-- Solo metadatos: el archivo se guarda en volumen privado fuera de Nginx.
CREATE TABLE clinicas_documentos (
    id_documento UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_clinica UUID NOT NULL REFERENCES clinicas(id_clinica) ON DELETE RESTRICT,
    clave_almacenamiento UUID NOT NULL UNIQUE,
    nombre_original VARCHAR(255) NOT NULL,
    mime VARCHAR(40) NOT NULL CHECK (mime IN ('application/pdf', 'image/png', 'image/jpeg')),
    tamano_bytes INTEGER NOT NULL CHECK (tamano_bytes BETWEEN 1 AND 5242880),
    sha256 CHAR(64) NOT NULL,
    fecha_carga TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_clinicas_documentos_clinica ON clinicas_documentos (id_clinica);
