-- Días cerrados por la clínica; las citas se conservan como historial cancelado.
CREATE TABLE clinicas_dias_bloqueados (
    id_clinica UUID NOT NULL REFERENCES clinicas(id_clinica) ON DELETE CASCADE,
    fecha DATE NOT NULL,
    motivo VARCHAR(200),
    PRIMARY KEY (id_clinica, fecha)
);
