import { Link } from 'react-router-dom'
import { ArrowRight, HeartHandshake, MapPin, ShieldCheck } from 'lucide-react'
import '../css/Conocenos.css'

export default function Conocenos({ sesion, perfil, onSalir }) {
  const rutaCuenta = perfil?.rol === 'clinica' ? '/mi-clinica' : perfil?.rol === 'administrador' ? '/admin' : '/cuenta'

  return <div className="conocenos-page">
    <header className="conocenos-header">
      <Link to="/" className="conocenos-logo">
        <img src="/logo-puntoax.svg" alt="" className="conocenos-logo-img" aria-hidden="true" />
        <div>PuntOax<span>.</span></div>
      </Link>
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
          <p>PuntOax reúne información sobre centros y servicios de atención de ITS e interrupción legal del embarazo (ILE) en Oaxaca. Inicia sesión para consultar el mapa y las fichas de los centros.</p>
          <Link to="/mapa" className="conocenos-cta">Explorar el mapa <ArrowRight size={18} aria-hidden="true" /></Link>
        </div>
        <div className="conocenos-preview" aria-hidden="true">
          <img
            src="/img/oaxaca-panel-ilustracion.svg"
            alt=""
            style={{ width: '100%', height: '180px', objectFit: 'cover', borderRadius: '10px' }}
          />
          <span>PuntOax · Oaxaca</span>
        </div>
      </section>
      <section className="conocenos-details" aria-label="Sobre el proyecto">
        <article><MapPin size={24} aria-hidden="true" /><h2>Encuentra centros</h2><p>Inicia sesión para consultar el mapa y las fichas de los centros disponibles en Oaxaca.</p></article>
        <article><HeartHandshake size={24} aria-hidden="true" /><h2>Conoce sus servicios</h2><p>Revisa la información registrada sobre servicios y horarios; confirma siempre los datos con el centro antes de acudir.</p></article>
        <article><ShieldCheck size={24} aria-hidden="true" /><h2>Publicación revisada</h2><p>Las clínicas nuevas pasan por una revisión administrativa antes de aparecer en el directorio público.</p></article>
      </section>
    </main>
  </div>
}
