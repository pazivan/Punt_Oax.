-- Incorpora estado activo/inactivo en usuarios para desactivar cuentas sin eliminar registros históricos.
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_usuarios_activo
  ON usuarios (activo);
