import { defineConfig } from '@playwright/test';
import { environment } from './tests/e2e/support/environment';

/**
 * API-level integration tests against the running Docker Compose stack
 * (./start-infra.sh && ./start-app.sh). They exercise BFF -> Claims Service ->
 * Postgres/Redis with real Keycloak tokens.
 *
 *   npx playwright test
 */
export default defineConfig({
  testDir: './tests/e2e/api',
forbidOnly: !!process.env.CI,
  retries: 0, // a retry would hide the defects these tests exist to expose
  // Serial on purpose: parallel logins as the same seeded admin intermittently get
  // HTTP 401 from the BFF (see TEST_STRATEGY.md). Run in parallel only to investigate that.
  workers: 1,
  timeout: 30_000,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'playwright-report/results.xml' }],
  ],
  use: {
    baseURL: environment.bffUrl,
    trace: 'retain-on-failure',
  },
  globalSetup: './tests/e2e/global-setup.ts',
});