import { useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom' //Agregado el 21 oct x Citlalli
import { RutaPrivada } from './RutaPrivada' //Importa las herramientas de navegación
import './App.css'

function App() {
  const [clinicas, setClinicas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function cargarClinicas() {
      try {
        const respuesta = await fetch('/api/clinicas')

        if (!respuesta.ok) {
          throw new Error(`El servidor respondió con estado ${respuesta.status}`)
        }

        const datos = await respuesta.json()
        setClinicas(datos)
      } catch (err) {
        setError('No se pudieron cargar las clínicas. Revisa que el servidor Node esté activo.')
        console.error(err)
      } finally {
        setCargando(false)
      }
    }

    cargarClinicas()
  }, [])

  return (
    <Routes>
      {/* Ruta pública: Aquí vive todo tu diseño original */}
      <Route path="/" element={
        <div className="app-container">
          <header className="app-header">
            <div className="header-badge">PuntOax • Salud en Oaxaca</div>
            <h1>Directorio de Clínicas</h1>
            <p className="header-subtitle">
              Puntos de atención y servicios de salud integrados con PostgreSQL y PostGIS.
            </p>
          </header>

          <main className="main-content">
            {cargando && (
              <div className="state-card loading">
                <div className="spinner"></div>
                <p>Cargando clínicas desde el servidor…</p>
              </div>
            )}

            {error && (
              <div className="state-card error" role="alert">
                <span className="alert-icon">⚠️</span>
                <div>
                  <strong>Error de conexión</strong>
                  <p>{error}</p>
                </div>
              </div>
            )}

            {!cargando && !error && clinicas.length === 0 && (
              <div className="state-card empty">
                <span className="empty-icon">🏥</span>
                <h3>No hay clínicas aprobadas para mostrar</h3>
                <p>La base de datos está conectada pero aún no cuenta con clínicas registradas con estado "aprobada".</p>
              </div>
            )}

            {!cargando && !error && clinicas.length > 0 && (
              <div className="clinicas-grid">
                {clinicas.map((clinica) => (
                  <article key={clinica.id_clinica} className="clinica-card">
                    <div className="card-header">
                      <span className="badge-tipo">{clinica.tipo_institucion || 'Centro de Salud'}</span>
                      {clinica.municipio && (
                        <span className="badge-municipio">📍 {clinica.municipio}</span>
                      )}
                    </div>

                    <h3>{clinica.nombre}</h3>

                    {clinica.descripcion && (
                      <p className="card-desc">{clinica.descripcion}</p>
                    )}

                    <div className="card-details">
                      {clinica.direccion && (
                        <p className="detail-item">
                          <strong>Dirección:</strong> {clinica.direccion}
                          {clinica.codigo_postal ? `, C.P. ${clinica.codigo_postal}` : ''}
                        </p>
                      )}
                      {clinica.telefono && (
                        <p className="detail-item">
                          <strong>Teléfono:</strong> <a href={`tel:${clinica.telefono}`}>{clinica.telefono}</a>
                        </p>
                      )}
                      {clinica.correo_contacto && (
                        <p className="detail-item">
                          <strong>Contacto:</strong> <a href={`mailto:${clinica.correo_contacto}`}>{clinica.correo_contacto}</a>
                        </p>
                      )}
                      {clinica.requisitos_generales && (
                        <p className="detail-item requisitos">
                          <strong>Requisitos:</strong> {clinica.requisitos_generales}
                        </p>
                      )}
                    </div>

                    {clinica.sitio_web && (
                      <div className="card-footer">
                        <a
                          href={clinica.sitio_web}
                          target="_blank"
                          rel="noreferrer"
                          className="link-btn"
                        >
                          Sitio Oficial ↗
                        </a>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </main>
        </div>
      } />

      {/* Rutas simuladas para trabajar en tus validaciones */}
      <Route path="/login" element={<h2>Pantalla de Login simulada</h2>} />
      <Route path="/registro" element={<h2>Pantalla de Registro simulada</h2>} />

      {/* Ruta protegida */}
      <Route path="/admin" element={
        <RutaPrivada>
          <h2>Panel de Administración (Solo usuarios autorizados)</h2>
        </RutaPrivada>
      } />
    </Routes>
  )
}

export default App
