import { Link } from 'react-router-dom'
import { ArrowRight, HeartHandshake, MapPin, ShieldCheck } from 'lucide-react'
import EncabezadoUsuario from './Inicio/EncabezadoUsuario.jsx'
import EncabezadoClinica from './Clinica/EncabezadoClinica.jsx'
import './Conocenos.css'

export default function Conocenos({ sesion, onSalir, sinEncabezado = false }) {
  const usaEncabezadoFijo = Boolean(sesion)

  return <div className={`conocenos-page${usaEncabezadoFijo ? ' conocenos-con-encabezado-fijo' : ''}`}>
    {!sinEncabezado && (
      sesion?.tipo === 'clinica' ? (
        <EncabezadoClinica sesion={sesion} onSalir={onSalir} />
      ) : sesion ? (
        <EncabezadoUsuario sesion={sesion} onSalir={onSalir} seccionActiva="conocenos" />
      ) : (
        <header className="conocenos-header">
          <Link to="/" className="conocenos-logo">
            <img src="/logo-puntoax.svg" alt="" className="conocenos-logo-img" aria-hidden="true" />
            <div>PuntOax<span>.</span></div>
          </Link>
          <nav aria-label="Navegación pública">
            <Link to="/login">Iniciar sesión</Link>
            <Link to="/registro" className="conocenos-register">Crear cuenta</Link>
          </nav>
        </header>
      )
    )}
    <main className="conocenos-main">
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
            className="conocenos-preview-img"
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
