import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle, ArrowRight, CalendarDays, Clock3, MapPin,
  RefreshCw, ShieldCheck, X,
} from 'lucide-react'
import { cancelarCitaUsuario, consultarCitasUsuario } from '../../api/auth.js'
import TarjetaCita from './TarjetaCita.jsx'
import {
  ETIQUETAS_ESTADO, filtrarCitas, formatearFechaCita,
} from '../../utils/citasClinica.js'
import './Citas.css'

const FILTROS = [
  { id: 'proximas', texto: 'Próximas' },
  { id: 'historial', texto: 'Historial' },
  { id: 'todas', texto: 'Todas' },
]

function esCancelable(cita, ahora = Date.now()) {
  const fecha = new Date(cita?.fecha_hora_inicio).getTime()
  return cita?.estado === 'confirmada' && Number.isFinite(fecha) && fecha > ahora
}

function DetalleCita({ cita, ahora, cancelando, error, onCerrar, onCancelar }) {
  const puedeCancelar = esCancelable(cita, ahora)

  return (
    <div className="citas-modal-fondo" onMouseDown={(evento) => {
      if (evento.target === evento.currentTarget) onCerrar()
    }}>
      <section role="dialog" aria-modal="true" aria-labelledby="mis-citas-detalle-titulo" className="citas-modal">
        <button type="button" className="citas-modal-cerrar" onClick={onCerrar} aria-label="Cerrar detalles de la cita"><X size={19} /></button>
        <span className="citas-etiqueta">DETALLE DE TU CITA</span>
        <h2 id="mis-citas-detalle-titulo">{cita.nombre_clinica || 'Clínica sin nombre'}</h2>
        <span className={`citas-estado citas-estado--${cita.estado || 'otro'}`}>
          {ETIQUETAS_ESTADO[cita.estado] || 'Estado no registrado'}
        </span>
        <dl className="citas-modal-datos">
          <div><dt>Identificador de la cita</dt><dd className="citas-folio-largo">{cita.id_cita}</dd></div>
          <div><dt>Fecha y hora</dt><dd>{formatearFechaCita(cita.fecha_hora_inicio)}</dd></div>
          <div><dt>Servicio</dt><dd>{cita.nombre_servicio || 'No especificado'}</dd></div>
          <div><dt>Clínica</dt><dd>{cita.nombre_clinica || 'No especificada'}</dd></div>
          <div><dt>Dirección</dt><dd>{cita.direccion_clinica || 'Por confirmar con la clínica'}</dd></div>
          <div><dt>Municipio</dt><dd>{cita.municipio_clinica || 'No especificado'}</dd></div>
          <div><dt>Teléfono de la clínica</dt><dd>{cita.telefono_clinica || 'No registrado'}</dd></div>
          <div><dt>Fecha de reserva</dt><dd>{formatearFechaCita(cita.fecha_reserva)}</dd></div>
        </dl>
        {error && <p className="citas-alerta citas-alerta--error" role="alert">{error}</p>}
        <p className="citas-modal-nota">
          {puedeCancelar
            ? 'Puedes cancelar esta cita. Al hacerlo, el horario quedará disponible para otra persona.'
            : 'Solo puedes cancelar citas confirmadas que todavía no han comenzado.'}
        </p>
        <div className="citas-modal-acciones">
          {puedeCancelar && (
            <button type="button" className="citas-boton citas-boton--peligro" onClick={onCancelar} disabled={cancelando}>
              {cancelando ? 'Cancelando…' : 'Cancelar cita'}
            </button>
          )}
          <button type="button" className="citas-boton citas-boton--oscuro" onClick={onCerrar}>Cerrar</button>
        </div>
      </section>
    </div>
  )
}

function ConfirmarCancelacion({ cita, cancelando, error, onVolver, onConfirmar }) {
  return (
    <div className="citas-modal-fondo" onMouseDown={(evento) => {
      if (evento.target === evento.currentTarget) onVolver()
    }}>
      <section role="dialog" aria-modal="true" aria-labelledby="mis-citas-cancelar-titulo" className="citas-modal citas-modal--confirmacion">
        <span className="citas-etiqueta">CANCELAR CITA</span>
        <h2 id="mis-citas-cancelar-titulo">¿Cancelar esta cita?</h2>
        <p>
          Se cancelará tu cita en <strong>{cita.nombre_clinica || 'la clínica'}</strong> para el{' '}
          <strong>{formatearFechaCita(cita.fecha_hora_inicio)}</strong>. El horario quedará libre y no se puede recuperar.
        </p>
        {error && <p className="citas-alerta citas-alerta--error" role="alert">{error}</p>}
        <div className="citas-modal-acciones">
          <button type="button" className="citas-boton citas-boton--secundario" onClick={onVolver} disabled={cancelando}>
            Mantener cita
          </button>
          <button type="button" className="citas-boton citas-boton--peligro" onClick={onConfirmar} disabled={cancelando}>
            {cancelando ? 'Cancelando…' : 'Sí, cancelar'}
          </button>
        </div>
      </section>
    </div>
  )
}

export default function MisCitasUsuario({ onSalir }) {
  const [citas, setCitas] = useState([])
  const [estado, setEstado] = useState('cargando')
  const [error, setError] = useState('')
  const [filtro, setFiltro] = useState('proximas')
  const [seleccionada, setSeleccionada] = useState(null)
  const [citaACancelar, setCitaACancelar] = useState(null)
  const [recargar, setRecargar] = useState(0)
  const [ahora, setAhora] = useState(() => Date.now())
  const [cancelando, setCancelando] = useState(false)
  const [errorAccion, setErrorAccion] = useState('')
  const [mensaje, setMensaje] = useState('')

  useEffect(() => {
    let vigente = true
    consultarCitasUsuario()
      .then((respuesta) => {
        if (!vigente) return
        if (!Array.isArray(respuesta.citas)) throw new Error('La respuesta de citas no tiene el formato esperado.')
        setCitas(respuesta.citas)
        setAhora(Date.now())
        setError('')
        setEstado('listo')
      })
      .catch((fallo) => {
        if (!vigente) return
        setCitas([])
        setError(fallo.message || 'No se pudieron cargar tus citas.')
        setEstado('error')
      })
    return () => { vigente = false }
  }, [recargar])

  useEffect(() => {
    function cerrarConEscape(evento) {
      if (evento.key !== 'Escape') return
      if (citaACancelar) setCitaACancelar(null)
      else if (seleccionada) setSeleccionada(null)
    }
    document.addEventListener('keydown', cerrarConEscape)
    return () => document.removeEventListener('keydown', cerrarConEscape)
  }, [citaACancelar, seleccionada])

  const visibles = useMemo(() => filtrarCitas(citas, filtro, ahora), [citas, filtro, ahora])
  const proximas = useMemo(() => filtrarCitas(citas, 'proximas', ahora).length, [citas, ahora])

  function actualizarCitas() {
    setEstado('cargando')
    setError('')
    setMensaje('')
    setRecargar((valor) => valor + 1)
  }

  function abrirDetalle(cita) {
    setErrorAccion('')
    setMensaje('')
    setSeleccionada(cita)
  }

  async function confirmarCancelacion() {
    if (!citaACancelar) return
    setCancelando(true)
    setErrorAccion('')
    try {
      const respuesta = await cancelarCitaUsuario(citaACancelar.id_cita)
      setMensaje(respuesta.mensaje || 'Cita cancelada. El horario quedó libre.')
      setCitaACancelar(null)
      setSeleccionada(null)
      setEstado('cargando')
      setRecargar((valor) => valor + 1)
    } catch (fallo) {
      setErrorAccion(fallo.message || 'No se pudo cancelar la cita. Inténtalo de nuevo.')
      setCitaACancelar(null)
    } finally {
      setCancelando(false)
    }
  }

  return (
    <div className="citas-clinica citas-usuario">
      <header className="citas-header">
        <div className="citas-contenedor citas-nav">
          <Link to="/cuenta" className="citas-marca">PuntOax</Link>
          <nav className="citas-nav-enlaces" aria-label="Navegación de paciente">
            <Link to="/cuenta">Inicio</Link>
            <Link to="/mapa">Mapa de centros</Link>
            <Link to="/agendar-cita">Agendar cita</Link>
            <span className="citas-nav-activo" aria-current="page">Mis citas</span>
            <Link to="/informacion-util">Información útil</Link>
          </nav>
          <div className="citas-nav-derecha">
            <Link to="/cuenta" className="citas-panel-link">Mi cuenta</Link>
            <button type="button" className="citas-boton-salir" onClick={onSalir}>Salir</button>
          </div>
        </div>
      </header>

      <main className="citas-contenedor citas-principal">
        <div className="citas-encabezado">
          <span className="citas-etiqueta">ÁREA DE PACIENTE</span>
          <h1>Mis citas</h1>
          <p>Consulta tus próximas citas, revisa tu historial y cancela una reserva futura si lo necesitas.</p>
        </div>

        <div className="citas-rejilla">
          <section className="citas-columna" aria-label="Mis citas">
            <div className="citas-listado-cabecera">
              <div>
                <span className="citas-etiqueta">TU AGENDA</span>
                <p>{estado === 'listo' ? `${proximas} cita${proximas === 1 ? '' : 's'} próxima${proximas === 1 ? '' : 's'}` : 'Citas registradas'}</p>
              </div>
              <button type="button" className="citas-refrescar" onClick={actualizarCitas} disabled={estado === 'cargando'}>
                <RefreshCw size={15} aria-hidden="true" /> Actualizar
              </button>
            </div>

            {mensaje && <p className="citas-alerta citas-alerta--ok" role="status">{mensaje}</p>}
            {errorAccion && !seleccionada && <p className="citas-alerta citas-alerta--error" role="alert">{errorAccion}</p>}

            <div className="citas-filtros" role="group" aria-label="Filtrar mis citas">
              {FILTROS.map(({ id, texto }) => (
                <button type="button" key={id} className={filtro === id ? 'citas-filtro activo' : 'citas-filtro'}
                  aria-pressed={filtro === id} onClick={() => setFiltro(id)}>{texto}</button>
              ))}
            </div>

            {estado === 'cargando' && <div className="citas-estado-mensaje" role="status"><Clock3 size={24} aria-hidden="true" /><h2>Cargando citas…</h2><p>Consultando tus reservas registradas.</p></div>}
            {estado === 'error' && <div className="citas-estado-mensaje" role="alert"><AlertCircle size={26} aria-hidden="true" /><h2>No pudimos consultar tus citas</h2><p>{error}</p><button type="button" className="citas-boton citas-boton--oscuro" onClick={actualizarCitas}>Reintentar</button></div>}
            {estado === 'listo' && visibles.length === 0 && (
              <div className="citas-estado-mensaje" role="status">
                <CalendarDays size={28} aria-hidden="true" />
                <h2>{filtro === 'proximas' ? 'No tienes citas próximas' : filtro === 'historial' ? 'No hay citas en tu historial' : 'Aún no tienes citas registradas'}</h2>
                <p>{filtro === 'proximas' ? 'Cuando agendes una cita aparecerá aquí. También puedes revisar tu historial.' : 'Cuando registres una cita, podrás consultarla en esta sección.'}</p>
                <Link to="/agendar-cita" className="citas-boton citas-boton--oscuro">Agendar una cita <ArrowRight size={15} aria-hidden="true" /></Link>
              </div>
            )}
            {estado === 'listo' && visibles.length > 0 && (
              <div className="citas-listado">
                {visibles.map((cita) => (
                  <TarjetaCita key={cita.id_cita} cita={cita} vista="usuario" onVerDetalles={abrirDetalle} />
                ))}
              </div>
            )}
          </section>

          <aside className="citas-aside">
            <span className="citas-etiqueta">TU ATENCIÓN</span>
            <h2>Ten tus citas a la mano.</h2>
            <p>Revisa la fecha, el servicio y la ubicación antes de acudir. Si ya no puedes asistir, cancela con anticipación para liberar el horario.</p>
            <div className="citas-aside-info">
              <p><ShieldCheck size={17} aria-hidden="true" /> Solo puedes cancelar citas confirmadas que aún no comienzan.</p>
              <p><MapPin size={17} aria-hidden="true" /> Consulta la dirección y el teléfono de la clínica.</p>
              <p><CalendarDays size={17} aria-hidden="true" /> Revisa tu historial para consultar citas anteriores.</p>
            </div>
            <Link className="citas-boton citas-boton--oscuro citas-aside-enlace" to="/agendar-cita">
              Agendar otra cita <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </aside>
        </div>
      </main>

      <footer className="citas-footer"><div className="citas-contenedor">© 2026 PuntOax. Salud, bienestar y orientación en Oaxaca.</div></footer>

      {seleccionada && (
        <DetalleCita
          cita={seleccionada}
          ahora={ahora}
          cancelando={cancelando}
          error={errorAccion}
          onCerrar={() => { setSeleccionada(null); setErrorAccion('') }}
          onCancelar={() => { setErrorAccion(''); setCitaACancelar(seleccionada) }}
        />
      )}
      {citaACancelar && (
        <ConfirmarCancelacion
          cita={citaACancelar}
          cancelando={cancelando}
          error={errorAccion}
          onVolver={() => { setCitaACancelar(null); setErrorAccion('') }}
          onConfirmar={confirmarCancelacion}
        />
      )}
    </div>
  )
}
