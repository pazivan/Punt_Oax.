DROP TABLE IF EXISTS desafios_google;
DROP INDEX IF EXISTS idx_usuarios_google_identidad;
-- Conservar google_sub, su unicidad original y password_hash nullable:
-- pertenecen al esquema 001 y quitarlos dejaría sin acceso a cuentas existentes.
