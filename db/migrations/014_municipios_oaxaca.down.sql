-- No descartar la auditoría ni restaurar textos sobre ediciones posteriores automáticamente.
DO $$ BEGIN
  RAISE EXCEPTION 'Reversión manual requerida: conservar migracion_municipios_reporte y respaldar la BD.';
END $$;
