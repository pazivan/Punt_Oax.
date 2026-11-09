import { Link } from 'react-router-dom'
import { ArrowRight, HeartHandshake, MapPin, ShieldCheck } from 'lucide-react'
import './Conocenos.css'

export default function Conocenos({ sesion, perfil, onSalir }) {
  const rutaCuenta = perfil?.rol === 'clinica' ? '/mi-clinica' : '/cuenta'

  return <div className="conocenos-page">
    <header className="conocenos-header">
      <Link to="/" className="conocenos-logo">PuntOax<span>.</span></Link>
      <nav aria-label="Navegación pública">
        {sesion ? (
          <>
            <Link to={rutaCuenta}>Mi cuenta</Link>
            <button type="button" className="conocenos-salir" onClick={onSalir}>Salir</button>
          </>
        ) : (
          <>
            <Link to="/login">Iniciar sesión</Link>
            <Link to="/registro" className="conocenos-register">Crear cuenta</Link>
          </>
        )}
      </nav>
    </header>
    <main>
      <section className="conocenos-hero">
        <div>
          <span className="conocenos-eyebrow">CONÓCENOS · SALUD EN OAXACA</span>
          <h1>Información para encontrar atención con confianza.</h1>
          <p>PuntOax reúne información sobre centros y servicios de atención de ITS e interrupción legal del embarazo (ILE) en Oaxaca. El directorio y el mapa están disponibles para consulta pública.</p>
          <Link to="/directorio" className="conocenos-cta">Explorar el directorio <ArrowRight size={18} aria-hidden="true" /></Link>
        </div>
        <div className="conocenos-preview" aria-hidden="true"><MapPin size={36} /><span>PuntOax · Oaxaca</span></div>
      </section>
      <section className="conocenos-details" aria-label="Sobre el proyecto">
        <article><MapPin size={24} aria-hidden="true" /><h2>Encuentra centros</h2><p>Consulta el mapa y las fichas de los centros disponibles en el directorio sin necesidad de iniciar sesión.</p></article>
        <article><HeartHandshake size={24} aria-hidden="true" /><h2>Conoce sus servicios</h2><p>Revisa la información registrada sobre servicios y horarios; confirma siempre los datos con el centro antes de acudir.</p></article>
        <article><ShieldCheck size={24} aria-hidden="true" /><h2>Publicación revisada</h2><p>Las clínicas nuevas no aparecen automáticamente. La postulación y la revisión administrativa son funciones pendientes.</p></article>
      </section>
      <p className="conocenos-note">Catálogo en pruebas: los centros mostrados pueden ser ejemplos, no sedes verificadas.</p>
    </main>
  </div>
}
