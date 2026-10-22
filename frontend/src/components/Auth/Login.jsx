import React, { useState } from 'react';
import '../../styles/Auth.css';

export default function Login({ onSwitchToRegister }) {
  const [accountType, setAccountType] = useState('usuario'); // 'usuario' | 'clinica'
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
      <header className="auth-header">
        <div className="auth-header-container">
          <div className="auth-brand-group">
            <span className="auth-brand-title">PuntOax</span>
            <a href="#conocenos" className="auth-nav-link">Conócenos</a>
          </div>
          <div className="auth-header-actions">
            <button type="button" onClick={onSwitchToRegister} className="auth-btn-outline">
              Registro de clínica
            </button>
            <span>👤</span>
          </div>
        </div>
      </header>

      <main className="auth-main">
        <div className="auth-card-container">
          {/* Panel Izquierdo */}
          <section className="auth-left-panel">
            <div>
              <span className="auth-badge-top">ACCESO PUNTOAX</span>
              <h1 className="auth-heading-hero">Bienvenido de nuevo.</h1>
              <p className="auth-subtext-hero">
                Accede a la plataforma para gestionar y consultar información verificada.
              </p>
            </div>

            <div className="auth-map-preview-box">
              <div className="auth-map-card-inner">
                <div className="auth-map-tag">
                  <span>📍</span>
                  <span>PuntOax · Oaxaca</span>
                </div>
              </div>
            </div>

            <div className="auth-features-list">
              <div className="auth-feature-row">
                <span className="auth-check-icon">✔</span>
                <span>Gestión integral de centros de salud</span>
              </div>
              <div className="auth-feature-row">
                <span className="auth-check-icon">✔</span>
                <span>Información actualizada de servicios</span>
              </div>
              <div className="auth-feature-row">
                <span className="auth-check-icon">✔</span>
                <span>Consulta accesible, rápida y segura</span>
              </div>
            </div>
          </section>

          {/* Panel Derecho: Formulario */}
          <section className="auth-right-panel">
            <div className="auth-form-inner">
              <span className="auth-subtitle-small">TU CUENTA</span>
              <h2 className="auth-form-title">Iniciar sesión</h2>
              <p className="auth-form-instruction">
                Selecciona el tipo de cuenta con el que deseas continuar.
              </p>

              {error && (
                <div className="auth-error-alert" role="alert">
                  {error}
                </div>
              )}

              {/* Selector de rol */}
              <div className="auth-role-toggle">
                <button
                  type="button"
                  className={`auth-toggle-btn ${accountType === 'usuario' ? 'active' : ''}`}
                  onClick={() => setAccountType('usuario')}
                >
                  👤 Soy usuario
                </button>
                <button
                  type="button"
                  className={`auth-toggle-btn ${accountType === 'clinica' ? 'active' : ''}`}
                  onClick={() => setAccountType('clinica')}
                >
                  🏥 Soy clínica
                </button>
              </div>

              <form onSubmit={handleSubmit} className="auth-form">
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
                    placeholder="mariana@correo.ejemplo"
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
                  {loading ? 'Verificando datos...' : 'Entrar al panel →'}
                </button>
              </form>

              <div className="auth-bottom-links">
                <p className="auth-switch-text">
                  ¿Aún no registras tu cuenta?{' '}
                  <button type="button" onClick={onSwitchToRegister} className="auth-inline-link">
                    Crear cuenta
                  </button>
                </p>
                <a href="/" className="auth-public-link">
                  ← Continuar como visitante (Consulta pública sin cuenta)
                </a>
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
