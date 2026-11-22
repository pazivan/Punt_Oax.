import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filtrarYOrdenarCercanasLocal,
  formatearDistanciaKm,
  normalizarRespuestaCercanas,
  obtenerMensajeErrorGeolocalizacion,
} from '../src/utils/cercania.js';

test('formatearDistanciaKm formatea metros y kilómetros correctamente', () => {
  assert.equal(formatearDistanciaKm(0.45), 'A 450 m');
  assert.equal(formatearDistanciaKm(1.24), 'A 1.2 km');
  assert.equal(formatearDistanciaKm(10), 'A 10.0 km');
  assert.equal(formatearDistanciaKm(null), null);
  assert.equal(formatearDistanciaKm(-2), null);
});

test('normalizarRespuestaCercanas ordena por distancia de menor a mayor y soporta distintos envoltorios', () => {
  const resultado = normalizarRespuestaCercanas({
    centros: [
      { id_clinica: 'c2', nombre: 'Lejano', distancia_km: 8.4 },
      { id_clinica: 'c1', nombre: 'Cercano', distancia_km: 1.2 },
      { id_clinica: 'c3', nombre: 'Medio', distancia: '3.5' },
    ],
  });
  assert.deepEqual(
    resultado.map((c) => [c.id_clinica, c.distancia_km]),
    [
      ['c1', 1.2],
      ['c3', 3.5],
      ['c2', 8.4],
    ]
  );

  const arregloDirecto = normalizarRespuestaCercanas([
    { id_clinica: 'a', distance_km: 4.1 },
    { id_clinica: 'b', distance_km: 0.9 },
  ]);
  assert.deepEqual(
    arregloDirecto.map((c) => c.id_clinica),
    ['b', 'a']
  );
});

test('obtenerMensajeErrorGeolocalizacion devuelve mensajes claros por código de error', () => {
  assert.match(obtenerMensajeErrorGeolocalizacion({ code: 1 }), /Permiso de ubicación denegado/i);
  assert.match(obtenerMensajeErrorGeolocalizacion({ code: 2 }), /No pudimos obtener tu ubicación/i);
  assert.match(obtenerMensajeErrorGeolocalizacion({ code: 3 }), /Se agotó el tiempo/i);
  assert.match(obtenerMensajeErrorGeolocalizacion({}), /búsqueda manual/i);
});

test('filtrarYOrdenarCercanasLocal filtra por radio en km y ordena por distancia', () => {
  const zocalo = { lat: 17.0606, lng: -96.7254 };
  const muestra = [
    { id_clinica: 'lejos', nombre: 'Lejano', latitud: 16.17, longitud: -95.2 },
    { id_clinica: 'cerca2', nombre: 'Xoxo', latitud: 17.03, longitud: -96.73 },
    { id_clinica: 'cerca1', nombre: 'Centro', latitud: 17.0619, longitud: -96.7236 },
    { id_clinica: 'sin-coords', nombre: 'Sin coords', latitud: null, longitud: null },
  ];
  const res = filtrarYOrdenarCercanasLocal(muestra, zocalo.lat, zocalo.lng, 10);
  assert.deepEqual(
    res.map((c) => c.id_clinica),
    ['cerca1', 'cerca2']
  );
  assert.ok(res[0].distancia_km < res[1].distancia_km);
});
