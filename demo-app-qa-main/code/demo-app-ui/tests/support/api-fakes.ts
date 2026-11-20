import { ResponseError } from '@/src/lib/api/generated/runtime';
import type { ClaimResponse, ClaimStatus } from '@/src/lib/api/bff-client';

/**
 * Builders for API-layer test doubles. Tests mock the generated BFF client at its
 * boundary and use these to describe what the server returned, so components and
 * stores are exercised with their real logic.
 */

const GENERATED_CLIENT_ERROR_MESSAGE = 'Response returned an error code';

export function problemDetailError(status: number, detail?: string): ResponseError {
  const body = detail === undefined ? {} : { status, title: 'Error', detail };
  const response = new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  });
  return new ResponseError(response, GENERATED_CLIENT_ERROR_MESSAGE);
}

export const RAW_CLIENT_ERROR_MESSAGE = GENERATED_CLIENT_ERROR_MESSAGE;

let claimSequence = 0;

export function aClaim(overrides: Partial<ClaimResponse> = {}): ClaimResponse {
  claimSequence += 1;
  const createdAt = new Date('2026-11-01T09:00:00Z');
  return {
    claimId: `c1a10000-0000-4000-8000-${String(claimSequence).padStart(12, '0')}`,
    userId: 'a5e10000-0000-4000-8000-000000000001',
    incidentDate: new Date('2026-10-30'),
    incidentLocation: '1 Raffles Place, Singapore',
    description: 'Rear-ended at a traffic light, bumper damaged',
    claimAmount: 1250,
    status: 'SUBMITTED' as ClaimStatus,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  } as ClaimResponse;
}