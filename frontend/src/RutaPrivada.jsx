import { Navigate, useLocation } from 'react-router-dom'
import { CargandoSesion, ErrorSesionTemporal } from './components/EstadoSesion.jsx'
import { obtenerDestinoPorRol } from './utils/permisos.js'

export function RutaPrivada({
  sesion,
  perfil,
  verificando,
  error,
  onReintentar,
  rolesPermitidos,
  avisoNoAutenticado = 'Inicia sesión o crea una cuenta para continuar.',
  children,
}) {
  const { pathname, search } = useLocation()

  if (!sesion) {
    const destinoActual = `${pathname}${search || ''}`
    return (
      <Navigate
        to="/login"
        replace
        state={{
          aviso: avisoNoAutenticado,
          from: destinoActual,
        }}
      />
    )
  }

  if (verificando) {
    return <CargandoSesion />
  }

  if (!perfil) {
    return (
      <ErrorSesionTemporal
        mensaje={error || 'No se pudo comprobar tu sesión por un fallo temporal de conexión.'}
        onReintentar={onReintentar}
        rutaInicio="/conocenos"
        textoInicio="Ir al inicio"
      />
    )
  }

  if (!rolesPermitidos.includes(perfil.rol)) {
    const destino = obtenerDestinoPorRol(perfil, sesion)
    const destinoSeguro = destino && destino !== pathname ? destino : '/conocenos'
    return <Navigate to={destinoSeguro} replace />
  }

  return children
}
