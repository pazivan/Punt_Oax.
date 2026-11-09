import { useEffect, useMemo, useState } from 'react';
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
import { consultarEspaciosClinica, solicitarCita } from '../../api/auth.js';
import '../../styles/Inicio.css';

const ZONA_HORARIA = 'America/Mexico_City';
const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

// Fecha local de México en formato AAAA-MM-DD, sin depender de la zona del navegador.
function isoFechaLocal(fechaHora) {
  return new Date(fechaHora).toLocaleDateString('sv-SE', { timeZone: ZONA_HORARIA });
}

function describirFecha(isoFecha) {
  const [anio, mes, dia] = isoFecha.split('-').map(Number);
  // Mediodía UTC evita que el huso horario mueva el día al formatear.
  const fecha = new Date(Date.UTC(anio, mes - 1, dia, 12));
  const diaSemanaNumero = fecha.getUTCDay();
  const diaNombre = DIAS_SEMANA[diaSemanaNumero];
  return {
    isoFecha,
    diaSemanaNumero,
    diaNombre,
    etiquetaCorta: `${diaNombre} ${dia} de ${MESES[mes - 1]}`,
    etiquetaCompleta: `${diaNombre} ${dia} de ${MESES[mes - 1]} de ${anio}`,
  };
}

function rangoDeConsulta(dias = 30) {
  const hoy = new Date();
  const hasta = new Date(hoy);
  hasta.setDate(hoy.getDate() + dias);
  return {
    desde: hoy.toLocaleDateString('sv-SE', { timeZone: ZONA_HORARIA }),
    hasta: hasta.toLocaleDateString('sv-SE', { timeZone: ZONA_HORARIA }),
  };
}

function etiquetaHora(fechaHora) {
  return new Date(fechaHora).toLocaleTimeString('es-MX', {
    timeZone: ZONA_HORARIA, hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function categoriaDeServicio(clinica) {
  const categorias = Array.isArray(clinica?.categorias) ? clinica.categorias : [];
  if (categorias.includes('Aborto')) return 'ILE / Salud Reproductiva';
  return categorias[0] || 'Detección de ITS';
}

/**
 * AgendarCitaDatos - Flujo completo de 3 pasos para agendar cita en PuntOax:
 * - Permite elegir el centro ahí mismo (o conserva el centro preseleccionado si vienes desde "Ver detalles" en el mapa).
 * - Paso 1: Tus datos (`usuarios`: nombre, apellidos, telefono, correo) + Selección de Unidad de Salud (`clinicas`).
 * - Paso 2: Fecha y hora reales desde `GET /api/clinicas/:id/espacios` (`clinicas_servicios`, `horarios_atencion` y `espacios_disponibles`).
 * - Paso 3: Confirmación con `POST /api/citas` (tabla `citas`). La cita solo se muestra confirmada si el servidor la guardó.
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

  // Espacios reales de la sede (`espacios_disponibles` -> `clinicas_servicios` -> `servicios`).
  const [espaciosDisponibles, setEspaciosDisponibles] = useState([]);
  const [cargandoEspacios, setCargandoEspacios] = useState(true);
  // Sin centro seleccionado no hay consulta en curso que esperar.
  const esperandoEspacios = Boolean(clinicaActiva?.id_clinica) && cargandoEspacios;
  const [errorEspacios, setErrorEspacios] = useState('');
  const [recargaEspacios, setRecargaEspacios] = useState(0);

  useEffect(() => {
    const idClinica = clinicaActiva?.id_clinica;
    if (!idClinica) return undefined;

    let vigente = true;
    consultarEspaciosClinica(idClinica, rangoDeConsulta())
      .then((respuesta) => {
        if (!vigente) return;
        setEspaciosDisponibles(Array.isArray(respuesta.espacios) ? respuesta.espacios : []);
        setErrorEspacios('');
      })
      .catch((error) => {
        if (!vigente) return;
        setEspaciosDisponibles([]);
        setErrorEspacios(error.message || 'No se pudieron consultar los horarios disponibles.');
      })
      .finally(() => {
        if (vigente) setCargandoEspacios(false);
      });

    return () => { vigente = false; };
  }, [clinicaActiva?.id_clinica, recargaEspacios]);

  // Catálogo de servicios de la clínica activa (`clinicas_servicios` + `servicios`).
  // Solo se ofrecen servicios que tengan al menos un espacio reservable.
  const serviciosClinica = useMemo(() => {
    const porServicio = new Map();
    for (const espacio of espaciosDisponibles) {
      if (porServicio.has(espacio.id_clinica_servicio)) continue;
      porServicio.set(espacio.id_clinica_servicio, {
        id_clinica_servicio: espacio.id_clinica_servicio,
        id_clinica: clinicaActiva?.id_clinica || '',
        id_servicio: espacio.id_servicio,
        nombre: espacio.nombre_servicio,
        categoria: categoriaDeServicio(clinicaActiva),
        requisitos:
          clinicaActiva?.requisitos || 'Presentar CURP o identificación oficial. Sin ayuno.',
        requiere_cita: true,
        activo: true,
      });
    }
    return [...porServicio.values()];
  }, [espaciosDisponibles, clinicaActiva]);

  // Datos del Paso 2 (`clinicas_servicios` y `espacios_disponibles`)
  const [idClinicaServicioSeleccionado, setIdClinicaServicioSeleccionado] = useState('');
  const [fechaSeleccionadaIso, setFechaSeleccionadaIso] = useState('');
  const [idEspacioSeleccionado, setIdEspacioSeleccionado] = useState('');

  const servicioSeleccionadoObj =
    serviciosClinica.find((s) => s.id_clinica_servicio === idClinicaServicioSeleccionado) ||
    serviciosClinica[0];

  const fechasDisponibles = useMemo(() => {
    const fechas = new Set();
    for (const espacio of espaciosDisponibles) {
      if (
        servicioSeleccionadoObj &&
        espacio.id_clinica_servicio !== servicioSeleccionadoObj.id_clinica_servicio
      ) {
        continue;
      }
      fechas.add(isoFechaLocal(espacio.fecha_hora_inicio));
    }
    return [...fechas].sort().map(describirFecha);
  }, [espaciosDisponibles, servicioSeleccionadoObj]);

  const fechaSeleccionadaObj =
    fechasDisponibles.find((f) => f.isoFecha === fechaSeleccionadaIso) ||
    fechasDisponibles[0] ||
    null;

  const espaciosDelDia = useMemo(() => {
    if (!servicioSeleccionadoObj || !fechaSeleccionadaObj) return [];
    return espaciosDisponibles
      .filter(
        (espacio) =>
          espacio.id_clinica_servicio === servicioSeleccionadoObj.id_clinica_servicio &&
          isoFechaLocal(espacio.fecha_hora_inicio) === fechaSeleccionadaObj.isoFecha
      )
      .sort((a, b) => new Date(a.fecha_hora_inicio) - new Date(b.fecha_hora_inicio))
      .map((espacio) => ({
        id_espacio: espacio.id_espacio,
        id_clinica_servicio: espacio.id_clinica_servicio,
        etiqueta: `${etiquetaHora(espacio.fecha_hora_inicio)} h`,
        fecha_hora_inicio: espacio.fecha_hora_inicio,
        habilitado: true,
      }));
  }, [espaciosDisponibles, servicioSeleccionadoObj, fechaSeleccionadaObj]);

  // Datos del Paso 3 (`citas` + Modal de confirmación)
  const [mostrarModalConfirmarCita, setMostrarModalConfirmarCita] = useState(false);
  const [enviandoCita, setEnviandoCita] = useState(false);
  const [citaRegistrada, setCitaRegistrada] = useState(null);
  const [errorSolicitudCita, setErrorSolicitudCita] = useState('');
  const [errorFormulario, setErrorFormulario] = useState('');

  const nombreOCorreo = sesion?.cuenta?.nombre || sesion?.cuenta?.correo || 'Mi cuenta';
  const nombreCentro =
    clinicaActiva?.nombre || 'Punto Fijo de Detección – Dirección de Sanidad';
  const municipioCentro = clinicaActiva?.municipio || 'Oaxaca de Juárez';
  const direccionCentro =
    clinicaActiva?.direccion || 'Mártires de Tacubaya 315, Col. Centro, Oaxaca de Juárez';

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
    setErrorFormulario('');
    setCitaRegistrada(null);
    setIdClinicaServicioSeleccionado('');
    setFechaSeleccionadaIso('');
    setIdEspacioSeleccionado('');
    setCargandoEspacios(true);
    setErrorEspacios('');
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

    if (!clinicaActiva) {
      setErrorFormulario('Selecciona un centro de salud disponible para continuar.');
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

  // Confirmar cita: el registro solo existe si `POST /api/citas` responde correctamente.
  const confirmarRegistroCita = async () => {
    setErrorSolicitudCita('');
    setErrorFormulario('');

    if (
      !clinicaActiva ||
      !fechaSeleccionadaIso ||
      !espacioSeleccionadoObj ||
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

    setMostrarModalConfirmarCita(false);
    setEnviandoCita(true);

    try {
      const respuesta = await solicitarCita(espacioSeleccionadoObj.id_espacio);
      setCitaRegistrada({
        ...respuesta.cita,
        mensaje_servidor: respuesta.mensaje,
        usuario: {
          nombre: nombres.trim(),
          apellidos: apellidos.trim(),
          telefono: telefono.trim() || 'No especificado',
          correo: correoContacto.trim(),
        },
        clinica_servicio: {
          id_clinica_servicio: servicioSeleccionadoObj?.id_clinica_servicio,
          id_clinica: clinicaActiva?.id_clinica,
          nombre_clinica: nombreCentro,
          municipio: municipioCentro,
          direccion: direccionCentro,
          nombre_servicio: servicioSeleccionadoObj?.nombre,
          categoria: servicioSeleccionadoObj?.categoria,
          requisitos: requisitoResumen,
        },
        espacio: {
          id_espacio: espacioSeleccionadoObj?.id_espacio,
          fecha_etiqueta: fechaSeleccionadaObj?.etiquetaCompleta,
          hora_etiqueta: espacioSeleccionadoObj?.etiqueta,
          fecha_hora_inicio: espacioSeleccionadoObj?.fecha_hora_inicio,
          habilitado: true,
        },
      });

      if (typeof onCitaConfirmada === 'function') {
        onCitaConfirmada(respuesta.cita);
      }
    } catch (error) {
      setCitaRegistrada(null);
      setErrorSolicitudCita(
        error.message || 'No se pudo registrar la cita. Inténtalo de nuevo.'
      );
    } finally {
      setEnviandoCita(false);
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
                      {esperandoEspacios && (
                        <p className="agendar-form-subtitle" role="status">
                          Consultando los horarios disponibles del centro…
                        </p>
                      )}
                      {errorEspacios && (
                        <div className="auth-error-alert" role="alert">
                          {errorEspacios}{' '}
                          <button
                            type="button"
                            className="agendar-back-link"
                            onClick={() => {
                              setCargandoEspacios(true);
                              setErrorEspacios('');
                              setRecargaEspacios((valor) => valor + 1);
                            }}
                          >
                            Reintentar
                          </button>
                        </div>
                      )}
                      {!esperandoEspacios && !errorEspacios && serviciosClinica.length === 0 && (
                        <p className="agendar-form-subtitle" role="status">
                          Este centro no tiene horarios disponibles por ahora. Elige otro centro o inténtalo más tarde.
                        </p>
                      )}
                      {/* 1. Servicio requerido (`clinicas_servicios` -> `id_clinica_servicio`) */}
                      <div className="agendar-step2-section">
                        <label htmlFor="agendar-servicio-select" className="agendar-label">
                          Servicio solicitado en {nombreCentro} *
                        </label>
                        <select
                          id="agendar-servicio-select"
                          value={servicioSeleccionadoObj?.id_clinica_servicio || ''}
                          onChange={(e) => {
                            setIdClinicaServicioSeleccionado(e.target.value);
                            setFechaSeleccionadaIso('');
                            setIdEspacioSeleccionado('');
                          }}
                          className="agendar-select"
                          disabled={esperandoEspacios || Boolean(errorEspacios)}
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
                            const activa = f.isoFecha === fechaSeleccionadaObj?.isoFecha;
                            return (
                              <button
                                key={f.isoFecha}
                                type="button"
                                role="radio"
                                aria-checked={activa}
                                onClick={() => {
                                  setFechaSeleccionadaIso(f.isoFecha);
                                  setIdEspacioSeleccionado('');
                                }}
                                className={`agendar-date-chip ${activa ? 'is-selected' : ''}`}
                              >
                                <span className="agendar-date-day">{f.diaNombre}</span>
                                <span className="agendar-date-num">{f.etiquetaCorta.replace(`${f.diaNombre} `, '')}</span>
                              </button>
                            );
                          })}
                        </div>
                        {!esperandoEspacios && !errorEspacios && serviciosClinica.length > 0 && fechasDisponibles.length === 0 && (
                          <p className="agendar-form-subtitle" role="status">
                            No hay fechas disponibles para este servicio en los próximos días.
                          </p>
                        )}
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
                            const seleccionado = esp.id_espacio === espacioSeleccionadoObj?.id_espacio;
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
                        {!esperandoEspacios && !errorEspacios && espaciosDelDia.length === 0 && (
                          <p className="agendar-form-subtitle" role="status">
                            No hay horarios disponibles para la fecha seleccionada. Elige otra fecha o servicio.
                          </p>
                        )}
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

                    {/* Estado de guardado: esperando la respuesta del servidor */}
                    {enviandoCita && !citaRegistrada && (
                      <div className="agendar-confirmed-banner" role="status">
                        <Clock size={20} color="#001D14" aria-hidden="true" />
                        <div>
                          <strong>Guardando tu cita…</strong>
                          <p style={{ margin: '2px 0 0', fontSize: '13px', color: '#414845' }}>
                            Estamos reservando el horario en el servidor. No cierres esta página.
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
                              disabled={enviandoCita}
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
                                setCargandoEspacios(true);
                                setRecargaEspacios((valor) => valor + 1);
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
                                  Volver al mapa
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
                                  Volver al mapa
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
