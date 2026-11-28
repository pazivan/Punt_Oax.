import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

// Doble del SDK externo para probar la UI sin solicitar datos personales a Google.
// Firma, audiencia, emisor y nonce se ejecutan realmente en las suites backend.
const gis = `
window.google = { accounts: { id: {
  initialize(config) { window.gisConfig = config; },
  renderButton(el, config) {
    const button = document.createElement('button');
    button.textContent = config.text === 'signup_with' ? 'Registrarse con Google' : 'Iniciar sesión con Google';
    button.style.width = config.width + 'px';
    button.onclick = () => config.click_listener();
    el.appendChild(button);
  }
} } };
`
const paciente = { id: '12345678-1234-4123-8123-123456789012', nombre: 'Paciente', correo: 'google@puntoax.online', rol: 'usuario' }
async function preparar(page, { vincular = false, falloSdk = false } = {}) {
  await page.route('https://accounts.google.com/gsi/client', (route) =>
    falloSdk ? route.abort() : route.fulfill({ contentType: 'application/javascript', body: gis }))
  await page.route('**/api/auth/google/desafio', (r) => r.fulfill({ json: { desafio: 'd', nonce: 'n', csrf: 'c' } }))
  await page.route('**/api/auth/google', (r) => r.fulfill(vincular ? {
    status: 409, json: { codigo: 'GOOGLE_VINCULACION_REQUERIDA', vinculacion: 'v', correo: paciente.correo, error: 'Confirma tu contraseña original.' },
  } : { json: { token: 'jwt-puntoax', usuario: paciente } }))
  await page.route('**/api/auth/google/vincular', (r) => r.fulfill({ json: { token: 'jwt-puntoax', usuario: paciente } }))
  await page.route('**/api/auth/perfil', (r) => r.fulfill({ json: { usuarioAutenticado: { ...paciente, id: paciente.id } } }))
  await page.route('**/api/citas', (r) => r.fulfill({ json: { citas: [] } }))
}
async function responderGoogle(page) {
  await page.evaluate(() => window.gisConfig.callback({ credential: 'id-token-google-solo-en-memoria' }))
}

for (const width of [320, 390, 1280]) {
  test(`registro, login y cancelación conservan formularios y ancho móvil ${width}`, async ({ page }) => {
    await preparar(page)
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/registro')
    const google = page.getByRole('button', { name: 'Registrarse con Google', exact: true })
    await expect(google).toBeVisible()
    expect(await google.evaluate((button) => button.getBoundingClientRect().width <= button.parentElement.getBoundingClientRect().width)).toBe(true)
    await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await mkdir('/tmp/puntoax-qa-google/capturas', { recursive: true })
    await page.screenshot({ path: `/tmp/puntoax-qa-google/capturas/registro-google-${width}.png`, fullPage: true })
    await google.click()
    await expect(page.getByRole('status').filter({ hasText: 'Completa el acceso' })).toBeVisible()
    await page.getByRole('button', { name: 'Cancelar acceso con Google' }).click()
    await expect(page.getByRole('alert')).toContainText('Cancelaste')
    await responderGoogle(page) // Un callback tardío tras cancelar no crea sesión.
    expect(await page.evaluate(() => localStorage.getItem('puntoax-sesion'))).toBeNull()
    await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeEnabled()
    await page.goto('/login')
    await expect(page.getByRole('button', { name: 'Iniciar sesión con Google', exact: true })).toBeVisible()
    await page.screenshot({ path: `/tmp/puntoax-qa-google/capturas/login-google-${width}.png`, fullPage: true })
    await page.getByRole('tab', { name: 'Soy clínica' }).click()
    await expect(page.getByRole('button', { name: 'Iniciar sesión con Google', exact: true })).toHaveCount(0)
    await page.getByRole('tab', { name: 'Administrador' }).click()
    await expect(page.getByRole('button', { name: 'Iniciar sesión con Google', exact: true })).toHaveCount(0)
  })
}

test('login Google guarda solo JWT PuntOax y registro Google inicia una sesión de paciente', async ({ page }) => {
  await preparar(page)
  for (const ruta of ['/login', '/registro']) {
    await page.goto(ruta)
    await page.getByRole('button', { name: ruta === '/login' ? 'Iniciar sesión con Google' : 'Registrarse con Google', exact: true }).click()
    await responderGoogle(page)
    await expect(page).toHaveURL(/\/inicio$/)
    const sesion = await page.evaluate(() => JSON.parse(localStorage.getItem('puntoax-sesion')))
    expect(sesion.tipo).toBe('usuario')
    expect(sesion.token).toBe('jwt-puntoax')
    expect(JSON.stringify(sesion)).not.toContain('id-token-google')
    await page.evaluate(() => localStorage.clear())
  }
})

test('vinculación: exige consentimiento y contraseña y envía el desafío correcto', async ({ page }) => {
  await preparar(page, { vincular: true })
  await page.goto('/login')
  await page.getByRole('button', { name: 'Iniciar sesión con Google', exact: true }).click()
  await responderGoogle(page)
  await expect(page.getByText('Cuenta original:', { exact: false })).toBeVisible()
  const boton = page.getByRole('button', { name: 'Autenticar y vincular Google' })
  await expect(boton).toBeDisabled()
  await page.getByLabel('Contraseña de tu cuenta PuntOax').fill('Original-Segura9!')
  await expect(boton).toBeDisabled()
  await page.getByLabel('Quiero vincular Google').check()
  const request = page.waitForRequest('**/api/auth/google/vincular')
  await boton.click()
  expect((await request).postDataJSON()).toEqual({ vinculacion: 'v', csrf: 'c', password: 'Original-Segura9!', confirmar: true })
  await expect(page).toHaveURL(/\/inicio$/)
})

test('si falla Google, muestra error en español y el formulario tradicional sigue disponible', async ({ page }) => {
  await preparar(page, { falloSdk: true })
  await page.goto('/login')
  await expect(page.getByRole('alert')).toContainText('No se pudo cargar Google')
  await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Iniciar sesión', exact: true })).toBeEnabled()
})

test('un error al guardar la sesión no deja el formulario bloqueado', async ({ page }) => {
  await preparar(page)
  await page.addInitScript(() => {
    const guardar = Storage.prototype.setItem
    Storage.prototype.setItem = function (clave, valor) {
      if (clave === 'puntoax-sesion') throw new DOMException('Sin almacenamiento', 'QuotaExceededError')
      return guardar.call(this, clave, valor)
    }
  })
  await page.goto('/login')
  await page.getByRole('button', { name: 'Iniciar sesión con Google', exact: true }).click()
  await responderGoogle(page)
  await expect(page.getByRole('alert')).toContainText('No se pudo guardar la sesión')
  await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Reintentar con Google' })).toBeVisible()
})
