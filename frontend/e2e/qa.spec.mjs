import { test, expect } from '@playwright/test'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'

const require = createRequire(import.meta.url)
const { Pool } = require('../../backend/node_modules/pg')
const bcrypt = require('../../backend/node_modules/bcryptjs')
if (process.env.PUNTOAX_TEST_DB !== '1' || !process.env.PGDATABASE?.startsWith('puntoax_s4_test') ||
    !['127.0.0.1', 'localhost'].includes(process.env.PGHOST) ||
    ['5432', '55441'].includes(process.env.PGPORT)) throw new Error('Solo BD local aislada de QA.')
const api = 'http://127.0.0.1:3107'
const capturas = process.env.PUNTOAX_QA_CAPTURAS || '/tmp/puntoax-qa-browser/capturas'
let pool
let clinica
let paciente
let cita
let clinicaId
const password = 'QA-Navegador123!'

async function crearSesion(tipo, cuenta) {
  const r = await fetch(`${api}/api/auth/login-${tipo}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ correo: cuenta, password }),
  })
  expect(r.status).toBe(200)
  const body = await r.json()
  return { tipo, cuenta: body[tipo], token: body.token, iniciada_en: Date.now(), politica: body.sesion_politica }
}
async function abrir(page, sesion, ruta) {
  await page.addInitScript((s) => {
    if (!localStorage.getItem('puntoax-sesion')) localStorage.setItem('puntoax-sesion', JSON.stringify(s))
    localStorage.setItem('puntoax-sesion-compartida', '1')
  }, sesion)
  await page.goto(ruta)
}
async function sinDesborde(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}
test.beforeAll(async () => {
  pool = new Pool()
  await mkdir(capturas, { recursive: true })
  const hash = await bcrypt.hash(password, 4)
  const email = () => `navegador-${randomUUID()}@puntoax.online`
  const correoClinica = email()
  const correoPaciente = email()
  clinicaId = (await pool.query(`INSERT INTO clinicas(nombre,correo_acceso,password_hash,correo_verificado_en)
    VALUES('Centro de captura académica',$1,$2,now()) RETURNING id_clinica`, [correoClinica, hash])).rows[0].id_clinica
  const usuario = (await pool.query(`INSERT INTO usuarios(nombre,apellidos,correo,password_hash,correo_verificado_en,telefono)
    VALUES('Paciente','Controlado',$1,$2,now(),'+529511234567') RETURNING id_usuario`, [correoPaciente, hash])).rows[0].id_usuario
  const sede = (await pool.query(`INSERT INTO clinicas(nombre,municipio_clave,estado_publicacion)
    VALUES('Centro QA público','20067','aprobada') RETURNING id_clinica`)).rows[0].id_clinica
  const servicio = (await pool.query(`INSERT INTO servicios(nombre,categoria) VALUES($1,'its') RETURNING id_servicio`,
    [`Consulta controlada ${randomUUID()}`])).rows[0].id_servicio
  const cs = (await pool.query('INSERT INTO clinicas_servicios(id_clinica,id_servicio) VALUES($1,$2) RETURNING id_clinica_servicio',
    [sede, servicio])).rows[0].id_clinica_servicio
  const espacio = (await pool.query(`INSERT INTO espacios_disponibles(id_clinica_servicio,fecha_hora_inicio)
    VALUES($1,now()+interval '8 days') RETURNING id_espacio`, [cs])).rows[0].id_espacio
  cita = (await pool.query('INSERT INTO citas(id_usuario,id_espacio) VALUES($1,$2) RETURNING id_cita', [usuario, espacio])).rows[0].id_cita
  clinica = await crearSesion('clinica', correoClinica)
  paciente = await crearSesion('usuario', correoPaciente)
})
test.afterAll(async () => { await pool?.end() })

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`municipios: teclado, búsqueda, selección, guardado y móvil ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await abrir(page, clinica, '/mi-clinica')
    const selector = page.getByRole('button', { name: 'Municipio de Oaxaca', exact: true })
    await selector.focus()
    await selector.press('ArrowDown')
    const buscar = page.getByRole('combobox', { name: 'Buscar municipio (sin acentos)' })
    const opciones = page.getByRole('listbox', { name: 'Municipio de Oaxaca' }).getByRole('option')
    await expect(buscar).toBeFocused()
    await expect(opciones).toHaveCount(570)
    await buscar.fill('JUAREZ')
    await expect(page.getByRole('option', { name: 'Oaxaca de Juárez', exact: true })).toHaveCount(1)
    await page.screenshot({ path: `${capturas}/municipios-busqueda-${viewport.width}.png` })
    await buscar.fill('OAXACA DE JUAREZ')
    await expect(opciones).toHaveCount(1)
    await buscar.press('Enter')
    await expect(selector).toContainText('Oaxaca de Juárez')
    await selector.click()
    await buscar.fill('San Juan Mixtepec')
    await expect(opciones).toHaveCount(2)
    await page.getByRole('option', { name: 'San Juan Mixtepec · INEGI 20209', exact: true }).click()
    await expect(selector).toContainText('20209')
    let guardadoHomonimo = page.waitForResponse((r) => r.url().endsWith('/api/clinicas/mi-ficha') && r.request().method() === 'PUT')
    await page.getByRole('button', { name: 'Guardar borrador', exact: true }).click()
    expect((await guardadoHomonimo).status()).toBe(200)
    expect((await pool.query('SELECT municipio_clave FROM clinicas WHERE id_clinica=$1', [clinicaId])).rows[0].municipio_clave).toBe('20209')
    await selector.click()
    await buscar.fill('OAXACA DE JUAREZ')
    await buscar.press('Enter')
    await selector.click()
    await buscar.fill('Municipio inventado')
    await expect(opciones).toHaveCount(0)
    await buscar.press('Enter')
    await buscar.press('Escape')
    await expect(selector).toContainText('Oaxaca de Juárez')
    // Selección por toque/clic además del teclado.
    await selector.click()
    await buscar.fill('Abejones')
    await page.getByRole('option', { name: 'Abejones', exact: true }).click()
    await expect(selector).toContainText('Abejones')
    await page.getByLabel('Teléfono de México (+52) *', { exact: true }).fill('+52 (951) 123-4567')
    const guardado = page.waitForResponse((r) => r.url().endsWith('/api/clinicas/mi-ficha') && r.request().method() === 'PUT')
    await page.getByRole('button', { name: 'Guardar borrador', exact: true }).click()
    expect((await guardado).status()).toBe(200)
    const almacenada = (await pool.query('SELECT municipio_clave,municipio,telefono FROM clinicas WHERE id_clinica=$1', [clinicaId])).rows[0]
    expect(almacenada).toEqual({ municipio_clave: '20001', municipio: 'Abejones', telefono: '+529511234567' })
    await sinDesborde(page)
  })
}

test('inicio, notificaciones y perfil: contacto internacional se autocompleta sin truncarlo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await abrir(page, paciente, '/inicio')
  await expect(page.getByRole('navigation', { name: 'Accesos rápidos' }).getByRole('link', { name: 'Mis citas' })).toBeVisible()
  const recordatorio = page.getByRole('region', { name: 'Recordatorio de próxima cita' })
  await expect(recordatorio).toBeVisible()
  await expect(recordatorio).not.toContainText('Consulta controlada')
  await expect(recordatorio).not.toContainText('+529511234567')
  await page.getByRole('button', { name: /^Notificaciones/ }).click()
  await expect(page.getByRole('dialog', { name: 'Recordatorios de citas próximas' })).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar notificaciones' }).click()
  await page.screenshot({ path: `${capturas}/inicio-movil.png` })
  await sinDesborde(page)
  await page.goto('/mi-perfil')
  const telefono = page.locator('#perfil-telefono')
  await expect(telefono).toHaveValue('+529511234567')
  await telefono.fill('1234567890')
  await page.getByRole('button', { name: /Guardar/ }).first().click()
  await expect(page.getByText(/Ingresa un teléfono mexicano válido/)).toBeVisible()
  await telefono.fill('+52 (55) 1234-5678')
  const guardado = page.waitForResponse((r) => r.url().endsWith('/api/auth/perfil') && r.request().method() === 'PATCH')
  await page.getByRole('button', { name: /Guardar/ }).first().click()
  expect((await guardado).status()).toBe(200)
  await page.goto('/agendar-cita')
  await expect(page.locator('#agendar-telefono')).toHaveValue('+525512345678')
  await expect(page.locator('#agendar-telefono')).toHaveAttribute('inputmode', 'tel')
  await sinDesborde(page)
  await page.screenshot({ path: `${capturas}/telefono-agendamiento-movil.png` })
  // Se conserva la cita previa y el teléfono del paciente no se publica en mapa.
  expect((await pool.query('SELECT estado FROM citas WHERE id_cita=$1', [cita])).rows[0].estado).toBe('confirmada')
})
