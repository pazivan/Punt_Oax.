import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { CheckCircle2, MapPin, Pencil } from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import { OAXACA } from '../../utils/centros.js'
import { validarCoordenadas } from '../../utils/validacionFicha.js'

function AjustarTamanoMapa() {
  const mapa = useMap()
  useEffect(() => {
    const id = setTimeout(() => mapa.invalidateSize({ animate: false }), 120)
    return () => clearTimeout(id)
  }, [mapa])
  return null
}

function RecentrarMapa({ centro, activo }) {
  const mapa = useMap()
  useEffect(() => {
    if (!activo) return
    mapa.setView(centro, mapa.getZoom(), { animate: false })
  }, [centro, activo, mapa])
  return null
}

function ObservarCentro({ onCentro, activo }) {
  const mapa = useMap()
  useMapEvents({
    moveend: () => {
      if (!activo) return
      const centro = mapa.getCenter()
      onCentro([centro.lat, centro.lng])
    },
  })
  return null
}

/**
 * Selector de ubicación con marcador fijo al centro.
 *
 * El marcador no se arrastra: el usuario mueve el mapa y las coordenadas
 * provisionales se leen del centro. Solo al pulsar "Confirmar ubicación" se
 * entregan las coordenadas al formulario para que puedan guardarse.
 */
export default function SelectorUbicacionMapa({
  latitud,
  longitud,
  confirmada = false,
  onConfirmar,
  onCorregir,
  error = '',
  deshabilitado = false,
}) {
  const inicial = useMemo(() => {
    const coordenadas = validarCoordenadas(latitud, longitud)
    return coordenadas.error ? OAXACA : [coordenadas.latitud, coordenadas.longitud]
  }, [latitud, longitud])

  const [provisional, setProvisional] = useState(inicial)
  const mostradas = confirmada ? inicial : provisional
  const formatear = (valor) => Number(valor).toFixed(6)

  return (
    <div
      className={`ficha-mapa-bloque ${error ? 'is-invalid' : ''}`}
      id="ficha-ubicacion-mapa"
      role="group"
      aria-label="Seleccionar ubicación de la clínica"
      aria-describedby={error ? 'ficha-ubicacion-error' : undefined}
    >
      <div className="ficha-mapa-encabezado">
        <div>
          <strong>Ubicación en el mapa</strong>
          <p>Mueve el mapa para centrar el marcador en tu establecimiento.</p>
        </div>
        <span className={`ficha-mapa-estado ${confirmada ? 'is-confirmada' : ''}`}>
          {confirmada ? (
            <>
              <CheckCircle2 size={14} aria-hidden="true" /> Confirmada
            </>
          ) : (
            'Sin confirmar'
          )}
        </span>
      </div>

      <div className="ficha-mapa-lienzo">
        <MapContainer
          center={inicial}
          zoom={15}
          className="ficha-mapa"
          scrollWheelZoom
          aria-label="Mapa para seleccionar la ubicación de la clínica"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <AjustarTamanoMapa />
          <RecentrarMapa centro={inicial} activo={confirmada} />
          <ObservarCentro
            activo={!confirmada && !deshabilitado}
            onCentro={(nuevo) => setProvisional(nuevo)}
          />
        </MapContainer>
        <span className="ficha-mapa-marcador" aria-hidden="true">
          <MapPin size={30} />
        </span>
      </div>

      <div className="ficha-mapa-datos" aria-live="polite">
        <span>Latitud <strong>{formatear(mostradas[0])}</strong></span>
        <span>Longitud <strong>{formatear(mostradas[1])}</strong></span>
      </div>

      {error && (
        <p className="ficha-field-error" id="ficha-ubicacion-error" role="alert">
          {error}
        </p>
      )}

      <div className="ficha-mapa-acciones">
        {confirmada ? (
          <button
            type="button"
            className="ficha-btn-secondary"
            onClick={onCorregir}
            disabled={deshabilitado}
          >
            <Pencil size={16} aria-hidden="true" /> Corregir ubicación
          </button>
        ) : (
          <button
            type="button"
            className="ficha-btn-primary"
            onClick={() => onConfirmar({ latitud: mostradas[0], longitud: mostradas[1] })}
            disabled={deshabilitado}
            aria-describedby={error ? 'ficha-ubicacion-error' : undefined}
          >
            <CheckCircle2 size={16} aria-hidden="true" /> Confirmar ubicación
          </button>
        )}
        <small>
          {confirmada
            ? 'La ubicación se guardará con tu borrador y estará disponible para revisión.'
            : 'La posición actual es provisional; no se guarda hasta que la confirmes.'}
        </small>
      </div>
    </div>
  )
}
