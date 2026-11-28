import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: ['google-auth.spec.mjs', 'google-disabled.spec.mjs'],
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5188',
    launchOptions: { executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] },
  },
  outputDir: '/tmp/puntoax-qa-google/browser',
  webServer: [{
    command: 'npm run dev -- --host 127.0.0.1 --port 5188 --strictPort',
    url: 'http://127.0.0.1:5188',
    env: { VITE_GOOGLE_CLIENT_ID: 'puntoax-test.apps.googleusercontent.com' },
    reuseExistingServer: false,
  }, {
    command: 'npm run dev -- --host 127.0.0.1 --port 5189 --strictPort',
    url: 'http://127.0.0.1:5189',
    env: { VITE_GOOGLE_CLIENT_ID: '' },
    reuseExistingServer: false,
  }],
})
