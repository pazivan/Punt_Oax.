import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, User } from 'lucide-react';
import ListadoClinicas from './ListadoClinicas.jsx';
import EspacioMapa from './EspacioMapa.jsx';
import DetalleCentro from './DetalleCentro.jsx';
import AgendarCitaDatos from './AgendarCitaDatos.jsx';
import MapaLeaflet from './MapaLeaflet.jsx';
import '../../styles/Inicio.css';

/**
 * MapaCentros - Ventana de Mapa / Directorio de centros según diseño oficial de Figma (1280x1294).
 *
 * Donde conviven:
 * - Buscador y filtros basados estrictamente en las columnas de la matriz oficial de Filtración:
 *   1. Búsqueda libre (Unidad de Salud, Municipio, Dirección, Nivel de Atención o Servicios).
 *   2. Pestaña / Servicio (Todos, ITS, Aborto, Ambos).
 *   3. Municipio (columna Municipio).
 *   4. Horario (Cualquier horario, 24 horas, Fines de semana, Lunes a Viernes).
 *   5. Nivel de Atención (columna Nivel de Atención: Primer Nivel, Segundo Nivel, Tercer Nivel - ISSSTE, IMSS Ordinario, ISSSTE, Comunitario / Social, Privado, Sin nivel especificado).
 * - Listado de tarjetas resumidas con Unidad de Salud, Municipio, Dirección, Servicios, Horario y Nivel de Atención.
 * - Espacio y contrato de propiedades para el mapa de Jonathan (EspacioMapa).
 * - Al pulsar "Ver detalles" en cualquier tarjeta, muestra la ventana DetalleCentro.
 */
export default function MapaCentros({
  sesion,
  onSalir,
  clinicas = [],
  cargando = false,
  ComponenteMapa = MapaLeaflet,
}) {
  const [terminoBusqueda, setTerminoBusqueda] = useState('');
  const [filtroServicio, setFiltroServicio] = useState('todos');
  const [filtroMunicipio, setFiltroMunicipio] = useState('todos');
  const [filtroHorario, setFiltroHorario] = useState('todos');
  const [filtroNivel, setFiltroNivel] = useState('todos');
  const [clinicaSeleccionadaId, setClinicaSeleccionadaId] = useState(
    () => clinicas[0]?.id_clinica ?? 'coesdia 1'
  );
  const [clinicaEnDetalle, setClinicaEnDetalle] = useState(null);
  const [clinicaEnAgendar, setClinicaEnAgendar] = useState(null);

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
        const tieneIts = categorias.some((cat) => cat.toLowerCase() === 'its') ||
          servicios.some((srv) => srv.toLowerCase().includes('its'));
        const tieneIle = categorias.some((cat) => ['aborto', 'ile'].includes(cat.toLowerCase())) ||
          servicios.some((srv) => /ile|interrupci[oó]n|aborto/i.test(srv));
        if (filtroServicio === 'Ambos') {
          const tieneAmbos =
            categorias.some((cat) => cat.toLowerCase() === 'ambos') ||
            (tieneIts && tieneIle);
          if (!tieneAmbos) return false;
        } else {
          const coincide = (filtroServicio === 'ITS' && tieneIts) ||
            (filtroServicio === 'Aborto' && tieneIle) ||
            categorias.some((cat) => cat.toLowerCase() === filtroServicio.toLowerCase()) ||
            servicios.some((srv) => srv.toLowerCase().includes(filtroServicio.toLowerCase()));
          if (!coincide) return false;
        }
      }

      if (filtroMunicipio !== 'todos' && c.municipio !== filtroMunicipio) {
        return false;
      }

      if (filtroHorario !== 'todos' && c.modalidad_horario !== filtroHorario) {
        return false;
      }

      if (filtroNivel !== 'todos') {
        if (filtroNivel === 'sin-especificar') {
          if (c.nivel_atencion) return false;
        } else if (
          (c.nivel_atencion || '').toLowerCase() !== filtroNivel.toLowerCase()
        ) {
          return false;
        }
      }

      if (!busqueda) return true;

      const enNombre = (c.nombre || '').toLowerCase().includes(busqueda);
      const enMunicipio = (c.municipio || '').toLowerCase().includes(busqueda);
      const enDireccion = (c.direccion || '').toLowerCase().includes(busqueda);
      const enNivel = (c.nivel_atencion || '').toLowerCase().includes(busqueda);
      const enServiciosTexto = (c.servicios_texto || '').toLowerCase().includes(busqueda);
      const enServicios =
        Array.isArray(c.servicios) &&
        c.servicios.some((s) => s.toLowerCase().includes(busqueda));

      return (
        enNombre ||
        enMunicipio ||
        enDireccion ||
        enNivel ||
        enServiciosTexto ||
        enServicios
      );
    });
  }, [clinicas, terminoBusqueda, filtroServicio, filtroMunicipio, filtroHorario, filtroNivel]);

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
    setFiltroHorario('todos');
    setFiltroNivel('todos');
  };

  // Si el usuario pulsó "Agendar cita" desde DetalleCentro, mostramos la ventana Agendar cita (Datos) - PuntoOax
  if (clinicaEnAgendar) {
    return (
      <AgendarCitaDatos
        clinica={clinicaEnAgendar}
        clinicas={clinicas}
        sesion={sesion}
        onSalir={onSalir}
        onVolverAlCentro={() => setClinicaEnAgendar(null)}
      />
    );
  }

  // Si el usuario pulsó "Ver detalles", mostramos la ventana Detalle de centro - PuntoOax
  if (clinicaEnDetalle) {
    return (
      <DetalleCentro
        clinica={clinicaEnDetalle}
        sesion={sesion}
        onSalir={onSalir}
        onVolverAlMapa={() => setClinicaEnDetalle(null)}
        onAgendarCita={(sede) => setClinicaEnAgendar(sede)}
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

            <nav className="inicio-nav mapa-nav agendar-header-nav" aria-label="Navegación principal">
              <Link to="/cuenta" className="inicio-nav-link">
                Inicio
              </Link>
              <Link to="/mapa" className="inicio-nav-link active mapa-nav-active">
                <span className="inicio-nav-link-active-text">Mapa de centros</span>
              </Link>
              <Link to="/agendar-cita" className="inicio-nav-link">
                Agendar cita
              </Link>
              <Link to="/informacion-util" className="inicio-nav-link">
                Información útil
              </Link>
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
                <User size={14} color="#FFFFFF" />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main (padding-top: 80px) */}
      <main className="mapa-main">
        <div className="mapa-background-wrap">
          <div className="mapa-container">
            <p role="note">Catálogo en pruebas: las clínicas mostradas pueden ser ejemplos; confirma sus datos antes de acudir.</p>
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
                  Filtra por servicio, municipio, horario o institución y revisa los horarios y requisitos de cada unidad en Oaxaca.
                </p>
              </div>
            </section>

            {/* Barra de búsqueda y filtros */}
            <section className="mapa-search-bar" role="search" aria-label="Buscador de centros">
              {/* Input con ícono */}
              <div className="mapa-search-input-container">
                <span className="mapa-search-icon" aria-hidden="true">
                  <Search size={15} color="#717975" />
                </span>
                <input
                  type="search"
                  value={terminoBusqueda}
                  onChange={(e) => setTerminoBusqueda(e.target.value)}
                  placeholder="Buscar por centro, municipio, colonia o servicio (ej. VIH, AMEU)"
                  aria-label="Buscar centro o municipio"
                  className="mapa-search-input"
                />
              </div>

              {/* Selector 1: Categoría de Servicio (Pestañas Filtración: ITS, Aborto, Ambos) */}
              <div className="mapa-select-wrap">
                <select
                  value={filtroServicio}
                  onChange={(e) => setFiltroServicio(e.target.value)}
                  aria-label="Filtrar por tipo de servicio"
                  className="mapa-select-control"
                >
                  <option value="todos">Todos los servicios</option>
                  <option value="ITS">Detección de ITS (VIH, Sífilis, VHC)</option>
                  <option value="Aborto">Aborto Seguro (ILE)</option>
                  <option value="Ambos">Ambos (ITS + ILE)</option>
                </select>
              </div>

              {/* Selector 2: Municipio */}
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

              {/* Selector 3: Disponibilidad de Horario */}
              <div className="mapa-select-wrap">
                <select
                  value={filtroHorario}
                  onChange={(e) => setFiltroHorario(e.target.value)}
                  aria-label="Filtrar por disponibilidad de horario"
                  className="mapa-select-control"
                >
                  <option value="todos">Cualquier horario</option>
                  <option value="24-horas">Abierto 24 horas</option>
                  <option value="fines-semana">Abre fines de semana (Sáb / Dom)</option>
                  <option value="lunes-viernes">Lunes a Viernes</option>
                </select>
              </div>

              {/* Selector 4 + Limpiar: Nivel de Atención (columna Nivel de Atención del CSV) */}
              <div className="mapa-filter-right-group">
                <select
                  value={filtroNivel}
                  onChange={(e) => setFiltroNivel(e.target.value)}
                  aria-label="Filtrar por nivel de atención"
                  className="mapa-select-control mapa-select-cost"
                >
                  <option value="todos">Cualquier nivel de atención</option>
                  <option value="Primer Nivel">Primer Nivel</option>
                  <option value="Segundo Nivel">Segundo Nivel</option>
                  <option value="Tercer Nivel - ISSSTE">Tercer Nivel - ISSSTE</option>
                  <option value="IMSS Ordinario">IMSS Ordinario</option>
                  <option value="ISSSTE">ISSSTE</option>
                  <option value="Comunitario / Social">Comunitario / Social</option>
                  <option value="Privado">Privado</option>
                  <option value="sin-especificar">Sin nivel especificado (Puntos fijos)</option>
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
                vacioTexto={clinicas.length === 0
                  ? 'No hay clínicas aprobadas para mostrar.'
                  : 'Ningún centro coincide con los filtros seleccionados.'}
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
