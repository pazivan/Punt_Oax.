-- La reversión se niega si ya hay instantáneas de postulación, porque
-- eliminarlas perdería la evidencia que revisaría un administrador.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM solicitudes_clinicas WHERE datos_ficha IS NOT NULL) THEN
        RAISE EXCEPTION 'Hay postulaciones con datos_ficha; revertir eliminaría información de revisión';
    END IF;
END $$;

DROP INDEX IF EXISTS uq_solicitudes_clinicas_pendiente;
ALTER TABLE solicitudes_clinicas DROP COLUMN datos_ficha;
