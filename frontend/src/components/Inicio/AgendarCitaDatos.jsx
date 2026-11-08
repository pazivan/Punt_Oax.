import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  Lock,
  MapPin,
  ShieldCheck,
  User,
} from 'lucide-react';
import ModalConfirmacion from './ModalConfirmacion.jsx';
import { CLINICAS_DEMO, normalizarYUnificarClinicas } from '../../data/clinicasDemo.js';
import '../../styles/Inicio.css';

/**
 * Genera los próximos días hábiles para mostrar espacios disponibles (`espacios_disponibles`)
 * de acuerdo con `horarios_atencion` y `clinicas_servicios` del esquema de base de datos.
 */
function generarFechasDisponibles() {
  const diasSemana = [
    'Domingo',
    'Lunes',
    'Martes',
    'Miércoles',
    'Jueves',
    'Viernes',
    'Sábado',
  ];
  const meses = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre',
  ];

  const base = new Date();
  const resultado = [];
  let offset = 1;

  while (resultado.length < 5 && offset < 15) {
    const fecha = new Date(base);
    fecha.setDate(base.getDate() + offset);
    const diaNum = fecha.getDay();

    // Lunes (1) a Viernes (5) según horarios_atencion (dia_semana smallint)
    if (diaNum >= 1 && diaNum <= 5) {
      const yyyy = fecha.getFullYear();
      const mm = String(fecha.getMonth() + 1).padStart(2, '0');
      const dd = String(fecha.getDate()).padStart(2, '0');
      const isoFecha = `${yyyy}-${mm}-${dd}`;

      resultado.push({
        isoFecha,
        diaSemanaNumero: diaNum,
        diaNombre: diasSemana[diaNum],
        etiquetaCorta: `${diasSemana[diaNum]} ${fecha.getDate()} de ${meses[fecha.getMonth()]}`,
        etiquetaCompleta: `${diasSemana[diaNum]} ${fecha.getDate()} de ${meses[fecha.getMonth()]} de ${yyyy}`,
      });
    }
    offset += 1;
  }

  return resultado;
}

/**
 * Genera espacios disponibles (`espacios_disponibles`: id_espacio, id_clinica_servicio, fecha_hora_inicio, habilitado)
 * para una fecha y servicio dados.
 */
function generarEspaciosPorFecha(isoFecha, idClinicaServicio) {
  const bloques = [
    { hora: '09:00', etiqueta: '09:00 h', habilitado: true },
    { hora: '09:30', etiqueta: '09:30 h', habilitado: true },
    { hora: '10:00', etiqueta: '10:00 h', habilitado: true },
    { hora: '10:30', etiqueta: '10:30 h', habilitado: false },
    { hora: '11:30', etiqueta: '11:30 h', habilitado: true },
    { hora: '12:00', etiqueta: '12:00 h', habilitado: true },
    { hora: '12:30', etiqueta: '12:30 h', habilitado: true },
    { hora: '13:00', etiqueta: '13:00 h', habilitado: true },
  ];

  return bloques.map((b, idx) => ({
    id_espacio: `esp-${isoFecha.replace(/-/g, '')}-${idx + 1}`,
    id_clinica_servicio: idClinicaServicio,
    hora: b.hora,
    etiqueta: b.etiqueta,
    fecha_hora_inicio: `${isoFecha}T${b.hora}:00-06:00`,
    habilitado: b.habilitado,
  }));
}

/**
 * AgendarCitaDatos - Flujo completo de 3 pasos para agendar cita en PuntOax:
 * - Permite elegir el centro ahí mismo (o conserva el centro preseleccionado si vienes desde "Ver detalles" en el mapa).
 * - Paso 1: Tus datos (`usuarios`: nombre, apellidos, telefono, correo) + Selección de Unidad de Salud (`clinicas`).
 * - Paso 2: Fecha y hora (`clinicas_servicios`, `horarios_atencion` y `espacios_disponibles`: id_espacio, fecha_hora_inicio, habilitado).
 * - Paso 3: Confirmación (`citas`: id_cita, id_usuario, id_espacio, estado, fecha_reserva) con resumen completo y `ModalConfirmacion`.
 */
export default function AgendarCitaDatos({
  clinica = null,
  clinicas = [],
  sesion,
  onSalir,
  onVolverAlCentro,
  onCitaConfirmada,
}) {
  const correoSesion = sesion?.cuenta?.correo || '';
  const nombreSesion = sesion?.cuenta?.nombre || '';

  // Catálogo completo de clínicas para que el usuario pueda elegir o cambiar el centro ahí mismo
  const catalogoCentros = useMemo(() => {
    const origen = Array.isArray(clinicas) && clinicas.length > 0 ? clinicas : CLINICAS_DEMO;
    const unificadas = normalizarYUnificarClinicas(origen);
    if (clinica && !unificadas.some((c) => c.id_clinica === clinica.id_clinica)) {
      return [clinica, ...unificadas];
    }
    return unificadas;
  }, [clinicas, clinica]);

  const [idClinicaElegida, setIdClinicaElegida] = useState(
    () => clinica?.id_clinica || catalogoCentros[0]?.id_clinica || 'coesdia 1'
  );

  const clinicaActiva = useMemo(
    () =>
      catalogoCentros.find((c) => c.id_clinica === idClinicaElegida) ||
      clinica ||
      catalogoCentros[0] ||
      null,
    [catalogoCentros, idClinicaElegida, clinica]
  );

  // Estado de navegación entre los 3 pasos (1: Datos, 2: Fecha y hora, 3: Confirmación)
  const [pasoActual, setPasoActual] = useState(1);

  // Datos del Paso 1 (tabla `usuarios`)
  const [nombres, setNombres] = useState(nombreSesion);
  const [apellidos, setApellidos] = useState('');
  const [telefono, setTelefono] = useState('');
  const [correoContacto, setCorreoContacto] = useState(correoSesion);

  // Catálogo de servicios de la clínica activa (`clinicas_servicios` + `servicios`)
  const serviciosClinica = useMemo(() => {
    const listaServicios =
      Array.isArray(clinicaActiva?.servicios) && clinicaActiva.servicios.length > 0
        ? clinicaActiva.servicios
        : ['Pruebas rápidas de VIH', 'Sífilis', 'Hepatitis C', 'Consejería en salud sexual'];

    const categoriaDefault =
      Array.isArray(clinicaActiva?.categorias) && clinicaActiva.categorias.includes('Aborto')
        ? 'ILE / Salud Reproductiva'
        : 'Detección de ITS';

    return listaServicios.map((nombreSrv, idx) => ({
      id_clinica_servicio: `cs-${clinicaActiva?.id_clinica || 'sanidad'}-${idx + 1}`,
      id_clinica: clinicaActiva?.id_clinica || 'coesdia 1',
      id_servicio: `srv-${idx + 1}`,
      nombre: nombreSrv,
      categoria: categoriaDefault,
      requisitos:
        clinicaActiva?.requisitos || 'Presentar CURP o identificación oficial. Sin ayuno.',
      requiere_cita: true,
      activo: true,
    }));
  }, [clinicaActiva]);

  // Datos del Paso 2 (`clinicas_servicios` y `espacios_disponibles`)
  const fechasDisponibles = useMemo(() => generarFechasDisponibles(), []);
  const [idClinicaServicioSeleccionado, setIdClinicaServicioSeleccionado] = useState(
    () => serviciosClinica[0]?.id_clinica_servicio || 'cs-sanidad-1'
  );
  const [fechaSeleccionadaIso, setFechaSeleccionadaIso] = useState(
    () => fechasDisponibles[0]?.isoFecha || ''
  );

  const servicioSeleccionadoObj =
    serviciosClinica.find((s) => s.id_clinica_servicio === idClinicaServicioSeleccionado) ||
    serviciosClinica[0];

  const espaciosDelDia = useMemo(
    () =>
      generarEspaciosPorFecha(
        fechaSeleccionadaIso,
        servicioSeleccionadoObj?.id_clinica_servicio || idClinicaServicioSeleccionado
      ),
    [fechaSeleccionadaIso, servicioSeleccionadoObj, idClinicaServicioSeleccionado]
  );

  const [idEspacioSeleccionado, setIdEspacioSeleccionado] = useState(
    () => espaciosDelDia.find((e) => e.habilitado)?.id_espacio || ''
  );

  // Datos del Paso 3 (`citas` + Modal de confirmación)
  const [mostrarModalConfirmarCita, setMostrarModalConfirmarCita] = useState(false);
  const [citaRegistrada, setCitaRegistrada] = useState(null);
  const [errorSolicitudCita, setErrorSolicitudCita] = useState('');
  const [errorFormulario, setErrorFormulario] = useState('');

  const nombreOCorreo = sesion?.cuenta?.nombre || sesion?.cuenta?.correo || 'Mi cuenta';
  const nombreCentro =
    clinicaActiva?.nombre || 'Punto Fijo de Detección – Dirección de Sanidad';
  const municipioCentro = clinicaActiva?.municipio || 'Oaxaca de Juárez';
  const direccionCentro =
    clinicaActiva?.direccion || 'Mártires de Tacubaya 315, Col. Centro, Oaxaca de Juárez';

  const fechaSeleccionadaObj =
    fechasDisponibles.find((f) => f.isoFecha === fechaSeleccionadaIso) ||
    fechasDisponibles[0];

  const espacioSeleccionadoObj =
    espaciosDelDia.find((e) => e.id_espacio === idEspacioSeleccionado) ||
    espaciosDelDia.find((e) => e.habilitado) ||
    null;

  const centroResumen = clinicaActiva?.nombre
    ? `${clinicaActiva.nombre.replace(/^Punto Fijo de Detección\s*[–-]\s*/i, '')} - ${municipioCentro}`
    : 'Dirección de Sanidad - Oaxaca de Juárez';

  const requisitoResumen =
    clinicaActiva?.requisitos || 'Presenta tu CURP para realizarte una prueba rápida.';
  const horarioResumen = clinicaActiva?.horario || '09:00–10:30 y 11:30–13:00 h.';

  const manejarCambioClinica = (nuevoIdClinica) => {
    setIdClinicaElegida(nuevoIdClinica);
    setErrorSolicitudCita('');
    const nuevaSede = catalogoCentros.find((c) => c.id_clinica === nuevoIdClinica);
    const primerServicioId = `cs-${nuevaSede?.id_clinica || 'sanidad'}-1`;
    setIdClinicaServicioSeleccionado(primerServicioId);
    const nuevosEspacios = generarEspaciosPorFecha(fechaSeleccionadaIso, primerServicioId);
    const primeroHabilitado = nuevosEspacios.find((sp) => sp.habilitado);
    if (primeroHabilitado) {
      setIdEspacioSeleccionado(primeroHabilitado.id_espacio);
    }
  };

  // Paso 1 -> Paso 2
  const manejarAvanzarPaso2 = (e) => {
    e.preventDefault();
    setErrorFormulario('');
    setErrorSolicitudCita('');

    if (!nombres.trim() || !apellidos.trim()) {
      setErrorFormulario('Por favor, ingresa tu(s) nombre(s) y apellidos para continuar.');
      return;
    }

    if (!correoContacto.trim() || !correoContacto.includes('@')) {
      setErrorFormulario('Por favor, ingresa un correo electrónico de contacto válido.');
      return;
    }

    setPasoActual(2);
  };

  // Paso 2 -> Paso 3
  const manejarAvanzarPaso3 = (e) => {
    e.preventDefault();
    setErrorFormulario('');
    setErrorSolicitudCita('');

    if (!espacioSeleccionadoObj || !espacioSeleccionadoObj.habilitado) {
      setErrorFormulario('Por favor, selecciona un horario disponible para tu cita.');
      return;
    }

    setPasoActual(3);
  };

  // Confirmar cita desde el ModalConfirmacion (crea el registro según la tabla `citas`)
  const confirmarRegistroCita = () => {
    setErrorSolicitudCita('');
    setErrorFormulario('');

    if (
      !clinicaActiva ||
      !fechaSeleccionadaIso ||
      !espacioSeleccionadoObj ||
      !espacioSeleccionadoObj.habilitado ||
      !nombres.trim() ||
      !apellidos.trim() ||
      !correoContacto.trim()
    ) {
      setMostrarModalConfirmarCita(false);
      setErrorSolicitudCita(
        'Hubo un problema al procesar tu cita: verifica que hayas seleccionado clínica, fecha, horario disponible y tus datos de contacto.'
      );
      return;
    }

    const ahora = new Date();
    const folio = `CITA-${ahora.getFullYear()}${String(ahora.getMonth() + 1).padStart(2, '0')}${String(
      ahora.getDate()
    ).padStart(2, '0')}-${String(ahora.getTime()).slice(-4)}`;

    const nuevaCita = {
      // Tabla `citas`
      id_cita: folio,
      id_usuario: sesion?.cuenta?.id_usuario || sesion?.cuenta?.id || 'usr-autenticado',
      id_espacio: espacioSeleccionadoObj?.id_espacio,
      estado: 'confirmada',
      fecha_reserva: ahora.toISOString(),
      // Tabla `usuarios`
      usuario: {
        nombre: nombres.trim(),
        apellidos: apellidos.trim(),
        telefono: telefono.trim() || 'No especificado',
        correo: correoContacto.trim(),
      },
      // Tablas `clinicas` + `clinicas_servicios` + `servicios`
      clinica_servicio: {
        id_clinica_servicio: servicioSeleccionadoObj?.id_clinica_servicio,
        id_clinica: clinicaActiva?.id_clinica || 'coesdia 1',
        nombre_clinica: nombreCentro,
        municipio: municipioCentro,
        direccion: direccionCentro,
        nombre_servicio: servicioSeleccionadoObj?.nombre,
        categoria: servicioSeleccionadoObj?.categoria,
        requisitos: requisitoResumen,
      },
      // Tabla `espacios_disponibles`
      espacio: {
        id_espacio: espacioSeleccionadoObj?.id_espacio,
        fecha_etiqueta: fechaSeleccionadaObj?.etiquetaCompleta,
        hora_etiqueta: espacioSeleccionadoObj?.etiqueta,
        fecha_hora_inicio: espacioSeleccionadoObj?.fecha_hora_inicio,
        habilitado: true,
      },
    };

    setMostrarModalConfirmarCita(false);
    setCitaRegistrada(nuevaCita);

    if (typeof onCitaConfirmada === 'function') {
      onCitaConfirmada(nuevaCita);
    }
  };

  // Títulos superiores dinámicos según el paso activo
  const tituloPrincipal =
    pasoActual === 1
      ? 'Primero, tus datos.'
      : pasoActual === 2
        ? 'Elige fecha y horario.'
        : citaRegistrada
          ? 'Tu cita ha sido confirmada.'
          : 'Revisa y confirma tu cita.';

  const subtituloPrincipal =
    pasoActual === 1
      ? 'Completa la información para continuar con tu solicitud.'
      : pasoActual === 2
        ? 'Selecciona el servicio requerido y uno de los espacios habilitados en la unidad de salud.'
        : citaRegistrada
          ? 'Guarda los datos de tu reservación y presenta tus requisitos al acudir al centro.'
          : 'Verifica el resumen de tu cita antes de confirmar tu reservación.';

  return (
    <div className="agendar-page">
      {/* Header (80px) con "Agendar cita" seleccionado */}
      <header className="inicio-header">
        <div className="inicio-header-container">
          <div className="inicio-header-left">
            <div className="inicio-brand-wrap">
              <Link to="/cuenta" className="inicio-brand" style={{ textDecoration: 'none' }}>
                PuntOax
              </Link>
            </div>

            <nav className="inicio-nav agendar-header-nav" aria-label="Navegación principal">
              <Link to="/cuenta" className="inicio-nav-link">
                Inicio
              </Link>
              <Link to="/mapa" className="inicio-nav-link">
                Mapa de centros
              </Link>
              <Link to="/agendar-cita" className="inicio-nav-link active">
                <span className="inicio-nav-link-active-text">Agendar cita</span>
              </Link>
              <Link to="/informacion-util" className="inicio-nav-link">
                Información útil
              </Link>
            </nav>
          </div>

          <div className="inicio-header-right">
            <Link
              to="/cuenta"
              className="inicio-header-account-link"
              title={nombreOCorreo}
            >
              Mi cuenta
            </Link>

            <button
              type="button"
              onClick={onSalir}
              className="inicio-header-logout-btn"
            >
              Salir
            </button>

            <div className="inicio-avatar-margin">
              <div className="inicio-avatar-circle" aria-hidden="true">
                <User size={14} color="#FFFFFF" />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main (padding-top: 80px) */}
      <main className="agendar-main">
        <div className="agendar-background">
          <div className="agendar-container">
            {/* Top Titles (width: 1232px, height: 108px, gap: 4px) */}
            <section className="agendar-top-titles" aria-labelledby="agendar-main-heading">
              <div className="agendar-eyebrow-wrap">
                <span className="agendar-eyebrow-text">AGENDAR CITA</span>
              </div>
              <div className="agendar-heading-wrap">
                <h1 id="agendar-main-heading" className="agendar-heading-title">
                  {tituloPrincipal}
                </h1>
              </div>
              <div className="agendar-subtitle-wrap">
                <p className="agendar-subtitle-text">{subtituloPrincipal}</p>
              </div>
            </section>

            {/* Main Layout Container (1232px x 701px) */}
            <div className="agendar-layout-grid">
              {/* Left Sidebar Progress / Summary (394.67px x 425px, #001D14) */}
              <aside className="agendar-sidebar" aria-label="Progreso de solicitud de cita">
                <div className="agendar-sidebar-top">
                  {/* Encabezado de la sede en sidebar */}
                  <div className="agendar-sidebar-header">
                    <span className="agendar-sidebar-eyebrow">SOLICITUD DE CITA</span>
                    <h2 className="agendar-sidebar-center-name">{nombreCentro}</h2>
                    <span className="agendar-sidebar-municipio">{municipioCentro}</span>
                  </div>

                  {/* Navegación de pasos (3 pasos) */}
                  <nav className="agendar-steps-nav" aria-label="Pasos para agendar cita">
                    <button
                      type="button"
                      onClick={() => !citaRegistrada && setPasoActual(1)}
                      disabled={Boolean(citaRegistrada)}
                      className={`agendar-step-item agendar-step-btn ${
                        pasoActual === 1 ? 'is-active' : pasoActual > 1 ? 'is-completed' : ''
                      }`}
                      aria-current={pasoActual === 1 ? 'step' : undefined}
                    >
                      <span className="agendar-step-icon" aria-hidden="true">
                        {pasoActual > 1 ? (
                          <Check size={15} color="#AACFBF" />
                        ) : (
                          <User size={15} color={pasoActual === 1 ? '#FFFFFF' : '#AACFBF'} />
                        )}
                      </span>
                      <span className="agendar-step-text">1. Tus datos</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (!citaRegistrada && nombres.trim() && apellidos.trim()) {
                          setPasoActual(2);
                        }
                      }}
                      disabled={Boolean(citaRegistrada) || !nombres.trim() || !apellidos.trim()}
                      className={`agendar-step-item agendar-step-btn ${
                        pasoActual === 2 ? 'is-active' : pasoActual > 2 ? 'is-completed' : ''
                      }`}
                      aria-current={pasoActual === 2 ? 'step' : undefined}
                    >
                      <span className="agendar-step-icon" aria-hidden="true">
                        {pasoActual > 2 ? (
                          <Check size={15} color="#AACFBF" />
                        ) : (
                          <Calendar size={16} color={pasoActual === 2 ? '#FFFFFF' : '#AACFBF'} />
                        )}
                      </span>
                      <span className="agendar-step-text">2. Fecha y hora</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (
                          !citaRegistrada &&
                          nombres.trim() &&
                          apellidos.trim() &&
                          espacioSeleccionadoObj
                        ) {
                          setPasoActual(3);
                        }
                      }}
                      disabled={
                        Boolean(citaRegistrada) ||
                        !nombres.trim() ||
                        !apellidos.trim() ||
                        !espacioSeleccionadoObj
                      }
                      className={`agendar-step-item agendar-step-btn ${
                        pasoActual === 3 ? 'is-active' : ''
                      }`}
                      aria-current={pasoActual === 3 ? 'step' : undefined}
                    >
                      <span className="agendar-step-icon" aria-hidden="true">
                        <CheckCircle2
                          size={17}
                          color={pasoActual === 3 ? '#FFFFFF' : '#AACFBF'}
                        />
                      </span>
                      <span className="agendar-step-text">3. Confirmación</span>
                    </button>
                  </nav>
                </div>

                {/* Nota inferior de confidencialidad */}
                <div className="agendar-sidebar-footer-margin">
                  <div className="agendar-sidebar-footer-border">
                    <div className="agendar-sidebar-footer-row">
                      <span className="agendar-sidebar-lock-icon" aria-hidden="true">
                        <Lock size={13} color="#AACFBF" />
                      </span>
                      <span className="agendar-sidebar-footer-text">
                        Tus datos son confidenciales y seguros.
                      </span>
                    </div>
                  </div>
                </div>

                {/* Círculo decorativo inferior derecho */}
                <div className="agendar-sidebar-decor-circle" aria-hidden="true" />
              </aside>

              {/* Right Content Area / Form (813.33px x 697.67px, #FFFFFF) */}
              <section className="agendar-form-card" aria-labelledby="agendar-form-heading">
                {errorFormulario && (
                  <div className="auth-error-alert" role="alert" style={{ width: '100%' }}>
                    {errorFormulario}
                  </div>
                )}

                {/* =========================================================
                    PASO 1 DE 3: TUS DATOS + SELECCIÓN DE CENTRO (`usuarios` y `clinicas`)
                   ========================================================= */}
                {pasoActual === 1 && (
                  <>
                    <div className="agendar-form-header">
                      <span className="agendar-form-step-label">PASO 1 DE 3</span>
                      <h2 id="agendar-form-heading" className="agendar-form-title">
                        Datos para tu cita
                      </h2>
                      <p className="agendar-form-subtitle">
                        Usaremos esta información para identificar tu solicitud.
                      </p>
                    </div>

                    <form className="agendar-form" onSubmit={manejarAvanzarPaso2} noValidate>
                      {/* Selector de Centro de Salud (`clinicas`) para elegir o cambiar el centro ahí mismo */}
                      <div className="agendar-step2-section">
                        <label htmlFor="agendar-centro-select" className="agendar-label">
                          Centro o unidad de salud *
                        </label>
                        <select
                          id="agendar-centro-select"
                          value={clinicaActiva?.id_clinica || ''}
                          onChange={(e) => manejarCambioClinica(e.target.value)}
                          className="agendar-select"
                        >
                          {catalogoCentros.map((sede) => (
                            <option key={sede.id_clinica} value={sede.id_clinica}>
                              {sede.nombre} — {sede.municipio || 'Oaxaca'}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Fila 1: Nombre(s) * y Apellidos * */}
                      <div className="agendar-form-row">
                        <div className="agendar-field-group">
                          <label htmlFor="agendar-nombres" className="agendar-label">
                            Nombre(s) *
                          </label>
                          <input
                            id="agendar-nombres"
                            type="text"
                            required
                            maxLength={100}
                            value={nombres}
                            onChange={(e) => setNombres(e.target.value)}
                            placeholder="Mariana"
                            className="agendar-input"
                          />
                        </div>

                        <div className="agendar-field-group">
                          <label htmlFor="agendar-apellidos" className="agendar-label">
                            Apellidos *
                          </label>
                          <input
                            id="agendar-apellidos"
                            type="text"
                            required
                            maxLength={150}
                            value={apellidos}
                            onChange={(e) => setApellidos(e.target.value)}
                            placeholder="López Ruiz"
                            className="agendar-input"
                          />
                        </div>
                      </div>

                      {/* Fila 2: Teléfono y Correo de contacto */}
                      <div className="agendar-form-row">
                        <div className="agendar-field-group">
                          <label htmlFor="agendar-telefono" className="agendar-label">
                            Teléfono
                          </label>
                          <input
                            id="agendar-telefono"
                            type="tel"
                            maxLength={20}
                            value={telefono}
                            onChange={(e) => setTelefono(e.target.value)}
                            placeholder="951 000 0000"
                            className="agendar-input"
                          />
                        </div>

                        <div className="agendar-field-group">
                          <label htmlFor="agendar-correo" className="agendar-label">
                            Correo de contacto *
                          </label>
                          <input
                            id="agendar-correo"
                            type="email"
                            required
                            maxLength={255}
                            value={correoContacto}
                            onChange={(e) => setCorreoContacto(e.target.value)}
                            placeholder="mariana@correo.ejemplo"
                            className="agendar-input"
                          />
                        </div>
                      </div>

                      {/* Privacy Notice Box */}
                      <div className="agendar-privacy-box">
                        <span className="agendar-privacy-icon" aria-hidden="true">
                          <ShieldCheck size={17} color="#596763" />
                        </span>
                        <span className="agendar-privacy-text">
                          Tu información se comparte únicamente con el centro seleccionado.
                        </span>
                      </div>

                      {/* Summary Cards Grid */}
                      <div className="agendar-summary-grid">
                        {/* Tarjeta 1: Tu visita */}
                        <div className="agendar-summary-card">
                          <span className="agendar-summary-title">Tu visita</span>
                          <span className="agendar-summary-strong">
                            Servicio: {servicioSeleccionadoObj?.nombre || 'Detección de ITS'}
                          </span>
                          <span className="agendar-summary-strong">
                            Centro: {centroResumen}
                          </span>
                        </div>

                        {/* Tarjeta 2: Antes de acudir */}
                        <div className="agendar-summary-card">
                          <span className="agendar-summary-title">Antes de acudir</span>
                          <span className="agendar-summary-regular">{requisitoResumen}</span>
                          <span className="agendar-summary-strong">
                            Horario: {horarioResumen}
                          </span>
                        </div>
                      </div>

                      {/* Actions Footer */}
                      <div className="agendar-actions-margin">
                        <div className="agendar-actions-footer">
                          {typeof onVolverAlCentro === 'function' ? (
                            <button
                              type="button"
                              onClick={onVolverAlCentro}
                              className="agendar-back-link"
                            >
                              <ArrowLeft size={13} color="#414845" aria-hidden="true" />
                              <span>Volver al centro</span>
                            </button>
                          ) : (
                            <Link to="/mapa" className="agendar-back-link">
                              <ArrowLeft size={13} color="#414845" aria-hidden="true" />
                              <span>Volver al centro</span>
                            </Link>
                          )}

                          <button type="submit" className="agendar-submit-btn">
                            <span className="agendar-submit-btn-text">Elegir fecha y hora</span>
                            <ArrowRight size={13} color="#FFFFFF" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    </form>
                  </>
                )}

                {/* =========================================================
                    PASO 2 DE 3: FECHA Y HORA (`clinicas_servicios`, `horarios_atencion`, `espacios_disponibles`)
                   ========================================================= */}
                {pasoActual === 2 && (
                  <>
                    <div className="agendar-form-header">
                      <span className="agendar-form-step-label">PASO 2 DE 3</span>
                      <h2 id="agendar-form-heading" className="agendar-form-title">
                        Selecciona servicio, fecha y horario
                      </h2>
                      <p className="agendar-form-subtitle">
                        Elige el servicio médico requerido y el espacio disponible para tu atención.
                      </p>
                    </div>

                    <form className="agendar-form" onSubmit={manejarAvanzarPaso3} noValidate>
                      {/* 1. Servicio requerido (`clinicas_servicios` -> `id_clinica_servicio`) */}
                      <div className="agendar-step2-section">
                        <label htmlFor="agendar-servicio-select" className="agendar-label">
                          Servicio solicitado en {nombreCentro} *
                        </label>
                        <select
                          id="agendar-servicio-select"
                          value={servicioSeleccionadoObj?.id_clinica_servicio || ''}
                          onChange={(e) => {
                            const nuevoServicio = e.target.value;
                            setIdClinicaServicioSeleccionado(nuevoServicio);
                            const nuevosEspacios = generarEspaciosPorFecha(
                              fechaSeleccionadaIso,
                              nuevoServicio
                            );
                            const primeroHabilitado = nuevosEspacios.find((sp) => sp.habilitado);
                            if (primeroHabilitado) {
                              setIdEspacioSeleccionado(primeroHabilitado.id_espacio);
                            }
                          }}
                          className="agendar-select"
                        >
                          {serviciosClinica.map((srv) => (
                            <option
                              key={srv.id_clinica_servicio}
                              value={srv.id_clinica_servicio}
                            >
                              {srv.nombre} ({srv.categoria})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* 2. Selección de día (`horarios_atencion` / `fecha_hora_inicio`) */}
                      <div className="agendar-step2-section">
                        <span className="agendar-label">Fecha disponible *</span>
                        <div className="agendar-dates-grid" role="radiogroup" aria-label="Fechas disponibles">
                          {fechasDisponibles.map((f) => {
                            const activa = f.isoFecha === fechaSeleccionadaIso;
                            return (
                              <button
                                key={f.isoFecha}
                                type="button"
                                role="radio"
                                aria-checked={activa}
                                onClick={() => {
                                  setFechaSeleccionadaIso(f.isoFecha);
                                  const nuevosEspacios = generarEspaciosPorFecha(
                                    f.isoFecha,
                                    servicioSeleccionadoObj?.id_clinica_servicio ||
                                      idClinicaServicioSeleccionado
                                  );
                                  const primeroHabilitado = nuevosEspacios.find(
                                    (sp) => sp.habilitado
                                  );
                                  if (primeroHabilitado) {
                                    setIdEspacioSeleccionado(primeroHabilitado.id_espacio);
                                  }
                                }}
                                className={`agendar-date-chip ${activa ? 'is-selected' : ''}`}
                              >
                                <span className="agendar-date-day">{f.diaNombre}</span>
                                <span className="agendar-date-num">{f.etiquetaCorta.replace(`${f.diaNombre} `, '')}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* 3. Selección de hora (`espacios_disponibles`: id_espacio, fecha_hora_inicio, habilitado) */}
                      <div className="agendar-step2-section">
                        <div className="agendar-slots-header">
                          <span className="agendar-label">
                            Horarios disponibles ({horarioResumen}) *
                          </span>
                        </div>
                        <div className="agendar-slots-grid" role="radiogroup" aria-label="Horarios disponibles">
                          {espaciosDelDia.map((esp) => {
                            const seleccionado = esp.id_espacio === idEspacioSeleccionado;
                            return (
                              <button
                                key={esp.id_espacio}
                                type="button"
                                role="radio"
                                aria-checked={seleccionado}
                                disabled={!esp.habilitado}
                                onClick={() => setIdEspacioSeleccionado(esp.id_espacio)}
                                className={`agendar-slot-btn ${
                                  seleccionado ? 'is-selected' : ''
                                } ${!esp.habilitado ? 'is-disabled' : ''}`}
                              >
                                <Clock
                                  size={13}
                                  color={
                                    !esp.habilitado
                                      ? '#9AA39F'
                                      : seleccionado
                                        ? '#FFFFFF'
                                        : '#001D14'
                                  }
                                  aria-hidden="true"
                                />
                                <span>{esp.etiqueta}</span>
                                {!esp.habilitado && (
                                  <span className="agendar-slot-status">Ocupado</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Resumen de selección de espacio */}
                      <div className="agendar-summary-grid">
                        <div className="agendar-summary-card">
                          <span className="agendar-summary-title">Espacio seleccionado</span>
                          <span className="agendar-summary-strong">
                            Fecha: {fechaSeleccionadaObj?.etiquetaCompleta}
                          </span>
                          <span className="agendar-summary-strong">
                            Hora de inicio: {espacioSeleccionadoObj?.etiqueta || 'Por seleccionar'}
                          </span>
                        </div>

                        <div className="agendar-summary-card">
                          <span className="agendar-summary-title">Requisitos del servicio</span>
                          <span className="agendar-summary-regular">{requisitoResumen}</span>
                          <span className="agendar-summary-strong">
                            Modalidad: Requiere cita previa
                          </span>
                        </div>
                      </div>

                      {/* Actions Footer */}
                      <div className="agendar-actions-margin">
                        <div className="agendar-actions-footer">
                          <button
                            type="button"
                            onClick={() => setPasoActual(1)}
                            className="agendar-back-link"
                          >
                            <ArrowLeft size={13} color="#414845" aria-hidden="true" />
                            <span>Volver a tus datos</span>
                          </button>

                          <button type="submit" className="agendar-submit-btn">
                            <span className="agendar-submit-btn-text">
                              Revisar y confirmar
                            </span>
                            <ArrowRight size={13} color="#FFFFFF" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    </form>
                  </>
                )}

                {/* =========================================================
                    PASO 3 DE 3: CONFIRMACIÓN Y RESUMEN DE LA CITA (Tabla `citas`)
                   ========================================================= */}
                {pasoActual === 3 && (
                  <>
                    <div className="agendar-form-header">
                      <span className="agendar-form-step-label">PASO 3 DE 3</span>
                      <h2 id="agendar-form-heading" className="agendar-form-title">
                        {citaRegistrada
                          ? `¡Tu cita se pidió correctamente! · Folio ${citaRegistrada.id_cita}`
                          : 'Resumen y confirmación de tu cita'}
                      </h2>
                      <p className="agendar-form-subtitle">
                        {citaRegistrada
                          ? 'Tu solicitud quedó registrada exitosamente. Presenta este resumen al acudir a la unidad.'
                          : 'Revisa cuidadosamente los datos de tu cita antes de confirmar tu reservación.'}
                      </p>
                    </div>

                    {/* Estado de éxito: La cita se pidió */}
                    {citaRegistrada && (
                      <div className="agendar-confirmed-banner" role="status">
                        <CheckCircle2 size={20} color="#001D14" aria-hidden="true" />
                        <div>
                          <strong>
                            {citaRegistrada.mensaje_servidor ||
                              '¡La cita se pidió correctamente!'}
                          </strong>
                          <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#414845' }}>
                            Folio de cita: <code>{citaRegistrada.id_cita}</code> · Estado:{' '}
                            <strong>{citaRegistrada.estado}</strong> · Espacio reservado:{' '}
                            <code>{citaRegistrada.id_espacio}</code>
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Estado de error: Hubo un problema al pedir la cita */}
                    {errorSolicitudCita && !citaRegistrada && (
                      <div className="agendar-problem-banner" role="alert">
                        <div className="agendar-problem-top">
                          <AlertCircle size={20} color="#991B1B" aria-hidden="true" />
                          <div>
                            <strong className="agendar-problem-title">
                              Hubo un problema al pedir tu cita
                            </strong>
                            <p className="agendar-problem-message">{errorSolicitudCita}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Tarjetas de resumen completo basadas en el esquema de Base de Datos */}
                    <div className="agendar-confirm-summary-stack">
                      {/* 1. Datos de la persona (`usuarios`) */}
                      <div className="agendar-confirm-block">
                        <div className="agendar-confirm-block-header">
                          <User size={15} color="#001D14" aria-hidden="true" />
                          <h3 className="agendar-confirm-block-title">
                            1. Datos del solicitante
                          </h3>
                        </div>
                        <div className="agendar-confirm-grid-2">
                          <div>
                            <span className="agendar-confirm-label">Nombre completo</span>
                            <p className="agendar-confirm-value">
                              {nombres} {apellidos}
                            </p>
                          </div>
                          <div>
                            <span className="agendar-confirm-label">Correo electrónico</span>
                            <p className="agendar-confirm-value">{correoContacto}</p>
                          </div>
                          <div>
                            <span className="agendar-confirm-label">Teléfono de contacto</span>
                            <p className="agendar-confirm-value">
                              {telefono.trim() || 'No especificado'}
                            </p>
                          </div>
                          <div>
                            <span className="agendar-confirm-label">Estado de solicitud</span>
                            <p className="agendar-confirm-value">
                              {citaRegistrada
                                ? 'Cita solicitada / confirmada'
                                : errorSolicitudCita
                                  ? 'No se pudo enviar (revisar problema)'
                                  : 'Pendiente de confirmación'}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* 2. Datos de la unidad y servicio (`clinicas` + `clinicas_servicios` + `servicios`) */}
                      <div className="agendar-confirm-block">
                        <div className="agendar-confirm-block-header">
                          <Building2 size={15} color="#001D14" aria-hidden="true" />
                          <h3 className="agendar-confirm-block-title">
                            2. Unidad de salud y servicio
                          </h3>
                        </div>
                        <div className="agendar-confirm-grid-2">
                          <div>
                            <span className="agendar-confirm-label">Unidad de Salud</span>
                            <p className="agendar-confirm-value">{nombreCentro}</p>
                          </div>
                          <div>
                            <span className="agendar-confirm-label">Servicio solicitado</span>
                            <p className="agendar-confirm-value">
                              {servicioSeleccionadoObj?.nombre} ({servicioSeleccionadoObj?.categoria})
                            </p>
                          </div>
                          <div>
                            <span className="agendar-confirm-label">Municipio</span>
                            <p className="agendar-confirm-value">{municipioCentro}, Oaxaca</p>
                          </div>
                          <div>
                            <span className="agendar-confirm-label">Dirección</span>
                            <p className="agendar-confirm-value">{direccionCentro}</p>
                          </div>
                        </div>
                      </div>

                      {/* 3. Fecha, hora y requisitos (`espacios_disponibles` + `citas`) */}
                      <div className="agendar-confirm-block">
                        <div className="agendar-confirm-block-header">
                          <Calendar size={15} color="#001D14" aria-hidden="true" />
                          <h3 className="agendar-confirm-block-title">
                            3. Fecha, horario y requisitos
                          </h3>
                        </div>
                        <div className="agendar-confirm-grid-2">
                          <div>
                            <span className="agendar-confirm-label">Fecha programada</span>
                            <p className="agendar-confirm-value">
                              {fechaSeleccionadaObj?.etiquetaCompleta}
                            </p>
                          </div>
                          <div>
                            <span className="agendar-confirm-label">Hora de inicio</span>
                            <p className="agendar-confirm-value">
                              {espacioSeleccionadoObj?.etiqueta}
                            </p>
                          </div>
                          <div style={{ gridColumn: '1 / -1' }}>
                            <span className="agendar-confirm-label">
                              Requisitos para acudir a la cita
                            </span>
                            <p className="agendar-confirm-value">{requisitoResumen}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Actions Footer del Paso 3 */}
                    <div className="agendar-actions-margin">
                      <div className="agendar-actions-footer">
                        {!citaRegistrada ? (
                          <>
                            <button
                              type="button"
                              onClick={() => setPasoActual(2)}
                              className="agendar-back-link"
                            >
                              <ArrowLeft size={13} color="#414845" aria-hidden="true" />
                              <span>Cambiar fecha u hora</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setMostrarModalConfirmarCita(true)}
                              className="agendar-submit-btn"
                            >
                              <span className="agendar-submit-btn-text">Confirmar cita</span>
                              <Check size={14} color="#FFFFFF" aria-hidden="true" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setCitaRegistrada(null);
                                setErrorSolicitudCita('');
                                setPasoActual(1);
                              }}
                              className="agendar-back-link"
                            >
                              <FileText size={13} color="#414845" aria-hidden="true" />
                              <span>Agendar otra cita</span>
                            </button>

                            {typeof onVolverAlCentro === 'function' ? (
                              <button
                                type="button"
                                onClick={onVolverAlCentro}
                                className="agendar-submit-btn"
                              >
                                <MapPin size={14} color="#FFFFFF" aria-hidden="true" />
                                <span className="agendar-submit-btn-text">
                                  Volver al directorio de centros
                                </span>
                              </button>
                            ) : (
                              <Link
                                to="/mapa"
                                className="agendar-submit-btn"
                                style={{ textDecoration: 'none' }}
                              >
                                <MapPin size={14} color="#FFFFFF" aria-hidden="true" />
                                <span className="agendar-submit-btn-text">
                                  Volver al directorio de centros
                                </span>
                              </Link>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </section>
            </div>
          </div>
        </div>
      </main>

      {/* Modal reutilizable de confirmación para registrar la cita */}
      <ModalConfirmacion
        abierto={mostrarModalConfirmarCita}
        titulo="¿Confirmas el registro de tu cita?"
        mensaje={`Se reservará tu espacio para "${servicioSeleccionadoObj?.nombre}" en ${nombreCentro} el día ${fechaSeleccionadaObj?.etiquetaCompleta} a las ${espacioSeleccionadoObj?.etiqueta} a nombre de ${nombres} ${apellidos}.`}
        textoCancelar="Revisar de nuevo"
        textoConfirmar="Sí, confirmar cita"
        onCancelar={() => setMostrarModalConfirmarCita(false)}
        onConfirmar={confirmarRegistroCita}
      />

      {/* Footer (112px) */}
      <footer className="inicio-footer">
        <div className="inicio-footer-container">
          <p className="inicio-footer-text">
            © 2026 PuntOax · Salud, bienestar y orientación en Oaxaca.
          </p>
        </div>
      </footer>
    </div>
  );
}
