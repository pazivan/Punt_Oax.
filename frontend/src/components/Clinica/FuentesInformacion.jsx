import { useState } from 'react'
import { ExternalLink, Plus, Trash2 } from 'lucide-react'
import { guardarEnlacesInformacion } from '../../api/auth'
import { normalizarUrlExterna } from '../../utils/enlaces'
import './FuentesInformacion.css'

export default function FuentesInformacion({ iniciales = [] }) {
  const [enlaces, setEnlaces] = useState(Array.isArray(iniciales) ? iniciales : [])
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [cambios, setCambios] = useState(false)

  const cambiar = (nuevos) => {
    setEnlaces(nuevos)
    setCambios(true)
    setError('')
    setMensaje('')
  }

  const guardar = async () => {
    if (guardando) return
    const limpios = enlaces.map(({ titulo, url }) => ({ titulo: titulo.trim(), url: url.trim() }))
    if (limpios.some(({ titulo, url }) => !titulo || !/^https?:\/\//i.test(url) ||
      !normalizarUrlExterna(url))) {
      setError('Escribe un título y una URL válida (http:// o https://) para cada fuente.')
      return
    }
    setGuardando(true)
    setError('')
    setMensaje('')
    try {
      const respuesta = await guardarEnlacesInformacion(limpios)
      setEnlaces(respuesta.enlaces)
      setCambios(false)
      setMensaje('Fuentes de información guardadas.')
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section className="fuentes-clinica" aria-labelledby="fuentes-clinica-titulo">
      <h3 id="fuentes-clinica-titulo">Fuentes de información</h3>
      <p>Agrega el título y la dirección de cada fuente. Se mostrarán como botones en la ficha pública de tu clínica.</p>
      <fieldset className="fuentes-clinica-lista" disabled={guardando}>
      {enlaces.map((enlace, indice) => (
        <div className="fuentes-clinica-item" key={indice}>
          <div className="fuentes-clinica-campos">
            <label htmlFor={`fuente-titulo-${indice}`}>Título de la fuente {indice + 1}</label>
            <input id={`fuente-titulo-${indice}`} type="text" maxLength={120}
              placeholder="Ej. Secretaría de Salud"
              value={enlace.titulo}
              onChange={(e) => cambiar(enlaces.map((item, i) => i === indice ? { ...item, titulo: e.target.value } : item))} />
          </div>
          <div className="fuentes-clinica-campos">
            <label htmlFor={`fuente-url-${indice}`}>Enlace</label>
            <input id={`fuente-url-${indice}`} type="url" maxLength={1000}
              placeholder="https://ejemplo.gob.mx/informacion"
              value={enlace.url}
              onChange={(e) => cambiar(enlaces.map((item, i) => i === indice ? { ...item, url: e.target.value } : item))} />
          </div>
          <button type="button" className="fuentes-clinica-quitar"
            onClick={() => cambiar(enlaces.filter((_, i) => i !== indice))}
            aria-label={`Quitar fuente ${indice + 1}`}>
            <Trash2 size={16} aria-hidden="true" /> Quitar
          </button>
          {!guardando && /^https?:\/\//i.test(enlace.url) && normalizarUrlExterna(enlace.url) && (
            <a className="fuentes-clinica-vista" href={normalizarUrlExterna(enlace.url)}
              target="_blank" rel="noopener noreferrer">
              Probar enlace <ExternalLink size={14} aria-hidden="true" />
            </a>
          )}
        </div>
      ))}
      </fieldset>
      <div className="fuentes-clinica-acciones">
        <button type="button" disabled={guardando || enlaces.length >= 20}
          onClick={() => cambiar([...enlaces, { titulo: '', url: '' }])}>
          <Plus size={16} aria-hidden="true" /> Añadir fuente de información
        </button>
        <button type="button" disabled={guardando || !cambios} onClick={guardar}>
          {guardando ? 'Guardando…' : 'Guardar fuentes'}
        </button>
      </div>
      {error && <p role="alert" className="fuentes-clinica-error">{error}</p>}
      {mensaje && <p role="status" className="fuentes-clinica-exito">{mensaje}</p>}
    </section>
  )
}
