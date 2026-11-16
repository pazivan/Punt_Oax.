// La auditoría permanece en BD. La API pública no expone valores pendientes,
// ni siquiera si una sede ya tenía teléfono u horarios antes de la importación.
function fichaPublica(ficha) {
  const { revision_catalogo: revision, ...publica } = ficha;
  if (!revision) return publica;
  for (const campo of revision.campos_no_publicar || []) {
    if (['telefono', 'correo_contacto', 'codigo_postal'].includes(campo)) publica[campo] = null;
    if (campo === 'horario') {
      publica.horario = null;
      publica.horarios = [];
      if ('modalidad_horario' in publica) publica.modalidad_horario = null;
    }
  }
  // Las notas internas pueden contener el teléfono/horario descartado.
  publica.datos_por_confirmar = null;
  return publica;
}

module.exports = { fichaPublica };
