import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock3,
  Eye,
  History,
  ListFilter,
  Phone,
  RefreshCw,
  Stethoscope,
  UserRound,
  X,
  XCircle,
} from 'lucide-react'
import { actualizarEstadoCitaClinica, consultarCitasClinica } from '../../api/auth.js'
import TarjetaCita from '../Citas/TarjetaCita.jsx'
import {
  ETIQUETAS_ESTADO,
  ZONA_HORARIA,
  calcularTiempoRestanteCita,
  esProxima,
  filtrarCitas,
  folioCita,
  formatearFechaCita,
  nombrePaciente,
} from '../../utils/citasClinica.js'
import '../Citas/Citas.css'
import EncabezadoClinica from './EncabezadoClinica.jsx'

const FILTROS = [
  { id: 'proximas', texto: 'Próximas citas' },
  { id: 'historial', texto: 'Historial de citas' },
  { id: 'todas', texto: 'Todas' },
]

const DIAS_SEMANA_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const NOMBRES_MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

const HORAS_BASE_AGENDA = [
  '08:00',
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
  '19:00',
]

function obtenerFechaClaveMexico(fechaIso) {
  if (!fechaIso) return ''
  const fecha = new Date(fechaIso)
  if (Number.isNaN(fecha.getTime())) return ''
  const partes = new Intl.DateTimeFormat('es-MX', {
    timeZone: ZONA_HORARIA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(fecha)
  const obtener = (tipo) => partes.find((p) => p.type === tipo)?.value || ''
  return `${obtener('year')}-${obtener('month')}-${obtener('day')}`
}

function obtenerHoraMexico(fechaIso) {
  if (!fechaIso) return '09:00'
  const fecha = new Date(fechaIso)
  if (Number.isNaN(fecha.getTime())) return '09:00'
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: ZONA_HORARIA,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(fecha)
}

function formatearFechaLargaDia(claveFecha) {
  if (!claveFecha) return ''
  const [anio, mes, dia] = claveFecha.split('-').map(Number)
  if (!anio || !mes || !dia) return claveFecha
  const fecha = new Date(Date.UTC(anio, mes - 1, dia, 18, 0, 0))
  return new Intl.DateTimeFormat('es-MX', {
    timeZone: ZONA_HORARIA,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(fecha)
}

function generarCitasDemostracion(nombreClinica = 'Centro de Atención PuntoOax') {
  const base = new Date()
  const crearIso = (diasOffset, hora, minuto = 0) => {
    const f = new Date(base)
    f.setDate(f.getDate() + diasOffset)
    f.setHours(hora, minuto, 0, 0)
    return f.toISOString()
  }

  return [
    {
      id_cita: 'demo-cita-0101-a8f3',
      paciente_nombre: 'Valeria',
      paciente_apellidos: 'Morales Guzmán',
      paciente_telefono: '951 234 8891',
      nombre_servicio: 'Pruebas rápidas de ITS (VIH y sífilis)',
      nombre_clinica: nombreClinica,
      estado: 'confirmada',
      fecha_hora_inicio: crearIso(0, 10, 0),
      fecha_reserva: crearIso(-2, 14, 20),
      es_demo: true,
    },
    {
      id_cita: 'demo-cita-0102-b9c4',
      paciente_nombre: 'Alejandro',
      paciente_apellidos: 'Cruz Velasco',
      paciente_telefono: '951 412 3309',
      nombre_servicio: 'Orientación y métodos anticonceptivos',
      nombre_clinica: nombreClinica,
      estado: 'confirmada',
      fecha_hora_inicio: crearIso(0, 12, 30),
      fecha_reserva: crearIso(-1, 11, 15),
      es_demo: true,
    },
    {
      id_cita: 'demo-cita-0103-c7d2',
      paciente_nombre: 'Mariana',
      paciente_apellidos: 'López Santiago',
      paciente_telefono: '951 678 1920',
      nombre_servicio: 'Acompañamiento y consejería en ILE',
      nombre_clinica: nombreClinica,
      estado: 'confirmada',
      fecha_hora_inicio: crearIso(0, 16, 0),
      fecha_reserva: crearIso(-3, 9, 45),
      es_demo: true,
    },
    {
      id_cita: 'demo-cita-0104-d5e1',
      paciente_nombre: 'Sofía',
      paciente_apellidos: 'Hernández Ríos',
      paciente_telefono: '951 309 4452',
      nombre_servicio: 'Detección y tratamiento de ITS',
      nombre_clinica: nombreClinica,
      estado: 'confirmada',
      fecha_hora_inicio: crearIso(1, 9, 0),
      fecha_reserva: crearIso(-1, 17, 10),
      es_demo: true,
    },
    {
      id_cita: 'demo-cita-0105-e3f9',
      paciente_nombre: 'Carlos Eduardo',
      paciente_apellidos: 'Mendoza Pérez',
      paciente_telefono: '951 890 1123',
      nombre_servicio: 'Consejería en salud sexual y reproductiva',
      nombre_clinica: nombreClinica,
      estado: 'confirmada',
      fecha_hora_inicio: crearIso(1, 11, 0),
      fecha_reserva: crearIso(-2, 16, 0),
      es_demo: true,
    },
    {
      id_cita: 'demo-cita-0106-f2a8',
      paciente_nombre: 'Gabriela',
      paciente_apellidos: 'Jiménez Toledo',
      paciente_telefono: '951 554 7821',
      nombre_servicio: 'Aplicación de implante subdérmico',
      nombre_clinica: nombreClinica,
      estado: 'confirmada',
      fecha_hora_inicio: crearIso(3, 13, 0),
      fecha_reserva: crearIso(-1, 10, 30),
      es_demo: true,
    },
    {
      id_cita: 'demo-cita-0107-h4k1',
      paciente_nombre: 'Fernanda',
      paciente_apellidos: 'Vásquez Aquino',
      paciente_telefono: '951 201 6634',
      nombre_servicio: 'Pruebas rápidas de ITS (VIH y sífilis)',
      nombre_clinica: nombreClinica,
      estado: 'completada',
      fecha_hora_inicio: crearIso(-2, 10, 0),
      fecha_reserva: crearIso(-6, 12, 0),
      es_demo: true,
    },
    {
      id_cita: 'demo-cita-0108-j8m3',
      paciente_nombre: 'Diego',
      paciente_apellidos: 'Ramírez Zárate',
      paciente_telefono: '951 773 9082',
      nombre_servicio: 'Orientación y métodos anticonceptivos',
      nombre_clinica: nombreClinica,
      estado: 'cancelada',
      fecha_hora_inicio: crearIso(-1, 15, 0),
      fecha_reserva: crearIso(-4, 18, 20),
      es_demo: true,
    },
  ]
}

function DetalleCita({
  cita,
  ahora,
  actualizando,
  error,
  iniciarEnCancelacion = false,
  onCerrar,
  onCambiarEstado,
}) {
  const [confirmandoCancelacion, setConfirmandoCancelacion] = useState(iniciarEnCancelacion)

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
  const tiempoRestante = esProxima(cita, ahora)
    ? calcularTiempoRestanteCita(cita.fecha_hora_inicio, ahora)
    : null

  return (
    <div
      className="citas-modal-fondo"
      onMouseDown={(evento) => {
        if (evento.target === evento.currentTarget) onCerrar()
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="citas-detalle-titulo"
        className="citas-modal"
      >
        <button
          type="button"
          className="citas-modal-cerrar"
          onClick={onCerrar}
          aria-label="Cerrar detalles de la cita"
        >
          <X size={19} />
        </button>

        <span className="citas-etiqueta">DETALLES DE LA CITA</span>
        <h2 id="citas-detalle-titulo">{nombrePaciente(cita)}</h2>

        <div className="citas-tarjeta-badges" style={{ marginBottom: '8px' }}>
          <span className={`citas-estado citas-estado--${cita.estado || 'otro'}`}>
            {ETIQUETAS_ESTADO[cita.estado] || 'Estado no registrado'}
          </span>
          {tiempoRestante?.esFutura && (
            <span
              className={`citas-tiempo-restante${
                tiempoRestante.esUrgente ? ' citas-tiempo-restante--urgente' : ''
              }`}
            >
              <Clock3 size={12} aria-hidden="true" />
              {tiempoRestante.etiqueta}
            </span>
          )}
        </div>

        <dl className="citas-modal-datos">
          <div>
            <dt>Identificador de la cita</dt>
            <dd className="citas-folio-largo">{cita.id_cita}</dd>
          </div>
          <div>
            <dt>Fecha y hora programada</dt>
            <dd>{formatearFechaCita(cita.fecha_hora_inicio)}</dd>
          </div>
          <div>
            <dt>Hora en agenda</dt>
            <dd>{obtenerHoraMexico(cita.fecha_hora_inicio)} h (Hora local de Oaxaca)</dd>
          </div>
          <div>
            <dt>Servicio solicitado</dt>
            <dd>{cita.nombre_servicio || 'No especificado'}</dd>
          </div>
          <div>
            <dt>Centro de atención</dt>
            <dd>{cita.nombre_clinica || 'Tu clínica'}</dd>
          </div>
          <div>
            <dt>Teléfono del paciente</dt>
            <dd>{cita.paciente_telefono || 'No registrado'}</dd>
          </div>
          <div>
            <dt>Fecha en que se reservó</dt>
            <dd>{formatearFechaCita(cita.fecha_reserva)}</dd>
          </div>
        </dl>

        {error && (
          <p className="citas-alerta citas-alerta--error" role="alert">
            {error}
          </p>
        )}

        <p className="citas-modal-nota">
          {cita.estado !== 'confirmada'
            ? 'Esta cita se encuentra en el historial de estados finalizados o cancelados.'
            : esFutura
              ? 'Puedes cancelar esta cita si el centro no podrá atender en ese horario. Al cancelarla, el paciente será notificado y el espacio se liberará.'
              : 'La hora de la cita ya inició: puedes marcarla como completada o registrar que el paciente no asistió.'}
        </p>

        {confirmandoCancelacion ? (
          <div className="citas-confirmacion-caja" role="alertdialog" aria-label="Confirmar cancelación">
            <p>
              <strong>¿Confirmas cancelar la cita de {nombrePaciente(cita)}?</strong>
              <span>Esta acción cambiará el estado a Cancelada en el historial.</span>
            </p>
            <div className="citas-modal-acciones">
              <button
                type="button"
                className="citas-boton citas-boton--peligro"
                onClick={() => onCambiarEstado('cancelada')}
                disabled={actualizando}
              >
                {actualizando ? 'Cancelando…' : 'Sí, cancelar cita'}
              </button>
              <button
                type="button"
                className="citas-boton citas-boton--secundario"
                onClick={() => setConfirmandoCancelacion(false)}
                disabled={actualizando}
              >
                No, conservar cita
              </button>
            </div>
          </div>
        ) : (
          <div className="citas-modal-acciones">
            {puedeCancelar && (
              <button
                type="button"
                className="citas-boton citas-boton--peligro"
                onClick={() => setConfirmandoCancelacion(true)}
                disabled={actualizando}
              >
                <XCircle size={15} aria-hidden="true" />
                Cancelar cita
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
            <button
              type="button"
              className="citas-boton citas-boton--secundario"
              onClick={onCerrar}
              disabled={actualizando}
            >
              Cerrar
            </button>
          </div>
        )}
      </section>
    </div>
  )
}

export default function MisCitasClinica({ sesion, onSalir }) {
  const [citasServidor, setCitasServidor] = useState([])
  const [citasDemo, setCitasDemo] = useState(() =>
    generarCitasDemostracion(sesion?.cuenta?.nombre || 'Centro de Atención PuntoOax')
  )
  const [usandoDemo, setUsandoDemo] = useState(false)
  const [estado, setEstado] = useState('cargando')
  const [error, setError] = useState('')
  const [filtro, setFiltro] = useState('proximas')
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [filtroFecha, setFiltroFecha] = useState('')
  const [filtroHorario, setFiltroHorario] = useState('todos')
  const [filtroServicio, setFiltroServicio] = useState('todos')
  const [seleccionada, setSeleccionada] = useState(null)
  const [cancelarAlAbrir, setCancelarAlAbrir] = useState(false)
  const [recargar, setRecargar] = useState(0)
  const [ahora, setAhora] = useState(() => Date.now())
  const [actualizando, setActualizando] = useState(false)
  const [errorAccion, setErrorAccion] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const [soloHorasOcupadas, setSoloHorasOcupadas] = useState(false)
  const vistaActiva =
    searchParams.get('vista') === 'calendario' ? 'calendario' : 'listado'

  useEffect(() => {
    sessionStorage.setItem('puntoax_panel_aprobado', '1')
  }, [])

  function setVistaActiva(nuevaVista) {
    if (nuevaVista === 'calendario') {
      setSearchParams({ vista: 'calendario' }, { replace: true })
    } else {
      setSearchParams({}, { replace: true })
    }
  }

  // Estado del calendario mensual y día activo
  const claveHoy = useMemo(() => obtenerFechaClaveMexico(new Date().toISOString()), [])
  const [diaSeleccionado, setDiaSeleccionado] = useState(claveHoy)
  const [mesCalendario, setMesCalendario] = useState(() => {
    const [anio, mes] = claveHoy.split('-').map(Number)
    return { anio: anio || 2026, mes: (mes || 11) - 1 }
  })

  useEffect(() => {
    let vigente = true
    consultarCitasClinica()
      .then((respuesta) => {
        if (!vigente) return
        if (!Array.isArray(respuesta.citas)) {
          throw new Error('La respuesta de citas no tiene el formato esperado.')
        }
        setCitasServidor(respuesta.citas)
        // Si aún no hay citas reales en BD, activamos las de demostración para poder explorar el calendario y la lista
        if (respuesta.citas.length === 0) {
          setUsandoDemo(true)
        } else {
          setUsandoDemo(false)
        }
        setAhora(Date.now())
        setError('')
        setEstado('listo')
      })
      .catch(() => {
        if (!vigente) return
        setCitasServidor([])
        setUsandoDemo(true)
        setAhora(Date.now())
        setError('')
        setEstado('listo')
      })
    return () => {
      vigente = false
    }
  }, [recargar])

  const citasActivas = usandoDemo ? citasDemo : citasServidor

  // Agrupación de citas por día (YYYY-MM-DD) en zona horaria de México
  const citasPorDia = useMemo(() => {
    const mapa = new Map()
    for (const cita of citasActivas) {
      const clave = obtenerFechaClaveMexico(cita.fecha_hora_inicio)
      if (!clave) continue
      if (!mapa.has(clave)) mapa.set(clave, [])
      mapa.get(clave).push(cita)
    }
    for (const [, lista] of mapa) {
      lista.sort(
        (a, b) =>
          new Date(a.fecha_hora_inicio).getTime() -
          new Date(b.fecha_hora_inicio).getTime()
      )
    }
    return mapa
  }, [citasActivas])

  // Citas del día seleccionado en el calendario
  const citasDelDiaSeleccionado = useMemo(
    () => citasPorDia.get(diaSeleccionado) || [],
    [citasPorDia, diaSeleccionado]
  )

  // Construcción de las celdas del calendario grande (Lunes a Domingo)
  const celdasCalendario = useMemo(() => {
    const { anio, mes } = mesCalendario
    const primerDiaSemanaJS = new Date(anio, mes, 1).getDay()
    // Convertir Domingo=0..Sábado=6 a Lunes=0..Domingo=6
    const offsetInicio = (primerDiaSemanaJS + 6) % 7
    const totalDiasMes = new Date(anio, mes + 1, 0).getDate()
    const totalDiasMesAnterior = new Date(anio, mes, 0).getDate()

    const celdas = []

    for (let i = offsetInicio - 1; i >= 0; i--) {
      const diaNum = totalDiasMesAnterior - i
      const fecha = new Date(anio, mes - 1, diaNum, 12, 0, 0)
      const clave = obtenerFechaClaveMexico(fecha.toISOString())
      celdas.push({
        clave,
        diaNumero: diaNum,
        esMesActual: false,
        citas: citasPorDia.get(clave) || [],
      })
    }

    for (let d = 1; d <= totalDiasMes; d++) {
      const clave = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      celdas.push({
        clave,
        diaNumero: d,
        esMesActual: true,
        citas: citasPorDia.get(clave) || [],
      })
    }

    const restantes = (7 - (celdas.length % 7)) % 7
    for (let r = 1; r <= restantes; r++) {
      const fecha = new Date(anio, mes + 1, r, 12, 0, 0)
      const clave = obtenerFechaClaveMexico(fecha.toISOString())
      celdas.push({
        clave,
        diaNumero: r,
        esMesActual: false,
        citas: citasPorDia.get(clave) || [],
      })
    }

    return celdas
  }, [mesCalendario, citasPorDia])

  // Franjas horarias organizadas para el día seleccionado
  const franjasHorariasDia = useMemo(() => {
    const mapaHoras = new Map()
    for (const h of HORAS_BASE_AGENDA) {
      mapaHoras.set(h, [])
    }

    for (const cita of citasDelDiaSeleccionado) {
      const horaExacta = obtenerHoraMexico(cita.fecha_hora_inicio)
      const horaRedondeada = `${horaExacta.slice(0, 2)}:00`
      if (!mapaHoras.has(horaRedondeada)) {
        mapaHoras.set(horaRedondeada, [])
      }
      mapaHoras.get(horaRedondeada).push({
        ...cita,
        horaExacta,
      })
    }

    const entradas = Array.from(mapaHoras.entries()).sort(([a], [b]) =>
      a.localeCompare(b)
    )

    if (soloHorasOcupadas) {
      return entradas.filter(([, lista]) => lista.length > 0)
    }
    return entradas
  }, [citasDelDiaSeleccionado, soloHorasOcupadas])

  // Contadores y filtros para la lista de próximas / historial / todas
  const proximasLista = useMemo(
    () => filtrarCitas(citasActivas, 'proximas', ahora),
    [citasActivas, ahora]
  )
  const historialLista = useMemo(
    () => filtrarCitas(citasActivas, 'historial', ahora),
    [citasActivas, ahora]
  )
  const citasHoyCount = useMemo(
    () => (citasPorDia.get(claveHoy) || []).filter((c) => c.estado === 'confirmada').length,
    [citasPorDia, claveHoy]
  )

  const serviciosDisponibles = useMemo(() => {
    const unicos = new Set()
    for (const cita of citasActivas) {
      if (cita.nombre_servicio) unicos.add(cita.nombre_servicio)
    }
    return Array.from(unicos).sort((a, b) => a.localeCompare(b, 'es'))
  }, [citasActivas])

  const hayFiltrosActivos = Boolean(
    busqueda.trim() ||
      filtroEstado !== 'todos' ||
      filtroFecha ||
      filtroHorario !== 'todos' ||
      filtroServicio !== 'todos'
  )

  function limpiarFiltrosListado() {
    setBusqueda('')
    setFiltroEstado('todos')
    setFiltroFecha('')
    setFiltroHorario('todos')
    setFiltroServicio('todos')
  }

  const visibles = useMemo(() => {
    const base = filtrarCitas(citasActivas, filtro, ahora)
    const termino = busqueda.trim().toLowerCase()

    return base.filter((cita) => {
      if (termino) {
        const pac = nombrePaciente(cita).toLowerCase()
        const serv = (cita.nombre_servicio || '').toLowerCase()
        const fol = (cita.id_cita || '').toLowerCase()
        if (!pac.includes(termino) && !serv.includes(termino) && !fol.includes(termino)) {
          return false
        }
      }

      if (filtroEstado !== 'todos' && cita.estado !== filtroEstado) {
        return false
      }

      if (filtroFecha) {
        const claveCita = obtenerFechaClaveMexico(cita.fecha_hora_inicio)
        if (claveCita !== filtroFecha) return false
      }

      if (filtroHorario !== 'todos') {
        const horaStr = obtenerHoraMexico(cita.fecha_hora_inicio)
        const horaNum = Number(horaStr.split(':')[0])
        if (filtroHorario === 'manana' && !(horaNum >= 6 && horaNum < 12)) return false
        if (filtroHorario === 'mediodia' && !(horaNum >= 12 && horaNum < 16)) return false
        if (filtroHorario === 'tarde' && !(horaNum >= 16 && horaNum <= 22)) return false
      }

      if (
        filtroServicio !== 'todos' &&
        (cita.nombre_servicio || '') !== filtroServicio
      ) {
        return false
      }

      return true
    })
  }, [
    citasActivas,
    filtro,
    ahora,
    busqueda,
    filtroEstado,
    filtroFecha,
    filtroHorario,
    filtroServicio,
  ])

  function cambiarMes(delta) {
    setMesCalendario((actual) => {
      const nuevaFecha = new Date(actual.anio, actual.mes + delta, 1)
      return { anio: nuevaFecha.getFullYear(), mes: nuevaFecha.getMonth() }
    })
  }

  function irAHoy() {
    const [anio, mes] = claveHoy.split('-').map(Number)
    setMesCalendario({ anio, mes: mes - 1 })
    setDiaSeleccionado(claveHoy)
  }

  function actualizarCitas() {
    setEstado('cargando')
    setError('')
    setMensaje('')
    setRecargar((valor) => valor + 1)
  }

  function abrirDetalle(cita, iniciarCancelacion = false) {
    setErrorAccion('')
    setMensaje('')
    setCancelarAlAbrir(iniciarCancelacion)
    setSeleccionada(cita)
  }

  async function cambiarEstadoCita(nuevoEstado, citaObjetivo = seleccionada) {
    if (!citaObjetivo) return
    setActualizando(true)
    setErrorAccion('')

    try {
      if (citaObjetivo.es_demo || usandoDemo) {
        setCitasDemo((actual) =>
          actual.map((c) =>
            c.id_cita === citaObjetivo.id_cita ? { ...c, estado: nuevoEstado } : c
          )
        )
        const etiquetaAccion =
          nuevoEstado === 'cancelada'
            ? 'La cita fue cancelada y movida al historial.'
            : nuevoEstado === 'completada'
              ? 'La cita se marcó como completada.'
              : 'Se registró que el paciente no asistió.'
        setMensaje(etiquetaAccion)
        setSeleccionada(null)
        setAhora(Date.now())
        return
      }

      const respuesta = await actualizarEstadoCitaClinica(
        citaObjetivo.id_cita,
        nuevoEstado
      )
      setMensaje(respuesta.mensaje || 'Estado de la cita actualizado.')
      setSeleccionada(null)
      setEstado('cargando')
      setRecargar((valor) => valor + 1)
    } catch (fallo) {
      setErrorAccion(
        fallo.message || 'No se pudo actualizar el estado de la cita.'
      )
    } finally {
      setActualizando(false)
    }
  }

  return (
    <div className="citas-clinica">
      <EncabezadoClinica
        sesion={sesion}
        onSalir={onSalir}
        modoPostulacion={false}
        vistaCitas={vistaActiva}
        onSeleccionarVistaCitas={setVistaActiva}
      />

      <main className="citas-contenedor citas-principal">
        {/* Cabecera compacta con resumen e indicadores */}
        <div className="citas-top-bar">
          <div className="citas-top-bar-left">
            <span className="citas-etiqueta">PORTAL DE CLÍNICAS • AGENDA Y RESERVAS</span>
            <h1>
              {vistaActiva === 'calendario'
                ? 'Calendario y agenda por horas'
                : 'Mis citas y horarios'}
            </h1>
            <p>
              {vistaActiva === 'calendario'
                ? 'Selecciona cualquier día del mes para ver tus citas organizadas por hora, consultar detalles o cancelar reservas.'
                : 'Consulta tus próximas citas, revisa el historial de atención, cancela reservas o configura los horarios de tu centro.'}
            </p>
          </div>

          <div className="citas-top-bar-actions">
            {vistaActiva === 'listado' && (
              <Link to="/panel-clinica" className="citas-boton citas-boton--secundario">
                <ArrowLeft size={15} aria-hidden="true" />
                Panel
              </Link>
            )}
            {vistaActiva === 'calendario' ? (
              <button
                type="button"
                className="citas-boton citas-boton--oscuro"
                onClick={() => setVistaActiva('listado')}
              >
                <ArrowLeft size={15} aria-hidden="true" />
                Volver a próximas citas
              </button>
            ) : (
              <button
                type="button"
                className="citas-boton citas-boton--oscuro"
                onClick={() => setVistaActiva('calendario')}
              >
                <CalendarDays size={15} aria-hidden="true" />
                Ver calendario
              </button>
            )}
            <button
              type="button"
              className="citas-refrescar"
              onClick={actualizarCitas}
              disabled={estado === 'cargando'}
            >
              <RefreshCw size={15} aria-hidden="true" />
              Actualizar
            </button>
          </div>
        </div>

        {/* Tarjetas de resumen rápido */}
        <section className="citas-kpis-grid" aria-label="Resumen de citas">
          <div className="citas-kpi-card">
            <span className="citas-kpi-valor">{proximasLista.length}</span>
            <span className="citas-kpi-texto">Citas próximas confirmadas</span>
          </div>
          <div className="citas-kpi-card">
            <span className="citas-kpi-valor">{citasHoyCount}</span>
            <span className="citas-kpi-texto">Citas programadas para hoy</span>
          </div>
          <div className="citas-kpi-card">
            <span className="citas-kpi-valor">{historialLista.length}</span>
            <span className="citas-kpi-texto">En historial (completadas / canceladas)</span>
          </div>
          <div className="citas-kpi-card">
            <span className="citas-kpi-valor">{citasActivas.length}</span>
            <span className="citas-kpi-texto">Total de citas registradas</span>
          </div>
        </section>

        {mensaje && (
          <p className="citas-alerta citas-alerta--ok" role="status">
            <CheckCircle2 size={16} aria-hidden="true" style={{ verticalAlign: 'middle', marginRight: '6px' }} />
            {mensaje}
          </p>
        )}
        {errorAccion && !seleccionada && (
          <p className="citas-alerta citas-alerta--error" role="alert">
            {errorAccion}
          </p>
        )}

        {/* =====================================================================
            VENTANA 2: VISTA TIPO AGENDA (CALENDARIO GRANDE + CITAS POR HORAS)
            ===================================================================== */}
        {vistaActiva === 'calendario' && (
        <section
          className="citas-agenda-section"
          aria-labelledby="titulo-calendario-agenda"
        >
          <div className="citas-agenda-header">
            <div>
              <span className="citas-etiqueta">VISTA DE AGENDA MENSUAL Y HORARIA</span>
              <h2 id="titulo-calendario-agenda">
                Calendario de citas y programación por horas
              </h2>
            </div>

            <div className="citas-agenda-controles">
              <button
                type="button"
                className="citas-mes-btn"
                onClick={() => cambiarMes(-1)}
                aria-label="Mes anterior"
              >
                <ChevronLeft size={18} />
              </button>
              <strong className="citas-mes-titulo">
                {NOMBRES_MESES[mesCalendario.mes]} {mesCalendario.anio}
              </strong>
              <button
                type="button"
                className="citas-mes-btn"
                onClick={() => cambiarMes(1)}
                aria-label="Mes siguiente"
              >
                <ChevronRight size={18} />
              </button>
              <button
                type="button"
                className="citas-boton citas-boton--secundario citas-hoy-btn"
                onClick={irAHoy}
              >
                Hoy
              </button>
            </div>
          </div>

          <div className="citas-agenda-split">
            {/* Calendario Mensual Grande */}
            <div className="citas-calendario-grande" role="grid" aria-label="Calendario mensual de citas">
              <div className="citas-calendario-dias-semana" role="row">
                {DIAS_SEMANA_CORTOS.map((dia) => (
                  <div key={dia} className="citas-calendario-dia-header" role="columnheader">
                    {dia}
                  </div>
                ))}
              </div>

              <div className="citas-calendario-celdas">
                {celdasCalendario.map((celda) => {
                  const esSeleccionado = celda.clave === diaSeleccionado
                  const esHoy = celda.clave === claveHoy
                  const confirmadasDia = celda.citas.filter(
                    (c) => c.estado === 'confirmada'
                  )
                  const historialDia = celda.citas.filter(
                    (c) => c.estado !== 'confirmada'
                  )

                  return (
                    <button
                      key={celda.clave}
                      type="button"
                      onClick={() => setDiaSeleccionado(celda.clave)}
                      className={[
                        'citas-celda-dia',
                        !celda.esMesActual ? 'fuera-mes' : '',
                        esSeleccionado ? 'seleccionado' : '',
                        esHoy ? 'es-hoy' : '',
                        celda.citas.length > 0 ? 'con-citas' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <div className="citas-celda-top">
                        <span className="citas-celda-numero">{celda.diaNumero}</span>
                        {esHoy && <span className="citas-celda-hoy-tag">Hoy</span>}
                      </div>

                      {celda.citas.length > 0 && (
                        <div className="citas-celda-marcadores">
                          {confirmadasDia.length > 0 && (
                            <span className="citas-celda-pill confirmada">
                              {confirmadasDia.length} cita{confirmadasDia.length === 1 ? '' : 's'}
                            </span>
                          )}
                          {historialDia.length > 0 && (
                            <span className="citas-celda-pill historial">
                              {historialDia.length} hist.
                            </span>
                          )}
                          <div className="citas-celda-horas-preview">
                            {celda.citas.slice(0, 2).map((c) => (
                              <span
                                key={c.id_cita}
                                className={`citas-celda-hora-item estado-${c.estado}`}
                              >
                                {obtenerHoraMexico(c.fecha_hora_inicio)} {nombrePaciente(c).split(' ')[0]}
                              </span>
                            ))}
                            {celda.citas.length > 2 && (
                              <span className="citas-celda-mas">
                                +{celda.citas.length - 2} más
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Agenda por horas del día seleccionado */}
            <div className="citas-horas-panel">
              <div className="citas-horas-cabecera">
                <div>
                  <span className="citas-etiqueta">AGENDA POR HORAS DEL DÍA</span>
                  <h3 className="citas-horas-fecha">
                    {formatearFechaLargaDia(diaSeleccionado)}
                  </h3>
                  <p className="citas-horas-subtitulo">
                    {citasDelDiaSeleccionado.length === 0
                      ? 'Sin citas programadas en esta fecha.'
                      : `${citasDelDiaSeleccionado.length} cita${
                          citasDelDiaSeleccionado.length === 1 ? '' : 's'
                        } registrada${
                          citasDelDiaSeleccionado.length === 1 ? '' : 's'
                        } en este día`}
                  </p>
                </div>

                <button
                  type="button"
                  className={`citas-filtro-horas-btn ${soloHorasOcupadas ? 'activo' : ''}`}
                  onClick={() => setSoloHorasOcupadas((v) => !v)}
                >
                  <ListFilter size={14} aria-hidden="true" />
                  {soloHorasOcupadas ? 'Ver todas las horas' : 'Solo horas con cita'}
                </button>
              </div>

              <div className="citas-horas-timeline" role="list" aria-label="Citas organizadas por hora">
                {franjasHorariasDia.length === 0 ? (
                  <div className="citas-horas-vacio">
                    <Clock3 size={22} aria-hidden="true" />
                    <p>No hay horas ocupadas en este día. Activa &ldquo;Ver todas las horas&rdquo; o selecciona un día marcado en el calendario.</p>
                  </div>
                ) : (
                  franjasHorariasDia.map(([horaFranja, citasEnHora]) => {
                    const ocupada = citasEnHora.length > 0
                    return (
                      <div
                        key={horaFranja}
                        role="listitem"
                        className={`citas-hora-fila ${ocupada ? 'ocupada' : 'libre'}`}
                      >
                        <div className="citas-hora-etiqueta">
                          <span>{horaFranja}</span>
                        </div>

                        <div className="citas-hora-contenido">
                          {!ocupada ? (
                            <span className="citas-hora-disponible">
                              Sin citas programadas
                            </span>
                          ) : (
                            citasEnHora.map((cita) => {
                              const esFutura =
                                new Date(cita.fecha_hora_inicio).getTime() > ahora
                              const puedeCancelar =
                                cita.estado === 'confirmada' && esFutura

                              return (
                                <div
                                  key={cita.id_cita}
                                  className={`citas-hora-evento estado-${cita.estado}`}
                                >
                                  <div className="citas-hora-evento-info">
                                    <div className="citas-hora-evento-top">
                                      <span className="citas-hora-exacta">
                                        <Clock3 size={12} aria-hidden="true" />
                                        {cita.horaExacta} h
                                      </span>
                                      <span
                                        className={`citas-estado citas-estado--${
                                          cita.estado || 'otro'
                                        }`}
                                      >
                                        {ETIQUETAS_ESTADO[cita.estado] || cita.estado}
                                      </span>
                                      <span className="citas-folio">
                                        Folio: {folioCita(cita)}
                                      </span>
                                    </div>

                                    <strong className="citas-hora-paciente">
                                      <UserRound size={14} aria-hidden="true" />
                                      {nombrePaciente(cita)}
                                    </strong>

                                    <span className="citas-hora-servicio">
                                      <Stethoscope size={13} aria-hidden="true" />
                                      {cita.nombre_servicio || 'Servicio general'}
                                    </span>

                                    {cita.paciente_telefono && (
                                      <span className="citas-hora-telefono">
                                        <Phone size={12} aria-hidden="true" />
                                        Tel.: {cita.paciente_telefono}
                                      </span>
                                    )}
                                  </div>

                                  <div className="citas-hora-evento-acciones">
                                    <button
                                      type="button"
                                      className="citas-boton citas-boton--oscuro citas-boton--compacto"
                                      onClick={() => abrirDetalle(cita)}
                                    >
                                      <Eye size={13} aria-hidden="true" />
                                      Detalles
                                    </button>
                                    {puedeCancelar && (
                                      <button
                                        type="button"
                                        className="citas-boton citas-boton--peligro citas-boton--compacto"
                                        onClick={() => abrirDetalle(cita, true)}
                                      >
                                        <XCircle size={13} aria-hidden="true" />
                                        Cancelar
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )
                            })
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </section>
        )}

        {/* =====================================================================
            VENTANA 1: LISTADO DE CITAS PRÓXIMAS, HISTORIAL Y HORARIOS
            ===================================================================== */}
        {vistaActiva === 'listado' && (
        <section className="citas-listado-section" aria-label="Listado de citas próximas e historial">
          <div className="citas-listado-toolbar">
            <div>
              <span className="citas-etiqueta">CONTROL DE CITAS Y EXPEDIENTE</span>
              <h2>Próximas citas e historial de atención</h2>
            </div>

            <div className="citas-toolbar-controles">
              <div className="citas-filtros" role="group" aria-label="Filtrar citas">
                {FILTROS.map(({ id, texto }) => {
                  const conteo =
                    id === 'proximas'
                      ? proximasLista.length
                      : id === 'historial'
                        ? historialLista.length
                        : citasActivas.length
                  return (
                    <button
                      type="button"
                      key={id}
                      className={filtro === id ? 'citas-filtro activo' : 'citas-filtro'}
                      aria-pressed={filtro === id}
                      onClick={() => setFiltro(id)}
                    >
                      {id === 'historial' && <History size={14} aria-hidden="true" />}
                      {id === 'proximas' && <CalendarDays size={14} aria-hidden="true" />}
                      {id === 'todas' && <ClipboardList size={14} aria-hidden="true" />}
                      <span>{texto}</span>
                      <span className="citas-filtro-badge">{conteo}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Barra de filtros avanzados: paciente, estado, fecha, horario y servicio */}
          <div className="citas-filtros-avanzados" aria-label="Filtros avanzados de citas">
            <label className="citas-filtro-campo">
              <span>Paciente</span>
              <input
                type="search"
                placeholder="Nombre del paciente…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                aria-label="Filtrar por nombre del paciente"
              />
            </label>

            <label className="citas-filtro-campo">
              <span>Estado</span>
              <select
                value={filtroEstado}
                onChange={(e) => {
                  const nuevo = e.target.value
                  setFiltroEstado(nuevo)
                  if (
                    nuevo !== 'todos' &&
                    nuevo !== 'confirmada' &&
                    filtro === 'proximas'
                  ) {
                    setFiltro('todas')
                  }
                }}
              >
                <option value="todos">Todos los estados</option>
                <option value="confirmada">Confirmada</option>
                <option value="completada">Completada</option>
                <option value="cancelada">Cancelada</option>
                <option value="no_asistio">No asistió</option>
              </select>
            </label>

            <label className="citas-filtro-campo">
              <span>Fecha</span>
              <input
                type="date"
                value={filtroFecha}
                onChange={(e) => {
                  const nuevaFecha = e.target.value
                  setFiltroFecha(nuevaFecha)
                  if (nuevaFecha && filtro === 'proximas') {
                    setFiltro('todas')
                  }
                }}
              />
            </label>

            <label className="citas-filtro-campo">
              <span>Horario</span>
              <select
                value={filtroHorario}
                onChange={(e) => setFiltroHorario(e.target.value)}
              >
                <option value="todos">Cualquier horario</option>
                <option value="manana">Mañana (08:00 - 11:59 h)</option>
                <option value="mediodia">Mediodía (12:00 - 15:59 h)</option>
                <option value="tarde">Tarde (16:00 - 20:00 h)</option>
              </select>
            </label>

            <label className="citas-filtro-campo">
              <span>Servicio</span>
              <select
                value={filtroServicio}
                onChange={(e) => setFiltroServicio(e.target.value)}
              >
                <option value="todos">Todos los servicios</option>
                {serviciosDisponibles.map((srv) => (
                  <option key={srv} value={srv}>
                    {srv}
                  </option>
                ))}
              </select>
            </label>

            <div className="citas-filtros-resumen">
              <span className="citas-filtros-conteo">
                Mostrando {visibles.length} cita{visibles.length === 1 ? '' : 's'}
              </span>
              {hayFiltrosActivos && (
                <button
                  type="button"
                  className="citas-boton citas-boton--secundario citas-boton--compacto"
                  onClick={limpiarFiltrosListado}
                >
                  <X size={13} aria-hidden="true" />
                  Limpiar filtros
                </button>
              )}
            </div>
          </div>

          {estado === 'cargando' && (
            <div className="citas-estado-mensaje" role="status">
              <Clock3 size={24} aria-hidden="true" />
              <h2>Cargando citas…</h2>
              <p>Consultando la agenda de tu clínica.</p>
            </div>
          )}

          {estado === 'error' && (
            <div className="citas-estado-mensaje" role="alert">
              <AlertCircle size={26} aria-hidden="true" />
              <h2>No pudimos consultar las citas</h2>
              <p>{error}</p>
              <button
                type="button"
                className="citas-boton citas-boton--oscuro"
                onClick={actualizarCitas}
              >
                Reintentar
              </button>
            </div>
          )}

          {estado === 'listo' && visibles.length === 0 && (
            <div className="citas-estado-mensaje" role="status">
              <CalendarDays size={28} aria-hidden="true" />
              <h2>
                {filtro === 'proximas'
                  ? 'No tienes citas próximas en este filtro'
                  : filtro === 'historial'
                    ? 'No hay citas en el historial'
                    : 'No se encontraron citas'}
              </h2>
              <p>
                {filtro === 'proximas'
                  ? 'Las nuevas reservas confirmadas aparecerán aquí. También puedes consultar el historial de citas pasadas o canceladas.'
                  : 'Cuando existan citas registradas en esta categoría, se mostrarán aquí.'}
              </p>
              {filtro === 'proximas' && citasActivas.length > 0 && (
                <button
                  type="button"
                  className="citas-boton citas-boton--oscuro"
                  onClick={() => setFiltro('historial')}
                >
                  Ver historial de citas
                </button>
              )}
            </div>
          )}

          {estado === 'listo' && visibles.length > 0 && (
            <div className="citas-tarjetas-grid">
              {visibles.map((cita) => (
                <TarjetaCita
                  key={cita.id_cita}
                  cita={cita}
                  vista="clinica"
                  onVerDetalles={(c) => abrirDetalle(c, false)}
                  onCancelarDirecto={(c) => abrirDetalle(c, true)}
                />
              ))}
            </div>
          )}
        </section>
        )}
      </main>

      <footer className="citas-footer">
        <div className="citas-contenedor">
          © 2026 PuntOax. Salud, bienestar y orientación en Oaxaca.
        </div>
      </footer>

      {seleccionada && (
        <DetalleCita
          key={`${seleccionada.id_cita}-${cancelarAlAbrir ? 'cancelar' : 'detalle'}`}
          cita={seleccionada}
          ahora={ahora}
          actualizando={actualizando}
          error={errorAccion}
          iniciarEnCancelacion={cancelarAlAbrir}
          onCerrar={() => {
            setSeleccionada(null)
            setCancelarAlAbrir(false)
            setErrorAccion('')
          }}
          onCambiarEstado={(nuevoEstado) =>
            cambiarEstadoCita(nuevoEstado, seleccionada)
          }
        />
      )}
    </div>
  )
}
