import { defineConfig, devices } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 4018;
// One fresh database per run.
const dataDir = process.env.E2E_DATA_DIR ?? mkdtempSync(join(tmpdir(), 'anotado-e2e-'));
process.env.E2E_DATA_DIR = dataDir;

export default defineConfig({
  testDir: './tests',
  // All tests share one server, so run them one at a time.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
  ],
  webServer: {
    command: 'node --disable-warning=ExperimentalWarning ../server/src/index.ts',
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    env: {
      PORT: String(PORT),
      ANOTADO_PASSWORD: 'segredo',
      DATA_DIR: dataDir,
      WEB_DIR: '../web/dist',
      BACKUP_KEEP: '30',
    },
  },
});
