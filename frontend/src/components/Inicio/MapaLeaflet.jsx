import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import { Maximize2, Minimize2 } from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import {
  OAXACA,
  clasificarServicioCentro,
  coordenadas,
  ubicacionConfirmada,
} from '../../utils/centros.js'
import { ResumenMarcador } from '../FichaCentroMapa.jsx'

const ICONOS_MARCADOR_SVG = {
  its: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2v7.31"/><path d="M14 9.3V1.99"/><path d="M8.5 2h7"/><path d="M14 9.3a6.5 6.5 0 1 1-4 0"/><path d="M5.52 16h12.96"/></svg>',
  ile: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27"/></svg>',
  ambos: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12h8"/><path d="M12 8v8"/></svg>',
  propia: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>',
}

function crearIconoMarcador(tipo, seleccionada, esPropia = false) {
  const size = esPropia ? 44 : seleccionada ? 42 : 34
  const tipoClase = esPropia ? 'propia' : tipo
  const icono = ICONOS_MARCADOR_SVG[tipoClase] || ICONOS_MARCADOR_SVG.its
  const etiqueta = esPropia ? '<span class="mapa-marker-own-label">Mi clínica</span>' : ''
  return L.divIcon({
    className: 'mapa-custom-div-icon',
    html: `<span class="mapa-marker-own-wrap">${etiqueta}<span class="mapa-marker-pin-badge tipo-${tipoClase} ${seleccionada || esPropia ? 'is-selected' : ''}">${icono}</span></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2)],
  })
}

function crearIconoUsuario() {
  return L.divIcon({
    className: 'mapa-custom-div-icon',
    html: '<span class="mapa-user-location-dot" aria-hidden="true"></span>',
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -12],
  })
}

function EnfocarCentro({
  clinica,
  centrarTrigger = 0,
  zoomMinimo = 14,
  ubicacionUsuario = null,
  ubicacionVersion = 0,
}) {
  const mapa = useMap()
  const prevUbicacionVersionRef = useRef(0)
  const prevCentrarTriggerRef = useRef(0)
  const inicializadoRef = useRef(false)

  useEffect(() => {
    if (
      ubicacionUsuario &&
      Number.isFinite(ubicacionUsuario.lat) &&
      Number.isFinite(ubicacionUsuario.lng) &&
      ubicacionVersion !== prevUbicacionVersionRef.current
    ) {
      prevUbicacionVersionRef.current = ubicacionVersion
      mapa.flyTo([ubicacionUsuario.lat, ubicacionUsuario.lng], Math.max(mapa.getZoom(), 13), { duration: 0.5 })
    }
  }, [ubicacionUsuario, ubicacionVersion, mapa])

  useEffect(() => {
    if (centrarTrigger !== prevCentrarTriggerRef.current) {
      prevCentrarTriggerRef.current = centrarTrigger
      if (ubicacionConfirmada(clinica)) {
        mapa.flyTo(coordenadas(clinica), Math.max(mapa.getZoom(), zoomMinimo), { duration: 0.5 })
      }
      return
    }
    if (!inicializadoRef.current && !ubicacionUsuario && ubicacionConfirmada(clinica)) {
      inicializadoRef.current = true
      mapa.flyTo(coordenadas(clinica), Math.max(mapa.getZoom(), zoomMinimo), { duration: 0.5 })
    }
  }, [clinica, centrarTrigger, zoomMinimo, ubicacionUsuario, mapa])

  return null
}

function AjustarTamanoMapa({ modoVista, pantallaCompleta }) {
  const mapa = useMap()
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      mapa.invalidateSize({ animate: false })
    })
    const id = setTimeout(() => {
      mapa.invalidateSize({ animate: false })
    }, 180)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(id)
    }
  }, [mapa, modoVista, pantallaCompleta])

  useEffect(() => {
    const contenedor = mapa.getContainer()
    const recalcular = () => mapa.invalidateSize({ animate: false })
    window.addEventListener('resize', recalcular)
    window.addEventListener('orientationchange', recalcular)

    let observador = null
    if (contenedor && typeof ResizeObserver !== 'undefined') {
      observador = new ResizeObserver(recalcular)
      observador.observe(contenedor)
    }

    return () => {
      window.removeEventListener('resize', recalcular)
      window.removeEventListener('orientationchange', recalcular)
      observador?.disconnect()
    }
  }, [mapa])

  return null
}

export default function MapaLeaflet({
  clinicas,
  clinicaSeleccionada,
  onSeleccionarClinica,
  onVerDetallesClinica,
  modoVista = 'combinada',
  clinicaAutenticadaId = null,
  mostrarLeyenda = true,
  zoomInicial = 11,
  centrarTrigger = 0,
  ubicacionUsuario = null,
  ubicacionVersion = 0,
  radioKm = 10,
}) {
  const ubicadas = useMemo(
    () => clinicas.filter((clinica) => ubicacionConfirmada(clinica)),
    [clinicas]
  )
  const tienePropiaEnMapa = Boolean(
    clinicaAutenticadaId &&
    ubicadas.some((c) => String(c.id_clinica) === String(clinicaAutenticadaId))
  )
  const centroInicial = useMemo(() => {
    if (ubicacionConfirmada(clinicaSeleccionada)) return coordenadas(clinicaSeleccionada)
    if (ubicadas.length === 1) return coordenadas(ubicadas[0])
    return OAXACA
  }, [clinicaSeleccionada, ubicadas])
  const contenedorRef = useRef(null)
  const [pantallaCompleta, setPantallaCompleta] = useState(false)

  useEffect(() => {
    const manejarFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setPantallaCompleta(false)
      }
    }
    const manejarEscape = (e) => {
      if (e.key === 'Escape' && pantallaCompleta) {
        if (document.fullscreenElement) {
          document.exitFullscreen?.().catch(() => {})
        }
        setPantallaCompleta(false)
      }
    }
    document.addEventListener('fullscreenchange', manejarFullscreenChange)
    window.addEventListener('keydown', manejarEscape)
    return () => {
      document.removeEventListener('fullscreenchange', manejarFullscreenChange)
      window.removeEventListener('keydown', manejarEscape)
    }
  }, [pantallaCompleta])

  const alternarPantallaCompleta = async () => {
    const siguiente = !pantallaCompleta
    setPantallaCompleta(siguiente)
    const el = contenedorRef.current
    if (!el) return
    try {
      if (siguiente && el.requestFullscreen && !document.fullscreenElement) {
        await el.requestFullscreen()
      } else if (!siguiente && document.fullscreenElement) {
        await document.exitFullscreen()
      }
    } catch {
      // Mantiene el modo pantalla completa por CSS si la API nativa no está disponible.
    }
  }

  return (
    <div
      ref={contenedorRef}
      className={`mapa-leaflet-wrapper ${pantallaCompleta ? 'is-fullscreen' : ''}`}
    >
      <button
        type="button"
        className="mapa-fullscreen-btn"
        onClick={alternarPantallaCompleta}
        aria-label={pantallaCompleta ? 'Salir de pantalla completa' : 'Ver mapa en pantalla completa'}
        aria-pressed={pantallaCompleta}
      >
        {pantallaCompleta ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}
        <span>{pantallaCompleta ? 'Salir' : 'Pantalla completa'}</span>
      </button>

      <MapContainer center={centroInicial} zoom={zoomInicial} className="mapa-leaflet" aria-label="Mapa OpenStreetMap de clínicas aprobadas">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <AjustarTamanoMapa modoVista={modoVista} pantallaCompleta={pantallaCompleta} />
        <EnfocarCentro
          clinica={clinicaSeleccionada}
          centrarTrigger={centrarTrigger}
          zoomMinimo={zoomInicial >= 14 ? zoomInicial : 14}
          ubicacionUsuario={ubicacionUsuario}
          ubicacionVersion={ubicacionVersion}
        />
        {ubicacionUsuario && Number.isFinite(ubicacionUsuario.lat) && Number.isFinite(ubicacionUsuario.lng) && (
          <>
            <Circle
              center={[ubicacionUsuario.lat, ubicacionUsuario.lng]}
              radius={Math.max(0.5, Number(radioKm) || 10) * 1000}
              pathOptions={{
                color: '#103328',
                fillColor: '#43A882',
                fillOpacity: 0.1,
                weight: 1.5,
                dashArray: '5 5',
              }}
            />
            <Marker
              position={[ubicacionUsuario.lat, ubicacionUsuario.lng]}
              icon={crearIconoUsuario()}
              zIndexOffset={1500}
            >
              <Popup>
                <strong>Tu ubicación actual</strong>
                <br />
                <span>
                  {ubicacionUsuario.lat.toFixed(5)}, {ubicacionUsuario.lng.toFixed(5)}
                </span>
              </Popup>
            </Marker>
          </>
        )}
        {ubicadas.map((clinica) => {
          const tipo = clasificarServicioCentro(clinica)
          const esPropia = Boolean(clinicaAutenticadaId && String(clinica.id_clinica) === String(clinicaAutenticadaId))
          const seleccionada = clinicaSeleccionada?.id_clinica === clinica.id_clinica
          return (
            <Marker
              key={`${clinica.id_clinica}-${tipo}-${esPropia ? 'own' : 'std'}-${seleccionada ? 'sel' : 'base'}`}
              position={coordenadas(clinica)}
              icon={crearIconoMarcador(tipo, seleccionada, esPropia)}
              zIndexOffset={esPropia ? 1500 : seleccionada ? 1000 : 0}
              eventHandlers={{ click: () => onSeleccionarClinica?.(clinica) }}
            >
              <Popup>
                <ResumenMarcador
                  centro={clinica}
                  onVerFicha={() => onVerDetallesClinica?.(clinica)}
                />
              </Popup>
            </Marker>
          )
        })}
      </MapContainer>

      {mostrarLeyenda && (
        <div className="mapa-leyenda" aria-label="Leyenda de marcadores">
          {tienePropiaEnMapa && (
            <span className="mapa-leyenda-item">
              <span className="mapa-marker-pin-badge tipo-propia is-legend" aria-hidden="true">
                <span dangerouslySetInnerHTML={{ __html: ICONOS_MARCADOR_SVG.propia }} />
              </span>
              <span>Mi clínica</span>
            </span>
          )}
          <span className="mapa-leyenda-item">
            <span className="mapa-marker-pin-badge tipo-its is-legend" aria-hidden="true">
              <span dangerouslySetInnerHTML={{ __html: ICONOS_MARCADOR_SVG.its }} />
            </span>
            <span>Detección de ITS</span>
          </span>
          <span className="mapa-leyenda-item">
            <span className="mapa-marker-pin-badge tipo-ile is-legend" aria-hidden="true">
              <span dangerouslySetInnerHTML={{ __html: ICONOS_MARCADOR_SVG.ile }} />
            </span>
            <span>Aborto seguro (ILE)</span>
          </span>
          <span className="mapa-leyenda-item">
            <span className="mapa-marker-pin-badge tipo-ambos is-legend" aria-hidden="true">
              <span dangerouslySetInnerHTML={{ __html: ICONOS_MARCADOR_SVG.ambos }} />
            </span>
            <span>Ambos servicios</span>
          </span>
        </div>
      )}

      {ubicadas.length === 0 ? (
        <p className="mapa-leaflet-vacio" role="status">No hay centros con coordenadas para los filtros seleccionados.</p>
      ) : clinicaSeleccionada && !ubicacionConfirmada(clinicaSeleccionada) ? (
        <p className="mapa-leaflet-vacio" role="status">
          <strong>{clinicaSeleccionada.nombre}</strong> no tiene ubicación confirmada en el mapa; consulta su dirección en «Ver detalles».
        </p>
      ) : null}
    </div>
  )
}
