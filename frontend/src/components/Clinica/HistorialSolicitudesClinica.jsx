import { useEffect, useState } from 'react'
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  FileText,
  MessageSquare,
  RefreshCw,
  XCircle,
} from 'lucide-react'
import { consultarMisSolicitudesClinica } from '../../api/auth'

const ETIQUETAS_TIPO = {
  postulacion: 'Postulación inicial',
  actualizacion_informacion: 'Actualización de información',
  actualizacion_ubicacion: 'Actualización de ubicación',
}

const ETIQUETAS_ESTADO = {
  pendiente: 'Pendiente de revisión',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
}

function formatearFecha(valor) {
  if (!valor) return 'Pendiente'
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return 'No registrada'
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Mexico_City',
  }).format(fecha)
}

/**
 * HistorialSolicitudesClinica - Sección "Mis solicitudes" para que la clínica
 * consulte su historial de postulaciones, actualizaciones, motivos y comentarios
 * administrativos con persistencia en PostgreSQL.
 */
export default function HistorialSolicitudesClinica({
  solicitudSeleccionadaId = null,
  recargaTrigger = 0,
}) {
  const [solicitudes, setSolicitudes] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [expandidaId, setExpandidaId] = useState(null)
  const [intento, setIntento] = useState(0)

  const activaId =
    expandidaId !== null
      ? expandidaId
      : (solicitudSeleccionadaId || solicitudes[0]?.id_solicitud || null)

  useEffect(() => {
    let activo = true
    consultarMisSolicitudesClinica()
      .then((res) => {
        if (!activo) return
        const lista = Array.isArray(res?.solicitudes) ? res.solicitudes : []
        setSolicitudes(lista)
        setError('')
      })
      .catch((err) => {
        if (!activo) return
        setError(err.message || 'No se pudo consultar el historial de solicitudes.')
      })
      .finally(() => {
        if (activo) setCargando(false)
      })
    return () => {
      activo = false
    }
  }, [recargaTrigger, intento])

  return (
    <section className="mis-solicitudes-section" aria-labelledby="mis-solicitudes-titulo">
      <div className="mis-solicitudes-header">
        <div>
          <h3 id="mis-solicitudes-titulo" className="panel-clinica-section-title">
            Mis solicitudes
          </h3>
          <p className="mis-solicitudes-subtitulo">
            Consulta el historial de tus solicitudes enviadas, los campos revisados y los comentarios del equipo administrador.
          </p>
        </div>
        <button
          type="button"
          className="panel-clinica-back-shortcut"
          onClick={() => {
            setCargando(true)
            setError('')
            setIntento((v) => v + 1)
          }}
          disabled={cargando}
        >
          <RefreshCw size={14} aria-hidden="true" />
          <span>Actualizar</span>
        </button>
      </div>

      {cargando && (
        <div className="ficha-doc-note" role="status">
          <Clock3 size={18} aria-hidden="true" />
          <p>Cargando el historial de tus solicitudes…</p>
        </div>
      )}

      {!cargando && error && (
        <div className="ficha-alert ficha-alert-error" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <div>
            <strong>No pudimos cargar tus solicitudes</strong>
            <p>{error}</p>
          </div>
        </div>
      )}

      {!cargando && !error && solicitudes.length === 0 && (
        <div className="ficha-doc-note" role="status">
          <FileText size={18} aria-hidden="true" />
          <p>
            <strong>Aún no tienes solicitudes registradas.</strong> Cuando envíes una actualización de datos o ubicación, aparecerá aquí con su dictamen y comentarios.
          </p>
        </div>
      )}

      {!cargando && !error && solicitudes.length > 0 && (
        <div className="mis-solicitudes-lista">
          {solicitudes.map((sol) => {
            const abierta = activaId === sol.id_solicitud
            const campos = Array.isArray(sol.campos_modificados) ? sol.campos_modificados : []
            const claseEstado =
              sol.estado === 'aprobada'
                ? 'is-aprobada'
                : sol.estado === 'rechazada'
                  ? 'is-rechazada'
                  : 'is-pendiente'

            return (
              <article
                key={sol.id_solicitud}
                className={`mis-solicitudes-card ${claseEstado} ${abierta ? 'is-open' : ''}`}
              >
                <button
                  type="button"
                  className="mis-solicitudes-card-toggle"
                  aria-expanded={abierta}
                  onClick={() => setExpandidaId(abierta ? '' : sol.id_solicitud)}
                >
                  <div className="mis-solicitudes-card-main">
                    <span className={`mis-solicitudes-badge ${claseEstado}`}>
                      {sol.estado === 'aprobada' && <CheckCircle2 size={13} aria-hidden="true" />}
                      {sol.estado === 'rechazada' && <XCircle size={13} aria-hidden="true" />}
                      {sol.estado === 'pendiente' && <Clock3 size={13} aria-hidden="true" />}
                      <span>{ETIQUETAS_ESTADO[sol.estado] || sol.estado}</span>
                    </span>
                    <strong className="mis-solicitudes-tipo">
                      {ETIQUETAS_TIPO[sol.tipo_solicitud] || 'Solicitud de revisión'}
                    </strong>
                    <span className="mis-solicitudes-fecha">
                      <CalendarDays size={13} aria-hidden="true" />
                      Enviada: {formatearFecha(sol.fecha_solicitud)}
                    </span>
                  </div>
                  <span className="mis-solicitudes-chevron" aria-hidden="true">
                    {abierta ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </span>
                </button>

                {abierta && (
                  <div className="mis-solicitudes-detalle">
                    <div className="mis-solicitudes-meta-grid">
                      <div>
                        <span className="panel-clinica-summary-label">Fecha de envío</span>
                        <p className="panel-clinica-summary-value">{formatearFecha(sol.fecha_solicitud)}</p>
                      </div>
                      <div>
                        <span className="panel-clinica-summary-label">Fecha de resolución</span>
                        <p className="panel-clinica-summary-value">
                          {sol.fecha_resolucion ? formatearFecha(sol.fecha_resolucion) : 'Pendiente de respuesta'}
                        </p>
                      </div>
                    </div>

                    {sol.motivo && (
                      <div className="mis-solicitudes-bloque">
                        <span className="panel-clinica-summary-label">Motivo enviado por la clínica</span>
                        <p className="mis-solicitudes-texto">{sol.motivo}</p>
                      </div>
                    )}

                    {campos.length > 0 && (
                      <div className="mis-solicitudes-bloque">
                        <span className="panel-clinica-summary-label">
                          Campos modificados ({campos.length})
                        </span>
                        <ul className="mis-solicitudes-campos">
                          {campos.map((c, idx) => (
                            <li key={`${c.campo || idx}`}>
                              <strong>{c.etiqueta || c.campo}:</strong>{' '}
                              <span className="is-old">{c.valor_anterior ?? 'No especificado'}</span>
                              {' → '}
                              <span className="is-new">{c.valor_nuevo ?? 'No especificado'}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className={`mis-solicitudes-comentario ${sol.observaciones ? 'has-comment' : ''}`}>
                      <span className="panel-clinica-summary-label">
                        <MessageSquare size={12} aria-hidden="true" /> Comentarios del administrador
                      </span>
                      <p className="mis-solicitudes-texto">
                        {sol.observaciones
                          ? sol.observaciones
                          : sol.estado === 'pendiente'
                            ? 'Tu solicitud está en revisión. Cuando se emita un dictamen aparecerán aquí las observaciones.'
                            : 'El administrador resolvió la solicitud sin comentarios adicionales.'}
                      </p>
                    </div>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
