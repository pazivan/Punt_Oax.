const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { leerRegistros, validarFila } = require('../scripts/importar-filtracion');
const { resolverIdentidad } = require('../scripts/identidad-catalogo');
const { fichaPublica } = require('../catalogoPublico');
const registros = leerRegistros(fs.readFileSync(path.join(__dirname, '../data/aborto-coordenadas.csv'), 'utf8'));

test('17 filas con CLUES distintas, P latitud / Q longitud y origen vacío de Benito Juárez', () => {
  const fuente = leerRegistros(fs.readFileSync(path.join(__dirname, '../data/aborto-fuentes/aborto.csv'), 'utf8'));
  assert.equal(registros.length, 17);
  assert.equal(new Set(registros.map((r) => r.clues)).size, 17);
  registros.forEach((r, i) => {
    const v = validarFila(r, { catalogoIle: true });
    assert.ok(v.ok, r.nombre);
    assert.equal(v.datos.punto.lat, Number(fuente[i].latitud.replace(',', '.')));
    assert.equal(v.datos.punto.lng, Number(fuente[i].longitud.replace(',', '.')));
    assert.equal(r.ubicacion_maps_url, fuente[i].ubicacion_maps.trim());
    assert.deepEqual([...v.datos.categorias], ['ILE']);
  });
  assert.equal(registros[16].id_origen, '');
  assert.equal(registros[16].clues, 'OCIST000112');
  assert.match(registros[15].direccion, /Frontera No. 600/);
  assert.match(registros[11].datos_por_confirmar, /visualmente/);
});

test('identidad por CLUES, ID decimal legado y domicilio; bloquea conflictos, homónimos y candidatos múltiples', () => {
  const r = registros[14];
  const base = { ...r, id_clinica: 'existente', id_origen: '34.0' };
  assert.equal(resolverIdentidad([base], r).fila.id_clinica, 'existente');
  assert.equal(resolverIdentidad([{ ...base, id_origen: null }], r).tipo, 'CLUES + domicilio');
  assert.equal(resolverIdentidad([{ ...base, clues: null, fuente_origen: '' }], r).tipo, 'ID + domicilio');
  assert.ok(resolverIdentidad([{ ...base, clues: 'OCIST000112', fuente_origen: '' }], r).ambiguo);
  assert.ok(resolverIdentidad([{ ...base, direccion: 'Otra calle 7', direccion_identidad: null }], r).ambiguo);
  assert.ok(resolverIdentidad([base, { ...base, id_clinica: 'duplicada' }], r).ambiguo);
  const hospital = registros[16];
  assert.equal(resolverIdentidad([{ ...hospital, id_clinica: 'benito', id_origen: null }], hospital).fila.id_clinica, 'benito');
});

test('pendientes no reaparecen en API pública ni a través de horarios anteriores o notas internas', () => {
  const ficha = { telefono: '9511999247', horario: '08:00-16:00', horarios: [{ apertura: '08:00' }],
    modalidad_horario: 'lunes-viernes', datos_por_confirmar: 'Teléfono 9511999247 pendiente',
    revision_catalogo: { campos_no_publicar: ['telefono', 'horario'] } };
  const publica = fichaPublica(ficha);
  assert.equal(publica.telefono, null);
  assert.equal(publica.horario, null);
  assert.deepEqual(publica.horarios, []);
  assert.equal(publica.modalidad_horario, null);
  assert.equal(publica.datos_por_confirmar, null);
  assert.ok(!('revision_catalogo' in publica));
  assert.equal(ficha.telefono, '9511999247'); // no borrar el registro interno
  for (const numero of [11, 12, 13]) assert.equal(registros[numero - 2].telefono, '');
  for (const numero of [13, 14]) assert.equal(registros[numero - 2].horario, '');
  for (const numero of [2, 3, 5, 15]) {
    assert.equal(registros[numero - 2].codigo_postal, '');
    assert.doesNotMatch(registros[numero - 2].direccion, /\b\d{5}\b/);
  }
  assert.doesNotMatch(registros[8].direccion, /\b418\b/);
  assert.doesNotMatch(registros[13].direccion, /\b75\b/);
});
