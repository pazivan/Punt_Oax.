const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const {
  parsearCSV,
  leerRegistros,
  validarFila,
  fusionar,
  categoriasDe,
  coordenadas,
  diasDesdeTexto,
  parsearHorario,
  combinarEnlaces,
  procesarImportacion,
} = require('../scripts/importar-filtracion');

test('parsearCSV maneja comillas escapadas, saltos de línea y elimina BOM', () => {
  const csv = '\uFEFF"id_origen","nombre","servicios"\n"1","Centro ""La Esperanza""","Detección de ITS"\n"2","Clínica\nOaxaca","ILE"';
  const registros = leerRegistros(csv);
  assert.equal(registros.length, 2);
  assert.equal(registros[0].id_origen, '1');
  assert.equal(registros[0].nombre, 'Centro "La Esperanza"');
  assert.equal(registros[1].id_origen, '2');
  assert.equal(registros[1].nombre, 'Clínica\nOaxaca');
});

test('categoriasDe clasifica canónicamente a ITS, ILE o Ambos según el texto', () => {
  const catITS = categoriasDe({ categoria: 'ITS', servicios: 'Pruebas rápidas de VIH y sífilis' });
  assert.deepEqual([...catITS], ['ITS']);

  const catILE = categoriasDe({ categoria: 'Aborto', servicios: 'Servicio de interrupción legal y AMEU' });
  assert.deepEqual([...catILE], ['ILE']);

  const catAmbos = categoriasDe({ categoria: 'Ambos', servicios: 'Pruebas de VIH, consejería e ILE' });
  assert.ok(catAmbos.has('ITS'));
  assert.ok(catAmbos.has('ILE'));
  assert.equal(catAmbos.size, 2);
});

test('conserva el id_origen como texto y valida longitudes', () => {
  const regValido = {
    __cabeceras: new Set(['id_origen', 'nombre', 'servicios']),
    id_origen: 'coesdia 11.1',
    nombre: 'Consultorio Municipal',
    servicios: 'Detección de ITS',
  };
  const val = validarFila(regValido);
  assert.equal(val.ok, true);
  assert.equal(val.datos.id_origen, 'coesdia 11.1');

  const regSinId = {
    __cabeceras: new Set(['nombre', 'servicios']),
    nombre: 'Consultorio Municipal',
    servicios: 'Detección de ITS',
  };
  const valSinId = validarFila(regSinId);
  assert.equal(valSinId.ok, false);
  assert.equal(valSinId.motivo, 'sin id_origen');
});

test('deduce el nombre de la unidad si viene vacío a partir de la dirección o contexto', () => {
  const reg1 = {
    __cabeceras: new Set(['id_origen', 'direccion', 'servicios']),
    id_origen: 'coesdia 11',
    direccion: 'Blvd. Eduardo Vasconcelos 517, Barrio de Jalatlaco, C.P. 68080 (IMEDI)',
    servicios: 'Detección de VIH y Sífilis',
  };
  const val1 = validarFila(reg1);
  assert.equal(val1.ok, true);
  assert.equal(val1.datos.nombre, 'IMEDI');

  const reg2 = {
    __cabeceras: new Set(['id_origen', 'direccion', 'servicios']),
    id_origen: 'coesdia 11.2',
    direccion: 'Casa de Salud - Col. Lomas de San Javier, Santa Cruz Xoxocotlán',
    servicios: 'Detección de VIH',
  };
  const val2 = validarFila(reg2);
  assert.equal(val2.ok, true);
  assert.equal(val2.datos.nombre, 'Casa de Salud - Col. Lomas de San Javier');

  const reg3 = {
    __cabeceras: new Set(['id_origen', 'direccion', 'servicios']),
    id_origen: 'coesdia 1',
    direccion: 'Mártires de Tacubaya 315, Centro, 68000 Oaxaca de Juárez, Oax.',
    servicios: 'Detección de VIH, Sífilis y Hepatitis C',
  };
  const val3 = validarFila(reg3);
  assert.equal(val3.ok, true);
  assert.equal(val3.datos.nombre, 'Punto Fijo de Detección – Dirección de Sanidad');
});

test('extrae coordenadas desde columnas explícitas o desde URLs de Google Maps', () => {
  const coords1 = coordenadas({
    latitud: '17.0601',
    longitud: '-96.7253',
  });
  assert.deepEqual(coords1, { lat: 17.0601, lng: -96.7253 });

  const coords2 = coordenadas({
    ubicacion_maps_url: 'https://www.google.com/maps/search/?api=1&query=17.0583,-96.7123',
  });
  assert.deepEqual(coords2, { lat: 17.0583, lng: -96.7123 });

  const coords3 = coordenadas({
    ubicacion_maps_url: 'https://www.google.com/maps/@17.0700,-96.7300,15z',
  });
  assert.deepEqual(coords3, { lat: 17.07, lng: -96.73 });
});

test('fusionar une servicios, horarios y enlaces de filas duplicadas con el mismo id_origen', () => {
  const destino = {
    id_origen: '36',
    nombre: 'Fundación MSI Marie Stopes',
    categorias: new Set(['ITS']),
    horarios: [{ dia_semana: 1, apertura: '08:00', cierre: '16:00', es_24_horas: false }],
    links_relacionados: 'https://mariestopes.org.mx',
    punto: null,
    costo: null,
    requisitos: null,
  };

  const origen = {
    id_origen: '36',
    nombre: 'Fundación MSI Marie Stopes',
    categorias: new Set(['ILE']),
    horarios: [{ dia_semana: 2, apertura: '08:00', cierre: '16:00', es_24_horas: false }],
    links_relacionados: 'https://facebook.com/mariestopes',
    punto: { lat: 17.072, lng: -96.715 },
    costo: 0,
    requisitos: 'Identificación oficial',
  };

  fusionar(destino, origen);

  assert.equal(destino.categorias.size, 2);
  assert.ok(destino.categorias.has('ITS'));
  assert.ok(destino.categorias.has('ILE'));
  assert.equal(destino.horarios.length, 2);
  assert.deepEqual(destino.punto, { lat: 17.072, lng: -96.715 });
  assert.equal(destino.requisitos, 'Identificación oficial');
  assert.ok(destino.links_relacionados.includes('mariestopes.org.mx'));
  assert.ok(destino.links_relacionados.includes('facebook.com/mariestopes'));
});

test('filtra por seleccionado y verificacion_datos cuando las columnas están presentes', () => {
  const cabeceras = new Set(['id_origen', 'nombre', 'servicios', 'seleccionado', 'verificacion_datos']);
  
  const regNoSeleccionado = {
    __cabeceras: cabeceras,
    id_origen: '1',
    nombre: 'Centro X',
    servicios: 'ITS',
    seleccionado: 'no',
    verificacion_datos: 'verificado',
  };
  assert.equal(validarFila(regNoSeleccionado).ok, false);
  assert.equal(validarFila(regNoSeleccionado).motivo, 'no seleccionado');

  const regNoVerificado = {
    __cabeceras: cabeceras,
    id_origen: '2',
    nombre: 'Centro Y',
    servicios: 'ITS',
    seleccionado: 'si',
    verificacion_datos: 'pendiente',
  };
  assert.equal(validarFila(regNoVerificado).ok, false);
  assert.equal(validarFila(regNoVerificado).motivo, "verificación distinta de 'verificado'");

  const regValido = {
    __cabeceras: cabeceras,
    id_origen: '3',
    nombre: 'Centro Z',
    servicios: 'ITS',
    seleccionado: 'si',
    verificacion_datos: 'verificado',
  };
  assert.equal(validarFila(regValido).ok, true);
});

test('el archivo filtracion.csv existe, es procesable y contiene sedes de ITS, Aborto y Ambos', () => {
  const rutaCSV = path.resolve(__dirname, '../data/filtracion.csv');
  assert.ok(fs.existsSync(rutaCSV), 'El archivo backend/data/filtracion.csv debe existir');

  const contenido = fs.readFileSync(rutaCSV, 'utf8');
  const registros = leerRegistros(contenido);
  assert.ok(registros.length >= 50, `Se esperaban al menos 50 filas, se leyeron ${registros.length}`);

  let centrosValidos = 0;
  const categoriasDetectadas = new Set();
  const idsVistos = new Set();

  for (const reg of registros) {
    const val = validarFila(reg);
    if (val.ok) {
      centrosValidos++;
      idsVistos.add(val.datos.id_origen);
      val.datos.categorias.forEach(c => categoriasDetectadas.add(c));
    }
  }

  assert.ok(centrosValidos >= 50, `Se esperaban al menos 50 centros válidos, se obtuvieron ${centrosValidos}`);
  assert.ok(categoriasDetectadas.has('ITS'), 'Debe contener centros de ITS');
  assert.ok(categoriasDetectadas.has('ILE'), 'Debe contener centros de ILE (Aborto)');
  assert.equal(idsVistos.size, centrosValidos, 'Todos los id_origen deben ser únicos');
});

test('procesarImportacion simula correctamente con rollback y reporta métricas', async () => {
  const fakeServicios = [
    { id_servicio: 'srv-its-01', categoria: 'ITS', nombre: 'Detección de ITS' },
    { id_servicio: 'srv-ile-02', categoria: 'ILE', nombre: 'Interrupción Legal del Embarazo (ILE)' },
  ];

  const queriesEjecutadas = [];

  const mockClient = {
    query: async (sql, params = []) => {
      const normalizedSql = sql.replace(/\s+/g, ' ').trim();
      queriesEjecutadas.push({ sql: normalizedSql, params });
      if (normalizedSql.includes('FROM servicios')) {
        return { rows: fakeServicios };
      }
      if (normalizedSql.includes('FROM clinicas WHERE id_origen')) {
        return { rows: [] };
      }
      if (normalizedSql.includes('FROM clinicas WHERE LOWER(TRIM(nombre))')) {
        return { rows: [] };
      }
      if (normalizedSql.includes('INSERT INTO clinicas (')) {
        return { rows: [{ id_clinica: '00000000-0000-0000-0000-000000000001' }] };
      }
      if (normalizedSql.includes('INSERT INTO clinicas_servicios')) {
        return { rowCount: 1 };
      }
      if (normalizedSql.includes('INSERT INTO horarios_atencion')) {
        return { rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    release: () => {},
  };

  const mockPool = {
    connect: async () => mockClient,
  };

  const csvTest = `id_origen,nombre,servicios,municipio,direccion,horario,latitud,longitud
test-01,Centro de Prueba ITS,Detección de ITS,Oaxaca de Juárez,Calle Falsa 123,Lunes a viernes 08:00 a 16:00,17.06,-96.72
test-02,Centro de Prueba Ambos,Ambos (ITS e ILE),Oaxaca de Juárez,Av Central 456,Lunes a domingo 24 horas,17.07,-96.71`;

  const registros = leerRegistros(csvTest);

  // 1. Simulación (aplicar = false -> ROLLBACK)
  const resSimulacion = await procesarImportacion(registros, mockPool, { aplicar: false });
  assert.equal(resSimulacion.ok, true);
  assert.equal(resSimulacion.aplicar, false);
  assert.equal(resSimulacion.centrosUnicos, 2);
  assert.equal(resSimulacion.resumen.nuevos, 2);
  assert.equal(resSimulacion.resumen.servicios, 3); // 1 de ITS + 2 de Ambos
  assert.ok(queriesEjecutadas.some(q => q.sql === 'ROLLBACK'));

  // 2. Aplicación (aplicar = true -> COMMIT)
  queriesEjecutadas.length = 0;
  const resAplicar = await procesarImportacion(registros, mockPool, { aplicar: true });
  assert.equal(resAplicar.ok, true);
  assert.equal(resAplicar.aplicar, true);
  assert.ok(queriesEjecutadas.some(q => q.sql === 'COMMIT'));
});
