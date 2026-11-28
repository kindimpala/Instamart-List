import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 3100);
const chromePath = process.env.CHROME_PATH;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions: chromePath ? { executablePath: chromePath } : {},
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile-375', use: { ...devices['Desktop Chrome'], viewport: { width: 375, height: 812 } } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } }, grep: /@layout|@desktop/ },
  ],
  webServer: {
    command: 'tsx server/express.ts',
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    env: {
      PORT: String(PORT),
      SWIGGY_MODE: 'stub',
      ANTHROPIC_API_KEY: '',
      DATA_FILE: '.data/e2e-store.json',
      STUB_FLAGS: '',
      LOG_LEVEL: 'silent',
      RATE_LIMIT_MULTIPLIER: '20',
    },
  },
});
