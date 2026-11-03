import { useRef, useState } from 'react';
import { ArrowRight, Building2, Check, ShieldCheck, User } from 'lucide-react';
import '../../styles/Auth.css';
import { registrarClinica, registrarUsuario } from '../../api/auth';
import {
  normalizarCorreo,
  validarEmail,
  validarNombreClinica,
  validarPassword,
  validarRequerido,
} from '../../utils/validaciones';

const MENSAJE_CLINICA_CREADA =
  'Tu cuenta de clínica fue creada correctamente. Ya puedes iniciar sesión. ' +
  'La información de tu institución todavía no está publicada y deberá verificarse posteriormente.';
const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const AREAS = [
  { categoria: 'its', nombre: 'Atención de ITS', ejemplo: 'Ej. pruebas de VIH, sífilis, orientación y seguimiento.' },
  { categoria: 'ile', nombre: 'Interrupción legal del embarazo (ILE)', ejemplo: 'Ej. orientación, valoración y acompañamiento.' },
];

export default function Register({ onSwitchToLogin, onBackToPublic, initialAccountType = 'usuario' }) {
  const [accountType, setAccountType] = useState(
    initialAccountType === 'clinica' ? 'clinica' : 'usuario'
  );

  // Sincronizado con initialAccountType mediante key en App.jsx
  const [nombreClinica, setNombreClinica] = useState('');
  const [tipoInstitucion, setTipoInstitucion] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [direccion, setDireccion] = useState('');
  const [telefono, setTelefono] = useState('');
  const [codigoPostal, setCodigoPostal] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [serviciosSeleccionados, setServiciosSeleccionados] = useState({});
  const [horarios, setHorarios] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const enviando = useRef(false);

  const alternarServicio = (categoria) => setServiciosSeleccionados((actuales) => {
    const siguientes = { ...actuales };
    if (categoria in siguientes) delete siguientes[categoria];
    else siguientes[categoria] = '';
    return siguientes;
  });

  const alternarHorario = (dia) => setHorarios((actuales) => actuales.some((h) => h.dia_semana === dia)
    ? actuales.filter((h) => h.dia_semana !== dia)
    : [...actuales, { dia_semana: dia, apertura: '09:00', cierre: '17:00' }]);

  const cambiarHorario = (dia, campo, valor) => setHorarios((actuales) => actuales.map((h) =>
    h.dia_semana === dia ? { ...h, [campo]: valor } : h));

  const handleTabChange = (tipo) => {
    setAccountType(tipo);
    setError('');
    // Limpieza de contraseñas por seguridad (no guardar contraseña en el navegador)
    setPassword('');
    setConfirmPassword('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (enviando.current) return;
    setError('');

    const correoLimpio = normalizarCorreo(email);

    // Validaciones comunes a usuarios y clínicas
    if (!validarRequerido(email) || !validarRequerido(password) || !validarRequerido(confirmPassword)) {
      setError('Por favor, completa todos los campos requeridos.');
      return;
    }

    if (accountType === 'clinica' && !validarNombreClinica(nombreClinica)) {
      setError(!validarRequerido(nombreClinica)
        ? 'Por favor, ingresa el nombre de la clínica.'
        : 'El nombre de la clínica no puede superar los 255 caracteres.');
      return;
    }

    if (accountType === 'clinica') {
      if (!['publica', 'privada', 'ong', 'otra'].includes(tipoInstitucion) ||
          !municipio.trim() || !direccion.trim() || !telefono.trim()) {
        setError('Completa el tipo de institución, municipio, dirección y teléfono de la clínica.');
        return;
      }
      if (municipio.trim().length > 100 || direccion.trim().length > 500 ||
          telefono.trim().length > 20 || !/^[+\d()\s.-]+$/.test(telefono.trim()) ||
          (codigoPostal.trim() && !/^\d{5}$/.test(codigoPostal.trim())) ||
          descripcion.trim().length > 2000) {
        setError('Revisa municipio, dirección, teléfono, código postal y descripción.');
        return;
      }
      if (Object.keys(serviciosSeleccionados).length === 0 || horarios.length === 0) {
        setError('Selecciona al menos un área de atención y un día con horario.');
        return;
      }
      if (Object.values(serviciosSeleccionados).some((detalle) => !detalle.trim())) {
        setError('Describe los servicios específicos de cada área seleccionada.');
        return;
      }
      if (documentos.length === 0 || documentos.length > 5 || documentos.some((archivo) =>
        !['application/pdf', 'image/png', 'image/jpeg'].includes(archivo.type) ||
        archivo.size === 0 || archivo.size > 5 * 1024 * 1024)) {
        setError('Adjunta de uno a cinco documentos PDF, PNG o JPG, de hasta 5 MB cada uno.');
        return;
      }
      if (horarios.some((h) => !h.apertura || !h.cierre || h.apertura >= h.cierre)) {
        setError('Cada horario seleccionado debe tener apertura anterior al cierre. Los turnos nocturnos y 24 horas aún no están disponibles.');
        return;
      }
    }

    if (!validarEmail(correoLimpio)) {
      setError(accountType === 'clinica'
        ? 'Por favor, introduce un correo institucional válido.'
        : 'Por favor, introduce un correo electrónico válido.');
      return;
    }

    if (!validarPassword(password)) {
      setError(password.length < 8
        ? 'La contraseña debe tener al menos 8 caracteres.'
        : 'La contraseña no puede superar los 72 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden. Por favor verifícalas.');
      return;
    }

    enviando.current = true;
    setLoading(true);

    try {
      if (accountType === 'clinica') {
        await registrarClinica({
          nombre: nombreClinica.trim(), correo: correoLimpio, password,
          tipo_institucion: tipoInstitucion, municipio: municipio.trim(),
          direccion: direccion.trim(), telefono: telefono.trim(),
          codigo_postal: codigoPostal.trim() || null,
          descripcion: descripcion.trim() || null,
          servicios: Object.entries(serviciosSeleccionados).map(([categoria, detalle]) => ({
            categoria, detalle: detalle.trim(),
          })),
          horarios,
        }, documentos);
        onSwitchToLogin(MENSAJE_CLINICA_CREADA, 'clinica');
      } else {
        await registrarUsuario(email.trim(), password);
        onSwitchToLogin('Cuenta creada. Ya puedes iniciar sesión.', 'usuario');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      enviando.current = false;
      setLoading(false);
    }
  };

  return (
    <div className="auth-page-wrapper">
      {/* Header oficial */}
      <header className="auth-header">
        <div className="auth-header-container">
          <div className="auth-brand-group">
            <button
              type="button"
              className="auth-brand-title"
              style={{ cursor: 'pointer' }}
              onClick={onBackToPublic}
              disabled={loading}
            >
              PuntOax
            </button>
            <button
              type="button"
              onClick={onBackToPublic}
              disabled={loading}
              className="auth-nav-link"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Conócenos
            </button>
          </div>
          <div className="auth-header-actions">
            <button
              type="button"
              onClick={() => onSwitchToLogin('', accountType)}
              disabled={loading}
              className="auth-btn-outline"
            >
              Iniciar sesión
            </button>
            <div className="auth-avatar-circle" aria-hidden="true">
              <User size={16} />
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="auth-main">
        <div className="auth-card-container">
          {/* Panel Izquierdo: Diseño Figma con fondo #001D14 y detalle de mapa */}
          <section className="auth-left-panel theme-dark">
            <div className="auth-decor-circle" aria-hidden="true"></div>

            <div className="auth-panel-content-wrap">
              <div>
                <span className="auth-badge-top mint-light">
                  {accountType === 'usuario' ? 'CREACIÓN DE CUENTA' : 'PUNTOAX PARA CENTROS'}
                </span>
                <h1 className="auth-heading-hero hero-large">
                  {accountType === 'usuario'
                    ? 'Una experiencia pensada para la confianza.'
                    : 'Tu institución, al alcance de más personas.'}
                </h1>
                <p className="auth-subtext-hero larger">
                  {accountType === 'usuario'
                    ? 'Descubre centros, consulta sus fichas y organiza tus próximas visitas.'
                    : 'Registra los datos, servicios y horarios de tu clínica. La ficha permanecerá en borrador.'}
                </p>
              </div>

              {/* Previsualización de mapa con badge PuntOax · Oaxaca */}
              <div className="auth-map-preview-box">
                <div className="auth-map-card-inner">
                  <div className="auth-map-tag">
                    <span className="auth-map-dot" aria-hidden="true"></span>
                    <span>PuntOax · Oaxaca</span>
                  </div>
                </div>
              </div>

              {/* Lista de pasos o ventajas oficiales según Figma */}
              <div className="auth-features-list">
                {accountType === 'clinica' ? (
                  <>
                    <div className="auth-feature-row">
                      <span className="auth-check-icon"><Check size={14} strokeWidth={2.5} /></span>
                      <span>Registro institucional</span>
                    </div>
                    <div className="auth-feature-row">
                      <span className="auth-check-icon"><Check size={14} strokeWidth={2.5} /></span>
                      <span>Verificación de sede</span>
                    </div>
                    <div className="auth-feature-row">
                      <span className="auth-check-icon"><Check size={14} strokeWidth={2.5} /></span>
                      <span>Publicación en catálogo</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="auth-feature-row">
                      <span className="auth-check-icon"><Check size={14} strokeWidth={2.5} /></span>
                      <span>Directorio verificado de centros de detección de ITS e ILE</span>
                    </div>
                    <div className="auth-feature-row">
                      <span className="auth-check-icon"><Check size={14} strokeWidth={2.5} /></span>
                      <span>Información transparente, confidencial y segura</span>
                    </div>
                    <div className="auth-feature-row">
                      <span className="auth-check-icon"><Check size={14} strokeWidth={2.5} /></span>
                      <span>Consulta rápida y libre sin costo alguno</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>

          {/* Panel Derecho: Formulario de Creación de Cuenta Figma */}
          <section className="auth-right-panel">
            <div className="auth-form-inner">
              <span className="auth-subtitle-small">
                {accountType === 'usuario' ? 'CREACIÓN DE CUENTA' : 'CREAR CUENTA'}
              </span>
              <h2 className="auth-form-title" style={{ fontSize: accountType === 'clinica' ? '24px' : '32px', marginTop: '2px' }}>
                {accountType === 'usuario' ? 'Únete a PuntoOax' : 'Registra tu clínica'}
              </h2>
              <p className="auth-form-instruction">
                {accountType === 'usuario'
                  ? 'Selecciona cómo deseas ingresar a la plataforma.'
                  : 'Crea tu cuenta y registra la información de tu institución.'}
              </p>

              {/* Toggle de Tipo de Cuenta */}
              <div className="auth-role-toggle" role="tablist" aria-label="Tipo de cuenta">
                <button
                  type="button"
                  disabled={loading}
                  role="tab"
                  aria-selected={accountType === 'usuario'}
                  className={`auth-toggle-btn ${accountType === 'usuario' ? 'active' : ''}`}
                  onClick={() => handleTabChange('usuario')}
                >
                  <User size={15} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }} aria-hidden="true" />
                  Soy usuario
                </button>
                <button
                  type="button"
                  disabled={loading}
                  role="tab"
                  aria-selected={accountType === 'clinica'}
                  className={`auth-toggle-btn ${accountType === 'clinica' ? 'active' : ''}`}
                  onClick={() => handleTabChange('clinica')}
                >
                  <Building2 size={15} style={{ marginRight: '6px', verticalAlign: 'text-bottom' }} aria-hidden="true" />
                  Soy clínica
                </button>
              </div>

              {/* Info Banner oficial (#D6E6E0) */}
              <div className="auth-info-banner" role="status">
                <span className="auth-info-icon" aria-hidden="true"><ShieldCheck size={16} /></span>
                <p className="auth-info-text">
                  {accountType === 'usuario'
                    ? 'Crea tu cuenta de usuario para consultar información de los centros.'
                    : 'Registra servicios, horarios y al menos un respaldo en la misma ficha. Los documentos son privados y la clínica no aparecerá en el mapa hasta su aprobación; la postulación corresponde a una etapa posterior.'}
                </p>
              </div>

              {/* Mensaje de error accesible */}
              {error && (
                <div className="auth-error-alert" role="alert">
                  {error}
                </div>
              )}

              {/* Formulario */}
              <form onSubmit={handleSubmit} className="auth-form" noValidate>
                {accountType === 'clinica' ? (
                  <>
                    <div className="auth-input-group">
                      <label htmlFor="reg-clinica-nombre" className="auth-label">
                        Nombre de la clínica
                      </label>
                      <input
                        id="reg-clinica-nombre"
                        type="text"
                        required
                        maxLength={255}
                        autoComplete="organization"
                        value={nombreClinica}
                        onChange={(e) => setNombreClinica(e.target.value)}
                        placeholder="Ej. Clínica Comunitaria San Jacinto"
                        className="auth-input"
                      />
                    </div>

                    <div className="auth-input-group">
                      <label htmlFor="reg-clinica-tipo" className="auth-label">Tipo de institución</label>
                      <select id="reg-clinica-tipo" className="auth-input" required value={tipoInstitucion}
                        onChange={(e) => setTipoInstitucion(e.target.value)}>
                        <option value="">Selecciona una opción</option>
                        <option value="publica">Pública</option>
                        <option value="privada">Privada</option>
                        <option value="ong">Organización social</option>
                        <option value="otra">Otra</option>
                      </select>
                    </div>

                    <div className="auth-input-group">
                      <label htmlFor="reg-clinica-municipio" className="auth-label">Municipio</label>
                      <input id="reg-clinica-municipio" className="auth-input" type="text" required
                        maxLength={100} value={municipio} onChange={(e) => setMunicipio(e.target.value)} />
                    </div>

                    <div className="auth-input-group">
                      <label htmlFor="reg-clinica-direccion" className="auth-label">Dirección completa</label>
                      <input id="reg-clinica-direccion" className="auth-input" type="text" required
                        maxLength={500} value={direccion} onChange={(e) => setDireccion(e.target.value)} />
                    </div>

                    <div className="auth-input-group">
                      <label htmlFor="reg-clinica-cp" className="auth-label">Código postal (opcional)</label>
                      <input id="reg-clinica-cp" className="auth-input" type="text" inputMode="numeric"
                        maxLength={5} value={codigoPostal} onChange={(e) => setCodigoPostal(e.target.value)} />
                    </div>

                    <div className="auth-input-group">
                      <label htmlFor="reg-clinica-telefono" className="auth-label">Teléfono de contacto</label>
                      <input id="reg-clinica-telefono" className="auth-input" type="tel" required
                        maxLength={20} value={telefono} onChange={(e) => setTelefono(e.target.value)} />
                    </div>

                    <div className="auth-input-group">
                      <label htmlFor="reg-clinica-descripcion" className="auth-label">Descripción (opcional)</label>
                      <textarea id="reg-clinica-descripcion" className="auth-input" maxLength={2000}
                        value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
                    </div>

                    <fieldset className="auth-clinica-section">
                      <legend className="auth-clinica-legend">Servicios ofrecidos</legend>
                      <p className="auth-clinica-help">Elige una o ambas áreas. Describe debajo los servicios que ofrece tu clínica en cada una.</p>
                      <div className="auth-service-list">
                        {AREAS.map(({ categoria, nombre, ejemplo }) => (
                          <div className={`auth-service-card ${categoria in serviciosSeleccionados ? 'is-selected' : ''}`} key={categoria}>
                            <label className="auth-service-option">
                              <input type="checkbox" checked={categoria in serviciosSeleccionados}
                                onChange={() => alternarServicio(categoria)} />
                              <span>{nombre}</span>
                            </label>
                            {categoria in serviciosSeleccionados && <label className="auth-label" htmlFor={`reg-servicio-${categoria}`}>
                              Servicios específicos que ofrece tu clínica
                              <textarea id={`reg-servicio-${categoria}`} className="auth-input auth-textarea"
                                required maxLength={2000} rows={3} placeholder={ejemplo}
                                value={serviciosSeleccionados[categoria]}
                                onChange={(e) => setServiciosSeleccionados((actuales) => ({ ...actuales, [categoria]: e.target.value }))} />
                            </label>}
                          </div>
                        ))}
                      </div>
                    </fieldset>

                    <fieldset className="auth-clinica-section">
                      <legend className="auth-clinica-legend">Días y horario de atención</legend>
                      <p className="auth-clinica-help">Selecciona al menos un día y especifica su horario de apertura y cierre.</p>
                      <div className="auth-days-list">{DIAS_SEMANA.map((dia, numero) => {
                        const horario = horarios.find((h) => h.dia_semana === numero);
                        return <div className={`auth-day-row ${horario ? 'is-selected' : ''}`} key={dia}>
                          <label className="auth-day-option">
                            <input type="checkbox" checked={Boolean(horario)} onChange={() => alternarHorario(numero)} /> {dia}
                          </label>
                          {horario && <div className="auth-time-pair">
                            <label className="auth-label">Apertura
                              <input className="auth-input" type="time" required value={horario.apertura}
                                onChange={(e) => cambiarHorario(numero, 'apertura', e.target.value)} />
                            </label>
                            <label className="auth-label">Cierre
                              <input className="auth-input" type="time" required value={horario.cierre}
                                onChange={(e) => cambiarHorario(numero, 'cierre', e.target.value)} />
                            </label>
                          </div>}
                        </div>;
                      })}</div>
                      <p className="auth-clinica-help">Por ahora se admiten horarios dentro del mismo día; no turnos nocturnos ni de 24 horas.</p>
                    </fieldset>

                    <div className="auth-clinica-section">
                      <label className="auth-clinica-legend" htmlFor="reg-clinica-documentos">Documentos de respaldo</label>
                      <p className="auth-clinica-help">Adjunta al menos un archivo que respalde la información de tu clínica. No se exige un documento legal igual para todas las instituciones; se revisará según el servicio que ofrezcas cuando exista la postulación. Los archivos no se publican en el mapa.</p>
                      <input id="reg-clinica-documentos" className="auth-input auth-file-input" type="file"
                        accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" multiple required
                        onChange={(e) => setDocumentos(Array.from(e.target.files || []))} />
                      <p className="auth-clinica-help">PDF, PNG o JPG · máximo 5 archivos de 5 MB cada uno.</p>
                    </div>

                    <div className="auth-input-group">
                      <label htmlFor="reg-clinica-email" className="auth-label">
                        Correo institucional
                      </label>
                      <input
                        id="reg-clinica-email"
                        type="email"
                        required
                        maxLength={255}
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="equipo@centro.ejemplo"
                        className="auth-input"
                      />
                    </div>

                    <div className="auth-input-group">
                      <label htmlFor="reg-clinica-pass" className="auth-label">
                        Contraseña (mínimo 8 caracteres)
                      </label>
                      <input
                        id="reg-clinica-pass"
                        type="password"
                        required
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••••"
                        className="auth-input"
                      />
                    </div>

                    <div className="auth-input-group">
                      <label htmlFor="reg-clinica-confirm" className="auth-label">
                        Confirmar contraseña
                      </label>
                      <input
                        id="reg-clinica-confirm"
                        type="password"
                        required
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••••"
                        className="auth-input"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="auth-submit-btn dark-btn"
                    >
                      {loading ? (
                        'Registrando clínica...'
                      ) : (
                        <>
                          <span>Crear cuenta de clínica</span>{' '}
                          <ArrowRight size={15} style={{ verticalAlign: 'middle' }} aria-hidden="true" />
                        </>
                      )}
                    </button>
                  </>
                ) : (
                  <>
                    <div className="auth-input-group">
                      <label htmlFor="reg-email" className="auth-label">
                        Correo electrónico
                      </label>
                      <input
                        id="reg-email"
                        type="email"
                        required
                        maxLength={255}
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="mariana@correo.ejemplo"
                        className="auth-input"
                      />
                    </div>

                    <div className="auth-input-group">
                      <label htmlFor="reg-pass" className="auth-label">
                        Contraseña (mínimo 8 caracteres)
                      </label>
                      <input
                        id="reg-pass"
                        type="password"
                        required
                        autoComplete="new-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••••"
                        className="auth-input"
                      />
                    </div>

                    <div className="auth-input-group">
                      <label htmlFor="reg-confirm" className="auth-label">
                        Confirmar contraseña
                      </label>
                      <input
                        id="reg-confirm"
                        type="password"
                        required
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••••"
                        className="auth-input"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="auth-submit-btn dark-btn"
                    >
                      {loading ? (
                        'Creando cuenta...'
                      ) : (
                        <>
                          <span>Crear cuenta</span>{' '}
                          <ArrowRight size={15} style={{ verticalAlign: 'middle' }} aria-hidden="true" />
                        </>
                      )}
                    </button>
                  </>
                )}
              </form>

              {/* Enlaces inferiores */}
              <div className="auth-bottom-links">
                <p className="auth-switch-text">
                  ¿Ya tienes una cuenta registrada?{' '}
                  <button
                    type="button"
                    onClick={() => onSwitchToLogin('', accountType)}
                    disabled={loading}
                    className="auth-inline-link"
                  >
                    Iniciar sesión
                  </button>
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>

      {/* Footer oficial */}
      <footer className="auth-footer">
        <p className="auth-footer-text">
          © 2026 PuntOax · Salud, bienestar y orientación en Oaxaca.
        </p>
      </footer>
    </div>
  );
}
