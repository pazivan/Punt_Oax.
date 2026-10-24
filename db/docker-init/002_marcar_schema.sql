-- El esquema fue creado con 001_schema.sql; no cargar datos de demostración.
INSERT INTO schema_migrations (version, nombre)
VALUES ('001', '001_create_schema_puntoax_v1_3')
ON CONFLICT (version) DO NOTHING;
