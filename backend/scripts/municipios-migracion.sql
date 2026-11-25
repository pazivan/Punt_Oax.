-- Generado por backend/scripts/generar-migracion-municipios.js. Editar la plantilla.
CREATE TABLE municipios (
  cvegeo varchar(5) PRIMARY KEY CHECK (cvegeo ~ '^20[0-9]{3}$'),
  cve_ent varchar(2) NOT NULL CHECK (cve_ent = '20'),
  cve_mun varchar(3) NOT NULL CHECK (cve_mun ~ '^[0-9]{3}$'),
  nombre varchar(100) NOT NULL,
  fuente text NOT NULL,
  obtenido_en timestamptz NOT NULL,
  UNIQUE(cve_ent, cve_mun),
  CHECK (cvegeo = cve_ent || cve_mun)
);
INSERT INTO municipios (cvegeo, cve_ent, cve_mun, nombre, fuente, obtenido_en) VALUES
-- CATALOGO_GENERADO

CREATE FUNCTION normalizar_municipio(text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT lower(regexp_replace(trim(translate($1,
    'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')), '\s+', ' ', 'g'));
$$;

ALTER TABLE clinicas ADD COLUMN municipio_clave varchar(5) REFERENCES municipios(cvegeo);
CREATE INDEX idx_clinicas_municipio_clave ON clinicas(municipio_clave);

CREATE FUNCTION municipio_por_nombre(text) RETURNS varchar
LANGUAGE sql STABLE STRICT AS $$
  SELECT min(cvegeo) FROM municipios
  WHERE normalizar_municipio(nombre) = normalizar_municipio($1)
  HAVING count(*) = 1;
$$;

CREATE TABLE municipios_equivalencias (
  variante text PRIMARY KEY,
  cvegeo varchar(5) NOT NULL REFERENCES municipios(cvegeo),
  motivo text NOT NULL
);
INSERT INTO municipios_equivalencias(variante, cvegeo, motivo) VALUES
-- EQUIVALENCIAS_GENERADAS

-- Auditoría persistente: conserva exactamente el texto anterior, incluidos los no resueltos.
CREATE TABLE migracion_municipios_reporte (
  id_clinica uuid PRIMARY KEY REFERENCES clinicas(id_clinica),
  municipio_original text,
  municipio_clave varchar(5) REFERENCES municipios(cvegeo),
  resultado text NOT NULL,
  registrado_en timestamptz NOT NULL DEFAULT now()
);
INSERT INTO migracion_municipios_reporte(id_clinica, municipio_original, municipio_clave, resultado)
SELECT c.id_clinica, c.municipio, min(m.cvegeo),
       CASE WHEN count(m.cvegeo) = 1 THEN 'coincidencia_normalizada' ELSE 'requiere_revision' END
FROM clinicas c LEFT JOIN municipios m
  ON normalizar_municipio(c.municipio) = normalizar_municipio(m.nombre)
GROUP BY c.id_clinica, c.municipio;
UPDATE migracion_municipios_reporte SET municipio_clave = NULL WHERE resultado = 'requiere_revision';
UPDATE migracion_municipios_reporte r SET municipio_clave = e.cvegeo, resultado = 'equivalencia_documentada'
FROM municipios_equivalencias e
WHERE r.resultado = 'requiere_revision'
  AND normalizar_municipio(r.municipio_original) = normalizar_municipio(e.variante);
UPDATE clinicas c SET municipio_clave = r.municipio_clave, municipio = m.nombre
FROM migracion_municipios_reporte r JOIN municipios m ON m.cvegeo = r.municipio_clave
WHERE c.id_clinica = r.id_clinica;

-- Compatibilidad progresiva: los endpoints antiguos pueden enviar el nombre oficial;
-- las nuevas integraciones pueden enviar la clave. Ambos siempre quedan sincronizados.
CREATE FUNCTION validar_municipio_clinica() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE oficial municipios%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.municipio IS NOT DISTINCT FROM OLD.municipio
     AND NEW.municipio_clave IS NOT DISTINCT FROM OLD.municipio_clave THEN
    RETURN NEW; -- No bloquear contactos/citas de centros heredados no conciliados.
  END IF;
  IF TG_OP = 'INSERT' AND NEW.municipio IS NULL AND NEW.municipio_clave IS NULL
     AND NEW.estado_publicacion = 'borrador' THEN
    RETURN NEW; -- Registro de identidad previo a completar la ficha.
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.municipio IS DISTINCT FROM OLD.municipio
     AND NEW.municipio_clave IS NOT DISTINCT FROM OLD.municipio_clave THEN
    SELECT * INTO oficial FROM municipios WHERE cvegeo = municipio_por_nombre(NEW.municipio);
  ELSIF NEW.municipio_clave IS NOT NULL THEN
    SELECT * INTO oficial FROM municipios WHERE cvegeo = NEW.municipio_clave;
    IF NEW.municipio IS NOT NULL AND
       (TG_OP = 'INSERT' OR NEW.municipio IS DISTINCT FROM OLD.municipio) AND
       normalizar_municipio(NEW.municipio) IS DISTINCT FROM normalizar_municipio(oficial.nombre) THEN
      RAISE EXCEPTION 'Municipio y clave no coinciden' USING ERRCODE = '23514';
    END IF;
  ELSE
    SELECT * INTO oficial FROM municipios WHERE cvegeo = municipio_por_nombre(NEW.municipio);
  END IF;
  IF oficial.cvegeo IS NULL THEN
    RAISE EXCEPTION 'Selecciona un municipio oficial de Oaxaca' USING ERRCODE = '23514';
  END IF;
  NEW.municipio_clave := oficial.cvegeo;
  NEW.municipio := oficial.nombre;
  RETURN NEW;
END;
$$;
CREATE TRIGGER clinicas_municipio_oficial BEFORE INSERT OR UPDATE OF municipio, municipio_clave
ON clinicas FOR EACH ROW EXECUTE FUNCTION validar_municipio_clinica();
