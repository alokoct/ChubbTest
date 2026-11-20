import { test as base, expect } from '@playwright/test';
import { BffSession } from './bff-session';
import { environment } from './environment';

interface E2eFixtures {
  /** Seeded administrator, logged in over the API. */
  admin: BffSession;
  /** Creates a fresh claimant per call; all are disposed after the test. */
  newClaimant: () => Promise<BffSession>;
}

export const test = base.extend<E2eFixtures>({
  admin: async ({}, use) => {
    const session = await BffSession.login(environment.admin);
    await use(session);
    await session.dispose();
  },

  newClaimant: async ({}, use) => {
    const sessions: BffSession[] = [];
    await use(async () => {
      const session = await BffSession.signUpClaimant();
      sessions.push(session);
      return session;
    });
    await Promise.all(sessions.map((session) => session.dispose()));
  },
});

export { expect };