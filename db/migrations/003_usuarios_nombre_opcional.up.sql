-- Las bases que ya aplicaron la versión inicial con nombre obligatorio
-- deben admitir el registro progresivo sin inventar un nombre.
ALTER TABLE usuarios ALTER COLUMN nombre DROP NOT NULL;
