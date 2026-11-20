import { faker } from '@faker-js/faker';

export type ClaimStatus = 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'CLOSED';

export interface ClaimInput {
  incidentDate: string; // yyyy-mm-dd
  incidentLocation: string;
  description: string;
  claimAmount: number;
}

export interface ClaimView {
  claimId: string;
  userId: string;
  status: ClaimStatus;
  description: string;
  createdAt: string;
}

const DAYS_BEFORE_TODAY = 3; // keeps clear of the UTC/local "today" defect (BUG-04)

function isoDateDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

/**
 * Valid claim satisfying every server rule; descriptions carry a unique marker so a
 * test can find "its" claim among other parallel tests' data.
 */
export function aClaimInput(overrides: Partial<ClaimInput> = {}): ClaimInput {
  return {
    incidentDate: isoDateDaysAgo(DAYS_BEFORE_TODAY),
    incidentLocation: `${faker.location.streetAddress()}, Singapore`,
    description: `E2E ${faker.string.alphanumeric(10)} - ${faker.lorem.sentence({ min: 6, max: 10 })}`,
    claimAmount: faker.number.int({ min: 100, max: 25_000 }),
    ...overrides,
  };
}