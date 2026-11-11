import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle, ArrowRight, CalendarDays, ClipboardList, Clock3,
  MapPin, RefreshCw, UserRound, X,
} from 'lucide-react'
import { actualizarEstadoCitaClinica, consultarCitasClinica } from '../../api/auth.js'
import TarjetaCita from '../Citas/TarjetaCita.jsx'
import {
  ETIQUETAS_ESTADO, filtrarCitas, formatearFechaCita,
  nombrePaciente,
} from '../../utils/citasClinica.js'
import '../Citas/Citas.css'

const FILTROS = [
  { id: 'proximas', texto: 'Próximas' },
  { id: 'historial', texto: 'Historial' },
  { id: 'todas', texto: 'Todas' },
]

function DetalleCita({ cita, ahora, actualizando, error, onCerrar, onCambiarEstado }) {
  useEffect(() => {
    function cerrarConEscape(evento) {
      if (evento.key === 'Escape') onCerrar()
    }
    document.addEventListener('keydown', cerrarConEscape)
    return () => document.removeEventListener('keydown', cerrarConEscape)
  }, [onCerrar])

  const esFutura = new Date(cita.fecha_hora_inicio).getTime() > ahora
  const puedeCancelar = cita.estado === 'confirmada' && esFutura
  const puedeCerrarAtencion = cita.estado === 'confirmada' && !esFutura

  return (
    <div className="citas-modal-fondo" onMouseDown={(evento) => {
      if (evento.target === evento.currentTarget) onCerrar()
    }}>
      <section role="dialog" aria-modal="true" aria-labelledby="citas-detalle-titulo" className="citas-modal">
        <button type="button" className="citas-modal-cerrar" onClick={onCerrar} aria-label="Cerrar detalles de la cita"><X size={19} /></button>
        <span className="citas-etiqueta">DETALLES DE LA CITA</span>
        <h2 id="citas-detalle-titulo">{nombrePaciente(cita)}</h2>
        <span className={`citas-estado citas-estado--${cita.estado || 'otro'}`}>
          {ETIQUETAS_ESTADO[cita.estado] || 'Estado no registrado'}
        </span>
        <dl className="citas-modal-datos">
          <div><dt>Identificador de la cita</dt><dd className="citas-folio-largo">{cita.id_cita}</dd></div>
          <div><dt>Fecha y hora</dt><dd>{formatearFechaCita(cita.fecha_hora_inicio)}</dd></div>
          <div><dt>Servicio</dt><dd>{cita.nombre_servicio || 'No especificado'}</dd></div>
          <div><dt>Clínica</dt><dd>{cita.nombre_clinica || 'No especificada'}</dd></div>
          <div><dt>Teléfono del paciente</dt><dd>{cita.paciente_telefono || 'No registrado'}</dd></div>
          <div><dt>Fecha de reserva</dt><dd>{formatearFechaCita(cita.fecha_reserva)}</dd></div>
        </dl>
        {error && <p className="citas-alerta citas-alerta--error" role="alert">{error}</p>}
        <p className="citas-modal-nota">
          {cita.estado !== 'confirmada'
            ? 'Esta cita ya no está confirmada: solo puedes consultar sus datos.'
            : esFutura
              ? 'Puedes cancelar esta cita. Al hacerlo, el horario quedará disponible para otra persona.'
              : 'La cita ya inició: puedes marcarla como completada o registrar que el paciente no asistió.'}
        </p>
        <div className="citas-modal-acciones">
          {puedeCancelar && (
            <button
              type="button"
              className="citas-boton citas-boton--peligro"
              onClick={() => onCambiarEstado('cancelada')}
              disabled={actualizando}
            >
              {actualizando ? 'Cancelando…' : 'Cancelar cita'}
            </button>
          )}
          {puedeCerrarAtencion && (
            <>
              <button
                type="button"
                className="citas-boton citas-boton--oscuro"
                onClick={() => onCambiarEstado('completada')}
                disabled={actualizando}
              >
                {actualizando ? 'Guardando…' : 'Marcar completada'}
              </button>
              <button
                type="button"
                className="citas-boton citas-boton--peligro"
                onClick={() => onCambiarEstado('no_asistio')}
                disabled={actualizando}
              >
                Registrar no asistió
              </button>
            </>
          )}
          <button type="button" className="citas-boton citas-boton--secundario" onClick={onCerrar} disabled={actualizando}>
            Cerrar
          </button>
        </div>
      </section>
    </div>
  )
}

export default function MisCitasClinica({ onSalir }) {
  const [citas, setCitas] = useState([])
  const [estado, setEstado] = useState('cargando')
  const [error, setError] = useState('')
  const [filtro, setFiltro] = useState('proximas')
  const [seleccionada, setSeleccionada] = useState(null)
  const [recargar, setRecargar] = useState(0)
  const [ahora, setAhora] = useState(() => Date.now())
  const [actualizando, setActualizando] = useState(false)
  const [errorAccion, setErrorAccion] = useState('')
  const [mensaje, setMensaje] = useState('')

  useEffect(() => {
    let vigente = true
    // Recalcular la frontera entre próximas e historial al recargar la lista.
    consultarCitasClinica()
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
        setError(fallo.message || 'No se pudieron cargar las citas.')
        setEstado('error')
      })
    return () => { vigente = false }
  }, [recargar])

  const visibles = useMemo(() => filtrarCitas(citas, filtro, ahora), [citas, filtro, ahora])
  const proximas = useMemo(() => filtrarCitas(citas, 'proximas', ahora).length, [citas, ahora])

  function actualizarCitas() {
    setEstado('cargando')
    setError('')
    setRecargar((valor) => valor + 1)
  }

  function abrirDetalle(cita) {
    setErrorAccion('')
    setMensaje('')
    setSeleccionada(cita)
  }

  async function cambiarEstadoCita(nuevoEstado) {
    if (!seleccionada) return
    setActualizando(true)
    setErrorAccion('')
    try {
      const respuesta = await actualizarEstadoCitaClinica(seleccionada.id_cita, nuevoEstado)
      setMensaje(respuesta.mensaje || 'Estado de la cita actualizado.')
      setSeleccionada(null)
      setEstado('cargando')
      setRecargar((valor) => valor + 1)
    } catch (fallo) {
      setErrorAccion(fallo.message || 'No se pudo actualizar el estado de la cita.')
    } finally {
      setActualizando(false)
    }
  }

  return (
    <div className="citas-clinica">
      <header className="citas-header">
        <div className="citas-contenedor citas-nav">
          <Link to="/mi-clinica" className="citas-marca">PuntOax</Link>
          <nav className="citas-nav-enlaces" aria-label="Navegación institucional">
            <Link to="/mi-clinica">Inicio</Link>
            <Link to="/conocenos">Conócenos</Link>
            <Link to="/informacion-util">Orientación</Link>
            <Link to="/mi-clinica">Mi clínica</Link>
            <span className="citas-nav-activo" aria-current="page">Mis citas</span>
          </nav>
          <div className="citas-nav-derecha">
            <Link to="/mi-clinica" className="citas-panel-link">Panel de clínica</Link>
            <button type="button" className="citas-boton-salir" onClick={onSalir}>Salir</button>
          </div>
        </div>
      </header>

      <main className="citas-contenedor citas-principal">
        <div className="citas-encabezado">
          <span className="citas-etiqueta">PANEL DE CLÍNICA</span>
          <h1>Mis citas</h1>
          <p>Consulta las visitas agendadas en tu clínica y revisa sus datos importantes en un solo lugar.</p>
        </div>

        <div className="citas-rejilla">
          <section className="citas-columna" aria-label="Agenda de citas">
            <div className="citas-listado-cabecera">
              <div>
                <span className="citas-etiqueta">AGENDA DE TU CENTRO</span>
                <p>{estado === 'listo' ? `${proximas} cita${proximas === 1 ? '' : 's'} próxima${proximas === 1 ? '' : 's'}` : 'Citas registradas'}</p>
              </div>
              <button type="button" className="citas-refrescar" onClick={actualizarCitas} disabled={estado === 'cargando'}>
                <RefreshCw size={15} aria-hidden="true" /> Actualizar
              </button>
            </div>
            {mensaje && <p className="citas-alerta citas-alerta--ok" role="status">{mensaje}</p>}
            {errorAccion && !seleccionada && <p className="citas-alerta citas-alerta--error" role="alert">{errorAccion}</p>}
            <div className="citas-filtros" role="group" aria-label="Filtrar citas">
              {FILTROS.map(({ id, texto }) => (
                <button type="button" key={id} className={filtro === id ? 'citas-filtro activo' : 'citas-filtro'}
                  aria-pressed={filtro === id} onClick={() => setFiltro(id)}>{texto}</button>
              ))}
            </div>

            {estado === 'cargando' && <div className="citas-estado-mensaje" role="status"><Clock3 size={24} aria-hidden="true" /><h2>Cargando citas…</h2><p>Consultando la agenda de tu clínica.</p></div>}
            {estado === 'error' && <div className="citas-estado-mensaje" role="alert"><AlertCircle size={26} aria-hidden="true" /><h2>No pudimos consultar las citas</h2><p>{error}</p><button type="button" className="citas-boton citas-boton--oscuro" onClick={actualizarCitas}>Reintentar</button></div>}
            {estado === 'listo' && visibles.length === 0 && (
              <div className="citas-estado-mensaje" role="status">
                <CalendarDays size={28} aria-hidden="true" />
                <h2>{filtro === 'proximas' ? 'No tienes citas próximas' : filtro === 'historial' ? 'No hay citas en el historial' : 'Aún no hay citas registradas'}</h2>
                <p>{filtro === 'proximas' ? 'Las nuevas reservas aparecerán aquí. Revisa también el historial.' : 'Cuando haya reservas correspondientes a tu clínica, se mostrarán en esta sección.'}</p>
                {filtro === 'proximas' && citas.length > 0 && <button type="button" className="citas-boton citas-boton--oscuro" onClick={() => setFiltro('todas')}>Ver todas las citas</button>}
              </div>
            )}
            {estado === 'listo' && visibles.length > 0 && (
              <div className="citas-listado">{visibles.map((cita) => (
                <TarjetaCita key={cita.id_cita} cita={cita} vista="clinica" onVerDetalles={abrirDetalle} />
              ))}</div>
            )}
          </section>

          <aside className="citas-aside">
            <span className="citas-etiqueta">GESTIONA TU CENTRO</span>
            <h2>Organiza la atención de tu clínica.</h2>
            <p>Consulta tus reservas, confirma los horarios registrados y mantén actualizada la información institucional.</p>
            <div className="citas-aside-info">
              <p><UserRound size={17} aria-hidden="true" /> Revisa qué paciente tiene una visita programada.</p>
              <p><MapPin size={17} aria-hidden="true" /> Consulta los servicios de tu sede.</p>
              <p><ClipboardList size={17} aria-hidden="true" /> Revisa los datos de cada cita.</p>
            </div>
            <Link className="citas-boton citas-boton--oscuro citas-aside-enlace" to="/mi-clinica">
              Ir a mi clínica <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </aside>
        </div>
      </main>

      <footer className="citas-footer"><div className="citas-contenedor">© 2024 PuntOax. Salud, bienestar y orientación en Oaxaca.</div></footer>
      {seleccionada && (
        <DetalleCita
          cita={seleccionada}
          ahora={ahora}
          actualizando={actualizando}
          error={errorAccion}
          onCerrar={() => { setSeleccionada(null); setErrorAccion('') }}
          onCambiarEstado={cambiarEstadoCita}
        />
      )}
    </div>
  )
}
