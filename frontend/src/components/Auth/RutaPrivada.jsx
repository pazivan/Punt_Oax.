// frontend/src/components/Auth/RutaPrivada.jsx
import React from 'react';
import { Navigate } from 'react-router-dom'; // O la lógica de navegación que use tu proyecto

export default function RutaPrivada({ children, rolRequerido }) {
  const token = localStorage.getItem('puntOax_token');
  const rol = localStorage.getItem('puntOax_rol');
  const expira = localStorage.getItem('puntOax_expira'); // Timestamp de expiración

  // 1. Manejo de Sesión Vencida o Ausente
  const sesionVencida = expira && Date.now() > parseInt(expira, 10);

  if (!token || sesionVencida) {
    // Si la sesión venció, limpiamos las credenciales almacenadas
    if (sesionVencida) {
      localStorage.removeItem('puntOax_token');
      localStorage.removeItem('puntOax_rol');
      localStorage.removeItem('puntOax_expira');
      alert('Tu sesión ha expirado por seguridad. Por favor, ingresa nuevamente.');
    }
    // Redirección activa al Login
    return <Navigate to="/login" replace />;
  }

  // 2. Control de Permisos por Rol
  if (rolRequerido && rol !== rolRequerido) {
    return <Navigate to="/" replace />; // Redirige a la vista pública si no tiene el rol
  }

  return children;
}