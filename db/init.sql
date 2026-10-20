-- Habilitar extensión PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- Tabla clinicas
CREATE TABLE IF NOT EXISTS clinicas (
    id_clinica SERIAL PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    descripcion TEXT,
    requisitos_generales TEXT,
    tipo_institucion VARCHAR(100),
    telefono VARCHAR(50),
    correo_contacto VARCHAR(100),
    sitio_web VARCHAR(255),
    imagen_portada_url TEXT,
    estado_federativo VARCHAR(100) DEFAULT 'Oaxaca',
    municipio VARCHAR(100),
    localidad VARCHAR(100),
    direccion TEXT,
    codigo_postal VARCHAR(10),
    estado_publicacion VARCHAR(50) DEFAULT 'aprobada',
    ubicacion GEOMETRY(Point, 4326),
    creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Datos iniciales de prueba en Oaxaca
INSERT INTO clinicas (
    nombre,
    descripcion,
    requisitos_generales,
    tipo_institucion,
    telefono,
    correo_contacto,
    sitio_web,
    estado_federativo,
    municipio,
    localidad,
    direccion,
    codigo_postal,
    estado_publicacion,
    ubicacion
) VALUES
(
    'Hospital General Dr. Aurelio Valdivieso',
    'Atención médica general y de especialidades, urgencias 24/7 y servicios hospitalarios.',
    'Identificación oficial (INE), CURP y carnet de salud.',
    'Pública / Servicios de Salud de Oaxaca',
    '951 515 1200',
    'contacto@valdivieso.oaxaca.gob.mx',
    'https://www.oaxaca.gob.mx/salud/',
    'Oaxaca',
    'Oaxaca de Juárez',
    'Colonia Reforma',
    'Calzada Porfirio Díaz s/n, Reforma',
    '68050',
    'aprobada',
    ST_SetSRID(ST_MakePoint(-96.7212, 17.0792), 4326)
),
(
    'Centro de Salud Urbano No. 1',
    'Consulta médica de primer nivel, vacunación, control prenatal y medicina preventiva.',
    'CURP e INE vigente.',
    'Pública / SSA',
    '951 516 2345',
    'csu1@salud-oaxaca.gob.mx',
    'https://www.oaxaca.gob.mx/salud/',
    'Oaxaca',
    'Oaxaca de Juárez',
    'Centro Histórico',
    'Calle Mina 310, Centro',
    '68000',
    'aprobada',
    ST_SetSRID(ST_MakePoint(-96.7265, 17.0573), 4326)
),
(
    'Centro de Salud con Servicios Ampliados (CESSA) Tlalixtac',
    'Servicios ampliados de consulta externa, laboratorio básico y atención materno-infantil.',
    'Identificación oficial y comprobante de domicilio.',
    'Pública / IMSS-Bienestar',
    '951 521 8011',
    'cessa.tlalixtac@imssbienestar.gob.mx',
    'https://imssbienestar.gob.mx/',
    'Oaxaca',
    'Tlalixtac de Cabrera',
    'Tlalixtac',
    'Av. Ferrocarril s/n',
    '68270',
    'aprobada',
    ST_SetSRID(ST_MakePoint(-96.6543, 17.0664), 4326)
);
