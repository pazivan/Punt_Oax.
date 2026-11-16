// Navegador real, API y PostGIS locales; no intercepta ni simula respuestas.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');
const { leerRegistros } = require('../scripts/importar-filtracion');
const { chromium } = require(require.resolve('playwright-core', {
  paths: [process.env.PUNTOAX_BROWSER_TOOLS || '/tmp/opencode/puntoax-browser-tools'],
}));

async function main() {
  assert.equal(process.env.PUNTOAX_TEST_DB, '1');
  assert.equal(process.env.PGHOST, '127.0.0.1');
  assert.equal(process.env.PGPORT, '55483');
  assert.equal(process.env.PGDATABASE, 'puntoax_s4_test_ile17');
  const base = 'http://127.0.0.1:33084';
  const registros = leerRegistros(fs.readFileSync(path.join(__dirname, '../data/aborto-coordenadas.csv'), 'utf8'));
  const db = new Pool();
  const correo = `mapa-ile-${randomUUID()}@puntoax.online`;
  const password = `Revision-${randomUUID()}!`;
  let browser;
  try {
    const respuesta = await fetch(`${base}/api/auth/registro-usuario`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ correo, password }),
    });
    assert.equal(respuesta.status, 201, await respuesta.text());
    const obtener = async (ruta) => {
      const r = await fetch(base + ruta);
      assert.equal(r.status, 200, ruta);
      return r.json();
    };
    const catalogo = await obtener('/api/clinicas?servicios=ILE');
    assert.equal(catalogo.length, 17);
    assert.equal(new Set(catalogo.map((c) => c.id_clinica)).size, 17);
    assert.equal(new Set(catalogo.map((c) => c.clues)).size, 17);
    const alias = await obtener('/api/clinicas?servicios=Aborto');
    assert.deepEqual(alias.map((c) => c.id_clinica), catalogo.map((c) => c.id_clinica));
    for (const r of registros) {
      const c = catalogo.find((c) => c.clues === r.clues);
      assert.ok(c, r.clues);
      const detalle = await obtener(`/api/clinicas/${c.id_clinica}`);
      if (r.clues === 'OCIST000112') assert.equal(detalle.id_origen, null);
      for (const vista of [c, detalle]) {
        assert.equal(vista.nombre, r.nombre);
        assert.equal(vista.latitud, Number(r.latitud));
        assert.equal(vista.longitud, Number(r.longitud));
        assert.equal(vista.ubicacion_confirmada, true);
        assert.equal(vista.ubicacion_maps, r.ubicacion_maps_url);
        assert.equal(vista.datos_por_confirmar, null);
        assert.ok(!('revision_catalogo' in vista));
        for (const campo of r.campos_no_publicar.split('|').filter(Boolean)) {
          if (campo === 'numero_exterior') assert.doesNotMatch(vista.direccion, /\b(?:418|75)\b/);
          else assert.equal(vista[campo === 'horario' ? 'horario' : campo], null);
          if (campo === 'horario') assert.deepEqual(vista.horarios, []);
        }
      }
      assert.ok(detalle.servicios.some((s) => s.categoria === 'ILE'));
    }
    browser = await chromium.launch({
      executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome',
      headless: true, args: ['--no-sandbox'],
    });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errores = [];
    page.on('pageerror', (e) => errores.push(e.message));
    await page.goto(`${base}/login`);
    await page.locator('#login-email').fill(correo);
    await page.locator('#login-password').fill(password);
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
    await page.waitForURL('**/cuenta');
    await page.getByRole('link', { name: 'Mapa de centros', exact: true }).first().click();
    const filtro = page.getByRole('combobox', { name: 'Filtrar por tipo de servicio' });
    await filtro.selectOption('Aborto');
    await page.waitForFunction(() => document.querySelectorAll('.leaflet-interactive').length === 17);
    assert.equal(await page.locator('.leaflet-interactive').count(), 17);
    for (const r of registros) {
      await page.getByRole('searchbox', { name: 'Buscar centro o municipio' }).fill(r.nombre);
      await page.waitForFunction(() => document.querySelectorAll('.leaflet-interactive').length === 1);
      // El único marcador visible tras buscar es la unidad seleccionada; se hace
      // click real y se abre la ficha usando el botón habitual del popup.
      await page.locator('.leaflet-interactive').click({ timeout: 20000 });
      await page.locator('.leaflet-popup').getByRole('heading', { name: r.nombre, exact: true }).waitFor();
      await page.getByRole('button', { name: 'Ver ficha completa', exact: true }).click();
      await page.getByRole('heading', { name: r.nombre, exact: true, level: 1 }).waitFor();
      assert.equal(await page.getByRole('link', { name: 'Abrir ubicación en Google Maps' }).getAttribute('href'), r.ubicacion_maps_url);
      const texto = await page.locator('main').innerText();
      if (r.clues === 'OCIMB006814') {
        assert.doesNotMatch(texto, /951 199 9247|08:00 a 16:00|08:00 a 20:00/);
      }
      console.log(`OK fila ${r.fila_fuente}: marcador → ficha ${r.clues}`);
      await page.getByRole('button', { name: 'Volver al mapa', exact: true }).click();
    }
    await page.getByRole('searchbox', { name: 'Buscar centro o municipio' }).fill('');
    await filtro.selectOption('ITS');
    const its = await obtener('/api/clinicas?servicios=ITS');
    await page.waitForFunction((n) => document.querySelectorAll('.leaflet-interactive').length === n,
      its.filter((c) => c.ubicacion_confirmada).length);
    await filtro.selectOption('Aborto');
    await page.waitForFunction(() => document.querySelectorAll('.leaflet-interactive').length === 17);
    await page.screenshot({ path: '/tmp/opencode/puntoax-ile17-mapa.png', fullPage: true });
    assert.deepEqual(errores, []);
    console.log('OK 17 fichas/API/coordenadas, filtro ILE↔ITS y 17 marcadores abiertos en navegador.');
  } finally {
    await browser?.close();
    await db.query('DELETE FROM usuarios WHERE correo=$1', [correo]);
    await db.end();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
