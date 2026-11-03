import { useEffect, useRef, useState } from 'react'
import { direccionCompleta, enlaceComoLlegar, horarioTexto, textoPendiente } from '../utils/centros.js'

export function ResumenMarcador({ centro, onVerFicha }) {
  const enlace = enlaceComoLlegar(centro)
  return (
    <div className="puntoax-resumen" aria-label={`Resumen de ${centro.nombre}`}>
      {centro.municipio && <span className="puntoax-etiqueta">{centro.municipio}</span>}
      <h3>{centro.nombre}</h3>
      <p>{textoPendiente(direccionCompleta(centro), 'Dirección por confirmar')}</p>
      <p className="puntoax-horario-resumen">{horarioTexto(centro.horarios)}</p>
      <div className="puntoax-resumen-acciones">
        <button type="button" className="puntoax-btn puntoax-btn--primario" onClick={onVerFicha}>Ver ficha completa</button>
        {enlace && <a className="puntoax-btn puntoax-btn--secundario" href={enlace} target="_blank" rel="noreferrer">Cómo llegar ↗</a>}
      </div>
    </div>
  )
}

function Campo({ titulo, children }) {
  return <div className="puntoax-ficha-campo"><dt>{titulo}</dt><dd>{children}</dd></div>
}

function Servicio({ servicio }) {
  return <article className="puntoax-ficha-servicio">
    <h4>{servicio.nombre}</h4>
    {servicio.descripcion && <p>{servicio.descripcion}</p>}
    <dl>
      <Campo titulo="Requisitos">{textoPendiente(servicio.requisitos, 'Sin requisitos documentados; consulta directamente')}</Campo>
      <Campo titulo="Costo">{servicio.costo == null ? 'Por confirmar' : Number(servicio.costo) === 0 ? 'Gratuito' : `$${Number(servicio.costo).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN`}</Campo>
      <Campo titulo="Cita">{servicio.requiere_cita ? 'Requiere cita según registro' : 'No requiere cita según registro'}</Campo>
    </dl>
  </article>
}

export default function FichaCentroMapa({ id, onCerrar }) {
  const [estado, setEstado] = useState('cargando')
  const [centro, setCentro] = useState(null)
  const [intento, setIntento] = useState(0)
  const [aviso, setAviso] = useState('')
  const cerrarRef = useRef(null)
  useEffect(() => {
    const abortar = new AbortController()
    // Se realiza una petición nueva cada vez que cambia el ID o se reintenta.
    fetch(`/api/clinicas/${encodeURIComponent(id)}`, { signal: abortar.signal })
      .then(async r => {
        if (r.status === 404 || r.status === 400) { setEstado('no-encontrado'); return null }
        if (!r.ok) throw new Error('No se pudo cargar la ficha del centro')
        return r.json()
      })
      .then(datos => {
        if (!datos || abortar.signal.aborted) return
        setCentro(datos)
        setEstado('exito')
      })
      .catch(err => { if (err.name !== 'AbortError') setEstado('error') })
    return () => abortar.abort()
  }, [id, intento])

  useEffect(() => {
    cerrarRef.current?.focus()
    function teclado(evento) { if (evento.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', teclado)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', teclado); document.body.style.overflow = '' }
  }, [onCerrar])

  async function compartir() {
    const url = window.location.href
    try {
      if (navigator.share) await navigator.share({ title: centro.nombre, url })
      else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
        setAviso('Enlace copiado al portapapeles')
      } else setAviso(`Copia este enlace: ${url}`)
    } catch (error) {
      if (error.name !== 'AbortError') setAviso('No se pudo compartir; copia la dirección desde el navegador')
    }
  }

  const enlace = centro && enlaceComoLlegar(centro)
  return (
    <div className="puntoax-modal-fondo" onMouseDown={evento => { if (evento.target === evento.currentTarget) onCerrar() }}>
      <section className="puntoax-ficha" role="dialog" aria-modal="true" aria-labelledby="puntoax-ficha-titulo">
        <div className="puntoax-ficha-cabecera">
          <span className="puntoax-ficha-sobretitulo" id={estado !== 'exito' ? 'puntoax-ficha-titulo' : undefined}>FICHA DEL CENTRO</span>
          <button ref={cerrarRef} className="puntoax-cerrar" type="button" onClick={onCerrar} aria-label="Cerrar ficha">×</button>
        </div>
        {estado === 'cargando' && <div className="puntoax-ficha-estado" role="status">Cargando información del centro…</div>}
        {estado === 'error' && <div className="puntoax-ficha-estado" role="alert">No se pudo cargar la ficha. <button type="button" onClick={() => { setEstado('cargando'); setIntento(n => n + 1) }}>Reintentar</button></div>}
        {estado === 'no-encontrado' && <div className="puntoax-ficha-estado" role="alert">Centro no encontrado o no disponible públicamente. <button type="button" onClick={onCerrar}>Volver al directorio</button></div>}
        {estado === 'exito' && centro && <>
          <h2 id="puntoax-ficha-titulo">{centro.nombre}</h2>
          <p id="puntoax-ficha-descripcion" className="puntoax-ficha-descripcion">{textoPendiente(centro.descripcion, 'Descripción pendiente de registrar')}</p>
          {centro.municipio && <span className="puntoax-etiqueta">{centro.municipio}{centro.localidad && ` · ${centro.localidad}`}</span>}
          <dl className="puntoax-ficha-datos">
            <Campo titulo="Dirección">{textoPendiente(direccionCompleta(centro), 'Dirección por confirmar')}</Campo>
            <Campo titulo="Horario registrado">{horarioTexto(centro.horarios)}</Campo>
            <Campo titulo="Teléfono">{centro.telefono ? <a href={`tel:${centro.telefono.replace(/[^+\d]/g, '')}`}>{centro.telefono}</a> : 'Por confirmar'}</Campo>
            <Campo titulo="Contacto">{centro.correo_contacto ? <a href={`mailto:${centro.correo_contacto}`}>{centro.correo_contacto}</a> : 'Por confirmar'}</Campo>
            <Campo titulo="Tipo de institución">{textoPendiente(centro.tipo_institucion)}</Campo>
          </dl>
          <div className="puntoax-ficha-servicios">
            <h3>Servicios en esta sede</h3>
            {centro.servicios?.length ? centro.servicios.map(servicio => <Servicio key={servicio.id_clinica_servicio} servicio={servicio} />) : <p>Los servicios y requisitos de esta sede están pendientes de registrar.</p>}
          </div>
          <p className="puntoax-advertencia">ⓘ Esta ficha proviene del directorio institucional. Confirma horarios, disponibilidad y requisitos con el centro antes de acudir.</p>
          <div className="puntoax-ficha-botones">
            {enlace && <a className="puntoax-btn puntoax-btn--primario" href={enlace} target="_blank" rel="noreferrer">◉ Cómo llegar</a>}
            <button type="button" className="puntoax-btn puntoax-btn--borde" onClick={compartir}>Compartir</button>
            {/^https?:\/\//i.test(centro.sitio_web || '') && <a className="puntoax-btn puntoax-btn--borde" href={centro.sitio_web} target="_blank" rel="noreferrer">Sitio web ↗</a>}
          </div>
          {aviso && <p className="puntoax-aviso" role="status">{aviso}</p>}
        </>}
        <div className="puntoax-ficha-pie"><button type="button" onClick={onCerrar}>Volver al mapa</button></div>
      </section>
    </div>
  )
}
