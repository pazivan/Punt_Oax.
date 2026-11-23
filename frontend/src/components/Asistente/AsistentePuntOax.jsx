import { Fragment, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bot,
  CalendarCheck,
  ExternalLink,
  HeartPulse,
  LoaderCircle,
  MapPin,
  MessageSquare,
  Navigation,
  PlusCircle,
  Send,
  Stethoscope,
  X,
} from 'lucide-react'
import {
  formatearDistanciaKm,
  obtenerMensajeErrorGeolocalizacion,
} from '../../utils/cercania.js'
import './AsistentePuntOax.css'

const PREGUNTAS_SUGERIDAS = [
  '¿Dónde puedo hacerme una prueba de ITS en Oaxaca de Juárez?',
  '¿Qué centros atienden ILE en Oaxaca?',
  '¿Qué centros están cerca de mí?',
]

const MENSAJE_BIENVENIDA = {
  id: 'bienvenida',
  emisor: 'ia',
  texto:
    '¡Hola! Soy el asistente virtual de PuntOax. Puedo ayudarte a consultar centros aprobados en Oaxaca, sus servicios (ITS e ILE), horarios, costos, requisitos, disponibilidad de citas y centros cercanos.',
  fuentes: [],
}

const RUTA_INTERNA_RE = /\[([^\]]+)\]\(((?:\/mapa(?:\?centro=[0-9a-f-]+)?|\/agendar-cita))\)|\*\*([^*]+)\*\*/gi

function esEnlaceInternoValido(ruta, idsPermitidos) {
  if (ruta === '/mapa' || ruta === '/agendar-cita') return true
  const match = ruta.match(/^\/mapa\?centro=([0-9a-f-]+)$/i)
  return Boolean(match && idsPermitidos.has(match[1]))
}

function renderizarLineaSegura(linea, idsPermitidos, prefijoKey) {
  const nodos = []
  let ultimoIndice = 0
  RUTA_INTERNA_RE.lastIndex = 0
  let coincidencia

  while ((coincidencia = RUTA_INTERNA_RE.exec(linea)) !== null) {
    if (coincidencia.index > ultimoIndice) {
      nodos.push(linea.slice(ultimoIndice, coincidencia.index))
    }
    if (coincidencia[1] && coincidencia[2]) {
      const etiqueta = coincidencia[1]
      const ruta = coincidencia[2]
      if (esEnlaceInternoValido(ruta, idsPermitidos)) {
        nodos.push(
          <Link key={`${prefijoKey}-${coincidencia.index}`} to={ruta} className="puntoax-asistente-inline-link">
            {etiqueta}
          </Link>
        )
      } else {
        nodos.push(etiqueta)
      }
    } else if (coincidencia[3]) {
      nodos.push(<strong key={`${prefijoKey}-b-${coincidencia.index}`}>{coincidencia[3]}</strong>)
    }
    ultimoIndice = coincidencia.index + coincidencia[0].length
  }

  if (ultimoIndice < linea.length) {
    nodos.push(linea.slice(ultimoIndice))
  }
  return nodos
}

function renderizarTextoSeguro(texto, fuentes = []) {
  const idsPermitidos = new Set(
    (Array.isArray(fuentes) ? fuentes : []).map((f) => f?.id_clinica).filter(Boolean)
  )
  const lineas = String(texto || '').split('\n')
  return lineas.map((linea, idx) => (
    <Fragment key={`l-${idx}`}>
      {renderizarLineaSegura(linea, idsPermitidos, `l-${idx}`)}
      {idx < lineas.length - 1 && <br />}
    </Fragment>
  ))
}

function insigniaServicio(categorias = []) {
  const tieneIts = categorias.includes('its')
  const tieneIle = categorias.includes('ile')
  if (tieneIts && tieneIle) {
    return (
      <span className="puntoax-asistente-cat-badge es-ambos">
        <PlusCircle size={12} aria-hidden="true" />
        ITS e ILE
      </span>
    )
  }
  if (tieneIle) {
    return (
      <span className="puntoax-asistente-cat-badge es-ile">
        <HeartPulse size={12} aria-hidden="true" />
        ILE
      </span>
    )
  }
  if (tieneIts) {
    return (
      <span className="puntoax-asistente-cat-badge es-its">
        <Stethoscope size={12} aria-hidden="true" />
        ITS
      </span>
    )
  }
  return null
}

export default function AsistentePuntOax({ abiertoInicial = false, sesion = null }) {
  const [abierto, setAbierto] = useState(abiertoInicial)
  const [pregunta, setPregunta] = useState('')
  const [mensajes, setMensajes] = useState([MENSAJE_BIENVENIDA])
  const [cargando, setCargando] = useState(false)
  const [ubicacion, setUbicacion] = useState(null)
  const [errorUbicacion, setErrorUbicacion] = useState('')
  const [cargandoUbicacion, setCargandoUbicacion] = useState(false)
  const inputRef = useRef(null)
  const botonAbrirRef = useRef(null)
  const listaRef = useRef(null)
  const enviandoRef = useRef(false)

  useEffect(() => {
    if (!abierto) return undefined
    inputRef.current?.focus()
    const manejarEscape = (e) => {
      if (e.key === 'Escape') {
        setAbierto(false)
        botonAbrirRef.current?.focus()
      }
    }
    window.addEventListener('keydown', manejarEscape)
    return () => window.removeEventListener('keydown', manejarEscape)
  }, [abierto])

  useEffect(() => {
    if (listaRef.current) {
      listaRef.current.scrollTop = listaRef.current.scrollHeight
    }
  }, [mensajes, cargando])

  function alternarUbicacion() {
    if (ubicacion) {
      setUbicacion(null)
      setErrorUbicacion('')
      return
    }
    if (!navigator?.geolocation) {
      setErrorUbicacion('Tu navegador no permite compartir ubicación; puedes indicar tu municipio en la pregunta.')
      return
    }
    setCargandoUbicacion(true)
    setErrorUbicacion('')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Math.round(pos.coords.latitude * 10000) / 10000
        const lng = Math.round(pos.coords.longitude * 10000) / 10000
        setUbicacion({ lat, lng })
        setCargandoUbicacion(false)
      },
      (err) => {
        setErrorUbicacion(obtenerMensajeErrorGeolocalizacion(err))
        setCargandoUbicacion(false)
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
    )
  }

  async function enviarPregunta(textoConsulta) {
    const limpia = (textoConsulta ?? pregunta).trim()
    if (!limpia || cargando || enviandoRef.current) return

    enviandoRef.current = true
    const idUsuario = `u-${Date.now()}`
    setMensajes((prev) => [...prev, { id: idUsuario, emisor: 'usuario', texto: limpia }])
    setPregunta('')
    setCargando(true)

    try {
      const respuesta = await fetch('/api/asistente/consultar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pregunta: limpia,
          ...(ubicacion ? { ubicacion } : {}),
        }),
      })
      const datos = await respuesta.json().catch(() => null)
      if (!respuesta.ok) {
        throw new Error(datos?.error || `No se pudo consultar al asistente (${respuesta.status}).`)
      }
      setMensajes((prev) => [
        ...prev,
        {
          id: `ia-${Date.now()}`,
          emisor: 'ia',
          texto: datos?.respuesta || 'No se recibió respuesta del asistente.',
          fuentes: Array.isArray(datos?.fuentes) ? datos.fuentes : [],
        },
      ])
    } catch (err) {
      setMensajes((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          emisor: 'error',
          texto: err?.message || 'No se pudo conectar con el asistente. Revisa tu conexión e inténtalo de nuevo.',
        },
      ])
    } finally {
      enviandoRef.current = false
      setCargando(false)
    }
  }

  const esPacienteAutenticado = sesion?.tipo === 'usuario'

  return (
    <div className="puntoax-asistente-root">
      {!abierto ? (
        <button
          ref={botonAbrirRef}
          type="button"
          className="puntoax-asistente-fab"
          onClick={() => setAbierto(true)}
          aria-label="Abrir asistente virtual de PuntOax"
          aria-expanded="false"
        >
          <MessageSquare size={18} aria-hidden="true" />
          <span>Asistente IA</span>
        </button>
      ) : (
        <section
          className="puntoax-asistente-panel"
          role="dialog"
          aria-modal="false"
          aria-label="Asistente virtual de inteligencia artificial PuntOax"
        >
          <header className="puntoax-asistente-header">
            <div className="puntoax-asistente-header-info">
              <span className="puntoax-asistente-avatar" aria-hidden="true">
                <Bot size={19} />
              </span>
              <div>
                <h2>Asistente PuntOax</h2>
                <span className="puntoax-asistente-badge-ia">Inteligencia artificial · Catálogo público</span>
              </div>
            </div>
            <button
              type="button"
              className="puntoax-asistente-cerrar"
              aria-label="Cerrar asistente"
              onClick={() => {
                setAbierto(false)
                botonAbrirRef.current?.focus()
              }}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </header>

          <div className="puntoax-asistente-aviso" role="note">
            Usa un proveedor externo de IA con datos públicos de PuntOax. No compartas datos personales sensibles; no emite diagnósticos médicos.
          </div>

          <div className="puntoax-asistente-ubicacion-bar">
            <button
              type="button"
              className={`puntoax-asistente-ubicacion-btn ${ubicacion ? 'activa' : ''}`}
              onClick={alternarUbicacion}
              disabled={cargando || cargandoUbicacion}
              aria-pressed={Boolean(ubicacion)}
            >
              <MapPin size={14} aria-hidden="true" />
              <span>
                {cargandoUbicacion
                  ? 'Obteniendo ubicación…'
                  : ubicacion
                    ? 'Ubicación aproximada activa (quitar)'
                    : 'Usar mi ubicación aproximada'}
              </span>
            </button>
            <span className="puntoax-asistente-ubicacion-nota">
              Opcional: solo calcula distancias en el servidor; no se guarda ni se envía a la IA. También puedes escribir tu municipio.
            </span>
            {errorUbicacion && (
              <span className="puntoax-asistente-ubicacion-error" role="status">
                {errorUbicacion}
              </span>
            )}
          </div>

          <div ref={listaRef} className="puntoax-asistente-mensajes" aria-live="polite">
            {mensajes.map((m) => (
              <div
                key={m.id}
                className={`puntoax-asistente-burbuja ${m.emisor === 'usuario' ? 'es-usuario' : m.emisor === 'error' ? 'es-error' : 'es-ia'}`}
                role={m.emisor === 'error' ? 'alert' : undefined}
              >
                <div>{m.emisor === 'ia' ? renderizarTextoSeguro(m.texto, m.fuentes) : m.texto}</div>

                {Array.isArray(m.fuentes) && m.fuentes.length > 0 && (
                  <div className="puntoax-asistente-fuentes">
                    <span className="puntoax-asistente-fuentes-titulo">Establecimientos en PuntOax</span>
                    {m.fuentes.map((f) => {
                      const distancia = formatearDistanciaKm(f.distancia_km)
                      const insignia = insigniaServicio(f.categorias || [])
                      return (
                        <article key={f.id_clinica} className="puntoax-asistente-tarjeta">
                          <div className="puntoax-asistente-tarjeta-top">
                            <strong className="puntoax-asistente-tarjeta-nombre">{f.nombre}</strong>
                            {insignia}
                          </div>
                          {(f.municipio || distancia) && (
                            <div className="puntoax-asistente-tarjeta-meta">
                              {f.municipio && <span>{f.municipio}</span>}
                              {distancia && (
                                <span className="puntoax-asistente-distancia">
                                  <Navigation size={11} aria-hidden="true" />
                                  {distancia}
                                </span>
                              )}
                            </div>
                          )}
                          {f.direccion && (
                            <p className="puntoax-asistente-tarjeta-dir">{f.direccion}</p>
                          )}
                          <div className="puntoax-asistente-tarjeta-acciones">
                            <Link
                              to={f.enlace_ficha || `/mapa?centro=${f.id_clinica}`}
                              className="puntoax-asistente-fuente-link"
                            >
                              <span>Ver ficha</span>
                              <ExternalLink size={13} aria-hidden="true" />
                            </Link>
                            {f.habilitado_citas && (
                              esPacienteAutenticado ? (
                                <Link
                                  to="/agendar-cita"
                                  state={{ clinica: f }}
                                  className="puntoax-asistente-agendar-link"
                                >
                                  <CalendarCheck size={13} aria-hidden="true" />
                                  <span>Agendar cita</span>
                                </Link>
                              ) : (
                                <Link
                                  to="/login"
                                  state={{ aviso: 'Inicia sesión como paciente para agendar una cita.' }}
                                  className="puntoax-asistente-agendar-link"
                                >
                                  <CalendarCheck size={13} aria-hidden="true" />
                                  <span>Iniciar sesión para agendar</span>
                                </Link>
                              )
                            )}
                          </div>
                        </article>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}

            {mensajes.length === 1 && !cargando && (
              <div className="puntoax-asistente-sugerencias" aria-label="Preguntas sugeridas">
                {PREGUNTAS_SUGERIDAS.map((sugerencia) => (
                  <button
                    key={sugerencia}
                    type="button"
                    className="puntoax-asistente-sugerencia"
                    onClick={() => enviarPregunta(sugerencia)}
                  >
                    {sugerencia}
                  </button>
                ))}
              </div>
            )}

            {cargando && (
              <div className="puntoax-asistente-burbuja es-ia" role="status">
                <span className="puntoax-asistente-cargando">
                  <LoaderCircle size={16} className="puntoax-asistente-spin" aria-hidden="true" />
                  Consultando catálogo de PuntOax…
                </span>
              </div>
            )}
          </div>

          <form
            className="puntoax-asistente-form"
            onSubmit={(e) => {
              e.preventDefault()
              enviarPregunta()
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={pregunta}
              maxLength={400}
              onChange={(e) => setPregunta(e.target.value)}
              placeholder="Escribe tu pregunta sobre centros…"
              aria-label="Escribe tu pregunta para el asistente"
              disabled={cargando}
            />
            <button
              type="submit"
              className="puntoax-asistente-enviar"
              disabled={cargando || !pregunta.trim()}
            >
              <Send size={15} aria-hidden="true" />
              <span>Enviar</span>
            </button>
          </form>
        </section>
      )}
    </div>
  )
}
