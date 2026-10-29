import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './DetalleCentro.css';

export default function DetalleCentro() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [centro, setCentro] = useState(null);
  const [estado, setEstado] = useState('cargando'); // 'cargando', 'error', 'no-encontrado', 'exito'

  useEffect(() => {
    // Simulación de la petición a la API (reemplazar con el fetch real de Miguel)
    const fetchCentro = async () => {
      try {
        setEstado('cargando');
        // const response = await fetch(`/api/clinicas/${id}`);
        // if (response.status === 404) throw new Error('no-encontrado');
        // if (!response.ok) throw new Error('error');
        // const data = await response.json();
        
        // Datos simulados estructurados según Filtracion.xlsx para la prueba visual
        setTimeout(() => {
          setCentro({
            id: id,
            nombre: 'Punto Fijo de Detección – Dirección de Sanidad',
            nivelAtencion: 'COESIDA-CAPASITS',
            municipio: 'Oaxaca de Juárez',
            entidad: 'Oaxaca y zona metropolitana',
            descripcion: 'Pruebas de VIH, sífilis y hepatitis C. Orientación y consejería asociada al servicio.',
            servicios: ['Detección de ITS', 'Orientación'],
            horario: 'Lun. a vie., 09:00–10:30 y 11:30–13:00 h',
            costo: 'Gratuito',
            requisitos: 'Presentar CURP',
            telefono: '951 516 8365',
            correo: null,
            direccion: 'Mártires de Tacubaya 315, Col. Centro, Oaxaca de Juárez',
            ubicacionMaps: 'https://maps.app.goo.gl/ejemplo'
          });
          setEstado('exito');
        }, 800);
      } catch (err) {
        setEstado(err.message === 'no-encontrado' ? 'no-encontrado' : 'error');
      }
    };
    fetchCentro();
  }, [id]);

  const handleVolver = () => {
    // navigate(-1) conserva los filtros previos en el directorio
    navigate(-1);
  };

  if (estado === 'cargando') {
    return <div className="estado-contenedor"><div className="spinner"></div><p>Cargando información del centro...</p></div>;
  }

  if (estado === 'error') {
    return <div className="estado-contenedor error">⚠️ Ocurrió un error al cargar la información. Intenta nuevamente.</div>;
  }

  if (estado === 'no-encontrado') {
    return <div className="estado-contenedor empty">🏥 Centro no encontrado. Es posible que el enlace sea incorrecto o haya sido eliminado.</div>;
  }

  return (
    <div className="detalle-page-wrapper">
      <button onClick={handleVolver} className="btn-volver">
        ← VOLVER AL MAPA
      </button>
      
      <header className="detalle-header">
        <h1>{centro.nombre}</h1>
        <p className="detalle-subtitulo">{centro.municipio} · {centro.entidad}</p>
      </header>

      <main className="detalle-main-grid">
        {/* Columna Izquierda: Información */}
        <section className="detalle-info-section">
          {centro.nivelAtencion && (
            <span className="badge badge-institucion">{centro.nivelAtencion}</span>
          )}

          <h2>Información general</h2>
          <p>{centro.descripcion || 'Sin descripción adicional.'}</p>

          <h3 className="section-subtitle">Servicios</h3>
          <div className="servicios-tags">
            {centro.servicios?.length > 0 
              ? centro.servicios.map((srv, idx) => <span key={idx} className="badge badge-servicio">{srv}</span>)
              : <span className="text-pendiente">Servicios por confirmar</span>}
          </div>

          <h3 className="section-subtitle">Datos del centro</h3>
          <div className="datos-grid">
            <div className="dato-card">
              <span className="dato-icon">🕒</span>
              <div>
                <strong>Horario</strong>
                <p>{centro.horario || 'Por confirmar'}</p>
              </div>
            </div>
            <div className="dato-card">
              <span className="dato-icon">💵</span>
              <div>
                <strong>Costo</strong>
                <p>{centro.costo || 'Por confirmar'}</p>
              </div>
            </div>
            <div className="dato-card">
              <span className="dato-icon">📄</span>
              <div>
                <strong>Requisitos</strong>
                <p>{centro.requisitos || 'Por confirmar'}</p>
              </div>
            </div>
            <div className="dato-card">
              <span className="dato-icon">📞</span>
              <div>
                <strong>Teléfono</strong>
                <p>{centro.telefono ? <a href={`tel:${centro.telefono.replace(/\s+/g, '')}`}>{centro.telefono}</a> : 'No disponible'}</p>
              </div>
            </div>
            <div className="dato-card address-card">
              <span className="dato-icon">📍</span>
              <div>
                <strong>Dirección</strong>
                <p>{centro.direccion || 'Dirección por confirmar'}</p>
              </div>
            </div>
          </div>

          <div className="antes-visita-box">
            <h3>Antes de tu visita</h3>
            <p>Para las pruebas rápidas presenta tu CURP. Puedes acudir sin cita previa durante el horario de atención indicado.</p>
            <span className="badge badge-servicio">Atención presencial</span>
          </div>
        </section>

        {/* Columna Derecha: Mapa y CTA */}
        <aside className="detalle-sidebar">
          <div className="sidebar-card map-card">
            <h3>Ubicación</h3>
            <p className="direccion-corta">{centro.direccion?.split(',')[0]}</p>
            <div className="map-placeholder">
              {/* Aquí se integrará el componente Leaflet en los siguientes Sprints */}
              <div className="map-fallback-bg"></div>
              {centro.ubicacionMaps && (
                <a href={centro.ubicacionMaps} target="_blank" rel="noreferrer" className="btn-gmaps">
                  Abrir en Google Maps ↗
                </a>
              )}
            </div>
          </div>

          <div className="sidebar-card cta-card">
            <h3>Organiza tu visita</h3>
            <p>Elige la fecha y el horario que mejor se adapten a ti.</p>
            <button className="btn-agendar" disabled>
              Agendar cita →
            </button>
            <small className="cita-nota">* Función disponible en próximos Sprints</small>
          </div>
        </aside>
      </main>
    </div>
  );
}