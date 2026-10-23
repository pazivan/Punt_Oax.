import { Navigate } from 'react-router-dom'

export function RutaPrivada({ children }) {
  // Simulación: cambia a true para probar el acceso permitido
  const sesionActiva = false; 

  if (!sesionActiva) {
    return <Navigate to="/login" replace />
  }
  return children
}