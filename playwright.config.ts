import { defineConfig, devices } from '@playwright/test'

import 'dotenv/config'

import { testDatabaseUrl } from './tests/helpers/testDatabase'

const PORT = 3100
const baseURL = `http://localhost:${PORT}`

/**
 * Spine, Tests: Playwright runs its own `next dev` on bookeh_test, beside any
 * dev server on :3000: port 3100, its own `distDir` (Next locks
 * `<distDir>/dev`), migrations applied and push off, the fixture source in
 * place of the real ones, then a seed for the one known user. Not a
 * production server: the fixture source is refused there.
 */
export default defineConfig({
  testDir: './tests/e2e',
  forbidOnly: !!process.env.CI,
  // No retries: the seed runs once per server, so a retry after a save meets that Book.
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chromium' },
    },
  ],
  webServer: {
    // stdin closed, as in CI: a Payload prompt reads EOF instead of hanging.
    command:
      'npm run payload -- migrate </dev/null && npm run payload -- run tests/e2e/seed.ts </dev/null && npm run dev',
    env: {
      DATABASE_URL: testDatabaseUrl(process.env.DATABASE_URL),
      DATABASE_PUSH: 'false',
      BOOKEH_SOURCES: 'fixture',
      PORT: String(PORT),
      NEXT_DIST_DIR: '.next-e2e',
      MEDIA_DIR: 'media-test',
      SEED_EMAIL: '',
      SEED_PASSWORD: '',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    reuseExistingServer: false,
    timeout: 180_000,
    url: `${baseURL}/login`,
  },
})
