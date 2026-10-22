import React, { useState } from 'react';
import '../../styles/Auth.css';

export default function Login({ onSwitchToRegister, onBackToPublic }) {
  const [accountType, setAccountType] = useState('clinica'); // Soporta 'clinica' y 'usuario'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    // Validación básica en cliente
    if (!email.trim() || !password.trim()) {
      setError('Por favor, completa todos los campos.');
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

    setLoading(true);

    // Simulación de respuesta de API (para capturas de evidencia)
    setTimeout(() => {
      setLoading(false);
      if (password === 'error123') {
        setError('Correo electrónico o contraseña incorrectos.');
      } else {
        alert(`¡Sesión iniciada con éxito como ${accountType === 'clinica' ? 'Clínica' : 'Usuario'}!`);
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
            <button type="button" onClick={onSwitchToRegister} className="auth-btn-outline">
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
                {accountType === 'clinica'
                  ? 'Accede a la plataforma para gestionar y consultar información verificada.'
                  : 'Accede a la plataforma para gestionar y consultar información verificada.'}
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
                  ? 'Accede al portal de tu centro.'
                  : 'Selecciona el tipo de cuenta con el que deseas continuar.'}
              </p>

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
                    : accountType === 'clinica'
                    ? 'Entrar al portal →'
                    : 'Entrar al panel →'}
                </button>
              </form>

              {/* Enlace inferior */}
              <div className="auth-bottom-links">
                <p className="auth-switch-text">
                  ¿Aún no registras tu cuenta?{' '}
                  <button type="button" onClick={onSwitchToRegister} className="auth-inline-link">
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
