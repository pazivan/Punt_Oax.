import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { bloquearDiaClinica, cambiarCupoClinica, consultarAgendaClinica, crearCupoClinica, guardarHorariosAgenda } from '../../api/auth.js'
import EncabezadoClinica from './EncabezadoClinica.jsx'
import '../Citas/Citas.css'
import './AgendaClinica.css'

const fechaMexico = (valor) => {
  const partes = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(valor))
  const campo = (tipo) => partes.find((parte) => parte.type === tipo).value
  return `${campo('year')}-${campo('month')}-${campo('day')}`
}
const horaMexico = (valor) => new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(valor))
const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

export default function AgendaClinica({ sesion, onSalir }) {
  const [agenda, setAgenda] = useState(null)
  const [servicio, setServicio] = useState('')
  const [fecha, setFecha] = useState('')
  const [hora, setHora] = useState('')
  const [dia, setDia] = useState('')
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [horarios, setHorarios] = useState([])

  const cargar = useCallback(async () => {
    const datos = await consultarAgendaClinica()
    setAgenda(datos)
    setHorarios(datos.horarios)
    setServicio((actual) => actual || datos.servicios[0]?.id_clinica_servicio || '')
  }, [])
  useEffect(() => {
    consultarAgendaClinica().then((datos) => {
      setAgenda(datos)
      setHorarios(datos.horarios)
      setServicio(datos.servicios[0]?.id_clinica_servicio || '')
    }).catch((fallo) => setError(fallo.message))
  }, [])

  async function ejecutar(accion) {
    setOcupado(true)
    setError('')
    setMensaje('')
    try {
      const resultado = await accion()
      await cargar()
      setMensaje(resultado.mensaje + (resultado.citas_canceladas != null
        ? ` Citas canceladas: ${resultado.citas_canceladas}.` : ''))
    } catch (fallo) { setError(fallo.message || 'No se pudo actualizar la agenda.') }
    finally { setOcupado(false) }
  }

  const limite = agenda?.hoy && (() => {
    const fechaMaxima = new Date(`${agenda.hoy}T12:00:00Z`)
    fechaMaxima.setUTCDate(fechaMaxima.getUTCDate() + 14)
    return fechaMaxima.toISOString().slice(0, 10)
  })()

  return (
    <div className="citas-clinica agenda-clinica">
      <EncabezadoClinica sesion={sesion} onSalir={onSalir} modoPostulacion={false} />
      <main className="citas-contenedor citas-principal agenda-principal">
        <Link to="/mi-clinica/citas" className="agenda-volver">← Mis citas</Link>
        <header className="agenda-encabezado">
          <span className="agenda-eyebrow">CLÍNICA · DISPONIBILIDAD</span>
          <h1>Gestionar agenda</h1>
          <p>Crea cupos concretos para ITS o ILE durante los próximos 15 días. No se generan citas automáticamente ni se supone cuánto dura cada atención.</p>
        </header>
        {error && <p role="alert" className="citas-alerta citas-alerta--error">{error}</p>}
        {mensaje && <p role="status" className="citas-alerta citas-alerta--ok">{mensaje}</p>}
        {!agenda && !error && <p className="agenda-cargando">Cargando agenda…</p>}
        {agenda && <>
          <section className="agenda-card" aria-label="Horario de atención">
            <div className="agenda-card-titulo">
              <h2>Horario semanal de atención</h2>
              <p>Al cambiarlo, las citas confirmadas se conservan. Los cupos libres que queden fuera del nuevo horario se deshabilitan.</p>
            </div>
            <form className="agenda-form" onSubmit={(evento) => { evento.preventDefault(); ejecutar(() => guardarHorariosAgenda(horarios)) }}>
              <div className="agenda-filas">
                {horarios.map((item, indice) => (
                  <div className="agenda-fila" key={indice}>
                    <label className="agenda-campo">
                      <span>Día</span>
                      <select value={item.dia_semana} onChange={(evento) => setHorarios((actual) => actual.map((h, i) => i === indice ? { ...h, dia_semana: Number(evento.target.value) } : h))}>
                        {dias.map((nombre, i) => <option value={i} key={nombre}>{nombre}</option>)}
                      </select>
                    </label>
                    <label className="agenda-campo">
                      <span>Apertura</span>
                      <input type="time" value={item.apertura} required onChange={(evento) => setHorarios((actual) => actual.map((h, i) => i === indice ? { ...h, apertura: evento.target.value } : h))} />
                    </label>
                    <label className="agenda-campo">
                      <span>Cierre</span>
                      <input type="time" value={item.cierre} required onChange={(evento) => setHorarios((actual) => actual.map((h, i) => i === indice ? { ...h, cierre: evento.target.value } : h))} />
                    </label>
                    <button type="button" className="agenda-btn agenda-btn--quitar" onClick={() => setHorarios((actual) => actual.filter((_, i) => i !== indice))}>Quitar</button>
                  </div>
                ))}
              </div>
              <div className="agenda-acciones">
                <button type="button" className="agenda-btn agenda-btn--ghost" disabled={horarios.length >= 14} onClick={() => setHorarios((actual) => [...actual, { dia_semana: 1, apertura: '09:00', cierre: '17:00' }])}>Agregar franja</button>
                <button type="submit" className="agenda-btn agenda-btn--primario" disabled={ocupado}>Guardar horario</button>
              </div>
            </form>
          </section>

          <section className="agenda-card" aria-label="Publicar cupo">
            <div className="agenda-card-titulo">
              <h2>Publicar un cupo</h2>
              <p>Solo se admiten horas futuras dentro del horario registrado y en días laborables. Un cupo de ITS no ocupa el de ILE.</p>
            </div>
            <form className="agenda-form" onSubmit={(evento) => { evento.preventDefault(); ejecutar(() => crearCupoClinica({ id_clinica_servicio: servicio, fecha, hora })) }}>
              <div className="agenda-fila agenda-fila--cupo">
                <label className="agenda-campo">
                  <span>Servicio</span>
                  <select value={servicio} onChange={(evento) => setServicio(evento.target.value)} required>
                    {agenda.servicios.map((item) => <option key={item.id_clinica_servicio} value={item.id_clinica_servicio}>{item.nombre}</option>)}
                  </select>
                </label>
                <label className="agenda-campo">
                  <span>Fecha</span>
                  <input type="date" value={fecha} min={agenda.hoy} max={limite} onChange={(evento) => setFecha(evento.target.value)} required />
                </label>
                <label className="agenda-campo">
                  <span>Hora de inicio (Oaxaca)</span>
                  <input type="time" value={hora} onChange={(evento) => setHora(evento.target.value)} required />
                </label>
                <button type="submit" className="agenda-btn agenda-btn--primario" disabled={ocupado || !agenda.servicios.length}>Publicar cupo</button>
              </div>
              <p className="agenda-ayuda">La clínica decide cuántas horas ofrecer y evita horas demasiado próximas: aún no se calcula duración ni capacidad automáticamente.</p>
            </form>
          </section>

          <section className="agenda-card" aria-label="Bloquear día">
            <div className="agenda-card-titulo">
              <h2>Bloquear un día</h2>
              <p>Al bloquearlo se cancelarán automáticamente las citas futuras de ese día. Las citas canceladas permanecerán en el historial del paciente y de la clínica.</p>
            </div>
            <form className="agenda-form" onSubmit={(evento) => {
              evento.preventDefault()
              if (window.confirm(`¿Bloquear ${dia}? Se cancelarán todas las citas futuras de ese día.`)) ejecutar(() => bloquearDiaClinica(dia))
            }}>
              <div className="agenda-fila agenda-fila--bloqueo">
                <label className="agenda-campo">
                  <span>Fecha</span>
                  <input type="date" value={dia} min={agenda.hoy} max={limite} onChange={(evento) => setDia(evento.target.value)} required />
                </label>
                <button type="submit" className="agenda-btn agenda-btn--peligro" disabled={ocupado}>Bloquear día</button>
              </div>
            </form>
            <dl className="agenda-datos">
              <div>
                <dt>Festivos nacionales</dt>
                <dd>{agenda.festivos.length ? agenda.festivos.map((item) => `${item.fecha} (${item.nombre})`).join(', ') : 'Ninguno en los próximos 15 días.'}</dd>
              </div>
              <div>
                <dt>Días bloqueados</dt>
                <dd>{agenda.bloqueados.length ? agenda.bloqueados.map((item) => item.fecha).join(', ') : 'Ninguno por ahora.'}</dd>
              </div>
            </dl>
          </section>

          <section className="agenda-card" aria-label="Cupos próximos">
            <div className="agenda-card-titulo">
              <h2>Cupos próximos</h2>
              <p>Horarios publicados para los próximos 15 días.</p>
            </div>
            {agenda.espacios.length === 0 ? (
              <p className="agenda-vacio">No hay cupos publicados.</p>
            ) : (
              <ul className="agenda-cupos">
                {agenda.espacios.map((item) => (
                  <li key={item.id_espacio}>
                    <div className="agenda-cupo-info">
                      <strong>{agenda.servicios.find((s) => s.id_clinica_servicio === item.id_clinica_servicio)?.nombre || 'Servicio'}</strong>
                      <span>{fechaMexico(item.fecha_hora_inicio)} · {horaMexico(item.fecha_hora_inicio)} h</span>
                    </div>
                    <div className="agenda-cupo-acciones">
                      <span className={`agenda-estado ${item.ocupado ? 'is-ocupado' : item.habilitado ? 'is-disponible' : 'is-deshabilitado'}`}>
                        {item.ocupado ? 'Reservado' : item.habilitado ? 'Disponible' : 'Deshabilitado'}
                      </span>
                      {!item.ocupado && (
                        <button type="button" className="agenda-btn agenda-btn--ghost" disabled={ocupado} onClick={() => ejecutar(() => cambiarCupoClinica(item.id_espacio, !item.habilitado))}>
                          {item.habilitado ? 'Deshabilitar' : 'Habilitar'}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>}
      </main>
    </div>
  )
}
