-- ============================================================================
-- MIGRACIÓN 002 (UP): Datos Semilla (Seeds) para PuntOax v1.3
-- Incluye: Cuentas por rol con contraseñas cifradas en Bcrypt (cost 10),
-- Catálogo de servicios de Oaxaca, Clínicas con Geo PostGIS, Turnos y Citas
-- ============================================================================

DO $$
DECLARE
    -- Variables para llaves UUID
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

    -- 1. Administrador Inicial PuntOax
    -- Credencial: admin@puntoax.oaxaca.gob.mx | Clave: AdminPuntOax2026!
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

    -- 2. Usuarios / Pacientes Iniciales
    -- Usuario 1 (Autenticación nativa Correo + Hash)
    -- Credencial: maria.gonzalez@example.com | Clave: UsuarioDemo2026!
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

    -- Usuario 2 (Autenticación federada Google OAuth)
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

    -- 3. Catálogo General de Servicios
    INSERT INTO servicios (nombre, descripcion, categoria, activo)
    VALUES (
        'Prueba Rápida de VIH y Sífilis',
        'Detección oportuna confidencial y gratuita con entrega de resultados en 20 minutos y consejería pre y post prueba.',
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

    -- 4. Clínicas (Sedes físicas y cuentas)
    -- Clínica 1: Hospital General Dr. Aurelio Valdivieso (con cuenta panel institucional)
    -- Credencial: valdivieso@salud.oaxaca.gob.mx | Clave: Valdivieso2026!
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

    -- Clínica 2: Centro de Salud Urbano No. 1 (Dada de alta sin cuenta panel inicial)
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

    -- Clínica 3: CESSA Tlalixtac
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

    -- Clínica 4: Clínica Comunitaria Huaxyacac (Postulada en estado pendiente de aprobación)
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
        'Organización de la sociedad civil enfocada en salud sexual comunitaria y acompañamiento en derechos sexuales.',
        'ong',
        '9513334455',
        'informes@huaxyacac-salud.org',
        'Oaxaca de Juárez',
        'Barrio de Jalatlaco',
        'Calle Aldama 104, Jalatlaco',
        '68080',
        ST_SetSRID(ST_MakePoint(-96.7150, 17.0650), 4326)::geography,
        ARRAY['/documentos_privados/solicitudes/huaxyacac_acta_constitutiva.pdf', '/documentos_privados/solicitudes/huaxyacac_aviso_cofepris.pdf'],
        'pendiente'
    )
    ON CONFLICT (correo_acceso) DO UPDATE SET nombre = EXCLUDED.nombre
    RETURNING id_clinica INTO v_clinica_pendiente_id;

    -- 5. Solicitud de Postulación para la Clínica Huaxyacac
    INSERT INTO solicitudes_clinicas (
        id_clinica,
        estado,
        observaciones
    ) VALUES (
        v_clinica_pendiente_id,
        'pendiente',
        'Postulación comunitaria enviada con aviso de funcionamiento de COFEPRIS y acta constitutiva. En espera de validación administrativa.'
    );

    -- 6. Servicios ofrecidos por el Hospital Valdivieso
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
        'Presentar identificación oficial (INE o pasaporte), CURP impresa y presentarse con 15 minutos de anticipación.',
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
        'Identificación oficial y carnet de salud (si cuenta con él).',
        TRUE,
        TRUE
    )
    ON CONFLICT (id_clinica, id_servicio) DO NOTHING;

    -- 7. Horarios de Atención del Hospital Valdivieso (Lunes a Viernes de 08:00 a 14:00)
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

    -- 8. Espacio Disponible de Prueba (Turno de 1 hora)
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

    -- 9. Cita Agendada de Prueba (Confirmada para María González)
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
