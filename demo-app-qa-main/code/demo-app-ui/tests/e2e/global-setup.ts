import { request } from '@playwright/test';
import { environment } from './support/environment';

/**
 * Fails fast with an actionable message when the Docker Compose stack is not up,
 * instead of every spec timing out individually. (playwright.config.ts already
 * referenced this file but it was missing from the repository.)
 */
const HEALTH_CHECKS = [
  { name: 'BFF', url: `${environment.bffUrl}/actuator/health` },
  { name: 'UI', url: environment.uiUrl },
];

export default async function globalSetup(): Promise<void> {
  const api = await request.newContext();
  try {
    for (const { name, url } of HEALTH_CHECKS) {
      const response = await api.get(url, { timeout: 10_000 }).catch(() => null);
      if (!response?.ok()) {
        throw new Error(
          `${name} is not reachable at ${url}. Start the stack first: ./start-infra.sh && ./start-app.sh`
        );
      }
    }
  } finally {
    await api.dispose();
  }
}