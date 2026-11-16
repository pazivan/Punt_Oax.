-- CLUES identifica la unidad; id_origen sigue representando exclusivamente la hoja.
ALTER TABLE clinicas
    ADD COLUMN clues VARCHAR(11) UNIQUE CHECK (clues ~ '^[A-Z]{5}[0-9]{6}$'),
    ADD COLUMN revision_catalogo JSONB;
COMMENT ON COLUMN clinicas.revision_catalogo IS
    'Trazabilidad interna del catálogo y campos omitidos en API pública; no altera agenda ni relaciones.';
