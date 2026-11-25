-- Sesiones activas en servidor para control de expiración por inactividad,
-- duración absoluta máxima y revocación efectiva (PuntOax).
CREATE TABLE IF NOT EXISTS sesiones_activas (
  jti UUID PRIMARY KEY,
  rol VARCHAR(20) NOT NULL CHECK (rol IN ('usuario', 'clinica', 'administrador')),
  cuenta_id UUID NOT NULL,
  version_sesion INTEGER NOT NULL DEFAULT 0,
  creada_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ultima_actividad_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expira_absoluta_en TIMESTAMPTZ NOT NULL,
  revocada_en TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_sesiones_activas_cuenta
  ON sesiones_activas (rol, cuenta_id)
  WHERE revocada_en IS NULL;

CREATE INDEX IF NOT EXISTS idx_sesiones_activas_expira
  ON sesiones_activas (expira_absoluta_en)
  WHERE revocada_en IS NULL;
