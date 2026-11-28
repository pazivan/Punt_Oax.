import { test, expect } from '@playwright/test'

test.use({ baseURL: 'http://127.0.0.1:5189' })

test('Google sin configurar: no hay SDK ni desafíos y los formularios tradicionales siguen disponibles', async ({ page }) => {
  const google = []
  page.on('request', (r) => {
    if (r.url().startsWith('https://accounts.google.com/') || r.url().includes('/api/auth/google')) google.push(r.url())
  })
  await page.goto('/login')
  await expect(page.getByRole('button', { name: 'Iniciar sesión', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Iniciar sesión con Google', exact: true })).toHaveCount(0)
  await page.getByLabel('Correo electrónico', { exact: true }).fill('local@example.com')
  await expect(page.getByLabel('Contraseña', { exact: true })).toBeEnabled()
  await page.goto('/registro')
  await expect(page.getByLabel('Correo electrónico', { exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Crear cuenta', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Registrarse con Google', exact: true })).toHaveCount(0)
  expect(google).toEqual([])
})
