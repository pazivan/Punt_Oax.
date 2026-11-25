/**
 * Utilidades para geolocalización del usuario, consulta de centros cercanos
 * y gestión de favoritos locales aislados por cuenta y rol.
 */

export function obtenerMensajeErrorGeolocalizacion(error) {
  const codigo = Number(error?.code);
  if (codigo === 1) {
    return 'Permiso de ubicación denegado. Puedes activarlo en tu navegador o seguir usando la búsqueda manual por municipio y servicio.';
  }
  if (codigo === 2) {
    return 'No pudimos obtener tu ubicación en este momento. Inténtalo de nuevo o usa la búsqueda manual.';
  }
  if (codigo === 3) {
    return 'Se agotó el tiempo de espera al buscar tu ubicación. Inténtalo de nuevo o usa la búsqueda manual.';
  }
  return 'No fue posible acceder a la geolocalización en este dispositivo. Sigue usando la búsqueda manual.';
}

export function formatearDistanciaKm(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const km = Number(valor);
  if (!Number.isFinite(km) || km < 0) return null;
  if (km < 1) {
    return `A ${Math.round(km * 1000)} m`;
  }
  return `A ${km.toFixed(1)} km`;
}

export function claveFavoritosCuenta(sesion) {
  const rol = typeof sesion?.tipo === 'string' && sesion.tipo.trim()
    ? sesion.tipo.trim().toLowerCase()
    : '';
  const cuenta = sesion?.cuenta;
  const idCuenta =
    cuenta?.id_usuario ??
    cuenta?.id_clinica ??
    cuenta?.id_administrador ??
    cuenta?.id ??
    null;

  if (rol && idCuenta !== null && idCuenta !== undefined && String(idCuenta).trim() !== '') {
    return `puntoax_favoritos_${rol}_${String(idCuenta).trim()}`;
  }
  return 'puntoax_favoritos_invitado';
}

export function leerFavoritosLocal(clave) {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(clave);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function guardarFavoritosLocal(clave, favoritosIds) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(clave, JSON.stringify(favoritosIds));
  } catch {
    // Ignorar errores de almacenamiento local
  }
}

export function normalizarRespuestaCercanas(payload) {
  const listaBruta = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.centros)
      ? payload.centros
      : Array.isArray(payload?.clinicas)
        ? payload.clinicas
        : Array.isArray(payload?.resultados)
          ? payload.resultados
          : [];

  const normalizados = listaBruta.map((item) => {
    const rawDist = item?.distancia_km ?? item?.distancia ?? item?.distance_km;
    const distanciaNum =
      rawDist !== null && rawDist !== undefined && rawDist !== '' && Number.isFinite(Number(rawDist))
        ? Number(rawDist)
        : null;
    return {
      ...item,
      distancia_km: distanciaNum,
    };
  });

  return normalizados.sort((a, b) => {
    const da = a.distancia_km ?? Number.POSITIVE_INFINITY;
    const db = b.distancia_km ?? Number.POSITIVE_INFINITY;
    return da - db;
  });
}

export function calcularDistanciaKm(lat1, lng1, lat2, lng2) {
  const aLat = Number(lat1);
  const aLng = Number(lng1);
  const bLat = Number(lat2);
  const bLng = Number(lng2);
  if (
    !Number.isFinite(aLat) ||
    !Number.isFinite(aLng) ||
    !Number.isFinite(bLat) ||
    !Number.isFinite(bLng)
  ) {
    return null;
  }
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const a =
    sinDLat * sinDLat +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      sinDLng *
      sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function filtrarYOrdenarCercanasLocal(clinicas, lat, lng, radioKm = 10) {
  const lista = Array.isArray(clinicas) ? clinicas : [];
  const radio = Math.max(0.5, Number(radioKm) || 10);
  return lista
    .map((centro) => {
      if (centro?.ubicacion_confirmada !== true) return null;
      if (centro?.latitud == null || centro?.longitud == null) return null;
      const dist = calcularDistanciaKm(lat, lng, centro.latitud, centro.longitud);
      if (dist === null || dist > radio) return null;
      return {
        ...centro,
        distancia_km: Number(dist.toFixed(2)),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distancia_km - b.distancia_km);
}

export async function consultarClinicasCercanas({
  lat,
  lng,
  radioKm = 10,
  limite = 50,
  signal,
  token,
  clinicasRespaldo = null,
}) {
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    radio_km: String(radioKm),
    limite: String(limite),
  });

  const respuesta = await fetch(`/api/clinicas/cercanas?${params.toString()}`, {
    signal,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (!respuesta.ok) {
    const errorJson = await respuesta.json().catch(() => null);
    const mensaje =
      errorJson?.error ||
      errorJson?.mensaje ||
      `No se pudieron consultar los centros cercanos (código ${respuesta.status}).`;

    if (respuesta.status === 401 || respuesta.status === 403) {
      const errorAuth = new Error(mensaje);
      errorAuth.status = respuesta.status;
      errorAuth.codigo = errorJson?.codigo;
      throw errorAuth;
    }

    const rutaNoDisponible =
      respuesta.status === 404 ||
      (respuesta.status === 400 && /identificador de cl[ií]nica/i.test(mensaje));

    if (rutaNoDisponible && Array.isArray(clinicasRespaldo)) {
      const locales = filtrarYOrdenarCercanasLocal(clinicasRespaldo, lat, lng, radioKm);
      return {
        centros: locales,
        total: locales.length,
        fuente: 'local',
      };
    }

    throw new Error(mensaje);
  }

  const datos = await respuesta.json();
  const centros = normalizarRespuestaCercanas(datos);
  return {
    centros,
    total: typeof datos?.total === 'number' ? datos.total : centros.length,
    fuente: 'api',
  };
}
