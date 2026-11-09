const fs = require('fs');
const path = require('path');
const data = require('../../scratch/parsed_sheets.json');

const headers = [
  "id_origen", "nombre", "categoria", "servicios", "municipio", "localidad",
  "direccion", "codigo_postal", "telefono", "correo_contacto", "sitio_web",
  "descripcion", "tipo_institucion", "nivel_atencion", "horario",
  "latitud", "longitud", "situacion_ubicacion", "verificacion_datos",
  "seleccionado", "fuente_origen", "ubicacion_maps_url", "links_relacionados",
  "region", "datos_por_confirmar", "requisitos", "costo", "costo_texto",
  "detalle_servicio", "requiere_cita"
];

function escapeCSV(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const outRows = [headers.join(',')];

// Helper to extract clean data from rowArr
function procesarFila(sheetName, rowArr) {
  const id = (rowArr[0] || '').trim();
  if (!id) return null;

  let nombre = (rowArr[3] || '').trim();
  const mun = (rowArr[2] || '').trim();
  const dir = (rowArr[5] || '').trim();
  const tel = (rowArr[6] || '').trim();
  const hor = (rowArr[7] || '').trim();
  const correo = (rowArr[8] || '').trim();
  const serv = (rowArr[9] || '').trim();
  const req = (rowArr[10] || '').trim();
  const fuente = (rowArr[11] || '').trim();
  const maps = (rowArr[12] || '').trim();
  const links = (rowArr[13] || '').trim();
  const nivel = (rowArr[4] || '').trim();

  // If nombre is empty, extract from dir / context
  if (!nombre) {
    if (/^(Casa de Salud[^-–—]*[-–—][^,]+)/i.test(dir)) {
      nombre = dir.match(/^(Casa de Salud[^-–—]*[-–—][^,]+)/i)[1].trim();
    } else if (/^(Consultorio Municipal)/i.test(dir)) {
      nombre = "Consultorio Municipal - Santa Cruz Xoxocotlán";
    } else if (/Centro ["“]Mujer, T[uú] Espacio["”]/i.test(dir)) {
      nombre = "Centro Mujer, Tú Espacio";
    } else {
      const paren = dir ? [...dir.matchAll(/\(([^)]+)\)/g)].map((m) => m[1].trim()) : [];
      const nameParen = paren.find((p) =>
        !/^C\.?P\.?\s*\d+/i.test(p) &&
        !/A un costado/i.test(p) &&
        !/Unidad m[oó]vil/i.test(p) &&
        !/Calle Moctezuma/i.test(p) &&
        !/Servicio/i.test(p) &&
        !/Murgu[ií]a/i.test(p) &&
        !/Aviso/i.test(p) &&
        !/entre /i.test(p) &&
        p.length > 2
      );
      if (nameParen) {
        nombre = nameParen;
      } else if (id === "coesdia 1") {
        nombre = "Punto Fijo de Detección – Dirección de Sanidad";
      } else if (id) {
        nombre = `Punto de Detección (${id})`;
      }
    }
  }

  // Extract lat / lng if query=lat,lng or @lat,lng in maps URL
  let lat = '';
  let lng = '';
  if (maps) {
    const q = maps.match(/query=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    const at = maps.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (q) {
      lat = q[1];
      lng = q[2];
    } else if (at) {
      lat = at[1];
      lng = at[2];
    }
  }

  // Extract C.P. from direccion
  let cp = '';
  const cpMatch = dir.match(/C\.?P\.?\s*(\d{5})/i);
  if (cpMatch) cp = cpMatch[1];

  let categoria = sheetName === 'ITS' ? 'ITS' : (sheetName === 'Aborto' ? 'ILE' : 'Ambos');

  const row = {
    id_origen: id,
    nombre: nombre,
    categoria: categoria,
    servicios: serv || (categoria === 'ITS' ? 'Detección de ITS' : (categoria === 'ILE' ? 'Interrupción Legal del Embarazo (ILE)' : 'Detección de ITS e Interrupción Legal del Embarazo (ILE)')),
    municipio: mun,
    localidad: '',
    direccion: dir,
    codigo_postal: cp,
    telefono: tel,
    correo_contacto: correo,
    sitio_web: '',
    descripcion: '',
    tipo_institucion: /privad/i.test(nivel) ? 'privada' : (/social|comunitari|ong/i.test(nivel) ? 'ong' : 'publica'),
    nivel_atencion: nivel,
    horario: hor,
    latitud: lat,
    longitud: lng,
    situacion_ubicacion: lat && lng ? 'fija' : 'pendiente',
    verificacion_datos: 'verificado',
    seleccionado: 'si',
    fuente_origen: fuente,
    ubicacion_maps_url: maps,
    links_relacionados: links,
    region: /istmo/i.test(mun) ? 'Istmo' : (/costa|huatulco|pochutla|pinotepa/i.test(mun) ? 'Costa' : 'Valles Centrales'),
    datos_por_confirmar: '',
    requisitos: req,
    costo: /gratuito/i.test(req) ? '0' : '',
    costo_texto: /gratuito/i.test(req) ? 'Gratuito' : '',
    detalle_servicio: '',
    requiere_cita: /cita/i.test(req) || /agendar/i.test(hor) ? 'si' : 'no'
  };

  return headers.map(h => escapeCSV(row[h])).join(',');
}

for (const [sheet, rows] of Object.entries(data)) {
  for (let i = 1; i < rows.length; i++) {
    const csvLine = procesarFila(sheet, rows[i].rowArr);
    if (csvLine) outRows.push(csvLine);
  }
}

const targetPath = path.resolve(__dirname, '../data/filtracion.csv');
fs.mkdirSync(path.dirname(targetPath), { recursive: true });
fs.writeFileSync(targetPath, outRows.join('\n'), 'utf8');
console.log(`Generated ${targetPath} with ${outRows.length - 1} data rows.`);
