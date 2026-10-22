import React, { useState } from 'react';
import '../../styles/Auth.css';

export default function Register({ onSwitchToLogin }) {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!nombre.trim() || !email.trim() || !password.trim()) {
      setError('Por favor, llena todos los campos obligatorios.');
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

    setTimeout(() => {
      setLoading(false);
      if (email === 'duplicado@centro.com') {
        setError('Este correo electrónico ya se encuentra registrado.');
      } else {
        alert('¡Registro enviado exitosamente!');
        onSwitchToLogin();
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
            <button type="button" onClick={onSwitchToLogin} className="auth-btn-outline">
              Iniciar sesión
            </button>
          </div>
        </div>
      </header>

      <main className="auth-main">
        <div className="auth-card-container">
          {/* Panel Izquierdo */}
          <section className="auth-left-panel">
            <div>
              <span className="auth-badge-top">PUNTOAX PARA CENTROS</span>
              <h1 className="auth-heading-hero">Tu centro al alcance de más personas.</h1>
              <p className="auth-subtext-hero">
                Crea tu cuenta institucional y comparte información de tus servicios en Oaxaca.
              </p>
            </div>

            <div className="auth-features-list" style={{ marginTop: '30px' }}>
              <div className="auth-feature-row">
                <span className="auth-check-icon">①</span>
                <span>Crea tu cuenta con correo oficial</span>
              </div>
              <div className="auth-feature-row">
                <span className="auth-check-icon">②</span>
                <span>Configura los servicios que ofrece tu centro</span>
              </div>
              <div className="auth-feature-row">
                <span className="auth-check-icon">③</span>
                <span>Recibe solicitudes y mantén actualizados tus datos</span>
              </div>
            </div>
          </section>

          {/* Panel Derecho: Formulario */}
          <section className="auth-right-panel">
            <div className="auth-form-inner">
              <span className="auth-subtitle-small">NUEVA CUENTA</span>
              <h2 className="auth-form-title">Registro de clínica</h2>
              <p className="auth-form-instruction">
                Ingresa los datos para registrar a tu institución.
              </p>

              {error && (
                <div className="auth-error-alert" role="alert">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="auth-form">
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

                <div className="auth-input-group">
                  <label htmlFor="reg-email" className="auth-label">
                    Correo electrónico institucional
                  </label>
                  <input
                    id="reg-email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="contacto@centro.ejemplo"
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
                  className="auth-submit-btn"
                >
                  {loading ? 'Creando cuenta...' : 'Crear cuenta institucional →'}
                </button>
              </form>

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

      <footer className="auth-footer">
        <p className="auth-footer-text">
          © 2026 PuntOax · Salud, bienestar y orientación en Oaxaca.
        </p>
      </footer>
    </div>
  );
}