import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { consultarMiFicha } from '../../api/auth'

/**
 * Protege las rutas operativas de una clínica (panel, citas y agenda).
 *
 * El estado se consulta al servidor en cada entrada; no se confía en la sesión
 * ni en marcas de sessionStorage, que pueden quedar desactualizadas después de
 * una aprobación, rechazo o suspensión.
 */
export default function RutaClinicaAprobada({ children }) {
  const [estado, setEstado] = useState('verificando')
  const [error, setError] = useState('')
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
        setError(err.message || 'No se pudo verificar el estado de tu clínica.')
        setEstado('error')
      })
    return () => { activo = false }
  }, [intento])

  if (estado === 'restringido') return <Navigate to="/mi-clinica" replace />

  if (estado === 'error') {
    return (
      <div className="ficha-page">
        <main className="ficha-state-card" role="alert">
          <h1>No pudimos verificar tu clínica</h1>
          <p>{error}</p>
          <button
            type="button"
            className="ficha-btn-primary"
            onClick={() => {
              setEstado('verificando')
              setError('')
              setIntento((valor) => valor + 1)
            }}
          >
            Reintentar
          </button>
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
