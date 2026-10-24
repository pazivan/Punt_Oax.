import { Link, Navigate } from 'react-router-dom'

// Adaptación del prototipo de rutas privadas de Citlalli a la sesión verificada.
export function RutaPrivada({ sesion, perfil, verificando, error, rolesPermitidos, children }) {
  if (!sesion) return <Navigate to="/login" replace />

  if (verificando) {
    return <p role="status">Verificando tu sesión…</p>
  }

  if (!perfil) {
    return <p role="alert">{error || 'No se pudo verificar tu sesión.'} <Link to="/">Volver al directorio</Link></p>
  }

  if (!rolesPermitidos.includes(perfil.rol)) {
    return <p role="alert">No tienes permiso para ver esta página. <Link to="/">Volver al directorio</Link></p>
  }

  return children
}
