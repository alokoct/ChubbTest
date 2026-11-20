import { describe, expect, it } from 'vitest';
import { step1Schema, step2Schema } from './claim-schemas';

/**
 * The wizard validates on the client and the Claims Service (Claim.java) validates
 * again. Where the two disagree, the user passes every client check and then hits a
 * server rejection on the final step. These specs encode the server rules so the
 * client can't drift from them.
 *
 * Server rules (claims-service/.../domain/claim/Claim.java):
 *   description.trim()      10..1000 chars
 *   incidentLocation.trim()  5..200  chars
 *   0 < claimAmount <= 1,000,000
 */

const MIN_DESCRIPTION = 10;
const MIN_LOCATION = 5;
const PADDING = ' '.repeat(20);
const VALID_STEP1 = { incidentDate: new Date('2026-11-01'), incidentLocation: 'Orchard Road', claimAmount: 500 };

const padded = (text: string) => `${PADDING}${text}${PADDING}`;

describe('claim wizard validation matches the Claims Service rules', () => {
  it('accepts a description of exactly the minimum length', () => {
    expect(step2Schema.safeParse({ description: 'x'.repeat(MIN_DESCRIPTION) }).success).toBe(true);
  });

  it('rejects a description that only reaches the minimum length because of surrounding spaces', () => {
    const tooShortOnceTrimmed = padded('x'.repeat(MIN_DESCRIPTION - 1));

    expect(step2Schema.safeParse({ description: tooShortOnceTrimmed }).success).toBe(false);
  });

  it('rejects a whitespace-only description', () => {
    expect(step2Schema.safeParse({ description: ' '.repeat(MIN_DESCRIPTION * 3) }).success).toBe(false);
  });

  it('rejects a location that only reaches the minimum length because of surrounding spaces', () => {
    const location = padded('x'.repeat(MIN_LOCATION - 1));

    expect(step1Schema.safeParse({ ...VALID_STEP1, incidentLocation: location }).success).toBe(false);
  });

  it('accepts the maximum claim amount and rejects one cent more', () => {
    expect(step1Schema.safeParse({ ...VALID_STEP1, claimAmount: 1_000_000 }).success).toBe(true);
    expect(step1Schema.safeParse({ ...VALID_STEP1, claimAmount: 1_000_000.01 }).success).toBe(false);
  });
});