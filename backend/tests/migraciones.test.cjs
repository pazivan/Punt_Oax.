const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');
const DOCS_DIR = path.resolve(__dirname, '../../docs');

test('todas las migraciones deben tener su archivo .up.sql y .down.sql correspondiente', () => {
  const archivos = fs.readdirSync(MIGRATIONS_DIR);
  const upFiles = archivos.filter(f => f.endsWith('.up.sql')).sort();

  assert.ok(upFiles.length >= 4, 'Deben existir al menos 4 migraciones');

  for (const upFile of upFiles) {
    const downFile = upFile.replace('.up.sql', '.down.sql');
    assert.ok(
      archivos.includes(downFile),
      `La migración ${upFile} no tiene su archivo ${downFile} correspondiente.`
    );
  }
});

test('la migración 004 define los ajustes mínimos para clinicas, clinicas_servicios y horarios_atencion', () => {
  const upContent = fs.readFileSync(path.join(MIGRATIONS_DIR, '004_ajustes_catalogo_clinicas.up.sql'), 'utf8');
  const downContent = fs.readFileSync(path.join(MIGRATIONS_DIR, '004_ajustes_catalogo_clinicas.down.sql'), 'utf8');

  // 1. No debe recrear el esquema ni usar public.puntos/Supabase
  assert.doesNotMatch(upContent, /CREATE\s+TABLE\s+.*public\.puntos/i);
  assert.doesNotMatch(upContent, /CREATE\s+TABLE\s+.*clinicas\s*\(/i);

  // 2. Campos en clinicas
  assert.match(upContent, /id_origen\s+VARCHAR\(50\)/i);
  assert.match(upContent, /region\s+VARCHAR\(100\)/i);
  assert.match(upContent, /fuente_origen\s+TEXT/i);
  assert.match(upContent, /links_relacionados\s+TEXT/i);
  assert.match(upContent, /horario_texto\s+TEXT/i);
  assert.match(upContent, /ubicacion_maps_url\s+TEXT/i);
  assert.match(upContent, /nivel_atencion\s+VARCHAR\(50\)/i);
  assert.match(upContent, /situacion_ubicacion\s+VARCHAR\(20\)/i);
  assert.match(upContent, /verificacion_datos\s+VARCHAR\(20\)/i);
  assert.match(upContent, /datos_por_confirmar\s+TEXT/i);

  // 3. Restricciones CHECK de situación de ubicación y verificación de datos
  assert.match(upContent, /chk_clinicas_situacion_ubicacion/i);
  assert.match(upContent, /'fija',\s*'pendiente',\s*'itinerante',\s*'reubicacion'/i);
  assert.match(upContent, /chk_clinicas_verificacion_datos/i);
  assert.match(upContent, /'pendiente',\s*'por_confirmar',\s*'parcial',\s*'verificado',\s*'inconsistente'/i);

  // 4. Campos en clinicas_servicios para sedes multi-servicio y etiquetas de costo de Figma
  assert.match(upContent, /ALTER\s+TABLE\s+clinicas_servicios/i);
  assert.match(upContent, /costo_texto\s+VARCHAR\(100\)/i);
  assert.match(upContent, /detalle_servicio\s+TEXT/i);

  // 5. Horarios de 24h y que cruzan medianoche
  assert.match(upContent, /es_24_horas\s+BOOLEAN/i);
  assert.match(upContent, /cruza_medianoche\s+BOOLEAN/i);
  assert.match(upContent, /chk_horarios_intervalo/i);
  assert.match(upContent, /hora_apertura\s*>\s*hora_cierre/i);

  // 6. Estandarización canónica de los 2 servicios (Detección de ITS e ILE)
  assert.match(upContent, /Detección de ITS/i);
  assert.match(upContent, /Interrupción Legal del Embarazo \(ILE\)/i);

  // 7. La migración DOWN debe revertir todos los campos, índices, servicios y restricciones
  assert.match(downContent, /DROP COLUMN IF EXISTS id_origen/i);
  assert.match(downContent, /DROP COLUMN IF EXISTS region/i);
  assert.match(downContent, /DROP COLUMN IF EXISTS situacion_ubicacion/i);
  assert.match(downContent, /DROP COLUMN IF EXISTS verificacion_datos/i);
  assert.match(downContent, /DROP COLUMN IF EXISTS costo_texto/i);
  assert.match(downContent, /DROP COLUMN IF EXISTS detalle_servicio/i);
  assert.match(downContent, /DROP COLUMN IF EXISTS es_24_horas/i);
  assert.match(downContent, /DROP COLUMN IF EXISTS cruza_medianoche/i);
  assert.match(downContent, /chk_horarios_intervalo/i);
});

test('el documento de acuerdo para Kelly y el importador existe y cubre todos los criterios', () => {
  const docPath = path.join(DOCS_DIR, 'acuerdo-mapeo-datos-clinicas.md');
  assert.ok(fs.existsSync(docPath), 'Debe existir docs/acuerdo-mapeo-datos-clinicas.md');

  const doc = fs.readFileSync(docPath, 'utf8');
  assert.match(doc, /id_origen/);
  assert.match(doc, /N\.º de origen/);
  assert.match(doc, /situacion_ubicacion/);
  assert.match(doc, /verificacion_datos/);
  assert.match(doc, /estado_publicacion/);
  assert.match(doc, /es_24_horas/);
  assert.match(doc, /cruza_medianoche/);
  assert.match(doc, /costo_texto/);
  assert.match(doc, /region/);
  assert.match(doc, /Detección de ITS/);
  assert.match(doc, /Interrupción Legal del Embarazo/);
  assert.match(doc, /Kelly/i);
});
