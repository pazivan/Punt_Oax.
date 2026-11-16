DROP TABLE IF EXISTS limites_correo;
DROP TABLE IF EXISTS desafios_correo;
ALTER TABLE administradores DROP COLUMN IF EXISTS version_sesion;
ALTER TABLE clinicas DROP COLUMN IF EXISTS version_sesion, DROP COLUMN IF EXISTS correo_verificado_en;
ALTER TABLE usuarios DROP COLUMN IF EXISTS version_sesion, DROP COLUMN IF EXISTS correo_verificado_en;
