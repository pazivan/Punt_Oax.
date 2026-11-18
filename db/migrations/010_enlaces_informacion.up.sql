ALTER TABLE clinicas
  ADD COLUMN enlaces_informacion JSONB NOT NULL DEFAULT '[]'::jsonb
  CONSTRAINT chk_clinicas_enlaces_informacion_array CHECK (jsonb_typeof(enlaces_informacion) = 'array');
