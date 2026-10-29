import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ListadoClinicas from './ListadoClinicas.jsx';
import EspacioMapa from './EspacioMapa.jsx';
import DetalleCentro from './DetalleCentro.jsx';
import '../../styles/Inicio.css';

/**
 * MapaCentros - Ventana de Mapa / Directorio de centros según diseño oficial de Figma (1280x1294).
 *
 * Donde conviven:
 * - Buscador y filtros (Buscar centro o municipio, Detección de ITS, Todos los municipios, Cualquier costo, Limpiar).
 * - Listado de tarjetas resumidas con nombre, municipio y servicios (ListadoClinicas / TarjetaClinica).
 * - Espacio y contrato de propiedades para el mapa de Jonathan (EspacioMapa).
 * - Al pulsar "Ver detalles" en cualquier tarjeta, muestra la ventana DetalleCentro.
 */
export default function MapaCentros({
  sesion,
  onSalir,
  clinicas = [],
  cargando = false,
  ComponenteMapa = null,
}) {
  const [terminoBusqueda, setTerminoBusqueda] = useState('');
  const [filtroServicio, setFiltroServicio] = useState('todos');
  const [filtroMunicipio, setFiltroMunicipio] = useState('todos');
  const [filtroCosto, setFiltroCosto] = useState('todos');
  const [clinicaSeleccionadaId, setClinicaSeleccionadaId] = useState(
    () => clinicas[0]?.id_clinica ?? 'demo-sanidad-oaxaca'
  );
  const [clinicaEnDetalle, setClinicaEnDetalle] = useState(null);

  const nombreOCorreo = sesion?.cuenta?.nombre || sesion?.cuenta?.correo || 'Mi cuenta';

  const municipiosDisponibles = useMemo(() => {
    const conjunto = new Set();
    for (const c of clinicas) {
      if (typeof c.municipio === 'string' && c.municipio.trim()) {
        conjunto.add(c.municipio.trim());
      }
    }
    return Array.from(conjunto);
  }, [clinicas]);

  const clinicasFiltradas = useMemo(() => {
    const busqueda = terminoBusqueda.trim().toLowerCase();

    return clinicas.filter((c) => {
      if (filtroServicio !== 'todos') {
        const categorias = Array.isArray(c.categorias) ? c.categorias : [];
        const servicios = Array.isArray(c.servicios) ? c.servicios : [];
        const coincide =
          categorias.some((cat) => cat.toLowerCase() === filtroServicio.toLowerCase()) ||
          servicios.some((srv) => srv.toLowerCase().includes(filtroServicio.toLowerCase()));
        if (!coincide) return false;
      }

      if (filtroMunicipio !== 'todos' && c.municipio !== filtroMunicipio) {
        return false;
      }

      if (filtroCosto !== 'todos' && (c.costo || 'Gratuito') !== filtroCosto) {
        return false;
      }

      if (!busqueda) return true;

      const enNombre = (c.nombre || '').toLowerCase().includes(busqueda);
      const enMunicipio = (c.municipio || '').toLowerCase().includes(busqueda);
      const enEtiqueta = (c.etiqueta_ubicacion || '').toLowerCase().includes(busqueda);
      const enServicios =
        Array.isArray(c.servicios) &&
        c.servicios.some((s) => s.toLowerCase().includes(busqueda));

      return enNombre || enMunicipio || enEtiqueta || enServicios;
    });
  }, [clinicas, terminoBusqueda, filtroServicio, filtroMunicipio, filtroCosto]);

  const clinicaActiva = useMemo(
    () =>
      clinicasFiltradas.find((c) => c.id_clinica === clinicaSeleccionadaId) ||
      clinicasFiltradas[0] ||
      null,
    [clinicasFiltradas, clinicaSeleccionadaId]
  );

  const limpiarFiltros = () => {
    setTerminoBusqueda('');
    setFiltroServicio('todos');
    setFiltroMunicipio('todos');
    setFiltroCosto('todos');
  };

  // Si el usuario pulsó "Ver detalles", mostramos la ventana Detalle de centro - PuntoOax
  if (clinicaEnDetalle) {
    return (
      <DetalleCentro
        clinica={clinicaEnDetalle}
        sesion={sesion}
        onSalir={onSalir}
        onVolverAlMapa={() => setClinicaEnDetalle(null)}
      />
    );
  }

  return (
    <div className="mapa-page">
      {/* Header (80px) */}
      <header className="inicio-header">
        <div className="inicio-header-container">
          <div className="inicio-header-left">
            <div className="inicio-brand-wrap">
              <Link to="/cuenta" className="inicio-brand" style={{ textDecoration: 'none' }}>
                PuntOax
              </Link>
            </div>

            <nav className="inicio-nav mapa-nav" aria-label="Navegación principal">
              <Link to="/cuenta" className="inicio-nav-link">
                Inicio
              </Link>
              <Link to="/mapa" className="inicio-nav-link active mapa-nav-active">
                <span className="inicio-nav-link-active-text">Mapa de centros</span>
              </Link>
              <a href="#agenda" className="inicio-nav-link">
                Agenda
              </a>
              <a href="#conocenos" className="inicio-nav-link">
                Conócenos
              </a>
            </nav>
          </div>

          <div className="inicio-header-right">
            <Link
              to="/cuenta"
              className="inicio-header-account-link"
              title={nombreOCorreo}
            >
              Mi cuenta
            </Link>

            <button
              type="button"
              onClick={onSalir}
              className="inicio-header-logout-btn"
            >
              Salir
            </button>

            <div className="inicio-avatar-margin">
              <div className="inicio-avatar-circle" aria-hidden="true">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M6 6C7.65685 6 9 4.65685 9 3C9 1.34315 7.65685 0 6 0C4.34315 0 3 1.34315 3 3C3 4.65685 4.34315 6 6 6ZM6 7.5C3.9975 7.5 0 8.505 0 10.5V12H12V10.5C12 8.505 8.0025 7.5 6 7.5Z"
                    fill="#FFFFFF"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main (padding-top: 80px) */}
      <main className="mapa-main">
        <div className="mapa-background-wrap">
          <div className="mapa-container">
            {/* Encabezado (width: 1184px, height: 116px) */}
            <section className="mapa-heading-block" aria-labelledby="mapa-heading-title">
              <span className="mapa-eyebrow-text">DIRECTORIO DE ATENCIÓN</span>
              <div className="mapa-heading-wrap">
                <h1 id="mapa-heading-title" className="mapa-heading-title">
                  Encuentra un centro de atención.
                </h1>
              </div>
              <div className="mapa-subtitle-wrap">
                <p className="mapa-subtitle-text">
                  Busca por municipio y descubre las opciones disponibles en Oaxaca.
                </p>
              </div>
            </section>

            {/* Barra de búsqueda y filtros (Background+Shadow: 1184px x 68px) */}
            <section className="mapa-search-bar" role="search" aria-label="Buscador de centros">
              {/* Input con ícono (width: 451.2px, height: 36px) */}
              <div className="mapa-search-input-container">
                <span className="mapa-search-icon" aria-hidden="true">
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                    <path
                      d="M10.7 9.4H10.02L9.78 9.17C10.62 8.19 11.13 6.92 11.13 5.56C11.13 2.49 8.64 0 5.56 0C2.49 0 0 2.49 0 5.56C0 8.64 2.49 11.13 5.56 11.13C6.92 11.13 8.19 10.62 9.17 9.78L9.4 10.02V10.7L13.68 14.97L14.97 13.68L10.7 9.4ZM5.56 9.4C3.44 9.4 1.71 7.68 1.71 5.56C1.71 3.44 3.44 1.71 5.56 1.71C7.68 1.71 9.4 3.44 9.4 5.56C9.4 7.68 7.68 9.4 5.56 9.4Z"
                      fill="#717975"
                    />
                  </svg>
                </span>
                <input
                  type="search"
                  value={terminoBusqueda}
                  onChange={(e) => setTerminoBusqueda(e.target.value)}
                  placeholder="Buscar centro o municipio"
                  aria-label="Buscar centro o municipio"
                  className="mapa-search-input"
                />
              </div>

              {/* Selector 1: Detección de ITS */}
              <div className="mapa-select-wrap">
                <select
                  value={filtroServicio}
                  onChange={(e) => setFiltroServicio(e.target.value)}
                  aria-label="Filtrar por tipo de servicio"
                  className="mapa-select-control"
                >
                  <option value="todos">Detección de ITS</option>
                  <option value="ITS">Solo Detección de ITS</option>
                  <option value="Aborto">ILE / Aborto</option>
                </select>
              </div>

              {/* Selector 2: Todos los municipios */}
              <div className="mapa-select-wrap">
                <select
                  value={filtroMunicipio}
                  onChange={(e) => setFiltroMunicipio(e.target.value)}
                  aria-label="Filtrar por municipio"
                  className="mapa-select-control"
                >
                  <option value="todos">Todos los municipios</option>
                  {municipiosDisponibles.map((mun) => (
                    <option key={mun} value={mun}>
                      {mun}
                    </option>
                  ))}
                </select>
              </div>

              {/* Grupo derecho: Cualquier costo + Botón Limpiar */}
              <div className="mapa-filter-right-group">
                <select
                  value={filtroCosto}
                  onChange={(e) => setFiltroCosto(e.target.value)}
                  aria-label="Filtrar por costo"
                  className="mapa-select-control mapa-select-cost"
                >
                  <option value="todos">Cualquier costo</option>
                  <option value="Gratuito">Gratuito</option>
                  <option value="Cuota accesible">Cuota accesible</option>
                </select>

                <button
                  type="button"
                  onClick={limpiarFiltros}
                  className="mapa-clear-btn"
                >
                  Limpiar
                </button>
              </div>
            </section>

            {/* Zona de convivencia (1184px x 774px): Listado a la izquierda + Mapa a la derecha */}
            <section className="mapa-workspace-grid" aria-label="Listado de centros y mapa">
              <ListadoClinicas
                clinicas={clinicasFiltradas}
                clinicaSeleccionadaId={clinicaActiva?.id_clinica ?? null}
                onSeleccionarClinica={(clinica) => setClinicaSeleccionadaId(clinica.id_clinica)}
                onVerDetallesClinica={(clinica) => {
                  setClinicaSeleccionadaId(clinica.id_clinica);
                  setClinicaEnDetalle(clinica);
                }}
                cargando={cargando}
              />

              <EspacioMapa
                clinicas={clinicasFiltradas}
                clinicaSeleccionada={clinicaActiva}
                onSeleccionarClinica={(clinica) => setClinicaSeleccionadaId(clinica.id_clinica)}
                filtroServicio={filtroServicio}
                filtroMunicipio={filtroMunicipio}
                terminoBusqueda={terminoBusqueda}
                ComponenteMapa={ComponenteMapa}
              />
            </section>
          </div>
        </div>
      </main>

      {/* Footer (112px) */}
      <footer className="inicio-footer">
        <div className="inicio-footer-container">
          <p className="inicio-footer-text">
            © 2026 PuntOax · Salud, bienestar y orientación en Oaxaca.
          </p>
        </div>
      </footer>
    </div>
  );
}
