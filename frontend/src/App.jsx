import { useEffect, useState } from 'react'

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
    <main>
      <h1>PuntOax</h1>
      <h2>Clínicas disponibles</h2>

      {cargando && <p>Cargando clínicas…</p>}
      {error && <p role="alert">{error}</p>}

      {!cargando && !error && clinicas.length === 0 && (
        <p>No hay clínicas aprobadas para mostrar.</p>
      )}

      {clinicas.map((clinica) => (
        <article key={clinica.id_clinica}>
          <h3>{clinica.nombre}</h3>
          {clinica.descripcion && <p>{clinica.descripcion}</p>}
          {clinica.municipio && <p>Municipio: {clinica.municipio}</p>}
        </article>
      ))}
    </main>
  )
}

export default App
