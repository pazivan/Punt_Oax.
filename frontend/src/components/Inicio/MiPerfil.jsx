import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  Phone,
  ShieldCheck,
  User,
} from 'lucide-react';
import EncabezadoUsuario from './EncabezadoUsuario.jsx';
import PiePagina from './PiePagina.jsx';
import EncabezadoClinica from '../Clinica/EncabezadoClinica.jsx';
import { consultarCitasUsuario, consultarMiFicha } from '../../api/auth.js';
import {
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN,
  validarPassword,
} from '../../utils/validaciones.js';
import { guardarPerfilLocal, leerPerfilLocal } from '../../utils/perfilLocal.js';
import '../../styles/Inicio.css';

const NOMBRE_MIN = 2;
const NOMBRE_MAX = 60;
const APELLIDOS_MIN = 2;
const APELLIDOS_MAX = 80;
const TELEFONO_LONGITUD = 10;
const REGEX_SOLO_LETRAS = /^[A-Za-zÁÉÍÓÚáéíóúÜüÑñ]+(?:[ '-][A-Za-zÁÉÍÓÚáéíóúÜüÑñ]+)*$/;

function limpiarTextoNombre(valor, maxLen) {
  if (typeof valor !== 'string') return '';
  return valor
    .replace(/[^A-Za-zÁÉÍÓÚáéíóúÜüÑñ '-]/g, '')
    .replace(/\s{2,}/g, ' ')
    .slice(0, maxLen);
}

function limpiarTelefonoDiezDigitos(valor) {
  if (typeof valor !== 'string') return '';
  return valor.replace(/\D/g, '').slice(0, TELEFONO_LONGITUD);
}

/**
 * MiPerfil - Vista de perfil del usuario autenticado.
 * Muestra los detalles de su cuenta, resumen de citas, edición de datos personales
 * de contacto y módulo de cambio de contraseña con validaciones.
 */
export default function MiPerfil({ sesion, perfil, onSalir }) {
  const esClinica = sesion?.tipo === 'clinica' || perfil?.rol === 'clinica';
  const correoCuenta =
    sesion?.cuenta?.correo || perfil?.correo || '';
  const idCuenta =
    sesion?.cuenta?.id_clinica ||
    sesion?.cuenta?.id ||
    perfil?.id ||
    'Verificado en sesión';
  const rolCuenta =
    esClinica
      ? 'Clínica / Centro'
      : perfil?.rol === 'administrador'
        ? 'Administrador'
        : 'Paciente / Usuario';

  const datosIniciales = useMemo(() => {
    const guardados = leerPerfilLocal(idCuenta);
    return {
      nombre: guardados.nombre || sesion?.cuenta?.nombre || '',
      apellidos: guardados.apellidos || sesion?.cuenta?.apellidos || '',
      telefono: guardados.telefono || '',
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idCuenta]);

  const [nombre, setNombre] = useState(
    () => datosIniciales.nombre || sesion?.cuenta?.nombre || ''
  );
  const [apellidos, setApellidos] = useState(() => datosIniciales.apellidos || '');
  const [telefono, setTelefono] = useState(() => datosIniciales.telefono || '');
  const [mensajeDatos, setMensajeDatos] = useState('');
  const [errorDatos, setErrorDatos] = useState('');

  // Estado de cambio de contraseña
  const [passwordActual, setPasswordActual] = useState('');
  const [passwordNueva, setPasswordNueva] = useState('');
  const [passwordConfirmacion, setPasswordConfirmacion] = useState('');
  const [mostrarActual, setMostrarActual] = useState(false);
  const [mostrarNueva, setMostrarNueva] = useState(false);
  const [mostrarConfirmacion, setMostrarConfirmacion] = useState(false);
  const [guardandoPassword, setGuardandoPassword] = useState(false);
  const [mensajePassword, setMensajePassword] = useState('');
  const [errorPassword, setErrorPassword] = useState('');

  // Resumen de citas del usuario (y ficha si es clínica)
  const [citas, setCitas] = useState([]);
  const [fichaClinica, setFichaClinica] = useState(null);

  useEffect(() => {
    let activo = true;
    if (esClinica) {
      consultarMiFicha()
        .then((datos) => {
          if (!activo) return;
          setFichaClinica(datos);
          if (!nombre.trim() && datos?.clinica?.nombre) {
            setNombre(datos.clinica.nombre);
          }
        })
        .catch(() => {
          if (!activo) return;
          setFichaClinica(null);
        });
      return () => {
        activo = false;
      };
    }

    consultarCitasUsuario()
      .then((res) => {
        if (!activo) return;
        setCitas(Array.isArray(res?.citas) ? res.citas : []);
      })
      .catch(() => {
        if (!activo) return;
        setCitas([]);
      });
    return () => {
      activo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esClinica]);

  const enModoPanelAprobado =
    esClinica &&
    (fichaClinica?.clinica?.estado_publicacion === 'aprobada' ||
      sesion?.cuenta?.estado_publicacion === 'aprobada' ||
      sessionStorage.getItem('puntoax_panel_aprobado') === '1');

  const estadoSolicitudClinica = useMemo(() => {
    if (!esClinica) return '';
    const pub = fichaClinica?.clinica?.estado_publicacion || sesion?.cuenta?.estado_publicacion;
    const fichaEst = fichaClinica?.clinica?.estado_ficha;
    const postEst = fichaClinica?.postulacion?.estado;

    if (pub === 'aprobada') return 'Clínica aprobada y publicada';
    if (postEst === 'pendiente' || fichaEst === 'pendiente_revision') {
      return 'Enviada para revisión';
    }
    if (fichaEst === 'rechazada' || pub === 'rechazada') {
      return 'Requiere correcciones';
    }
    return 'Aún no registrada (en borrador)';
  }, [esClinica, fichaClinica, sesion]);

  const nombreCompletoVista =
    [nombre.trim(), apellidos.trim()].filter(Boolean).join(' ') ||
    sesion?.cuenta?.nombre ||
    correoCuenta ||
    'Mi perfil';

  const cumpleMinimoNueva = passwordNueva.length >= PASSWORD_MIN;
  const cumpleMaximoBytes =
    new TextEncoder().encode(passwordNueva).length <= PASSWORD_MAX_BYTES;
  const esDiferenteActual =
    Boolean(passwordNueva) && passwordNueva !== passwordActual;
  const coincideConfirmacion =
    Boolean(passwordNueva) && passwordNueva === passwordConfirmacion;

  function manejarGuardarDatos(e) {
    e.preventDefault();
    setMensajeDatos('');
    setErrorDatos('');

    const nombreLimpio = nombre.trim();
    const apellidosLimpios = apellidos.trim();
    const telefonoLimpio = telefono.trim();

    if (nombreLimpio) {
      if (nombreLimpio.length < NOMBRE_MIN || nombreLimpio.length > NOMBRE_MAX) {
        setErrorDatos(
          `El nombre debe tener entre ${NOMBRE_MIN} y ${NOMBRE_MAX} caracteres.`
        );
        return;
      }
      if (!REGEX_SOLO_LETRAS.test(nombreLimpio)) {
        setErrorDatos(
          'El nombre solo puede contener letras y espacios (sin números ni símbolos).'
        );
        return;
      }
    }

    if (apellidosLimpios) {
      if (
        apellidosLimpios.length < APELLIDOS_MIN ||
        apellidosLimpios.length > APELLIDOS_MAX
      ) {
        setErrorDatos(
          `Los apellidos deben tener entre ${APELLIDOS_MIN} y ${APELLIDOS_MAX} caracteres.`
        );
        return;
      }
      if (!REGEX_SOLO_LETRAS.test(apellidosLimpios)) {
        setErrorDatos(
          'Los apellidos solo pueden contener letras y espacios (sin números ni símbolos).'
        );
        return;
      }
    }

    if (telefonoLimpio && !/^\d{10}$/.test(telefonoLimpio)) {
      setErrorDatos(
        `El número de teléfono debe contener exactamente ${TELEFONO_LONGITUD} dígitos numéricos.`
      );
      return;
    }

    try {
      guardarPerfilLocal(idCuenta, {
        nombre: nombreLimpio,
        apellidos: apellidosLimpios,
        telefono: telefonoLimpio,
      });
      setMensajeDatos(
        'Tus datos de contacto se guardaron en este navegador y se autocompletarán al agendar una cita.'
      );
    } catch {
      setErrorDatos('No se pudieron guardar los datos en este navegador.');
    }
  }

  async function manejarCambioPassword(e) {
    e.preventDefault();
    setMensajePassword('');
    setErrorPassword('');

    if (!passwordActual) {
      setErrorPassword('Ingresa tu contraseña actual para continuar.');
      return;
    }

    if (!validarPassword(passwordNueva)) {
      setErrorPassword(
        `La nueva contraseña debe tener al menos ${PASSWORD_MIN} caracteres y no exceder ${PASSWORD_MAX_BYTES} bytes.`
      );
      return;
    }

    if (passwordNueva === passwordActual) {
      setErrorPassword(
        'La nueva contraseña debe ser diferente a tu contraseña actual.'
      );
      return;
    }

    if (passwordNueva !== passwordConfirmacion) {
      setErrorPassword('La confirmación de la nueva contraseña no coincide.');
      return;
    }

    setGuardandoPassword(true);
    try {
      const token = sesion?.token;
      const respuesta = await fetch('/api/auth/cambiar-password', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          passwordActual,
          passwordNueva,
        }),
      });

      if (respuesta.ok) {
        const datos = await respuesta.json().catch(() => null);
        setMensajePassword(datos?.mensaje || 'Tu contraseña se actualizó correctamente.');
        setPasswordActual('');
        setPasswordNueva('');
        setPasswordConfirmacion('');
      } else {
        const datosError = await respuesta.json().catch(() => null);
        setErrorPassword(
          datosError?.error ||
            'No se pudo actualizar la contraseña. Verifica tu contraseña actual.'
        );
      }
    } catch {
      setErrorPassword('No se pudo conectar con el servidor. Inténtalo de nuevo.');
    } finally {
      setGuardandoPassword(false);
    }
  }

  return (
    <div className="perfil-page">
      {/* Header (80px) */}
      {esClinica ? (
        <EncabezadoClinica
          sesion={sesion}
          onSalir={onSalir}
          modoPostulacion={!enModoPanelAprobado}
        />
      ) : (
        <EncabezadoUsuario
          sesion={sesion}
          onSalir={onSalir}
          seccionActiva="perfil"
          citasPreCargadas={citas}
        />
      )}

      {/* Main Content */}
      <main className="perfil-main">
        <div className="perfil-container">
          <div className="detalle-back-margin">
            <div className="detalle-back-wrap">
              <Link
                to={esClinica ? (enModoPanelAprobado ? '/panel-clinica' : '/mi-clinica') : '/inicio'}
                className="detalle-back-link"
                style={{ textDecoration: 'none' }}
              >
                <span className="detalle-back-icon" aria-hidden="true">
                  <ArrowLeft size={14} color="#001D14" />
                </span>
                <span className="detalle-back-text">
                  {esClinica
                    ? enModoPanelAprobado
                      ? 'Volver al panel'
                      : 'Volver al formulario'
                    : 'Volver al inicio'}
                </span>
              </Link>
            </div>
          </div>

          <section className="perfil-header-block" aria-labelledby="perfil-main-title">
            <span className="agendar-eyebrow-text">CONFIGURACIÓN DE CUENTA</span>
            <h1 id="perfil-main-title" className="perfil-heading-title">
              Mi perfil
            </h1>
            <p className="perfil-subtitle-text">
              {esClinica
                ? 'Consulta los detalles de tu cuenta de clínica, administra tus datos de contacto y actualiza tu contraseña de acceso.'
                : 'Consulta los detalles de tu cuenta, administra tus datos de contacto para agendar citas más rápido y actualiza tu contraseña de acceso.'}
            </p>
          </section>

          <div className="perfil-layout-grid">
            {/* Columna izquierda: Resumen de la cuenta */}
            <aside className="perfil-sidebar-card" aria-label="Resumen de tu cuenta">
              <div className="perfil-avatar-hero">
                <div className="perfil-avatar-large" aria-hidden="true">
                  <User size={30} color="#FFFFFF" />
                </div>
                <div className="perfil-avatar-texts">
                  <span className="perfil-role-badge">{rolCuenta}</span>
                  <h2 className="perfil-user-name">{nombreCompletoVista}</h2>
                  <p className="perfil-user-email">{correoCuenta || 'Correo verificado'}</p>
                </div>
              </div>

              <div className="perfil-meta-list">
                <div className="perfil-meta-item">
                  <span className="perfil-meta-label">Estado de la cuenta</span>
                  <span className="perfil-meta-value is-status">
                    <ShieldCheck size={15} color="#103328" aria-hidden="true" />
                    Sesión activa y verificada
                  </span>
                </div>

                {esClinica && (
                  <>
                    <div className="perfil-meta-item">
                      <span className="perfil-meta-label">Estado de registro</span>
                      <span className="perfil-meta-value">{estadoSolicitudClinica}</span>
                    </div>

                    <div className="perfil-meta-item">
                      <span className="perfil-meta-label">Nombre</span>
                      <span className="perfil-meta-value">{nombreCompletoVista}</span>
                    </div>
                  </>
                )}

                <div className="perfil-meta-item">
                  <span className="perfil-meta-label">Correo de acceso</span>
                  <span className="perfil-meta-value">{correoCuenta || 'No disponible'}</span>
                </div>

                {!esClinica && (
                  <div className="perfil-meta-item">
                    <span className="perfil-meta-label">Identificador de usuario</span>
                    <span className="perfil-meta-value is-mono">{String(idCuenta)}</span>
                  </div>
                )}
              </div>

              <div className="perfil-privacy-box">
                <Lock size={15} color="#103328" aria-hidden="true" />
                <p>
                  {esClinica
                    ? 'Tu información de acceso es confidencial y se emplea únicamente para administrar tu centro en PuntOax.'
                    : 'Tu información personal es confidencial y se emplea únicamente para gestionar tus solicitudes de atención médica.'}
                </p>
              </div>
            </aside>

            {/* Columna derecha: Formularios de Detalles y Contraseña */}
            <div className="perfil-content-stack">
              {/* Tarjeta 1: Detalles de la cuenta */}
              <section className="perfil-card" aria-labelledby="perfil-datos-heading">
                <div className="perfil-card-header">
                  <div className="perfil-card-icon" aria-hidden="true">
                    <User size={18} color="#001D14" />
                  </div>
                  <div>
                    <h2 id="perfil-datos-heading" className="perfil-card-title">
                      {esClinica ? 'Datos de la cuenta' : 'Detalles personales y de contacto'}
                    </h2>
                    <p className="perfil-card-desc">
                      {esClinica
                        ? 'Consulta el correo vinculado a tu clínica y actualiza el nombre visible de tu cuenta.'
                        : 'Estos datos se rellenarán automáticamente en el Paso 1 cuando agendes una cita.'}
                    </p>
                  </div>
                </div>

                {mensajeDatos && (
                  <div className="agendar-Step-success-banner" role="status">
                    <CheckCircle2 size={18} color="#001D14" aria-hidden="true" />
                    <div className="agendar-step-success-texts">
                      <span className="agendar-step-success-meta">{mensajeDatos}</span>
                    </div>
                  </div>
                )}

                {errorDatos && (
                  <div className="agendar-error-banner" role="alert">
                    <AlertCircle size={16} color="#991B1B" aria-hidden="true" />
                    <span>{errorDatos}</span>
                  </div>
                )}

                <form className="perfil-form" onSubmit={manejarGuardarDatos} noValidate>
                  <div className="agendar-field-group">
                    <label htmlFor="perfil-correo" className="agendar-label">
                      Correo electrónico de la cuenta (vinculado a tu sesión)
                    </label>
                    <div className="perfil-input-icon-wrap">
                      <span className="perfil-input-icon" aria-hidden="true">
                        <Mail size={15} color="#596763" />
                      </span>
                      <input
                        id="perfil-correo"
                        type="email"
                        className="agendar-input perfil-input-with-icon agendar-input-readonly"
                        value={correoCuenta}
                        readOnly
                        title="El correo electrónico corresponde a tu cuenta de acceso"
                      />
                    </div>
                    <span className="agendar-field-hint">
                      {esClinica
                        ? 'Este correo corresponde a tu cuenta de acceso como clínica.'
                        : 'Se asigna automáticamente desde tu cuenta y no requiere volver a capturarse al agendar.'}
                    </span>
                  </div>

                  {esClinica ? (
                    <div className="agendar-field-group">
                      <label htmlFor="perfil-nombre" className="agendar-label">
                        Nombre de la clínica o cuenta
                      </label>
                      <input
                        id="perfil-nombre"
                        type="text"
                        className="agendar-input"
                        placeholder="Ej. Clínica Salud Oaxaca"
                        maxLength={NOMBRE_MAX}
                        value={nombre}
                        onChange={(e) => {
                          setNombre(limpiarTextoNombre(e.target.value, NOMBRE_MAX));
                          if (errorDatos) setErrorDatos('');
                          if (mensajeDatos) setMensajeDatos('');
                        }}
                      />
                    </div>
                  ) : (
                    <>
                      <div className="agendar-form-row">
                        <div className="agendar-field-group">
                          <label htmlFor="perfil-nombre" className="agendar-label">
                            Nombre(s)
                          </label>
                          <input
                            id="perfil-nombre"
                            type="text"
                            className="agendar-input"
                            placeholder="Ej. Mariana"
                            maxLength={NOMBRE_MAX}
                            value={nombre}
                            onChange={(e) => {
                              setNombre(limpiarTextoNombre(e.target.value, NOMBRE_MAX));
                              if (errorDatos) setErrorDatos('');
                              if (mensajeDatos) setMensajeDatos('');
                            }}
                          />
                          <span className="agendar-field-hint">
                            Solo letras ({NOMBRE_MIN} a {NOMBRE_MAX} caracteres).
                          </span>
                        </div>

                        <div className="agendar-field-group">
                          <label htmlFor="perfil-apellidos" className="agendar-label">
                            Apellidos
                          </label>
                          <input
                            id="perfil-apellidos"
                            type="text"
                            className="agendar-input"
                            placeholder="Ej. López Ruiz"
                            maxLength={APELLIDOS_MAX}
                            value={apellidos}
                            onChange={(e) => {
                              setApellidos(limpiarTextoNombre(e.target.value, APELLIDOS_MAX));
                              if (errorDatos) setErrorDatos('');
                              if (mensajeDatos) setMensajeDatos('');
                            }}
                          />
                          <span className="agendar-field-hint">
                            Solo letras ({APELLIDOS_MIN} a {APELLIDOS_MAX} caracteres).
                          </span>
                        </div>
                      </div>

                      <div className="agendar-field-group">
                        <label htmlFor="perfil-telefono" className="agendar-label">
                          Teléfono de contacto (10 dígitos)
                        </label>
                        <div className="perfil-input-icon-wrap">
                          <span className="perfil-input-icon" aria-hidden="true">
                            <Phone size={15} color="#596763" />
                          </span>
                          <input
                            id="perfil-telefono"
                            type="tel"
                            inputMode="numeric"
                            pattern="[0-9]{10}"
                            maxLength={TELEFONO_LONGITUD}
                            className="agendar-input perfil-input-with-icon"
                            placeholder="9510000000"
                            value={telefono}
                            onChange={(e) => {
                              setTelefono(limpiarTelefonoDiezDigitos(e.target.value));
                              if (errorDatos) setErrorDatos('');
                              if (mensajeDatos) setMensajeDatos('');
                            }}
                          />
                        </div>
                        <span className="agendar-field-hint">
                          Únicamente números ({telefono.length}/{TELEFONO_LONGITUD} dígitos).
                        </span>
                      </div>
                    </>
                  )}

                  <div className="perfil-form-actions">
                    <button type="submit" className="agendar-submit-btn">
                      <span className="agendar-submit-text">Guardar datos de perfil</span>
                    </button>
                  </div>
                </form>
              </section>

              {/* Tarjeta 2: Seguridad y cambio de contraseña */}
              <section className="perfil-card" aria-labelledby="perfil-password-heading">
                <div className="perfil-card-header">
                  <div className="perfil-card-icon" aria-hidden="true">
                    <KeyRound size={18} color="#001D14" />
                  </div>
                  <div>
                    <h2 id="perfil-password-heading" className="perfil-card-title">
                      Cambiar contraseña
                    </h2>
                    <p className="perfil-card-desc">
                      Actualiza tu contraseña periódicamente para mantener segura tu cuenta.
                    </p>
                  </div>
                </div>

                {mensajePassword && (
                  <div className="agendar-Step-success-banner" role="status">
                    <CheckCircle2 size={18} color="#001D14" aria-hidden="true" />
                    <div className="agendar-step-success-texts">
                      <span className="agendar-step-success-meta">{mensajePassword}</span>
                    </div>
                  </div>
                )}

                {errorPassword && (
                  <div className="agendar-error-banner" role="alert">
                    <AlertCircle size={16} color="#991B1B" aria-hidden="true" />
                    <span>{errorPassword}</span>
                  </div>
                )}

                <form className="perfil-form" onSubmit={manejarCambioPassword} noValidate>
                  <div className="agendar-field-group">
                    <label htmlFor="perfil-pass-actual" className="agendar-label">
                      Contraseña actual <span className="agendar-required">*</span>
                    </label>
                    <div className="perfil-password-wrap">
                      <input
                        id="perfil-pass-actual"
                        type={mostrarActual ? 'text' : 'password'}
                        className="agendar-input perfil-password-input"
                        placeholder="Ingresa tu contraseña actual"
                        autoComplete="current-password"
                        value={passwordActual}
                        onChange={(e) => {
                          setPasswordActual(e.target.value);
                          if (errorPassword) setErrorPassword('');
                          if (mensajePassword) setMensajePassword('');
                        }}
                        required
                      />
                      <button
                        type="button"
                        className="perfil-password-toggle"
                        onClick={() => setMostrarActual((v) => !v)}
                        aria-label={
                          mostrarActual
                            ? 'Ocultar contraseña actual'
                            : 'Mostrar contraseña actual'
                        }
                      >
                        {mostrarActual ? (
                          <EyeOff size={16} color="#414845" />
                        ) : (
                          <Eye size={16} color="#414845" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="agendar-form-row">
                    <div className="agendar-field-group">
                      <label htmlFor="perfil-pass-nueva" className="agendar-label">
                        Nueva contraseña <span className="agendar-required">*</span>
                      </label>
                      <div className="perfil-password-wrap">
                        <input
                          id="perfil-pass-nueva"
                          type={mostrarNueva ? 'text' : 'password'}
                          className="agendar-input perfil-password-input"
                          placeholder="Mínimo 8 caracteres"
                          autoComplete="new-password"
                          value={passwordNueva}
                          onChange={(e) => {
                            setPasswordNueva(e.target.value);
                            if (errorPassword) setErrorPassword('');
                            if (mensajePassword) setMensajePassword('');
                          }}
                          required
                        />
                        <button
                          type="button"
                          className="perfil-password-toggle"
                          onClick={() => setMostrarNueva((v) => !v)}
                          aria-label={
                            mostrarNueva
                              ? 'Ocultar nueva contraseña'
                              : 'Mostrar nueva contraseña'
                          }
                        >
                          {mostrarNueva ? (
                            <EyeOff size={16} color="#414845" />
                          ) : (
                            <Eye size={16} color="#414845" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="agendar-field-group">
                      <label htmlFor="perfil-pass-confirmar" className="agendar-label">
                        Confirmar nueva contraseña <span className="agendar-required">*</span>
                      </label>
                      <div className="perfil-password-wrap">
                        <input
                          id="perfil-pass-confirmar"
                          type={mostrarConfirmacion ? 'text' : 'password'}
                          className="agendar-input perfil-password-input"
                          placeholder="Repite la nueva contraseña"
                          autoComplete="new-password"
                          value={passwordConfirmacion}
                          onChange={(e) => {
                            setPasswordConfirmacion(e.target.value);
                            if (errorPassword) setErrorPassword('');
                            if (mensajePassword) setMensajePassword('');
                          }}
                          required
                        />
                        <button
                          type="button"
                          className="perfil-password-toggle"
                          onClick={() => setMostrarConfirmacion((v) => !v)}
                          aria-label={
                            mostrarConfirmacion
                              ? 'Ocultar confirmación de contraseña'
                              : 'Mostrar confirmación de contraseña'
                          }
                        >
                          {mostrarConfirmacion ? (
                            <EyeOff size={16} color="#414845" />
                          ) : (
                            <Eye size={16} color="#414845" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  <ul className="perfil-password-rules" aria-label="Requisitos de la contraseña">
                    <li className={cumpleMinimoNueva && cumpleMaximoBytes ? 'is-valid' : ''}>
                      <CheckCircle2 size={14} aria-hidden="true" />
                      <span>Mínimo {PASSWORD_MIN} caracteres (máximo {PASSWORD_MAX_BYTES} bytes).</span>
                    </li>
                    <li className={esDiferenteActual ? 'is-valid' : ''}>
                      <CheckCircle2 size={14} aria-hidden="true" />
                      <span>Debe ser distinta a tu contraseña actual.</span>
                    </li>
                    <li className={coincideConfirmacion ? 'is-valid' : ''}>
                      <CheckCircle2 size={14} aria-hidden="true" />
                      <span>La confirmación coincide con la nueva contraseña.</span>
                    </li>
                  </ul>

                  <div className="perfil-form-actions">
                    <button
                      type="submit"
                      className="agendar-submit-btn"
                      disabled={guardandoPassword}
                    >
                      <span className="agendar-submit-text">
                        {guardandoPassword ? 'Actualizando…' : 'Actualizar contraseña'}
                      </span>
                    </button>
                  </div>
                </form>
              </section>
            </div>
          </div>
        </div>
      </main>

      <PiePagina />
    </div>
  );
}
