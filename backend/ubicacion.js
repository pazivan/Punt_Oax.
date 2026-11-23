/**
 * Validación compartida de coordenadas geográficas.
 *
 * PostGIS almacena el punto como GEOGRAPHY(Point, 4326): longitud primero,
 * latitud después. Estas funciones solo validan el par; la construcción del
 * punto se hace en servidor.js para mantener el orden correcto.
 */

const LATITUD_MIN = -90;
const LATITUD_MAX = 90;
const LONGITUD_MIN = -180;
const LONGITUD_MAX = 180;

function aNumero(valor) {
  if (typeof valor === "number") return valor;
  if (typeof valor === "string" && valor.trim()) return Number(valor);
  return Number.NaN;
}

function validarCoordenadas(latitud, longitud) {
  const lat = aNumero(latitud);
  const lng = aNumero(longitud);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { error: "Indica una latitud y una longitud válidas." };
  }
  if (lat < LATITUD_MIN || lat > LATITUD_MAX) {
    return { error: "La latitud debe estar entre -90 y 90." };
  }
  if (lng < LONGITUD_MIN || lng > LONGITUD_MAX) {
    return { error: "La longitud debe estar entre -180 y 180." };
  }

  // Seis decimales equivalen a una precisión de aproximadamente 11 cm.
  return {
    latitud: Math.round(lat * 1e6) / 1e6,
    longitud: Math.round(lng * 1e6) / 1e6,
  };
}

module.exports = {
  LATITUD_MIN,
  LATITUD_MAX,
  LONGITUD_MIN,
  LONGITUD_MAX,
  validarCoordenadas,
};
