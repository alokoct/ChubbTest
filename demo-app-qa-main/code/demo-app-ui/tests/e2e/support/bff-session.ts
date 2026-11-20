import { expect, request, type APIRequestContext, type APIResponse } from '@playwright/test';
import { faker } from '@faker-js/faker';
import { environment } from './environment';
import type { ClaimInput, ClaimStatus, ClaimView } from './claim-data';

export interface Credentials {
  email: string;
  password: string;
}

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: 'CLAIMANT' | 'ADMIN';
}

export interface DashboardStats {
  totalClaims: number;
  claimsByStatus: Partial<Record<ClaimStatus, number>>;
  cacheHit: boolean;
}

/**
 * One logged-in user talking to the BFF over HTTP, with its own cookie jar (access
 * token + CSRF). Methods return the raw APIResponse so specs can assert on status
 * codes; `json*` helpers assert success and parse the body.
 */
export class BffSession {
  private constructor(
    private readonly api: APIRequestContext,
    private readonly csrfToken: string,
    readonly user: AuthenticatedUser,
    readonly credentials: Credentials
  ) {}

  static async login(credentials: Credentials): Promise<BffSession> {
    const api = await request.newContext({ baseURL: environment.bffUrl });
    const loginResponse = await api.post('/api/auth/login', { data: credentials });
    await expectSuccess(loginResponse, `login as ${credentials.email}`);
    const user = (await loginResponse.json()) as AuthenticatedUser;

    const csrfResponse = await api.get('/api/auth/csrf');
    await expectSuccess(csrfResponse, 'fetch CSRF token');
    const { token } = (await csrfResponse.json()) as { token: string };

    return new BffSession(api, token, user, credentials);
  }

  /** Registers a brand-new claimant so each test owns its data and parallel runs never collide. */
  static async signUpClaimant(): Promise<BffSession> {
    const credentials = {
      email: `e2e.${Date.now()}.${faker.string.alphanumeric(6).toLowerCase()}@example.com`,
      password: environment.newUserPassword,
    };
    const api = await request.newContext({ baseURL: environment.bffUrl });
    const signup = await api.post('/api/auth/signup', {
      data: { ...credentials, name: faker.person.fullName() },
    });
    await expectSuccess(signup, `sign up ${credentials.email}`);
    await api.dispose();
    return BffSession.login(credentials);
  }

  // ---- Claimant operations -------------------------------------------------

  submitClaim(input: ClaimInput): Promise<APIResponse> {
    return this.api.post('/api/claims', { data: input, headers: this.csrfHeaders() });
  }

  async submitClaimOk(input: ClaimInput): Promise<ClaimView> {
    return parseSuccess<ClaimView>(await this.submitClaim(input), 'submit claim');
  }

  listMyClaims(): Promise<APIResponse> {
    return this.api.get('/api/claims');
  }

  async listMyClaimsOk(): Promise<ClaimView[]> {
    return parseSuccess<ClaimView[]>(await this.listMyClaims(), 'list own claims');
  }

  getClaim(claimId: string): Promise<APIResponse> {
    return this.api.get(`/api/claims/${claimId}`);
  }

  // ---- Admin operations ----------------------------------------------------

  updateClaimStatus(claimId: string, newStatus: ClaimStatus): Promise<APIResponse> {
    return this.api.patch(`/api/admin/claims/${claimId}/status`, {
      data: { newStatus },
      headers: this.csrfHeaders(),
    });
  }

  async updateClaimStatusOk(claimId: string, newStatus: ClaimStatus): Promise<ClaimView> {
    return parseSuccess<ClaimView>(
      await this.updateClaimStatus(claimId, newStatus),
      `move claim ${claimId} to ${newStatus}`
    );
  }

  listAllClaims(): Promise<APIResponse> {
    return this.api.get('/api/admin/claims');
  }

  async listAllClaimsOk(): Promise<ClaimView[]> {
    return parseSuccess<ClaimView[]>(await this.listAllClaims(), 'list all claims');
  }

  dashboardStats(): Promise<APIResponse> {
    return this.api.get('/api/admin/dashboard/stats');
  }

  async dashboardStatsOk(): Promise<DashboardStats> {
    return parseSuccess<DashboardStats>(await this.dashboardStats(), 'read dashboard stats');
  }

  dispose(): Promise<void> {
    return this.api.dispose();
  }

  private csrfHeaders() {
    return { 'X-XSRF-TOKEN': this.csrfToken };
  }
}

async function expectSuccess(response: APIResponse, action: string): Promise<void> {
  expect(response.ok(), `${action} failed: HTTP ${response.status()} ${await response.text()}`).toBe(true);
}

async function parseSuccess<T>(response: APIResponse, action: string): Promise<T> {
  await expectSuccess(response, action);
  return (await response.json()) as T;
}