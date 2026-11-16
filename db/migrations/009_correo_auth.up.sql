-- Las cuentas existentes conservan su acceso; los registros nuevos deben verificar.
ALTER TABLE usuarios ADD COLUMN correo_verificado_en TIMESTAMPTZ DEFAULT now(), ADD COLUMN version_sesion INTEGER NOT NULL DEFAULT 0;
ALTER TABLE clinicas ADD COLUMN correo_verificado_en TIMESTAMPTZ DEFAULT now(), ADD COLUMN version_sesion INTEGER NOT NULL DEFAULT 0;
ALTER TABLE administradores ADD COLUMN version_sesion INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usuarios ALTER COLUMN correo_verificado_en DROP DEFAULT;
ALTER TABLE clinicas ALTER COLUMN correo_verificado_en DROP DEFAULT;

CREATE TABLE desafios_correo (
  rol VARCHAR(20) NOT NULL CHECK (rol IN ('usuario','clinica','administrador')),
  cuenta_id UUID NOT NULL,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('verificacion','recuperacion')),
  secreto_hash TEXT NOT NULL,
  vence_en TIMESTAMPTZ NOT NULL,
  intentos INTEGER NOT NULL DEFAULT 0,
  envios INTEGER NOT NULL DEFAULT 1,
  ventana_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_envio TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (rol, cuenta_id, tipo)
);
CREATE TABLE limites_correo (
  clave TEXT PRIMARY KEY,
  ventana_en TIMESTAMPTZ NOT NULL,
  cantidad INTEGER NOT NULL
);
