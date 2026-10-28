import { useRef, useState } from 'react';
import '../../styles/Auth.css';
import { registrarUsuario } from '../../api/auth';

export default function Register({ onSwitchToLogin, onBackToPublic }) {
  const [accountType, setAccountType] = useState('clinica'); // Vista de clínica según especificación Figma
  const [nombreClinica, setNombreClinica] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const enviando = useRef(false);

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

    // Validación para el registro de clínicas
    if (accountType === 'clinica') {
      if (!nombreClinica.trim() || !email.trim() || !password.trim() || !confirmPassword.trim()) {
        setError('Por favor, completa todos los campos requeridos.');
        return;
      }

      if (!/\S+@\S+\.\S+/.test(email)) {
        setError('Por favor, introduce un correo institucional válido.');
        return;
      }

      if (password.length < 8) {
        setError('La contraseña debe tener al menos 8 caracteres.');
        return;
      }

      if (password !== confirmPassword) {
        setError('Las contraseñas no coinciden. Por favor verifícalas.');
        return;
      }

      // Hasta que exista conexión con el servidor, seguir avisando que no está disponible
      setError('El registro de clínicas aún no está disponible en el servidor.');
      return;
    }

    // Validación para el registro de usuarios individuales
    if (!email.trim() || !password.trim() || !confirmPassword.trim()) {
      setError('Por favor, completa todos los campos requeridos.');
      return;
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      setError('Por favor, introduce un correo electrónico válido.');
      return;
    }

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden. Por favor verifícalas.');
      return;
    }

    enviando.current = true;
    setLoading(true);

    try {
      await registrarUsuario(email.trim(), password);
      onSwitchToLogin('Cuenta creada. Ya puedes iniciar sesión.');
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
            <button type="button" onClick={onSwitchToLogin} disabled={loading} className="auth-btn-outline">
              Iniciar sesión
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
          {/* Panel Izquierdo: Diseño Figma con fondo #001D14 y detalle de mapa */}
          <section className="auth-left-panel theme-dark">
            <div className="auth-decor-circle" aria-hidden="true"></div>

            <div className="auth-panel-content-wrap">
              <div>
                <span className="auth-badge-top mint-light">
                  {accountType === 'usuario' ? 'CREACIÓN DE CUENTA' : 'PUNTOOAX PARA CENTROS'}
                </span>
                <h1 className="auth-heading-hero hero-large">
                  {accountType === 'usuario'
                    ? 'Una experiencia pensada para la confianza.'
                    : 'Tu institución, al alcance de más personas.'}
                </h1>
                <p className="auth-subtext-hero larger">
                  {accountType === 'usuario'
                    ? 'Descubre centros, consulta sus fichas y organiza tus próximas visitas.'
                    : 'Comienza con un correo institucional y una contraseña para dar de alta tu sede.'}
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
                      <span className="auth-check-icon">✔</span>
                      <span>Registro institucional</span>
                    </div>
                    <div className="auth-feature-row">
                      <span className="auth-check-icon">✔</span>
                      <span>Verificación de sede</span>
                    </div>
                    <div className="auth-feature-row">
                      <span className="auth-check-icon">✔</span>
                      <span>Publicación en catálogo</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="auth-feature-row">
                      <span className="auth-check-icon">✔</span>
                      <span>Directorio verificado de centros de detección de ITS e ILE</span>
                    </div>
                    <div className="auth-feature-row">
                      <span className="auth-check-icon">✔</span>
                      <span>Información transparente, confidencial y segura</span>
                    </div>
                    <div className="auth-feature-row">
                      <span className="auth-check-icon">✔</span>
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
                  : 'Comienza con un correo institucional y una contraseña.'}
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
                  👤 Soy usuario
                </button>
                <button
                  type="button"
                  disabled={loading}
                  role="tab"
                  aria-selected={accountType === 'clinica'}
                  className={`auth-toggle-btn ${accountType === 'clinica' ? 'active' : ''}`}
                  onClick={() => handleTabChange('clinica')}
                >
                  🏥 Soy clínica
                </button>
              </div>

              {/* Info Banner oficial (#D6E6E0) */}
              <div className="auth-info-banner" role="status">
                <span className="auth-info-icon" aria-hidden="true">🛡️</span>
                <p className="auth-info-text">
                  {accountType === 'usuario'
                    ? 'Crea tu cuenta de usuario para consultar información de los centros.'
                    : 'Aviso importante: Tu ficha institucional todavía no es pública (se habilitará tras su revisión y aprobación). El registro requiere conexión con el servidor.'}
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
                        autoComplete="organization"
                        value={nombreClinica}
                        onChange={(e) => setNombreClinica(e.target.value)}
                        placeholder="Ej. Clínica Comunitaria San Jacinto"
                        className="auth-input"
                      />
                    </div>

                    <div className="auth-input-group">
                      <label htmlFor="reg-clinica-email" className="auth-label">
                        Correo institucional
                      </label>
                      <input
                        id="reg-clinica-email"
                        type="email"
                        required
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
                      {loading ? 'Registrando clínica...' : 'Crear cuenta de clínica →'}
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
                      {loading ? 'Creando cuenta...' : 'Crear cuenta →'}
                    </button>
                  </>
                )}
              </form>

              {/* Enlaces inferiores */}
              <div className="auth-bottom-links">
                <p className="auth-switch-text">
                  ¿Ya tienes una cuenta registrada?{' '}
                  <button type="button" onClick={onSwitchToLogin} disabled={loading} className="auth-inline-link">
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
