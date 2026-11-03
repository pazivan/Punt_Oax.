import { useRef, useState } from 'react';
import '../../styles/Auth.css';
import { guardarSesion, iniciarSesion, iniciarSesionClinica } from '../../api/auth';
import { normalizarCorreo, validarEmail, validarRequerido } from '../../utils/validaciones';

export default function Login({ onSwitchToRegister, onBackToPublic, onLogin, mensaje }) {
  const [accountType, setAccountType] = useState('usuario');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const enviando = useRef(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (enviando.current) return;
    setError('');

    // Validación básica en cliente
    if (!validarRequerido(email) || !validarRequerido(password)) {
      setError('Por favor, completa todos los campos.');
      return;
    }

    const correoLimpio = normalizarCorreo(email);

    if (!validarEmail(correoLimpio)) {
      setError(
        accountType === 'clinica'
          ? 'Por favor, introduce un correo institucional válido.'
          : 'Por favor, introduce un correo electrónico válido.'
      );
      return;
    }

    enviando.current = true;
    setLoading(true);

    try {
      const respuesta = accountType === 'clinica'
        ? await iniciarSesionClinica(email.trim(), password)
        : await iniciarSesion(email.trim(), password);
      const sesion = guardarSesion(respuesta, accountType);
      onLogin(sesion);
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
            <button type="button" onClick={onSwitchToRegister} disabled={loading} className="auth-btn-outline">
              Registro de cuenta
            </button>
            <div className="auth-avatar-circle" aria-hidden="true">
              👤
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="auth-main">
        <div className="auth-card-container">
          {/* Panel Izquierdo: Verde Institucional #103328 (Left Dark Green Card) */}
          <section className="auth-left-panel">
            <div>
              <span className="auth-badge-top">
                {accountType === 'clinica' ? 'ÁREA CLÍNICA' : 'ACCESO PUNTOAX'}
              </span>
              <h1 className="auth-heading-hero">
                {accountType === 'clinica'
                  ? 'Todo tu centro en un mismo espacio.'
                  : 'Bienvenido de nuevo.'}
              </h1>
              <p className="auth-subtext-hero">
                Consulta la información disponible de los centros de salud.
              </p>
            </div>

            {/* Previsualización del mapa */}
            <div className="auth-map-preview-box">
              <div className="auth-map-card-inner">
                <div className="auth-map-tag">
                  <span role="img" aria-label="pin">📍</span>
                  <span>PuntOax · Oaxaca</span>
                </div>
              </div>
            </div>

            {/* Lista de ventajas según Figma */}
            <div className="auth-features-list">
              <div className="auth-feature-row">
                <span className="auth-check-icon">✔</span>
                <span>Gestión integral de centros de detección de ITS e ILE</span>
              </div>
              <div className="auth-feature-row">
                <span className="auth-check-icon">✔</span>
                <span>Información actualizada de servicios y horarios</span>
              </div>
              <div className="auth-feature-row">
                <span className="auth-check-icon">✔</span>
                <span>Administración accesible, rápida y segura</span>
              </div>
            </div>
          </section>

          {/* Panel Derecho: Formulario Blanco (Right Form Card) */}
          <section className="auth-right-panel">
            <div className="auth-form-inner">
              <span className="auth-subtitle-small">
                {accountType === 'clinica' ? 'BIENVENIDO DE NUEVO' : 'TU CUENTA'}
              </span>
              <h2 className="auth-form-title">Iniciar sesión</h2>
              <p className="auth-form-instruction">
                {accountType === 'clinica'
                  ? 'Inicia sesión con tu cuenta de clínica.'
                  : 'Selecciona el tipo de cuenta con el que deseas continuar.'}
              </p>

              {mensaje && <div className="auth-info-banner" role="status">{mensaje}</div>}
              {/* Mensaje de error accesible */}
              {error && (
                <div className="auth-error-alert" role="alert">
                  {error}
                </div>
              )}

              {/* Selector de rol (Tab Selector) */}
              <div className="auth-role-toggle" role="tablist" aria-label="Tipo de acceso">
                <button
                  type="button"
                  disabled={loading}
                  role="tab"
                  aria-selected={accountType === 'usuario'}
                  className={`auth-toggle-btn ${accountType === 'usuario' ? 'active' : ''}`}
                  onClick={() => {
                    setAccountType('usuario');
                    setError('');
                  }}
                >
                  👤 Soy usuario
                </button>
                <button
                  type="button"
                  disabled={loading}
                  role="tab"
                  aria-selected={accountType === 'clinica'}
                  className={`auth-toggle-btn ${accountType === 'clinica' ? 'active' : ''}`}
                  onClick={() => {
                    setAccountType('clinica');
                    setError('');
                  }}
                >
                  🏥 Soy clínica
                </button>
              </div>

              {/* Formulario */}
              <form onSubmit={handleSubmit} className="auth-form" noValidate>
                <div className="auth-input-group">
                  <label htmlFor="login-email" className="auth-label">
                    {accountType === 'clinica' ? 'Correo institucional' : 'Correo electrónico'}
                  </label>
                  <input
                    id="login-email"
                    type="email"
                    required
                    maxLength={255}
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={
                      accountType === 'clinica' ? 'equipo@centro.ejemplo' : 'mariana@correo.ejemplo'
                    }
                    className="auth-input"
                  />
                </div>

                <div className="auth-input-group">
                  <label htmlFor="login-password" className="auth-label">
                    Contraseña
                  </label>
                  <input
                    id="login-password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••"
                    className="auth-input"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="auth-submit-btn"
                >
                  {loading
                    ? 'Verificando datos...'
                    : 'Iniciar sesión →'}
                </button>
              </form>

              {/* Enlace inferior */}
              <div className="auth-bottom-links">
                <p className="auth-switch-text">
                  ¿Aún no registras tu cuenta?{' '}
                  <button type="button" onClick={onSwitchToRegister} disabled={loading} className="auth-inline-link">
                    Crear cuenta
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
