/**
 * Single source of truth for where the Docker Compose stack lives and which seeded
 * accounts exist (see repository README "Test Users"). Override via env vars to run
 * against another environment.
 */
export const environment = {
  uiUrl: process.env.E2E_UI_URL ?? 'http://localhost:3001',
  bffUrl: process.env.E2E_BFF_URL ?? 'http://localhost:8090',
  admin: {
    email: process.env.E2E_ADMIN_EMAIL ?? 'admin@demo.com',
    password: process.env.E2E_ADMIN_PASSWORD ?? 'Admin123!',
  },
  newUserPassword: process.env.E2E_NEW_USER_PASSWORD ?? 'Claimant123!',
} as const;