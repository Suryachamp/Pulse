import { defineConfig, devices } from '@playwright/test';

const API_PORT = 4100;
const WEB_PORT = 5180;
// E2E runs against its own database so it never touches development data.
const DATABASE_URL = process.env.E2E_DATABASE_URL ?? 'postgresql://pulse:pulse@localhost:5432/pulse_e2e';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  timeout: 45_000,
  use: { baseURL: `http://localhost:${WEB_PORT}`, trace: 'off', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }, testIgnore: /mobile/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile/ },
  ],
  webServer: [
    {
      command: `npx prisma migrate deploy && npx tsx src/server.ts`,
      cwd: '../api',
      port: API_PORT,
      reuseExistingServer: false,
      env: { NODE_ENV: 'development', PORT: String(API_PORT), DATABASE_URL, WEB_ORIGIN: `http://localhost:${WEB_PORT}`, LOG_LEVEL: 'warn' },
      timeout: 60_000,
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      port: WEB_PORT,
      reuseExistingServer: false,
      env: { API_URL: `http://localhost:${API_PORT}` },
      timeout: 60_000,
    },
  ],
});
