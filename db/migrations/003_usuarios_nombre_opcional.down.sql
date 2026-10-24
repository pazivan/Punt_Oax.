-- Solo se puede revertir si no existen usuarios sin nombre.
-- No completar nombres con valores ficticios ni borrar cuentas.
ALTER TABLE usuarios ALTER COLUMN nombre SET NOT NULL;
