import { useRef, useState } from 'react';
import { ArrowRight, Building2, Check, Eye, EyeOff, ShieldCheck, User } from 'lucide-react';
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
  'Tu cuenta de clínica fue creada correctamente. Ya puedes iniciar sesión para completar los datos de tu clínica.';

export default function Register({ onSwitchToLogin, onBackToPublic, initialAccountType = 'usuario' }) {
  const [accountType, setAccountType] = useState(
    initialAccountType === 'clinica' ? 'clinica' : 'usuario'
  );

  // Sincronizado con initialAccountType mediante key en App.jsx
  const [nombreClinica, setNombreClinica] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const enviando = useRef(false);

  const handleTabChange = (tipo) => {
    setAccountType(tipo);
    setError('');
    // Limpieza de contraseñas por seguridad (no guardar contraseña en el navegador)
    setPassword('');
    setConfirmPassword('');
    setMostrarPassword(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (enviando.current) return;
    setError('');

    const correoLimpio = normalizarCorreo(email);

    if (!validarRequerido(email) || !validarRequerido(password)) {
      setError('Por favor, completa todos los campos requeridos.');
      return;
    }

    if (accountType === 'clinica' && !validarNombreClinica(nombreClinica)) {
      setError(!validarRequerido(nombreClinica)
        ? 'Por favor, ingresa el nombre de la clínica.'
        : 'El nombre de la clínica no puede superar los 255 caracteres.');
      return;
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

    // La confirmación se conserva solo en el registro de usuarios comunes.
    if (accountType === 'usuario' && password !== confirmPassword) {
      setError('Las contraseñas no coinciden. Por favor verifícalas.');
      return;
    }

    enviando.current = true;
    setLoading(true);

    try {
      if (accountType === 'clinica') {
        await registrarClinica({
          nombre: nombreClinica.trim(),
          correo: correoLimpio,
          password,
        });
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

  const inputPassword = (
    <div className="auth-input-group">
      <label htmlFor={accountType === 'clinica' ? 'reg-clinica-pass' : 'reg-pass'} className="auth-label">
        Contraseña (mínimo 8 caracteres)
      </label>
      <div className="auth-password-wrap">
        <input
          id={accountType === 'clinica' ? 'reg-clinica-pass' : 'reg-pass'}
          type={mostrarPassword ? 'text' : 'password'}
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••••"
          className="auth-input"
        />
        <button
          type="button"
          className="auth-password-toggle"
          onClick={() => setMostrarPassword((visible) => !visible)}
          aria-label={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-pressed={mostrarPassword}
          disabled={loading}
        >
          {mostrarPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </div>
    </div>
  );

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
          {/* Panel izquierdo: diseño institucional */}
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
                    : 'Crea tu cuenta de acceso. Después completarás la ficha institucional y podrás enviarla a revisión.'}
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
                      <span>Cuenta de acceso institucional</span>
                    </div>
                    <div className="auth-feature-row">
                      <span className="auth-check-icon"><Check size={14} strokeWidth={2.5} /></span>
                      <span>Ficha institucional en borrador</span>
                    </div>
                    <div className="auth-feature-row">
                      <span className="auth-check-icon"><Check size={14} strokeWidth={2.5} /></span>
                      <span>Postulación sujeta a revisión</span>
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

          {/* Panel derecho: formulario */}
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
                  : 'Solo necesitas tres datos para crear tu cuenta de acceso.'}
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
                    : 'Aquí solo creas tu cuenta. Al iniciar sesión podrás completar servicios, horarios, ubicación y documentos. Tu clínica no aparecerá en el mapa hasta ser aprobada.'}
                </p>
              </div>

              {error && (
                <div className="auth-error-alert" role="alert">
                  {error}
                </div>
              )}

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
                      <label htmlFor="reg-clinica-email" className="auth-label">
                        Correo electrónico de acceso
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

                    {inputPassword}

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

                    {inputPassword}

                    <div className="auth-input-group">
                      <label htmlFor="reg-confirm" className="auth-label">
                        Confirmar contraseña
                      </label>
                      <input
                        id="reg-confirm"
                        type={mostrarPassword ? 'text' : 'password'}
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

      <footer className="auth-footer">
        <p className="auth-footer-text">
          © 2026 PuntOax · Salud, bienestar y orientación en Oaxaca.
        </p>
      </footer>
    </div>
  );
}
