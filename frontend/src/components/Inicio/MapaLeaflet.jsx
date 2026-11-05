import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { OAXACA, coordenadas } from '../../utils/centros.js'
import { ResumenMarcador } from '../FichaCentroMapa.jsx'

function EnfocarCentro({ clinica }) {
  const mapa = useMap()
  useEffect(() => {
    const punto = coordenadas(clinica)
    if (punto) mapa.flyTo(punto, Math.max(mapa.getZoom(), 13))
  }, [clinica, mapa])
  return null
}

// Sustituye únicamente el espacio reservado para el mapa, sin alterar los filtros de Yareli.
export default function MapaLeaflet({ clinicas, clinicaSeleccionada, onSeleccionarClinica }) {
  const navigate = useNavigate()
  const ubicadas = clinicas.filter((clinica) => coordenadas(clinica))

  return (
    <>
      <MapContainer center={OAXACA} zoom={11} className="mapa-leaflet" aria-label="Mapa OpenStreetMap de clínicas aprobadas">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <EnfocarCentro clinica={clinicaSeleccionada} />
        {ubicadas.map((clinica) => (
          <CircleMarker key={clinica.id_clinica} center={coordenadas(clinica)} radius={11}
            pathOptions={{ color: '#fff', weight: 3, fillColor: '#153b2f', fillOpacity: 1 }}
            eventHandlers={{ click: () => onSeleccionarClinica(clinica) }}>
            <Popup>
              <ResumenMarcador centro={clinica}
                onVerFicha={() => navigate(`/centro/${encodeURIComponent(clinica.id_clinica)}`)} />
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
      {ubicadas.length === 0 && (
        <p className="mapa-leaflet-vacio" role="status">No hay centros con coordenadas para los filtros seleccionados.</p>
      )}
    </>
  )
}
