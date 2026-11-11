import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { bloquearDiaClinica, cambiarCupoClinica, consultarAgendaClinica, crearCupoClinica, guardarHorariosAgenda } from '../../api/auth.js'
import '../Citas/Citas.css'

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

export default function AgendaClinica() {
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

  return <main className="citas-contenedor citas-principal">
    <Link to="/mi-clinica/citas">← Mis citas</Link>
    <h1>Gestionar agenda</h1>
    <p>Crea cupos concretos para ITS o ILE durante los próximos 15 días. No se generan citas automáticamente ni se supone cuánto dura cada atención.</p>
    {error && <p role="alert" className="citas-alerta citas-alerta--error">{error}</p>}
    {mensaje && <p role="status" className="citas-alerta citas-alerta--ok">{mensaje}</p>}
    {!agenda && !error && <p>Cargando agenda…</p>}
    {agenda && <>
      <section aria-label="Horario de atención">
        <h2>Horario semanal de atención</h2>
        <p>Al cambiarlo, las citas confirmadas se conservan. Los cupos libres que queden fuera del nuevo horario se deshabilitan.</p>
        <form onSubmit={(evento) => { evento.preventDefault(); ejecutar(() => guardarHorariosAgenda(horarios)) }}>
          {horarios.map((item, indice) => <div key={indice}>
            <label>Día <select value={item.dia_semana} onChange={(evento) => setHorarios((actual) => actual.map((h, i) => i === indice ? { ...h, dia_semana: Number(evento.target.value) } : h))}>
              {dias.map((nombre, i) => <option value={i} key={nombre}>{nombre}</option>)}
            </select></label>{' '}
            <label>Apertura <input type="time" value={item.apertura} required onChange={(evento) => setHorarios((actual) => actual.map((h, i) => i === indice ? { ...h, apertura: evento.target.value } : h))} /></label>{' '}
            <label>Cierre <input type="time" value={item.cierre} required onChange={(evento) => setHorarios((actual) => actual.map((h, i) => i === indice ? { ...h, cierre: evento.target.value } : h))} /></label>{' '}
            <button type="button" onClick={() => setHorarios((actual) => actual.filter((_, i) => i !== indice))}>Quitar</button>
          </div>)}
          <button type="button" disabled={horarios.length >= 14} onClick={() => setHorarios((actual) => [...actual, { dia_semana: 1, apertura: '09:00', cierre: '17:00' }])}>Agregar franja</button>{' '}
          <button type="submit" disabled={ocupado}>Guardar horario</button>
        </form>
      </section>
      <section aria-label="Publicar cupo">
        <h2>Publicar un cupo</h2>
        <form onSubmit={(evento) => { evento.preventDefault(); ejecutar(() => crearCupoClinica({ id_clinica_servicio: servicio, fecha, hora })) }}>
          <label>Servicio <select value={servicio} onChange={(evento) => setServicio(evento.target.value)} required>
            {agenda.servicios.map((item) => <option key={item.id_clinica_servicio} value={item.id_clinica_servicio}>{item.nombre}</option>)}
          </select></label>{' '}
          <label>Fecha <input type="date" value={fecha} min={agenda.hoy} max={limite} onChange={(evento) => setFecha(evento.target.value)} required /></label>{' '}
          <label>Hora de inicio (Oaxaca) <input type="time" value={hora} onChange={(evento) => setHora(evento.target.value)} required /></label>{' '}
          <button type="submit" disabled={ocupado || !agenda.servicios.length}>Publicar cupo</button>
        </form>
        <p>Solo se admiten horas futuras dentro del horario registrado y en días laborables. Un cupo de ITS no ocupa el de ILE. La clínica decide cuántas horas ofrecer y evita horas demasiado próximas: aún no se calcula duración ni capacidad automáticamente.</p>
      </section>
      <section aria-label="Bloquear día">
        <h2>Bloquear un día</h2>
        <p>Al bloquearlo se cancelarán automáticamente las citas futuras de ese día. Las citas canceladas permanecerán en el historial del paciente y de la clínica.</p>
        <form onSubmit={(evento) => {
          evento.preventDefault()
          if (window.confirm(`¿Bloquear ${dia}? Se cancelarán todas las citas futuras de ese día.`)) ejecutar(() => bloquearDiaClinica(dia))
        }}>
          <label>Fecha <input type="date" value={dia} min={agenda.hoy} max={limite} onChange={(evento) => setDia(evento.target.value)} required /></label>{' '}
          <button type="submit" disabled={ocupado}>Bloquear día</button>
        </form>
        <p>Festivos nacionales: {agenda.festivos.length ? agenda.festivos.map((item) => `${item.fecha} (${item.nombre})`).join(', ') : 'ninguno en los próximos 15 días'}.</p>
        <p>Días bloqueados: {agenda.bloqueados.length ? agenda.bloqueados.map((item) => item.fecha).join(', ') : 'ninguno'}.</p>
      </section>
      <section aria-label="Cupos próximos">
        <h2>Cupos próximos</h2>
        {agenda.espacios.length === 0 && <p>No hay cupos publicados.</p>}
        <ul>{agenda.espacios.map((item) => <li key={item.id_espacio}>
          {agenda.servicios.find((s) => s.id_clinica_servicio === item.id_clinica_servicio)?.nombre || 'Servicio'} — {fechaMexico(item.fecha_hora_inicio)} {horaMexico(item.fecha_hora_inicio)} — {item.ocupado ? 'Reservado' : item.habilitado ? 'Disponible' : 'Deshabilitado'}{' '}
          {!item.ocupado && <button type="button" disabled={ocupado} onClick={() => ejecutar(() => cambiarCupoClinica(item.id_espacio, !item.habilitado))}>
            {item.habilitado ? 'Deshabilitar' : 'Habilitar'}
          </button>}
        </li>)}</ul>
      </section>
    </>}
  </main>
}
