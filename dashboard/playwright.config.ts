import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html'], ['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60000,
    env: {
      BASTION_API_KEY: process.env.BASTION_API_KEY || 'change-me-local-dev-only',
      // Mock mode keeps tests hermetic. Real DB queries still work via the
      // Connect DB modal (dynamic x-bastion-conn header bypasses mock in db.ts).
      // For tests against real data: start server manually with BASTION_MOCK=false
      // then run `npx playwright test --reuse-existing-server`.
      BASTION_MOCK: 'true',
    },
  },
})
