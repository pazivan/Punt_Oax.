-- ============================================================================
-- PUNTOAX - INICIALIZACIÓN DE BASE DE DATOS (DOCKER ENTRYPOINT)
-- Modelo de Datos v1.3 | PostgreSQL + PostGIS (9 Tablas)
-- Incluye esquema completo, restricciones, índices y datos semilla iniciales
-- ============================================================================

-- 1. EXTENSIONES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- 2. TABLA DE CONTROL DE MIGRACIONES
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(50) PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    aplicada_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. TABLA: usuarios (Personas que agendan citas)
CREATE TABLE IF NOT EXISTS usuarios (
    id_usuario UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(100),
    apellidos VARCHAR(150),
    correo VARCHAR(255) NOT NULL,
    password_hash TEXT,
    google_sub VARCHAR(255),
    telefono VARCHAR(20),
    fecha_registro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_usuarios_correo UNIQUE (correo),
    CONSTRAINT uq_usuarios_google_sub UNIQUE (google_sub),
    CONSTRAINT chk_usuarios_autenticacion CHECK (
        password_hash IS NOT NULL OR google_sub IS NOT NULL
    ),
    CONSTRAINT chk_usuarios_hash_seguro CHECK (
        password_hash IS NULL OR LENGTH(password_hash) >= 50
    ),
    CONSTRAINT chk_usuarios_correo_formato CHECK (
        correo ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_correo_lower 
    ON usuarios (LOWER(TRIM(correo)));

-- 4. TABLA: clinicas (Sedes físicas y cuentas de panel institucional)
CREATE TABLE IF NOT EXISTS clinicas (
    id_clinica UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(255) NOT NULL,
    correo_acceso VARCHAR(255),
    password_hash TEXT,
    descripcion TEXT,
    tipo_institucion VARCHAR(30),
    telefono VARCHAR(20),
    correo_contacto VARCHAR(255),
    sitio_web TEXT,
    imagen_portada_url TEXT,
    municipio VARCHAR(100),
    localidad VARCHAR(100),
    direccion TEXT,
    codigo_postal VARCHAR(5),
    ubicacion_geo GEOGRAPHY(Point, 4326),
    documentos_rutas TEXT[] NOT NULL DEFAULT '{}',
    estado_publicacion VARCHAR(20) NOT NULL DEFAULT 'borrador',
    fecha_registro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_clinicas_correo_acceso UNIQUE (correo_acceso),
    CONSTRAINT chk_clinicas_tipo_institucion CHECK (
        tipo_institucion IS NULL OR tipo_institucion IN ('publica', 'privada', 'ong', 'otra')
    ),
    CONSTRAINT chk_clinicas_estado_publicacion CHECK (
        estado_publicacion IN ('borrador', 'pendiente', 'aprobada', 'rechazada', 'suspendida')
    ),
    CONSTRAINT chk_clinicas_cuenta_panel CHECK (
        (correo_acceso IS NULL AND password_hash IS NULL) OR 
        (correo_acceso IS NOT NULL AND password_hash IS NOT NULL)
    ),
    CONSTRAINT chk_clinicas_hash_seguro CHECK (
        password_hash IS NULL OR LENGTH(password_hash) >= 50
    ),
    CONSTRAINT chk_clinicas_cp_formato CHECK (
        codigo_postal IS NULL OR codigo_postal ~ '^[0-9]{5}$'
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clinicas_correo_acceso_lower 
    ON clinicas (LOWER(TRIM(correo_acceso))) 
    WHERE correo_acceso IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clinicas_ubicacion_geo 
    ON clinicas USING GIST (ubicacion_geo);

CREATE INDEX IF NOT EXISTS idx_clinicas_estado_publicacion 
    ON clinicas (estado_publicacion);

-- 5. TABLA: administradores (Administración central de PuntOax)
CREATE TABLE IF NOT EXISTS administradores (
    id_administrador UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(150) NOT NULL,
    correo VARCHAR(255) NOT NULL,
    password_hash TEXT NOT NULL,
    fecha_registro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_administradores_correo UNIQUE (correo),
    CONSTRAINT chk_administradores_hash_seguro CHECK (
        LENGTH(password_hash) >= 50
    ),
    CONSTRAINT chk_administradores_correo_formato CHECK (
        correo ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_administradores_correo_lower 
    ON administradores (LOWER(TRIM(correo)));

-- 6. TABLA: servicios (Catálogo general)
CREATE TABLE IF NOT EXISTS servicios (
    id_servicio UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(150) NOT NULL,
    descripcion TEXT,
    categoria VARCHAR(100),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    fecha_registro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_servicios_nombre UNIQUE (nombre)
);

CREATE INDEX IF NOT EXISTS idx_servicios_categoria_activo 
    ON servicios (categoria, activo);

-- 7. TABLA: clinicas_servicios (Relación N:M)
CREATE TABLE IF NOT EXISTS clinicas_servicios (
    id_clinica_servicio UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_clinica UUID NOT NULL REFERENCES clinicas(id_clinica) ON DELETE CASCADE,
    id_servicio UUID NOT NULL REFERENCES servicios(id_servicio) ON DELETE RESTRICT,
    costo NUMERIC(10,2),
    requisitos TEXT,
    requiere_cita BOOLEAN NOT NULL DEFAULT TRUE,
    activo BOOLEAN NOT NULL DEFAULT TRUE,

    CONSTRAINT uq_clinicas_servicios_par UNIQUE (id_clinica, id_servicio),
    CONSTRAINT chk_clinicas_servicios_costo CHECK (costo IS NULL OR costo >= 0)
);

CREATE INDEX IF NOT EXISTS idx_clinicas_servicios_clinica 
    ON clinicas_servicios (id_clinica);

CREATE INDEX IF NOT EXISTS idx_clinicas_servicios_servicio 
    ON clinicas_servicios (id_servicio);

-- 8. TABLA: horarios_atencion (Franjas horarias semanales)
CREATE TABLE IF NOT EXISTS horarios_atencion (
    id_horario UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_clinica UUID NOT NULL REFERENCES clinicas(id_clinica) ON DELETE CASCADE,
    dia_semana SMALLINT NOT NULL,
    hora_apertura TIME NOT NULL,
    hora_cierre TIME NOT NULL,

    CONSTRAINT uq_horarios_clinica_dia_intervalo UNIQUE (id_clinica, dia_semana, hora_apertura, hora_cierre),
    CONSTRAINT chk_horarios_dia_semana CHECK (dia_semana BETWEEN 0 AND 6),
    CONSTRAINT chk_horarios_intervalo CHECK (hora_apertura < hora_cierre)
);

CREATE INDEX IF NOT EXISTS idx_horarios_clinica_dia 
    ON horarios_atencion (id_clinica, dia_semana);

-- 9. TABLA: espacios_disponibles (Turnos de 1 hora)
CREATE TABLE IF NOT EXISTS espacios_disponibles (
    id_espacio UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_clinica_servicio UUID NOT NULL REFERENCES clinicas_servicios(id_clinica_servicio) ON DELETE CASCADE,
    fecha_hora_inicio TIMESTAMPTZ NOT NULL,
    habilitado BOOLEAN NOT NULL DEFAULT TRUE,

    CONSTRAINT uq_espacios_servicio_inicio UNIQUE (id_clinica_servicio, fecha_hora_inicio)
);

CREATE INDEX IF NOT EXISTS idx_espacios_servicio_fecha 
    ON espacios_disponibles (id_clinica_servicio, fecha_hora_inicio);

-- 10. TABLA: citas (Reservas automáticas con índice único parcial)
CREATE TABLE IF NOT EXISTS citas (
    id_cita UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_usuario UUID NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
    id_espacio UUID NOT NULL REFERENCES espacios_disponibles(id_espacio) ON DELETE RESTRICT,
    estado VARCHAR(20) NOT NULL DEFAULT 'confirmada',
    fecha_reserva TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_citas_estado CHECK (
        estado IN ('confirmada', 'cancelada', 'completada', 'no_asistio')
    )
);

-- Regla de negocio crítica: Máximo una cita no cancelada por espacio
CREATE UNIQUE INDEX IF NOT EXISTS uq_citas_espacio_activa 
    ON citas (id_espacio) 
    WHERE estado <> 'cancelada';

CREATE INDEX IF NOT EXISTS idx_citas_usuario 
    ON citas (id_usuario);

-- 11. TABLA: solicitudes_clinicas (Postulación institucional)
CREATE TABLE IF NOT EXISTS solicitudes_clinicas (
    id_solicitud UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_clinica UUID NOT NULL REFERENCES clinicas(id_clinica) ON DELETE CASCADE,
    estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
    fecha_solicitud TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    observaciones TEXT,

    CONSTRAINT chk_solicitudes_estado CHECK (
        estado IN ('pendiente', 'aprobada', 'rechazada')
    )
);

CREATE INDEX IF NOT EXISTS idx_solicitudes_clinica_estado 
    ON solicitudes_clinicas (id_clinica, estado);

-- Registrar versión de migración 001
INSERT INTO schema_migrations (version, nombre)
VALUES ('001', '001_create_schema_puntoax_v1_3')
ON CONFLICT (version) DO NOTHING;


-- ============================================================================
-- DATOS SEMILLA INICIALES (SEEDS)
-- ============================================================================

DO $$
DECLARE
    v_admin_id UUID;
    v_usuario1_id UUID;
    v_usuario2_id UUID;
    v_clinica_valdivieso_id UUID;
    v_clinica_csu1_id UUID;
    v_clinica_cessa_id UUID;
    v_clinica_pendiente_id UUID;
    v_srv_reproductiva_id UUID;
    v_srv_its_id UUID;
    v_srv_anticoncepcion_id UUID;
    v_srv_ile_id UUID;
    v_srv_citologia_id UUID;
    v_cs_valdivieso_its UUID;
    v_espacio_id UUID;
BEGIN
    -- 1. Administrador Central PuntOax (Clave: AdminPuntOax2026!)
    INSERT INTO administradores (
        nombre,
        correo,
        password_hash
    ) VALUES (
        'Administrador Central PuntOax',
        'admin@puntoax.oaxaca.gob.mx',
        '$2b$10$wbfkEGy.XL9ytb3G6.ty9OF47mNSX6qAZ6pUuhkjKslap7j7IbCxG'
    )
    ON CONFLICT (correo) DO UPDATE SET nombre = EXCLUDED.nombre
    RETURNING id_administrador INTO v_admin_id;

    -- 2. Usuarios
    -- Clave: UsuarioDemo2026!
    INSERT INTO usuarios (
        nombre,
        apellidos,
        correo,
        password_hash,
        telefono
    ) VALUES (
        'María',
        'González Pérez',
        'maria.gonzalez@example.com',
        '$2b$10$v31zR66IAloV/9la8leKF.xn37WwL9Ld9dptC4wTdVdJg5XTVCjZG',
        '9511234567'
    )
    ON CONFLICT (correo) DO UPDATE SET nombre = EXCLUDED.nombre
    RETURNING id_usuario INTO v_usuario1_id;

    INSERT INTO usuarios (
        nombre,
        apellidos,
        correo,
        password_hash,
        google_sub,
        telefono
    ) VALUES (
        'Carlos',
        'Ramírez Ortiz',
        'carlos.ramirez@example.com',
        NULL,
        'google_sub_oauth2_1048291048201',
        '9519876543'
    )
    ON CONFLICT (correo) DO UPDATE SET nombre = EXCLUDED.nombre
    RETURNING id_usuario INTO v_usuario2_id;

    -- 3. Catálogo de Servicios
    INSERT INTO servicios (nombre, descripcion, categoria, activo)
    VALUES (
        'Prueba Rápida de VIH y Sífilis',
        'Detección oportuna confidencial y gratuita con entrega de resultados en 20 minutos y consejería profesional.',
        'ITS y Prevención',
        TRUE
    )
    ON CONFLICT (nombre) DO UPDATE SET descripcion = EXCLUDED.descripcion
    RETURNING id_servicio INTO v_srv_its_id;

    INSERT INTO servicios (nombre, descripcion, categoria, activo)
    VALUES (
        'Consulta de Salud Sexual y Reproductiva',
        'Evaluación médica integral, orientación sobre vida sexual saludable y resolución de dudas clínicas.',
        'Salud Sexual y Reproductiva',
        TRUE
    )
    ON CONFLICT (nombre) DO UPDATE SET descripcion = EXCLUDED.descripcion
    RETURNING id_servicio INTO v_srv_reproductiva_id;

    INSERT INTO servicios (nombre, descripcion, categoria, activo)
    VALUES (
        'Orientación y Dotación de Anticonceptivos',
        'Consejería médica profesional y entrega de métodos anticonceptivos reversibles de corta y larga duración.',
        'Planificación Familiar',
        TRUE
    )
    ON CONFLICT (nombre) DO UPDATE SET descripcion = EXCLUDED.descripcion
    RETURNING id_servicio INTO v_srv_anticoncepcion_id;

    INSERT INTO servicios (nombre, descripcion, categoria, activo)
    VALUES (
        'Atención para Interrupción Legal del Embarazo (ILE)',
        'Acompañamiento médico cálido, seguro y confidencial conforme al marco legal vigente en el Estado de Oaxaca.',
        'Salud Sexual y Reproductiva',
        TRUE
    )
    ON CONFLICT (nombre) DO UPDATE SET descripcion = EXCLUDED.descripcion
    RETURNING id_servicio INTO v_srv_ile_id;

    INSERT INTO servicios (nombre, descripcion, categoria, activo)
    VALUES (
        'Detección Oportuna de Cáncer Cervicouterino (Papanicolaou)',
        'Tamizaje citológico cervical para la prevención y diagnóstico oportuno de lesiones premalignas.',
        'Salud Preventiva',
        TRUE
    )
    ON CONFLICT (nombre) DO UPDATE SET descripcion = EXCLUDED.descripcion
    RETURNING id_servicio INTO v_srv_citologia_id;

    -- 4. Clínicas
    -- Hospital Dr. Aurelio Valdivieso (Clave panel: Valdivieso2026!)
    INSERT INTO clinicas (
        nombre,
        correo_acceso,
        password_hash,
        descripcion,
        tipo_institucion,
        telefono,
        correo_contacto,
        sitio_web,
        municipio,
        localidad,
        direccion,
        codigo_postal,
        ubicacion_geo,
        documentos_rutas,
        estado_publicacion
    ) VALUES (
        'Hospital General Dr. Aurelio Valdivieso',
        'valdivieso@salud.oaxaca.gob.mx',
        '$2b$10$FbTKm1bdMGYV0eBhWgAaXe3pcBHkcSwnTd1.E3lrKnsYqwNty87Bu',
        'Hospital de referencia con atención médica general, ginecológica y módulo de salud sexual y reproductiva.',
        'publica',
        '9515151200',
        'contacto@valdivieso.oaxaca.gob.mx',
        'https://www.oaxaca.gob.mx/salud/',
        'Oaxaca de Juárez',
        'Colonia Reforma',
        'Calzada Porfirio Díaz s/n, Reforma',
        '68050',
        ST_SetSRID(ST_MakePoint(-96.7212, 17.0792), 4326)::geography,
        ARRAY['/storage/clinicas/valdivieso_acreditacion_clues.pdf'],
        'aprobada'
    )
    ON CONFLICT (correo_acceso) DO UPDATE SET nombre = EXCLUDED.nombre
    RETURNING id_clinica INTO v_clinica_valdivieso_id;

    -- Centro de Salud Urbano No. 1
    INSERT INTO clinicas (
        nombre,
        correo_acceso,
        password_hash,
        descripcion,
        tipo_institucion,
        telefono,
        correo_contacto,
        sitio_web,
        municipio,
        localidad,
        direccion,
        codigo_postal,
        ubicacion_geo,
        documentos_rutas,
        estado_publicacion
    ) VALUES (
        'Centro de Salud Urbano No. 1',
        NULL,
        NULL,
        'Consulta de primer contacto, medicina preventiva, vacunación y detección oportuna de ITS en el centro histórico.',
        'publica',
        '9515162345',
        'csu1@salud-oaxaca.gob.mx',
        'https://www.oaxaca.gob.mx/salud/',
        'Oaxaca de Juárez',
        'Centro Histórico',
        'Calle Mina 310, Centro',
        '68000',
        ST_SetSRID(ST_MakePoint(-96.7265, 17.0573), 4326)::geography,
        '{}',
        'aprobada'
    )
    RETURNING id_clinica INTO v_clinica_csu1_id;

    -- CESSA Tlalixtac
    INSERT INTO clinicas (
        nombre,
        correo_acceso,
        password_hash,
        descripcion,
        tipo_institucion,
        telefono,
        correo_contacto,
        sitio_web,
        municipio,
        localidad,
        direccion,
        codigo_postal,
        ubicacion_geo,
        documentos_rutas,
        estado_publicacion
    ) VALUES (
        'Centro de Salud con Servicios Ampliados (CESSA) Tlalixtac',
        NULL,
        NULL,
        'Servicios ampliados de consulta externa, laboratorio básico y atención de salud sexual para valles centrales.',
        'publica',
        '9515218011',
        'cessa.tlalixtac@imssbienestar.gob.mx',
        'https://imssbienestar.gob.mx/',
        'Tlalixtac de Cabrera',
        'Tlalixtac',
        'Av. Ferrocarril s/n',
        '68270',
        ST_SetSRID(ST_MakePoint(-96.6543, 17.0664), 4326)::geography,
        '{}',
        'aprobada'
    )
    RETURNING id_clinica INTO v_clinica_cessa_id;

    -- Clínica Comunitaria Huaxyacac (Pendiente de revisión administrativa)
    INSERT INTO clinicas (
        nombre,
        correo_acceso,
        password_hash,
        descripcion,
        tipo_institucion,
        telefono,
        correo_contacto,
        municipio,
        localidad,
        direccion,
        codigo_postal,
        ubicacion_geo,
        documentos_rutas,
        estado_publicacion
    ) VALUES (
        'Clínica Comunitaria Huaxyacac AC',
        'contacto@huaxyacac-salud.org',
        '$2b$10$FbTKm1bdMGYV0eBhWgAaXe3pcBHkcSwnTd1.E3lrKnsYqwNty87Bu',
        'Organización comunitaria enfocada en salud sexual y acompañamiento en derechos reproductivos.',
        'ong',
        '9513334455',
        'informes@huaxyacac-salud.org',
        'Oaxaca de Juárez',
        'Barrio de Jalatlaco',
        'Calle Aldama 104, Jalatlaco',
        '68080',
        ST_SetSRID(ST_MakePoint(-96.7150, 17.0650), 4326)::geography,
        ARRAY['/documentos_privados/solicitudes/huaxyacac_acta_constitutiva.pdf'],
        'pendiente'
    )
    ON CONFLICT (correo_acceso) DO UPDATE SET nombre = EXCLUDED.nombre
    RETURNING id_clinica INTO v_clinica_pendiente_id;

    -- 5. Solicitud de Postulación para Clínica Huaxyacac
    INSERT INTO solicitudes_clinicas (
        id_clinica,
        estado,
        observaciones
    ) VALUES (
        v_clinica_pendiente_id,
        'pendiente',
        'Postulación comunitaria enviada con aviso COFEPRIS y acta constitutiva.'
    );

    -- 6. Servicios del Hospital Valdivieso
    INSERT INTO clinicas_servicios (
        id_clinica,
        id_servicio,
        costo,
        requisitos,
        requiere_cita,
        activo
    ) VALUES (
        v_clinica_valdivieso_id,
        v_srv_its_id,
        0.00,
        'Presentar identificación oficial (INE) y CURP.',
        TRUE,
        TRUE
    )
    ON CONFLICT (id_clinica, id_servicio) DO UPDATE SET requisitos = EXCLUDED.requisitos
    RETURNING id_clinica_servicio INTO v_cs_valdivieso_its;

    INSERT INTO clinicas_servicios (
        id_clinica,
        id_servicio,
        costo,
        requisitos,
        requiere_cita,
        activo
    ) VALUES (
        v_clinica_valdivieso_id,
        v_srv_reproductiva_id,
        0.00,
        'Identificación oficial y carnet de salud.',
        TRUE,
        TRUE
    )
    ON CONFLICT (id_clinica, id_servicio) DO NOTHING;

    -- 7. Horarios de Atención del Hospital Valdivieso (Lunes a Viernes 08:00 a 14:00)
    FOR dia IN 1..5 LOOP
        INSERT INTO horarios_atencion (
            id_clinica,
            dia_semana,
            hora_apertura,
            hora_cierre
        ) VALUES (
            v_clinica_valdivieso_id,
            dia,
            '08:00:00'::TIME,
            '14:00:00'::TIME
        )
        ON CONFLICT (id_clinica, dia_semana, hora_apertura, hora_cierre) DO NOTHING;
    END LOOP;

    -- 8. Espacio Disponible de Prueba
    INSERT INTO espacios_disponibles (
        id_clinica_servicio,
        fecha_hora_inicio,
        habilitado
    ) VALUES (
        v_cs_valdivieso_its,
        CURRENT_DATE + INTERVAL '1 day' + TIME '09:00:00',
        TRUE
    )
    ON CONFLICT (id_clinica_servicio, fecha_hora_inicio) DO UPDATE SET habilitado = EXCLUDED.habilitado
    RETURNING id_espacio INTO v_espacio_id;

    -- 9. Cita Agendada de Prueba
    INSERT INTO citas (
        id_usuario,
        id_espacio,
        estado
    ) VALUES (
        v_usuario1_id,
        v_espacio_id,
        'confirmada'
    )
    ON CONFLICT DO NOTHING;

END $$;

-- Registrar versión de migración 002
INSERT INTO schema_migrations (version, nombre)
VALUES ('002', '002_seed_initial_data')
ON CONFLICT (version) DO NOTHING;
