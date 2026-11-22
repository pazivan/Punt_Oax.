import { useEffect, useMemo, useState } from 'react';
import { Columns2, List, Map as MapIcon, Search } from 'lucide-react';
import ListadoClinicas from './ListadoClinicas.jsx';
import EspacioMapa from './EspacioMapa.jsx';
import DetalleCentro from './DetalleCentro.jsx';
import AgendarCitaDatos from './AgendarCitaDatos.jsx';
import MapaLeaflet from './MapaLeaflet.jsx';
import EncabezadoUsuario from './EncabezadoUsuario.jsx';
import PiePagina from './PiePagina.jsx';
import FiltroDesplegable from './FiltroDesplegable.jsx';
import EncabezadoClinica from '../Clinica/EncabezadoClinica.jsx';
import { claveMunicipioNormalizada } from '../../utils/centros.js';
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
  sinEncabezado = false,
}) {
  const [terminoBusqueda, setTerminoBusqueda] = useState('');
  const [filtroServicio, setFiltroServicio] = useState('todos');
  const [filtroMunicipio, setFiltroMunicipio] = useState('todos');
  const [filtroHorario, setFiltroHorario] = useState('todos');
  const [filtroNivel, setFiltroNivel] = useState('todos');
  const [modoVista, setModoVista] = useState('combinada');
  const [clinicaSeleccionadaId, setClinicaSeleccionadaId] = useState(
    () => clinicas[0]?.id_clinica ?? null
  );
  const [clinicaEnDetalle, setClinicaEnDetalle] = useState(null);
  const [clinicaEnAgendar, setClinicaEnAgendar] = useState(null);

  // Al abrir o cerrar las vistas de detalle/agenda se empieza desde el inicio.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [clinicaEnDetalle, clinicaEnAgendar]);

  const municipiosDisponibles = useMemo(() => {
    const mapa = new Map();
    for (const c of clinicas) {
      if (typeof c.municipio !== 'string' || !c.municipio.trim()) continue;
      const etiqueta = c.municipio.trim().replace(/\s+/g, ' ');
      const clave = claveMunicipioNormalizada(etiqueta);
      const existente = mapa.get(clave);
      // Preferir la variante que incluye tildes o mayúsculas más completas al mostrar en el filtro.
      if (!existente || (/[áéíóúüñÁÉÍÓÚÜÑ]/.test(etiqueta) && !/[áéíóúüñÁÉÍÓÚÜÑ]/.test(existente.label))) {
        mapa.set(clave, { value: clave, label: etiqueta });
      }
    }
    return Array.from(mapa.values()).sort((a, b) => a.label.localeCompare(b.label, 'es'));
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

      if (filtroMunicipio !== 'todos' && claveMunicipioNormalizada(c.municipio) !== filtroMunicipio) {
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

  const puedeAgendar = !sesion || sesion.tipo === 'usuario';

  // Si el usuario pulsó "Agendar cita" desde DetalleCentro, mostramos la ventana Agendar cita (Datos) - PuntoOax
  if (clinicaEnAgendar && puedeAgendar) {
    return (
      <AgendarCitaDatos
        clinica={clinicaEnAgendar}
        clinicas={clinicas}
        sesion={sesion}
        onSalir={onSalir}
        onVolverAlCentro={() => setClinicaEnAgendar(null)}
        sinEncabezado={sinEncabezado}
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
        onAgendarCita={puedeAgendar ? (sede) => setClinicaEnAgendar(sede) : undefined}
        sinEncabezado={sinEncabezado}
      />
    );
  }

  return (
    <div className="mapa-page">
      {/* Header (80px) */}
      {!sinEncabezado && (
        sesion?.tipo === 'clinica' ? (
          <EncabezadoClinica sesion={sesion} onSalir={onSalir} />
        ) : (
          <EncabezadoUsuario sesion={sesion} onSalir={onSalir} seccionActiva="mapa" />
        )
      )}

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

              <div className="mapa-select-wrap">
                <FiltroDesplegable
                  value={filtroServicio}
                  onChange={setFiltroServicio}
                  ariaLabel="Filtrar por tipo de servicio"
                  options={[
                    { value: 'todos', label: 'Todos los servicios' },
                    { value: 'ITS', label: 'Detección de ITS (VIH, Sífilis, VHC)' },
                    { value: 'Aborto', label: 'Aborto Seguro (ILE)' },
                    { value: 'Ambos', label: 'Ambos (ITS + ILE)' },
                  ]}
                />
              </div>

              <div className="mapa-select-wrap">
                <FiltroDesplegable
                  value={filtroMunicipio}
                  onChange={setFiltroMunicipio}
                  ariaLabel="Filtrar por municipio"
                  options={[
                    { value: 'todos', label: 'Todos los municipios' },
                    ...municipiosDisponibles,
                  ]}
                />
              </div>

              <div className="mapa-select-wrap">
                <FiltroDesplegable
                  value={filtroHorario}
                  onChange={setFiltroHorario}
                  ariaLabel="Filtrar por disponibilidad de horario"
                  options={[
                    { value: 'todos', label: 'Cualquier horario' },
                    { value: '24-horas', label: 'Abierto 24 horas' },
                    { value: 'fines-semana', label: 'Abre fines de semana (Sáb / Dom)' },
                    { value: 'lunes-viernes', label: 'Lunes a Viernes' },
                  ]}
                />
              </div>

              <div className="mapa-filter-right-group">
                <FiltroDesplegable
                  value={filtroNivel}
                  onChange={setFiltroNivel}
                  ariaLabel="Filtrar por nivel de atención"
                  className="mapa-select-cost"
                  options={[
                    { value: 'todos', label: 'Cualquier nivel de atención' },
                    { value: 'Primer Nivel', label: 'Primer Nivel' },
                    { value: 'Segundo Nivel', label: 'Segundo Nivel' },
                    { value: 'Tercer Nivel - ISSSTE', label: 'Tercer Nivel - ISSSTE' },
                    { value: 'IMSS Ordinario', label: 'IMSS Ordinario' },
                    { value: 'ISSSTE', label: 'ISSSTE' },
                    { value: 'Comunitario / Social', label: 'Comunitario / Social' },
                    { value: 'Privado', label: 'Privado' },
                    { value: 'sin-especificar', label: 'Sin nivel especificado (Puntos fijos)' },
                  ]}
                />

                <button
                  type="button"
                  onClick={limpiarFiltros}
                  className="mapa-clear-btn"
                >
                  Limpiar
                </button>
              </div>
            </section>

            {/* Selector de modo de visualización */}
            <div className="mapa-view-toolbar">
              <div className="mapa-view-mode-group" role="group" aria-label="Modo de visualización">
                <button
                  type="button"
                  className={`mapa-view-mode-btn ${modoVista === 'centros' ? 'is-active' : ''}`}
                  aria-pressed={modoVista === 'centros'}
                  onClick={() => setModoVista('centros')}
                >
                  <List size={15} aria-hidden="true" />
                  <span>Solo centros</span>
                </button>
                <button
                  type="button"
                  className={`mapa-view-mode-btn ${modoVista === 'combinada' ? 'is-active' : ''}`}
                  aria-pressed={modoVista === 'combinada'}
                  onClick={() => setModoVista('combinada')}
                >
                  <Columns2 size={15} aria-hidden="true" />
                  <span>Vista combinada</span>
                </button>
                <button
                  type="button"
                  className={`mapa-view-mode-btn ${modoVista === 'mapa' ? 'is-active' : ''}`}
                  aria-pressed={modoVista === 'mapa'}
                  onClick={() => setModoVista('mapa')}
                >
                  <MapIcon size={15} aria-hidden="true" />
                  <span>Solo mapa</span>
                </button>
              </div>
            </div>

            {/* Zona de convivencia: Listado y/o Mapa */}
            <section className={`mapa-workspace-grid mode-${modoVista}`} aria-label="Listado de centros y mapa">
              {modoVista !== 'mapa' && (
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
              )}

              {modoVista !== 'centros' && (
                <EspacioMapa
                  clinicas={clinicasFiltradas}
                  clinicaSeleccionada={clinicaActiva}
                  onSeleccionarClinica={(clinica) => setClinicaSeleccionadaId(clinica.id_clinica)}
                  onVerDetallesClinica={(clinica) => {
                    setClinicaSeleccionadaId(clinica.id_clinica);
                    setClinicaEnDetalle(clinica);
                  }}
                  filtroServicio={filtroServicio}
                  filtroMunicipio={filtroMunicipio}
                  terminoBusqueda={terminoBusqueda}
                  modoVista={modoVista}
                  ComponenteMapa={ComponenteMapa}
                />
              )}
            </section>
          </div>
        </div>
      </main>

      <PiePagina />
    </div>
  );
}
