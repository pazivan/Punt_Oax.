import catalogo from '../data/municipios-oaxaca.json' with { type: 'json' }
import equivalencias from '../data/municipios-equivalencias.json' with { type: 'json' }

export const municipios = catalogo.municipios
export const fuenteMunicipios = { fuente: catalogo.fuente, obtenido_en: catalogo.obtenido_en }
export function normalizarMunicipio(valor) {
  return typeof valor === 'string'
    ? valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLowerCase()
    : ''
}
const porClave = new Map(municipios.map((m) => [m.cvegeo, m]))
const porNombre = new Map()
for (const municipio of municipios) {
  const nombre = normalizarMunicipio(municipio.nombre)
  porNombre.set(nombre, [...(porNombre.get(nombre) || []), municipio])
}
const porVariante = new Map(equivalencias.map((m) => [normalizarMunicipio(m.variante), m.cvegeo]))

// Sin coincidencias parciales/fuzzy: una localidad o un nombre ambiguo requiere revisión.
export function resolverMunicipio(valor) {
  if (typeof valor !== 'string') return null
  const coincidencias = porNombre.get(normalizarMunicipio(valor)) || []
  return porClave.get(valor) || (coincidencias.length === 1 ? coincidencias[0] : null)
}
export function etiquetaMunicipio(municipio) {
  return (porNombre.get(normalizarMunicipio(municipio.nombre))?.length || 0) > 1
    ? `${municipio.nombre} · INEGI ${municipio.cvegeo}` : municipio.nombre
}
export function resolverMunicipioHeredado(valor) {
  return resolverMunicipio(valor) || porClave.get(porVariante.get(normalizarMunicipio(valor))) || null
}
export function validarMunicipioEntrada(body) {
  const tieneClave = Object.hasOwn(body, 'municipio_clave')
  const tieneNombre = Object.hasOwn(body, 'municipio')
  if (!tieneClave && !tieneNombre) return {}
  const municipio = tieneClave ? porClave.get(body.municipio_clave) : resolverMunicipio(body.municipio)
  if (!municipio || (tieneNombre && (typeof body.municipio !== 'string' ||
      normalizarMunicipio(body.municipio) !== normalizarMunicipio(municipio.nombre)))) {
    return { error: 'Selecciona un municipio válido del catálogo de Oaxaca.' }
  }
  return { municipio: municipio.nombre, municipio_clave: municipio.cvegeo }
}
