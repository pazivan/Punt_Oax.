import React, { useState } from 'react';
import '../../styles/Auth.css';

export default function Register({ onSwitchToLogin, onBackToPublic }) {
  const [accountType, setAccountType] = useState('usuario'); // 'usuario' por defecto según especificación Figma
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (accountType === 'clinica' && !nombre.trim()) {
      setError('Por favor, ingresa el nombre de la institución o encargado.');
      return;
    }

    if (!email.trim() || !password.trim() || !confirmPassword.trim()) {
      setError('Por favor, completa todos los campos requeridos.');
      return;
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      setError(
        accountType === 'clinica'
          ? 'Por favor, introduce un correo institucional válido.'
          : 'Por favor, introduce un correo electrónico válido.'
      );
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

    setLoading(true);

    // Simulación de respuesta de API para capturas y evidencias
    setTimeout(() => {
      setLoading(false);
      if (email === 'duplicado@centro.com' || email === 'duplicado@correo.com') {
        setError('Este correo electrónico ya se encuentra registrado.');
      } else {
        alert(
          accountType === 'usuario'
            ? '¡Cuenta de usuario creada exitosamente!'
            : '¡Registro de clínica enviado exitosamente!'
        );
        onSwitchToLogin();
      }
    }, 1500);
  };

  return (
    <div className="auth-page-wrapper">
      {/* Header oficial */}
      <header className="auth-header">
        <div className="auth-header-container">
          <div className="auth-brand-group">
            <span
              className="auth-brand-title"
              style={{ cursor: 'pointer' }}
              onClick={onBackToPublic}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && onBackToPublic) onBackToPublic();
              }}
            >
              PuntOax
            </span>
            <button
              type="button"
              onClick={onBackToPublic}
              className="auth-nav-link"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Conócenos
            </button>
          </div>
          <div className="auth-header-actions">
            <button type="button" onClick={onSwitchToLogin} className="auth-btn-outline">
              Iniciar sesión
            </button>
            <span>👤</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="auth-main">
        <div className="auth-card-container">
          {/* Panel Izquierdo: Diseño Figma con fondo #001D14 y detalle circular */}
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
                    : 'Tu centro al alcance de más personas.'}
                </h1>
                <p className="auth-subtext-hero larger">
                  {accountType === 'usuario'
                    ? 'Descubre centros, consulta sus fichas y organiza tus próximas visitas.'
                    : 'Crea tu cuenta institucional y comparte información de tus servicios en Oaxaca.'}
                </p>
              </div>

              {/* Previsualización de mapa con badge PuntOax · Oaxaca */}
              <div className="auth-map-preview-box">
                <div className="auth-map-card-inner">
                  <div className="auth-map-tag">
                    <span role="img" aria-label="pin">📍</span>
                    <span>PuntOax · Oaxaca</span>
                  </div>
                </div>
              </div>

              {/* Lista de ventajas oficiales */}
              <div className="auth-features-list">
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
              </div>
            </div>
          </section>

          {/* Panel Derecho: Formulario de Creación de Cuenta Figma */}
          <section className="auth-right-panel">
            <div className="auth-form-inner">
              <span className="auth-subtitle-small">CREACIÓN DE CUENTA</span>
              <h2 className="auth-form-title" style={{ fontSize: '32px', marginTop: '2px' }}>
                Únete a PuntoOax
              </h2>
              <p className="auth-form-instruction">
                Selecciona cómo deseas ingresar a la plataforma.
              </p>

              {/* Toggle de Tipo de Cuenta */}
              <div className="auth-role-toggle" role="tablist" aria-label="Tipo de cuenta">
                <button
                  type="button"
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

              {/* Info Banner oficial (#D6E6E0) */}
              <div className="auth-info-banner" role="status">
                <span className="auth-info-icon" aria-hidden="true">🛡️</span>
                <p className="auth-info-text">
                  {accountType === 'usuario'
                    ? 'Crea tu cuenta de usuario para guardar centros favoritos y consultar información.'
                    : 'Crea tu cuenta institucional para publicar y gestionar los servicios de tu centro.'}
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
                {accountType === 'clinica' && (
                  <div className="auth-input-group">
                    <label htmlFor="reg-nombre" className="auth-label">
                      Nombre de la institución o encargado
                    </label>
                    <input
                      id="reg-nombre"
                      type="text"
                      required
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                      placeholder="Ej. Centro de Salud San Jacinto"
                      className="auth-input"
                    />
                  </div>
                )}

                <div className="auth-input-group">
                  <label htmlFor="reg-email" className="auth-label">
                    {accountType === 'clinica' ? 'Correo institucional' : 'Correo electrónico'}
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
                  {loading
                    ? 'Creando cuenta...'
                    : accountType === 'usuario'
                      ? 'Crear cuenta →'
                      : 'Crear cuenta institucional →'}
                </button>
              </form>

              {/* Enlaces inferiores */}
              <div className="auth-bottom-links">
                <p className="auth-switch-text">
                  ¿Ya tienes una cuenta registrada?{' '}
                  <button type="button" onClick={onSwitchToLogin} className="auth-inline-link">
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