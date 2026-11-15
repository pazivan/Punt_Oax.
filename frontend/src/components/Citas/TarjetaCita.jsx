import { CalendarDays, Clock3, MapPin, UserRound, ArrowRight } from 'lucide-react'
import { ETIQUETAS_ESTADO, folioCita, formatearFechaCita, nombrePaciente } from '../../utils/citasClinica.js'

/** Tarjeta reutilizable: el tipo de vista determina qué nombre se destaca. */
export default function TarjetaCita({ cita, vista = 'clinica', onVerDetalles }) {
  const clinica = vista === 'clinica'
  const titulo = clinica ? nombrePaciente(cita) : (cita.nombre_clinica || 'Clínica sin nombre')
  return (
    <article className="citas-tarjeta">
      <div className="citas-tarjeta-superior">
        <span className={`citas-estado citas-estado--${cita.estado || 'otro'}`}>
          {ETIQUETAS_ESTADO[cita.estado] || 'Estado no registrado'}
        </span>
        <span className="citas-folio" title={cita.id_cita}>ID: {folioCita(cita)}…</span>
      </div>
      <h2 className="citas-tarjeta-titulo">{titulo}</h2>
      <p className="citas-tarjeta-servicio">{cita.nombre_servicio || 'Servicio no especificado'}</p>
      <div className="citas-tarjeta-datos">
        <p><CalendarDays size={16} aria-hidden="true" />{formatearFechaCita(cita.fecha_hora_inicio)}</p>
        {clinica ? (
          <p><UserRound size={16} aria-hidden="true" />{cita.paciente_telefono ? `Tel.: ${cita.paciente_telefono}` : 'Teléfono no registrado'}</p>
        ) : (
          <p><MapPin size={16} aria-hidden="true" />{cita.municipio_clinica || 'Ubicación por confirmar'}</p>
        )}
        <p><Clock3 size={16} aria-hidden="true" />{clinica ? cita.nombre_clinica || 'Tu clínica' : 'Atención programada'}</p>
      </div>
      <div className="citas-tarjeta-pie">
        <button type="button" className="citas-boton citas-boton--oscuro" onClick={() => onVerDetalles(cita)}>
          Ver detalles <ArrowRight size={15} aria-hidden="true" />
        </button>
        <span className="citas-pie-ayuda">Consulta la información de la reserva</span>
      </div>
    </article>
  )
}
