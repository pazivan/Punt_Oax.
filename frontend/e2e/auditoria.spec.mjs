import { test, expect } from '@playwright/test'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { readFile, mkdir } from 'node:fs/promises'
const require = createRequire(import.meta.url)
const { Pool } = require('../../backend/node_modules/pg')
const bcrypt = require('../../backend/node_modules/bcryptjs')
if (process.env.PUNTOAX_TEST_DB !== '1' || process.env.PGPORT !== '55474' ||
    !process.env.PGDATABASE?.startsWith('puntoax_s4_test') || process.env.PGHOST !== '127.0.0.1')
  throw new Error('Solo aislamiento local de correcciones.')
const api = `http://127.0.0.1:${process.env.PUNTOAX_TEST_API_PORT}`
const dir = process.env.PUNTOAX_QA_CAPTURAS || '/tmp/puntoax-qa-browser/capturas'
let pool, paciente, borrador, centro, admin, centroId
const password = 'Regresion-Navegador2026!'
async function llamada(ruta, sesion, body, method = body ? 'POST' : 'GET') {
  const r = await fetch(api + ruta, { method, headers: { 'Content-Type': 'application/json', ...(sesion ? { Authorization: `Bearer ${sesion.token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: r.status, body: await r.json() }
}
async function abrir(page, sesion, ruta) {
  await page.addInitScript((s) => { localStorage.setItem('puntoax-sesion', JSON.stringify(s)); localStorage.setItem('puntoax-sesion-compartida', '1') }, sesion)
  await page.goto(ruta)
}
async function sinDesborde(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}
test.beforeAll(async () => {
  pool = new Pool()
  await mkdir(dir, { recursive: true })
  const hash = await bcrypt.hash(password, 4)
  async function cuenta(tipo) {
    const correo = `regresion-${randomUUID()}@puntoax.online`
    const [tabla, email, id] = tipo === 'usuario' ? ['usuarios', 'correo', 'id_usuario'] : tipo === 'clinica' ? ['clinicas', 'correo_acceso', 'id_clinica'] : ['administradores', 'correo', 'id_administrador']
    const verificado = tipo === 'administrador' ? '' : ',correo_verificado_en'
    const valores = tipo === 'administrador' ? '' : ',now()'
    const cuentaId = (await pool.query(`INSERT INTO ${tabla}(nombre,${email},password_hash${verificado}) VALUES('Cuenta sintética',$1,$2${valores}) RETURNING ${id}`, [correo, hash])).rows[0][id]
    const login = await llamada(`/api/auth/login-${tipo === 'administrador' ? 'admin' : tipo}`, null, { correo, password })
    expect(login.status).toBe(200)
    return { id: cuentaId, tipo, token: login.body.token, cuenta: login.body[tipo === 'administrador' ? 'admin' : tipo], iniciada_en: Date.now(), politica: login.body.sesion_politica }
  }
  paciente = await cuenta('usuario'); borrador = await cuenta('clinica'); centro = await cuenta('clinica'); admin = await cuenta('administrador')
  centroId = centro.id
  centro.cuenta.nombre = `Centro regresión ${randomUUID().slice(0, 8)}`
  const datos = { tipo_institucion: 'privada', descripcion: 'Centro sintético sin atención real.', municipio_clave: '20067', telefono: '+529511234567', correo_contacto: 'sintetico@puntoax.online', direccion: 'Calle sintética 1', codigo_postal: '68000', latitud: 17.06, longitud: -96.72, servicios: [{ categoria: 'its', detalle: 'Detalle ITS de regresión' }, { categoria: 'ile', detalle: 'Detalle ILE de regresión' }], horarios: Array.from({ length: 7 }, (_, dia_semana) => ({ dia_semana, apertura: '08:00', cierre: '18:00' })) }
  for (const sesion of [borrador, centro]) expect((await llamada('/api/clinicas/mi-ficha', sesion, datos, 'PUT')).status).toBe(200)
  expect((await llamada('/api/clinicas/mi-ficha', centro, { nombre: centro.cuenta.nombre }, 'PUT')).status).toBe(200)
  expect((await llamada('/api/clinicas/mi-ficha', centro, {
    direccion: 'Dirección sintética de longitud extendida para comprobar saltos de línea. '.repeat(4),
    correo_contacto: `${'contacto'.repeat(8)}@${'institucion'.repeat(8)}.example.org`,
  }, 'PUT')).status).toBe(200)
  const form = new FormData()
  form.append('documentos', new Blob(['%PDF-1.4\n', 'x'.repeat(1200000), '\n%%EOF'], { type: 'application/pdf' }), 'respaldo-sintetico.pdf')
  const carga = await fetch(api + '/api/clinicas/mi-ficha/documentos', { method: 'POST', headers: { Authorization: `Bearer ${centro.token}` }, body: form })
  expect(carga.status).toBe(201)
  const solicitud = await llamada('/api/clinicas/mi-ficha/postulacion', centro, {})
  expect(solicitud.status).toBe(201)
  expect((await llamada(`/api/admin/solicitudes/${solicitud.body.solicitud.id_solicitud}`, admin, { decision: 'aprobar' }, 'PATCH')).status).toBe(200)
})
test.afterAll(async () => { await pool?.end() })

test('H02: recargar y volver a guardar conserva ambas áreas y detalles', async ({ page }) => {
  await abrir(page, borrador, '/mi-clinica')
  for (const nombre of [/Detección de ITS/, /Interrupción Legal/]) await expect(page.getByRole('checkbox', { name: nombre })).toBeChecked()
  const guardada = page.waitForResponse((r) => r.url().endsWith('/api/clinicas/mi-ficha') && r.request().method() === 'PUT')
  await page.getByRole('button', { name: 'Guardar borrador', exact: true }).click()
  expect((await guardada).status()).toBe(200)
  await page.reload()
  for (const nombre of [/Detección de ITS/, /Interrupción Legal/]) await expect(page.getByRole('checkbox', { name: nombre })).toBeChecked()
  const servicios = (await pool.query('SELECT s.categoria,cs.detalle_servicio FROM clinicas_servicios cs JOIN servicios s USING(id_servicio) WHERE cs.id_clinica=$1 AND cs.activo ORDER BY s.categoria', [borrador.id])).rows
  expect(servicios.map((s) => s.categoria)).toEqual(['ILE', 'ITS'])
  expect(servicios.every((s) => s.detalle_servicio.includes('regresión'))).toBe(true)
})
for (const ancho of [320, 390, 768, 1440]) {
  test(`H11/H12/H26: panel e información sin desborde ${ancho}`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 })
    await abrir(page, centro, '/mi-clinica')
    await expect(page.locator('.panel-clinica-card').first()).toBeVisible()
    await sinDesborde(page)
    await page.screenshot({ path: `${dir}/panel-${ancho}.png`, fullPage: true })
    await page.goto('/informacion-util')
    const tabs = page.getByRole('tab')
    for (let i = 0; i < await tabs.count(); i++) {
      await tabs.nth(i).click()
      await sinDesborde(page)
    }
    await page.screenshot({ path: `${dir}/informacion-${ancho}.png`, fullPage: true })
  })
}
test('H06/H07/H19: ficha usa horarios/detalles persistidos y marcadores con nombre', async ({ page }) => {
  await abrir(page, paciente, `/mapa?centro=${centroId}`)
  await expect(page.getByRole('heading', { name: centro.cuenta.nombre, level: 1 })).toBeVisible()
  await expect(page.getByText('Detalle ITS de regresión', { exact: true })).toBeVisible()
  await expect(page.getByText(/08:00.*18:00/).first()).toBeVisible()
  await expect(page.getByText(/Requisitos: No registrados/).first()).toBeVisible()
  await page.getByRole('button', { name: 'Volver al mapa', exact: true }).click()
  const marcadores = page.locator('.leaflet-marker-icon[role="button"]')
  await expect(marcadores.first()).toBeVisible()
  for (const marker of await marcadores.all()) await expect(marker).toHaveAccessibleName(/\S/)
  if (process.env.PUNTOAX_AXE_PATH) {
    await page.addScriptTag({ path: process.env.PUNTOAX_AXE_PATH })
    const axe = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['aria-command-name'] })).violations)
    expect(axe).toEqual([])
  }
})
test('H29: foco inicial, Tab, Escape y devolución al disparador de salida', async ({ page }) => {
  await abrir(page, paciente, '/inicio')
  const salir = page.getByRole('button', { name: /Salir/ }).first()
  await salir.click()
  const dialogo = page.getByRole('dialog', { name: '¿Estás seguro de que quieres salir?' })
  await expect(dialogo).toBeVisible()
  expect(await dialogo.evaluate((el) => el.contains(document.activeElement))).toBe(true)
  for (let i = 0; i < 5; i++) { await page.keyboard.press('Tab'); expect(await dialogo.evaluate((el) => el.contains(document.activeElement))).toBe(true) }
  await page.keyboard.press('Escape')
  await expect(dialogo).toBeHidden()
  await expect(salir).toBeFocused()
})
test('H07: reserva y cancelación completas por navegador, sin inventar requisitos', async ({ page }) => {
  const cs = (await pool.query("SELECT cs.id_clinica_servicio FROM clinicas_servicios cs JOIN servicios s USING(id_servicio) WHERE cs.id_clinica=$1 AND s.categoria='ITS' AND cs.activo", [centroId])).rows[0].id_clinica_servicio
  const fecha = (await pool.query("SELECT ((now() AT TIME ZONE 'America/Mexico_City')::date+3)::text fecha")).rows[0].fecha
  const cupo = await llamada('/api/clinicas/mi-agenda/espacios', centro, { id_clinica_servicio: cs, fecha, hora: '16:00' })
  expect(cupo.status).toBe(201)
  await abrir(page, paciente, '/agendar-cita')
  await page.getByRole('button', { name: 'Centro o unidad de salud', exact: true }).click()
  await page.getByRole('option', { name: new RegExp(centro.cuenta.nombre) }).click()
  await page.locator('#agendar-nombres').fill('Paciente')
  await page.locator('#agendar-apellidos').fill('Sintético')
  await page.locator('#agendar-telefono').fill('+529511234567')
  await page.getByRole('button', { name: 'Elegir fecha y hora', exact: true }).click()
  await page.getByRole('radio').filter({ hasText: '16:00' }).click()
  await page.getByRole('button', { name: 'Revisar y confirmar', exact: true }).click()
  await expect(page.getByText(/Requisitos no registrados para este servicio/).first()).toBeVisible()
  await expect(page.locator('main')).not.toContainText('Sin ayuno')
  await page.getByRole('button', { name: 'Confirmar cita', exact: true }).click()
  const dialogo = page.getByRole('dialog').last()
  expect(await dialogo.evaluate((el) => el.contains(document.activeElement))).toBe(true)
  const respuesta = page.waitForResponse((r) => r.url().endsWith('/api/citas') && r.request().method() === 'POST')
  await page.getByRole('button', { name: 'Sí, confirmar cita', exact: true }).click()
  expect((await respuesta).status()).toBe(201)
  await expect(page.getByText('Cita solicitada / confirmada', { exact: true })).toBeVisible()
  await page.screenshot({ path: `${dir}/cita-sin-requisitos-inventados.png`, fullPage: true })
  await page.goto('/mis-citas')
  await page.getByRole('button', { name: /Ver detalles/ }).first().click()
  await page.getByRole('button', { name: 'Cancelar cita', exact: true }).first().click()
  const cancelada = page.waitForResponse((r) => r.url().includes('/cancelar') && r.request().method() === 'PATCH')
  await page.getByRole('button', { name: /Sí, cancelar/ }).click()
  expect((await cancelada).status()).toBe(200)
  expect((await pool.query("SELECT count(*)::int n FROM citas WHERE id_espacio=$1 AND estado<>'cancelada'", [cupo.body.id_espacio])).rows[0].n).toBe(0)
})
test('H13: fallo controlado del asistente ofrece mapa sin bloquear navegación', async ({ page }) => {
  await page.route('**/api/asistente/consultar', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Proveedor sintético no disponible.' }) }))
  await abrir(page, paciente, '/inicio')
  await page.getByRole('button', { name: 'Abrir asistente virtual de PuntOax', exact: true }).click()
  await page.getByRole('textbox', { name: 'Escribe tu pregunta para el asistente' }).fill('Centros ITS en Oaxaca')
  await page.getByRole('button', { name: 'Enviar', exact: true }).click()
  const alternativa = page.getByRole('link', { name: 'Continuar al mapa de centros', exact: true })
  await expect(alternativa).toBeVisible()
  await alternativa.click()
  await expect(page).toHaveURL(/\/mapa$/)
})
test('H14/H19: alta administrativa redirige y contraste administrativo', async ({ page }) => {
  await abrir(page, admin, '/admin/clinicas/nueva')
  await expect(page).toHaveURL(/\/admin\/clinicas$/)
  await expect(page.getByRole('link', { name: 'Registrar clínica' })).toHaveCount(0)
  if (process.env.PUNTOAX_AXE_PATH) {
    await page.addScriptTag({ path: process.env.PUNTOAX_AXE_PATH })
    const axe = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['color-contrast'] })).violations.map((v) => ({ id: v.id, nodos: v.nodes.map((n) => n.target) })))
    expect(axe).toEqual([])
  }
})
test('H15/H16: tipos/límites y parser devuelven JSON 400; contrato de acceso 401', async () => {
  for (const nombre of [{}, 123, 'A'.repeat(61), '<script>']) expect((await llamada('/api/auth/perfil', paciente, { nombre }, 'PATCH')).status).toBe(400)
  expect((await llamada('/api/auth/perfil', paciente, { nombre: 'María José' }, 'PATCH')).status).toBe(200)
  expect((await llamada(`/api/clinicas/${centroId}/espacios?desde=2026-02-30`, paciente)).status).toBe(400)
  const r = await fetch(api + '/api/auth/login-usuario', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' })
  expect(r.status).toBe(400); expect(r.headers.get('content-type')).toContain('application/json')
  expect((await r.json()).error).toBeTruthy()
  for (const ruta of ['/api/clinicas', `/api/clinicas/${centroId}`, '/api/clinicas/cercanas?lat=17&lng=-96']) expect((await llamada(ruta)).status).toBe(401)
  const salud = await llamada('/api/ready'); expect(salud.status).toBe(200); expect(salud.body.database).toBe('ok')
  // Leer el archivo mock está permitido solo para este entorno sintético.
  expect(process.env.PUNTOAX_MOCK_MAIL_FILE).toBeTruthy()
  await readFile(process.env.PUNTOAX_MOCK_MAIL_FILE, 'utf8')
})
