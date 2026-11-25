import FiltroDesplegable from '../Inicio/FiltroDesplegable.jsx'
import { municipios, resolverMunicipio, etiquetaMunicipio } from '../../utils/municipios.mjs'

const opciones = [...municipios].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  .map((m) => ({ value: m.cvegeo, label: etiquetaMunicipio(m) }))

export default function SelectorMunicipio({ value, onChange, ...props }) {
  const seleccionado = resolverMunicipio(value)
  return (
    <div className="selector-municipio">
      <small>Estado: Oaxaca</small>
      <FiltroDesplegable {...props}
        ariaLabel="Municipio de Oaxaca"
        value={seleccionado?.cvegeo || ''}
        options={opciones}
        searchable
        searchPlaceholder="Buscar municipio (sin acentos)"
        placeholder="Selecciona un municipio"
        onChange={(clave) => onChange(resolverMunicipio(clave).nombre, clave)}
      />
      {value && !seleccionado && <small role="status">Municipio anterior: {value}. Selecciona su nombre oficial.</small>}
    </div>
  )
}
