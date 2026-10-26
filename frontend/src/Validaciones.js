// frontend/src/Validaciones.js

// Validar formato de correo electrónico (general e institucional)
export function validarEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

// Validar contraseña segura (mínimo 8 caracteres)
export function validarPassword(password) {
  return password && password.length >= 8;
}

// Validar campos obligatorios vacíos
export function validarRequerido(valor) {
  return valor && valor.trim().length > 0;
}