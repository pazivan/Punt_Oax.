import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { consultarMiFicha } from '../../api/auth'
import { describirErrorConsulta } from '../../utils/erroresConsulta.js'

/**
 * Protege las rutas operativas de una clínica (panel, citas y agenda).
 *
 * El estado se consulta al servidor en cada entrada; no se confía en la sesión
 * ni en marcas de sessionStorage, que pueden quedar desactualizadas después de
 * una aprobación, rechazo o suspensión.
 */
export default function RutaClinicaAprobada({ children }) {
  const [estado, setEstado] = useState('verificando')
  const [error, setError] = useState(null)
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    let activo = true
    consultarMiFicha()
      .then((datos) => {
        if (!activo) return
        setEstado(datos?.clinica?.estado_publicacion === 'aprobada' ? 'permitido' : 'restringido')
      })
      .catch((err) => {
        if (!activo) return
        setError(err)
        setEstado('error')
      })
    return () => { activo = false }
  }, [intento])

  if (estado === 'restringido') return <Navigate to="/mi-clinica" replace />

  if (estado === 'error') {
    const aviso = describirErrorConsulta(error, 'tu clínica')
    return (
      <div className="ficha-page">
        <main className="ficha-state-card" role="alert">
          <h1>{aviso.titulo}</h1>
          <p>{aviso.mensaje}</p>
          {aviso.reintentar && <button
            type="button"
            className="ficha-btn-primary"
            onClick={() => {
              setEstado('verificando')
              setError(null)
              setIntento((valor) => valor + 1)
            }}
          >
            Reintentar
          </button>}
          {error?.status === 401 || ['TOKEN_EXPIRADO', 'TOKEN_INVALIDO', 'SESION_INVALIDA'].includes(error?.codigo)
            ? <Link to="/login" className="ficha-inline-link">Iniciar sesión</Link>
            : null}
          <Link to="/mi-clinica" className="ficha-inline-link">Volver a mi clínica</Link>
        </main>
      </div>
    )
  }

  if (estado === 'verificando') {
    return (
      <div className="ficha-page">
        <main className="ficha-loading" role="status">
          <span className="ficha-spinner" aria-hidden="true" />
          <p>Verificando el estado de tu clínica…</p>
        </main>
      </div>
    )
  }

  return children
}
