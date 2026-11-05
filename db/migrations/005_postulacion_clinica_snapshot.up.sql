-- 005: postulación de la ficha institucional (flujo separado de registro).
-- Reutiliza solicitudes_clinicas; no crea tablas paralelas.
-- datos_ficha conserva una copia de la ficha y documentos revisados en el
-- momento de postular, para que una edición posterior no altere la revisión.

ALTER TABLE solicitudes_clinicas
    ADD COLUMN datos_ficha JSONB;

-- Impide dos postulaciones pendientes simultáneas para la misma clínica.
-- Los estados aprobada/rechazada quedan disponibles para el Sprint siguiente.
CREATE UNIQUE INDEX uq_solicitudes_clinicas_pendiente
    ON solicitudes_clinicas (id_clinica)
    WHERE estado = 'pendiente';
