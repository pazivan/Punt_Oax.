import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Columns2,
  Heart,
  List,
  LocateFixed,
  Map as MapIcon,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
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
import {
  claveFavoritosCuenta,
  consultarClinicasCercanas,
  guardarFavoritosLocal,
  leerFavoritosLocal,
  obtenerMensajeErrorGeolocalizacion,
} from '../../utils/cercania.js';
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
  const navigate = useNavigate();
  const [terminoBusqueda, setTerminoBusqueda] = useState('');
  const [filtroServicio, setFiltroServicio] = useState('todos');
  const [filtroMunicipio, setFiltroMunicipio] = useState('todos');
  const [filtroHorario, setFiltroHorario] = useState('todos');
  const [filtroNivel, setFiltroNivel] = useState('todos');
  const [soloFavoritos, setSoloFavoritos] = useState(false);
  const [modoVista, setModoVista] = useState('combinada');

  // Estado de geolocalización del usuario y búsqueda de centros cercanos
  const [estadoUbicacion, setEstadoUbicacion] = useState('inactivo'); // inactivo | pidiendo | concedida | error
  const [ubicacionUsuario, setUbicacionUsuario] = useState(null);
  const [ubicacionVersion, setUbicacionVersion] = useState(0);
  const [mensajeUbicacion, setMensajeUbicacion] = useState('');
  const [radioKm, setRadioKm] = useState(10);
  const [modoCercanas, setModoCercanas] = useState(false);
  const [estadoCercanas, setEstadoCercanas] = useState('inactivo'); // inactivo | cargando | listo | vacio | error
  const [errorCercanas, setErrorCercanas] = useState('');
  const [clinicasCercanas, setClinicasCercanas] = useState([]);
  const abortCercanasRef = useRef(null);

  useEffect(() => () => {
    abortCercanasRef.current?.abort();
  }, []);

  const buscarCentrosCercanos = async (lat, lng, radio = radioKm) => {
    abortCercanasRef.current?.abort();
    const controlador = new AbortController();
    abortCercanasRef.current = controlador;

    setModoCercanas(true);
    setEstadoCercanas('cargando');
    setErrorCercanas('');

    try {
      const { centros } = await consultarClinicasCercanas({
        lat,
        lng,
        radioKm: radio,
        signal: controlador.signal,
        token: sesion?.token,
        clinicasRespaldo: clinicas,
      });

      if (controlador.signal.aborted) return;
      setClinicasCercanas(centros);
      setEstadoCercanas(centros.length === 0 ? 'vacio' : 'listo');
    } catch (err) {
      if (controlador.signal.aborted) return;
      setClinicasCercanas([]);
      setEstadoCercanas('error');
      setErrorCercanas(
        err?.message || 'No se pudo conectar con el servicio de centros cercanos.'
      );
    }
  };

  const solicitarUbicacion = () => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setEstadoUbicacion('error');
      setMensajeUbicacion(obtenerMensajeErrorGeolocalizacion({}));
      return;
    }

    setEstadoUbicacion('pidiendo');
    setMensajeUbicacion('');

    navigator.geolocation.getCurrentPosition(
      (posicion) => {
        const lat = posicion.coords.latitude;
        const lng = posicion.coords.longitude;
        setUbicacionUsuario({
          lat,
          lng,
          precision: posicion.coords.accuracy,
        });
        setUbicacionVersion((v) => v + 1);
        setEstadoUbicacion('concedida');
        setMensajeUbicacion(
          `Ubicación actual: ${lat.toFixed(5)}, ${lng.toFixed(5)}`
        );
        buscarCentrosCercanos(lat, lng, radioKm);
      },
      (err) => {
        setEstadoUbicacion('error');
        setMensajeUbicacion(obtenerMensajeErrorGeolocalizacion(err));
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 60000,
      }
    );
  };

  const desactivarModoCercanas = () => {
    abortCercanasRef.current?.abort();
    setModoCercanas(false);
    setEstadoCercanas('inactivo');
    setErrorCercanas('');
    setClinicasCercanas([]);
  };

  const clinicasCatalogo = modoCercanas ? clinicasCercanas : clinicas;

  // Favoritos locales aislados por identificador de cuenta y rol (nunca por correo)
  const claveFavoritos = claveFavoritosCuenta(sesion);
  const [favoritosPorClave, setFavoritosPorClave] = useState(() => ({
    clave: claveFavoritos,
    ids: leerFavoritosLocal(claveFavoritos),
  }));

  const favoritosIds = useMemo(
    () => (favoritosPorClave.clave === claveFavoritos
      ? favoritosPorClave.ids
      : leerFavoritosLocal(claveFavoritos)),
    [favoritosPorClave, claveFavoritos]
  );

  const alternarFavorito = (clinica) => {
    const id = clinica?.id_clinica;
    if (!id) return;
    setFavoritosPorClave((actual) => {
      const baseIds = actual.clave === claveFavoritos
        ? actual.ids
        : leerFavoritosLocal(claveFavoritos);
      const existe = baseIds.includes(id);
      const siguiente = existe ? baseIds.filter((item) => item !== id) : [...baseIds, id];
      guardarFavoritosLocal(claveFavoritos, siguiente);
      return { clave: claveFavoritos, ids: siguiente };
    });
  };

  const [clinicaSeleccionadaId, setClinicaSeleccionadaId] = useState(
    () => clinicasCatalogo[0]?.id_clinica ?? null
  );
  const [centrarTrigger, setCentrarTrigger] = useState(0);
  const [clinicaEnDetalle, setClinicaEnDetalle] = useState(null);
  const [clinicaEnAgendar, setClinicaEnAgendar] = useState(null);

  // Al abrir o cerrar las vistas de detalle/agenda se empieza desde el inicio.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [clinicaEnDetalle, clinicaEnAgendar]);

  const municipiosDisponibles = useMemo(() => {
    const mapa = new Map();
    for (const c of clinicasCatalogo) {
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
  }, [clinicasCatalogo]);

  const clinicasFiltradas = useMemo(() => {
    const busqueda = terminoBusqueda.trim().toLowerCase();

    return clinicasCatalogo.filter((c) => {
      if (soloFavoritos && !favoritosIds.includes(c.id_clinica)) {
        return false;
      }
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
  }, [clinicasCatalogo, terminoBusqueda, filtroServicio, filtroMunicipio, filtroHorario, filtroNivel, soloFavoritos, favoritosIds]);

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
    setSoloFavoritos(false);
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
        onAgendarCita={puedeAgendar ? (sede) => {
          if (!sesion) {
            navigate('/agendar-cita', { state: { clinica: sede } });
            return;
          }
          setClinicaEnAgendar(sede);
        } : undefined}
        sinEncabezado={sinEncabezado}
        esFavorita={favoritosIds.includes(clinicaEnDetalle.id_clinica)}
        onAlternarFavorito={alternarFavorito}
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

            {/* Selector de ubicación cercana, favoritos y modo de visualización */}
            <div className="mapa-view-toolbar">
              <div className="mapa-toolbar-left-actions">
                <button
                  type="button"
                  className={`mapa-geo-btn ${modoCercanas ? 'is-active' : ''}`}
                  onClick={solicitarUbicacion}
                  disabled={estadoUbicacion === 'pidiendo'}
                >
                  <LocateFixed size={15} aria-hidden="true" />
                  <span>
                    {estadoUbicacion === 'pidiendo'
                      ? 'Obteniendo ubicación…'
                      : modoCercanas
                        ? 'Actualizar mi ubicación'
                        : 'Usar mi ubicación'}
                  </span>
                </button>

                <label className="mapa-radio-label">
                  <span>Radio:</span>
                  <select
                    aria-label="Radio de búsqueda en kilómetros"
                    value={radioKm}
                    onChange={(e) => {
                      const nuevoRadio = Number(e.target.value);
                      setRadioKm(nuevoRadio);
                      if (modoCercanas && ubicacionUsuario) {
                        setUbicacionVersion((v) => v + 1);
                        buscarCentrosCercanos(ubicacionUsuario.lat, ubicacionUsuario.lng, nuevoRadio);
                      }
                    }}
                  >
                    <option value={2}>2 km</option>
                    <option value={5}>5 km</option>
                    <option value={10}>10 km</option>
                    <option value={25}>25 km</option>
                    <option value={50}>50 km</option>
                  </select>
                </label>

                <button
                  type="button"
                  className={`mapa-fav-filter-btn ${soloFavoritos ? 'is-active' : ''}`}
                  aria-pressed={soloFavoritos}
                  onClick={() => setSoloFavoritos((v) => !v)}
                >
                  <Heart
                    size={15}
                    color={soloFavoritos ? '#FFFFFF' : '#C0262D'}
                    fill={soloFavoritos ? '#FFFFFF' : 'none'}
                    aria-hidden="true"
                  />
                  <span>Favoritos ({favoritosIds.length})</span>
                </button>
              </div>

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

            {soloFavoritos && (
              <div className="mapa-geo-banner is-empty" role="status">
                <Heart size={15} color="#C0262D" aria-hidden="true" />
                <span>
                  Mostrando centros guardados como favoritos. Los favoritos se almacenan localmente en este navegador.
                </span>
              </div>
            )}

            {estadoUbicacion === 'error' && mensajeUbicacion && (
              <div className="mapa-geo-banner is-error" role="alert">
                <AlertCircle size={16} aria-hidden="true" />
                <span>{mensajeUbicacion}</span>
                <div className="mapa-geo-banner-actions">
                  <button
                    type="button"
                    className="mapa-geo-banner-btn"
                    onClick={solicitarUbicacion}
                  >
                    Reintentar
                  </button>
                  {modoCercanas && (
                    <button
                      type="button"
                      className="mapa-geo-banner-btn"
                      onClick={desactivarModoCercanas}
                    >
                      Ver todos los centros
                    </button>
                  )}
                </div>
              </div>
            )}

            {modoCercanas && estadoUbicacion === 'concedida' && (
              <div className="mapa-geo-banner is-ok" role="status">
                <LocateFixed size={16} aria-hidden="true" />
                <span>
                  Mostrando centros dentro de <strong>{radioKm} km</strong> ordenados por distancia. {mensajeUbicacion}
                </span>
                <div className="mapa-geo-banner-actions">
                  <button
                    type="button"
                    className="mapa-geo-banner-btn"
                    onClick={() =>
                      ubicacionUsuario &&
                      buscarCentrosCercanos(ubicacionUsuario.lat, ubicacionUsuario.lng, radioKm)
                    }
                  >
                    <RefreshCw size={13} aria-hidden="true" />
                    <span>Actualizar</span>
                  </button>
                  <button
                    type="button"
                    className="mapa-geo-banner-btn"
                    onClick={desactivarModoCercanas}
                  >
                    <X size={13} aria-hidden="true" />
                    <span>Ver todos los centros</span>
                  </button>
                </div>
              </div>
            )}

            {modoCercanas && estadoCercanas === 'error' && (
              <div className="mapa-geo-banner is-error" role="alert">
                <AlertCircle size={16} aria-hidden="true" />
                <span>{errorCercanas}</span>
                <div className="mapa-geo-banner-actions">
                  {ubicacionUsuario && (
                    <button
                      type="button"
                      className="mapa-geo-banner-btn"
                      onClick={() =>
                        buscarCentrosCercanos(ubicacionUsuario.lat, ubicacionUsuario.lng, radioKm)
                      }
                    >
                      Reintentar
                    </button>
                  )}
                  <button
                    type="button"
                    className="mapa-geo-banner-btn"
                    onClick={desactivarModoCercanas}
                  >
                    Usar búsqueda manual
                  </button>
                </div>
              </div>
            )}

            {modoCercanas && estadoCercanas === 'vacio' && (
              <div className="mapa-geo-banner is-empty" role="status">
                <AlertCircle size={16} aria-hidden="true" />
                <span>
                  No se encontraron centros a menos de {radioKm} km de tu ubicación actual.
                </span>
                <div className="mapa-geo-banner-actions">
                  {radioKm < 25 && ubicacionUsuario && (
                    <button
                      type="button"
                      className="mapa-geo-banner-btn"
                      onClick={() => {
                        setRadioKm(25);
                        setUbicacionVersion((v) => v + 1);
                        buscarCentrosCercanos(ubicacionUsuario.lat, ubicacionUsuario.lng, 25);
                      }}
                    >
                      Ampliar a 25 km
                    </button>
                  )}
                  <button
                    type="button"
                    className="mapa-geo-banner-btn"
                    onClick={desactivarModoCercanas}
                  >
                    Ver todos los centros
                  </button>
                </div>
              </div>
            )}

            {/* Zona de convivencia: Listado y/o Mapa */}
            <section className={`mapa-workspace-grid mode-${modoVista}`} aria-label="Listado de centros y mapa">
              {modoVista !== 'mapa' && (
                <ListadoClinicas
                  clinicas={clinicasFiltradas}
                  vacioTexto={soloFavoritos
                    ? 'Aún no tienes centros agregados a favoritos en este navegador.'
                    : modoCercanas && estadoCercanas === 'error'
                      ? 'No se pudieron consultar los centros cercanos. Usa "Ver todos los centros" o la búsqueda manual.'
                      : modoCercanas && estadoCercanas === 'vacio'
                        ? `No hay centros dentro de ${radioKm} km de tu ubicación.`
                        : clinicasCatalogo.length === 0
                          ? 'No hay clínicas aprobadas para mostrar.'
                          : 'Ningún centro coincide con los filtros seleccionados.'}
                  clinicaSeleccionadaId={clinicaActiva?.id_clinica ?? null}
                  favoritosIds={favoritosIds}
                  onAlternarFavorito={alternarFavorito}
                  onSeleccionarClinica={(clinica) => {
                    setClinicaSeleccionadaId(clinica.id_clinica);
                    setCentrarTrigger((v) => v + 1);
                  }}
                  onVerDetallesClinica={(clinica) => {
                    setClinicaSeleccionadaId(clinica.id_clinica);
                    setCentrarTrigger((v) => v + 1);
                    setClinicaEnDetalle(clinica);
                  }}
                  cargando={cargando || (modoCercanas && estadoCercanas === 'cargando')}
                />
              )}

              {modoVista !== 'centros' && (
                <EspacioMapa
                  clinicas={clinicasFiltradas}
                  clinicaSeleccionada={clinicaActiva}
                  onSeleccionarClinica={(clinica) => {
                    setClinicaSeleccionadaId(clinica.id_clinica);
                    setCentrarTrigger((v) => v + 1);
                  }}
                  onVerDetallesClinica={(clinica) => {
                    setClinicaSeleccionadaId(clinica.id_clinica);
                    setCentrarTrigger((v) => v + 1);
                    setClinicaEnDetalle(clinica);
                  }}
                  filtroServicio={filtroServicio}
                  filtroMunicipio={filtroMunicipio}
                  terminoBusqueda={terminoBusqueda}
                  modoVista={modoVista}
                  clinicaAutenticadaId={sesion?.tipo === 'clinica' ? (sesion?.cuenta?.id_clinica || sesion?.cuenta?.id || null) : null}
                  ubicacionUsuario={ubicacionUsuario}
                  ubicacionVersion={ubicacionVersion}
                  radioKm={radioKm}
                  centrarTrigger={centrarTrigger}
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
