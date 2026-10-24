-- ============================================================================
-- MIGRACIÓN 002 (DOWN / REVERSIÓN): Limpieza de Datos Semilla
-- Elimina los registros insertados en 002_seed_initial_data.up.sql
-- ============================================================================

DELETE FROM citas WHERE id_usuario IN (
    SELECT id_usuario FROM usuarios WHERE correo IN ('maria.gonzalez@example.com', 'carlos.ramirez@example.com')
);

DELETE FROM espacios_disponibles WHERE id_clinica_servicio IN (
    SELECT id_clinica_servicio FROM clinicas_servicios WHERE id_clinica IN (
        SELECT id_clinica FROM clinicas WHERE correo_acceso IN ('valdivieso@salud.oaxaca.gob.mx', 'contacto@huaxyacac-salud.org')
    )
);

DELETE FROM solicitudes_clinicas WHERE id_clinica IN (
    SELECT id_clinica FROM clinicas WHERE correo_acceso = 'contacto@huaxyacac-salud.org'
);

DELETE FROM horarios_atencion WHERE id_clinica IN (
    SELECT id_clinica FROM clinicas WHERE correo_acceso = 'valdivieso@salud.oaxaca.gob.mx'
);

DELETE FROM clinicas_servicios WHERE id_clinica IN (
    SELECT id_clinica FROM clinicas WHERE correo_acceso = 'valdivieso@salud.oaxaca.gob.mx'
);

DELETE FROM clinicas WHERE correo_acceso IN ('valdivieso@salud.oaxaca.gob.mx', 'contacto@huaxyacac-salud.org')
   OR nombre IN ('Centro de Salud Urbano No. 1', 'Centro de Salud con Servicios Ampliados (CESSA) Tlalixtac');

DELETE FROM servicios WHERE nombre IN (
    'Prueba Rápida de VIH y Sífilis',
    'Consulta de Salud Sexual y Reproductiva',
    'Orientación y Dotación de Anticonceptivos',
    'Atención para Interrupción Legal del Embarazo (ILE)',
    'Detección Oportuna de Cáncer Cervicouterino (Papanicolaou)'
);

DELETE FROM usuarios WHERE correo IN ('maria.gonzalez@example.com', 'carlos.ramirez@example.com');

DELETE FROM administradores WHERE correo = 'admin@puntoax.oaxaca.gob.mx';
