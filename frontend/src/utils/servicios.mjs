// El catálogo histórico usa ITS/ILE; los formularios utilizan claves minúsculas.
export function categoriaServicio(valor) {
  const categoria = typeof valor === 'string' ? valor.trim().toLowerCase() : ''
  return categoria === 'aborto' ? 'ile' : categoria
}

export function areasDesdeServicios(lista = []) {
  const areas = { its: { seleccionado: false, detalle: '' }, ile: { seleccionado: false, detalle: '' } }
  for (const servicio of lista) {
    const categoria = categoriaServicio(servicio.categoria)
    if (Object.hasOwn(areas, categoria)) {
      areas[categoria] = { seleccionado: true, detalle: servicio.detalle_servicio || servicio.detalle || '' }
    }
  }
  return areas
}
