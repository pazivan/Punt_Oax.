// Matching conservador: nunca unir únicamente por nombre, cercanía o ID de hoja.
function normalizar(valor) {
  return String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function origen(valor) {
  return normalizar(String(valor || '').replace(/\.0$/, ''));
}

function domicilio(valor) {
  // Diferencias tipográficas, no correcciones de números ni de calles.
  return normalizar(valor)
    .replace(/\bcalz\b/g, 'calzada').replace(/\bav\b/g, 'avenida')
    .replace(/\bcol\b/g, 'colonia').replace(/\b(no|numero|calle)\b/g, '')
    .replace(/\s+/g, ' ').trim();
}

function claves(fila) {
  return new Set([fila.clues, ...(fila.fuente_origen || '').match(/\b[A-Z]{5}\d{6}\b/g) || []].filter(Boolean));
}

function resolverIdentidad(filas, datos) {
  const direcciones = [datos.direccion, datos.direccion_identidad].map(domicilio).filter(Boolean);
  const coincideDomicilio = (f) => {
    if (f.direccion && direcciones.includes(domicilio(f.direccion))) return true;
    // Permite cambiar la presentación (p. ej. retirar un CP pendiente) si
    // la fuente sigue siendo la misma y el domicilio guardado no fue editado.
    const revision = f.revision_catalogo;
    return Boolean(revision?.direccion_publicada &&
      domicilio(f.direccion) === domicilio(revision.direccion_publicada) &&
      domicilio(revision.direccion_identidad) === domicilio(datos.direccion_identidad));
  };
  const candidatos = filas.filter((f) => {
    if (claves(f).has(datos.clues)) return true;
    if (datos.id_origen && origen(f.id_origen) === origen(datos.id_origen)) return true;
    if (normalizar(f.municipio) !== normalizar(datos.municipio)) return false;
    const a = normalizar(f.nombre), b = normalizar(datos.nombre);
    // Un nombre abreviado también exige revisión antes de crear otra sede.
    return a === b || (a.length > 20 && b.length > 20 && (a.includes(b) || b.includes(a))) ||
      coincideDomicilio(f);
  });
  if (!candidatos.length) return null;
  if (candidatos.length > 1) return { ambiguo: true, motivo: 'varias clínicas candidatas por ID/CLUES/nombre/domicilio' };
  const fila = candidatos[0];
  const existentes = claves(fila);
  if ((fila.clues && fila.clues !== datos.clues) || (existentes.size && !existentes.has(datos.clues))) {
    return { ambiguo: true, motivo: 'CLUES de la unidad existente difiere de la auditoría' };
  }
  if (!coincideDomicilio(fila) || normalizar(fila.municipio) !== normalizar(datos.municipio)) {
    return { ambiguo: true, motivo: 'domicilio/municipio no coinciden; revisar la identidad antes de combinar' };
  }
  const mismaClave = existentes.has(datos.clues);
  const mismoOrigen = datos.id_origen && origen(fila.id_origen) === origen(datos.id_origen);
  const mismoNombre = normalizar(fila.nombre) === normalizar(datos.nombre);
  if (!mismaClave && !mismoOrigen && !mismoNombre) {
    return { ambiguo: true, motivo: 'domicilio compartido sin identidad suficiente' };
  }
  if (!mismaClave && fila.id_origen && !mismoOrigen) {
    return { ambiguo: true, motivo: 'otro ID de origen sin CLUES que confirme la identidad' };
  }
  return { fila, tipo: mismaClave ? 'CLUES + domicilio' : mismoOrigen ? 'ID + domicilio' : 'nombre + domicilio' };
}

module.exports = { resolverIdentidad };
