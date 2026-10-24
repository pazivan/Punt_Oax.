-- ============================================================================
-- MIGRACIÓN 001 (UP): Modelo de Datos PuntOax v1.3
-- PostgreSQL + PostGIS | 9 Tablas Normalizadas + Control de Migraciones
-- Roles: Público (sin auth), Usuario (citas), Clínica (panel sede), Administrador (central)
-- ============================================================================

-- 1. Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- 2. Tabla para control interno de migraciones (schema_migrations)
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(50) PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    aplicada_en TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabla: usuarios (Personas que agendan citas)
-- Autenticación vía contraseña segura (hash) o Google OAuth (google_sub)
CREATE TABLE IF NOT EXISTS usuarios (
    id_usuario UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(100),
    apellidos VARCHAR(150),
    correo VARCHAR(255) NOT NULL,
    password_hash TEXT,
    google_sub VARCHAR(255),
    telefono VARCHAR(20),
    fecha_registro TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Restricciones de integridad y autenticación
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

-- Índices optimizados para búsqueda de usuarios en login
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_correo_lower 
    ON usuarios (LOWER(TRIM(correo)));

-- 4. Tabla: clinicas (Sedes físicas y cuentas de acceso a panel institucional)
-- Representa tanto la entidad física como su propia cuenta; no existe usuarios_clinicas
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

    -- Restricciones
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

-- Índices para búsqueda geográfica, estado y login institucional
CREATE UNIQUE INDEX IF NOT EXISTS idx_clinicas_correo_acceso_lower 
    ON clinicas (LOWER(TRIM(correo_acceso))) 
    WHERE correo_acceso IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clinicas_ubicacion_geo 
    ON clinicas USING GIST (ubicacion_geo);

CREATE INDEX IF NOT EXISTS idx_clinicas_estado_publicacion 
    ON clinicas (estado_publicacion);

-- 5. Tabla: administradores (Administración central de PuntOax)
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

-- 6. Tabla: servicios (Catálogo general de servicios de salud)
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

-- 7. Tabla: clinicas_servicios (Relación N:M y condiciones por clínica)
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

-- 8. Tabla: horarios_atencion (Franjas horarias semanales por clínica)
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

-- 9. Tabla: espacios_disponibles (Turnos fijos de 1 hora por servicio de clínica)
CREATE TABLE IF NOT EXISTS espacios_disponibles (
    id_espacio UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_clinica_servicio UUID NOT NULL REFERENCES clinicas_servicios(id_clinica_servicio) ON DELETE CASCADE,
    fecha_hora_inicio TIMESTAMPTZ NOT NULL,
    habilitado BOOLEAN NOT NULL DEFAULT TRUE,

    CONSTRAINT uq_espacios_servicio_inicio UNIQUE (id_clinica_servicio, fecha_hora_inicio)
);

CREATE INDEX IF NOT EXISTS idx_espacios_servicio_fecha 
    ON espacios_disponibles (id_clinica_servicio, fecha_hora_inicio);

-- 10. Tabla: citas (Reservas realizadas por usuarios sobre un espacio disponible)
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

-- Regla de negocio crítica: Índice único parcial para evitar dobles citas en un mismo espacio
-- Si una cita es 'cancelada', el espacio se libera automáticamente para una nueva reserva
CREATE UNIQUE INDEX IF NOT EXISTS uq_citas_espacio_activa 
    ON citas (id_espacio) 
    WHERE estado <> 'cancelada';

CREATE INDEX IF NOT EXISTS idx_citas_usuario 
    ON citas (id_usuario);

-- 11. Tabla: solicitudes_clinicas (Postulaciones de clínicas para revisión del admin)
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
