import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: ['qa.spec.mjs', 'auditoria.spec.mjs'],
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:5177',
    launchOptions: { executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] },
  },
  outputDir: process.env.PUNTOAX_QA_OUTPUT || '/tmp/puntoax-qa-browser',
})
