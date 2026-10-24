-- ============================================================================
-- MIGRACIÓN 001 (DOWN / REVERSIÓN): Modelo de Datos PuntOax v1.3
-- Procedimiento de rollback ordenado por dependencias inversas
-- ============================================================================

-- 1. Eliminar tablas dependientes (hojas del árbol de dependencias)
DROP TABLE IF EXISTS citas CASCADE;
DROP TABLE IF EXISTS espacios_disponibles CASCADE;
DROP TABLE IF EXISTS clinicas_servicios CASCADE;
DROP TABLE IF EXISTS horarios_atencion CASCADE;
DROP TABLE IF EXISTS solicitudes_clinicas CASCADE;

-- 2. Eliminar tablas base de entidades y cuentas
DROP TABLE IF EXISTS servicios CASCADE;
DROP TABLE IF EXISTS administradores CASCADE;
DROP TABLE IF EXISTS clinicas CASCADE;
DROP TABLE IF EXISTS usuarios CASCADE;

-- 3. Nota: No se eliminan las extensiones ("postgis", "pgcrypto", "uuid-ossp")
-- ni la tabla schema_migrations automáticamente para preservar la infraestructura de BD.
