-- Incremental: el esquema 001 ya contemplaba Google. No recrear usuarios ni citas.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255);
ALTER TABLE usuarios ALTER COLUMN password_hash DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_google_identidad ON usuarios (google_sub);
-- No imponer un formato nuevo a google_sub: es opaco y hay datos demo heredados.

-- Solo hashes de secretos; compartido entre procesos y resistente a reintentos.
CREATE TABLE desafios_google (
  id_hash TEXT PRIMARY KEY,
  navegador_hash TEXT NOT NULL,
  csrf_hash TEXT NOT NULL,
  nonce_hash TEXT,
  tipo TEXT NOT NULL CHECK (tipo IN ('acceso', 'vinculacion')),
  usuario_id UUID REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
  google_sub VARCHAR(255),
  correo VARCHAR(255),
  version_sesion INTEGER,
  vence_en TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '5 minutes'),
  CHECK ((tipo = 'acceso' AND nonce_hash IS NOT NULL) OR
         (tipo = 'vinculacion' AND usuario_id IS NOT NULL AND google_sub IS NOT NULL))
);
CREATE INDEX idx_desafios_google_vencimiento ON desafios_google (vence_en);
