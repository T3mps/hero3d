import { defineConfig, devices } from '@playwright/test';

// Browser smoke tests against the built dist/ (run `npm run build` first; `npm run test:browser` does).
export default defineConfig({
  testDir: 'test/browser',
  timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:4317', viewport: { width: 1000, height: 2000 }, deviceScaleFactor: 1 },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1000, height: 2000 }, deviceScaleFactor: 1 } }],
  webServer: { command: 'node test/browser/serve.mjs 4317', url: 'http://127.0.0.1:4317/test/browser/index.html', reuseExistingServer: true }
});
