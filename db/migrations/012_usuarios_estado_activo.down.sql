DROP INDEX IF EXISTS idx_usuarios_activo;
ALTER TABLE usuarios DROP COLUMN IF EXISTS activo;
