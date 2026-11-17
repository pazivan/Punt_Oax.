import { useState } from 'react'
import { Link } from 'react-router-dom'
import { guardarPerfilLocal, leerPerfilLocal } from '../../utils/perfilLocal.js'
import { validarTelefono } from '../../utils/validaciones.js'
import CampanaNotificaciones from './CampanaNotificaciones.jsx'
import '../../styles/Inicio.css'
import './MiPerfil.css'

export default function MiPerfil({ sesion, perfil, onSalir }) {
  const id = sesion?.cuenta?.id_usuario
  const [datos, setDatos] = useState(() => leerPerfilLocal(id))
  const [mensaje, setMensaje] = useState('')
  const [error, setError] = useState('')

  function guardar(evento) {
    evento.preventDefault()
    setError('')
    setMensaje('')
    const limpios = Object.fromEntries(
      Object.entries(datos).map(([campo, valor]) => [campo, valor.trim()])
    )
    if (!limpios.nombre || !limpios.apellidos || limpios.nombre.length > 60 || limpios.apellidos.length > 80) {
      setError('Escribe nombre y apellidos (máximo 60 y 80 caracteres).')
      return
    }
    if (limpios.telefono && !validarTelefono(limpios.telefono)) {
      setError('Escribe un teléfono válido de al menos 10 dígitos o déjalo vacío.')
      return
    }
    try {
      guardarPerfilLocal(id, limpios)
      setDatos(limpios)
      setMensaje('Datos guardados solo en este navegador. Podrás usarlos al agendar.')
    } catch {
      setError('No se pudieron guardar los datos en este navegador.')
    }
  }

  return (
    <div className="inicio-page">
      <header className="inicio-header">
        <div className="inicio-header-container">
          <Link to="/cuenta" className="inicio-brand">PuntOax</Link>
          <nav className="inicio-nav" aria-label="Navegación principal">
            <Link to="/cuenta" className="inicio-nav-link">Inicio</Link>
            <Link to="/mis-citas" className="inicio-nav-link">Mis citas</Link>
            <Link to="/mapa" className="inicio-nav-link">Mapa de centros</Link>
          </nav>
          <div className="inicio-header-right">
            <CampanaNotificaciones sesion={sesion} />
            <button type="button" onClick={onSalir} className="inicio-header-logout-btn">Salir</button>
          </div>
        </div>
      </header>
      <main className="perfil-local">
        <Link to="/cuenta">← Volver a mi cuenta</Link>
        <h1>Mi perfil</h1>
        <p>Correo de acceso: {perfil?.correo || sesion?.cuenta?.correo}</p>
        <p className="perfil-local-aviso">Estos datos se guardan únicamente en este navegador; no se sincronizan con tu cuenta ni se envían al servidor al reservar una cita. No uses un dispositivo compartido.</p>
        <form onSubmit={guardar}>
          <label>Nombre
            <input value={datos.nombre} maxLength={60} required autoComplete="given-name"
              onChange={(e) => setDatos({ ...datos, nombre: e.target.value })} />
          </label>
          <label>Apellidos
            <input value={datos.apellidos} maxLength={80} required autoComplete="family-name"
              onChange={(e) => setDatos({ ...datos, apellidos: e.target.value })} />
          </label>
          <label>Teléfono
            <input value={datos.telefono} maxLength={20} autoComplete="tel" type="tel"
              onChange={(e) => setDatos({ ...datos, telefono: e.target.value })} />
          </label>
          {error && <p role="alert">{error}</p>}
          {mensaje && <p role="status">{mensaje}</p>}
          <button type="submit">Guardar en este navegador</button>
        </form>
      </main>
    </div>
  )
}
