import { test, expect } from '../support/fixtures';
import { aClaimInput } from '../support/claim-data';

/**
 * Admin-driven claim lifecycle through the full stack (BFF -> Claims Service ->
 * Postgres/Redis). These are the decisions that drive payouts.
 */
test.describe('claim lifecycle', () => {
  test('an admin can take a claim from submission to closure along the happy path', async ({ admin, newClaimant }) => {
    const claimant = await newClaimant();
    const claim = await claimant.submitClaimOk(aClaimInput());

    await admin.updateClaimStatusOk(claim.claimId, 'UNDER_REVIEW');
    await admin.updateClaimStatusOk(claim.claimId, 'APPROVED');
    const closed = await admin.updateClaimStatusOk(claim.claimId, 'CLOSED');

    expect(closed.status).toBe('CLOSED');
    const asSeenByClaimant = await claimant.listMyClaimsOk();
    expect(asSeenByClaimant.find((c) => c.claimId === claim.claimId)?.status).toBe('CLOSED');
  });

  test('a forbidden transition is refused as a client error with a reason', async ({ admin, newClaimant }) => {
    const claimant = await newClaimant();
    const claim = await claimant.submitClaimOk(aClaimInput());

    const response = await admin.updateClaimStatus(claim.claimId, 'APPROVED'); // SUBMITTED -> APPROVED skips review

    expect(response.status(), await response.text()).toBe(400);
    expect((await response.json()).detail).toMatch(/SUBMITTED.*APPROVED/);
  });

  test('two admins deciding the same claim at once cannot both win', async ({ admin, newClaimant }) => {
    const claimant = await newClaimant();
    const claim = await claimant.submitClaimOk(aClaimInput());
    await admin.updateClaimStatusOk(claim.claimId, 'UNDER_REVIEW');

    const [approve, reject] = await Promise.all([
      admin.updateClaimStatus(claim.claimId, 'APPROVED'),
      admin.updateClaimStatus(claim.claimId, 'REJECTED'),
    ]);

    const successes = [approve, reject].filter((response) => response.ok());
    expect(successes, 'exactly one decision may be accepted; the other must be refused').toHaveLength(1);
  });

  test('the admin claim list shows the newest claim first', async ({ admin, newClaimant }) => {
    const claimant = await newClaimant();
    const older = await claimant.submitClaimOk(aClaimInput());
    const newer = await claimant.submitClaimOk(aClaimInput());

    const ids = (await admin.listAllClaimsOk()).map((claim) => claim.claimId);

    expect(ids.indexOf(newer.claimId)).toBeLessThan(ids.indexOf(older.claimId));
  });

  test('the admin dashboard counts a claim as soon as it is submitted', async ({ admin, newClaimant }) => {
    const before = await admin.dashboardStatsOk(); // primes the 300s Redis cache
    const claimant = await newClaimant();
    await claimant.submitClaimOk(aClaimInput());

    const after = await admin.dashboardStatsOk();

    expect(after.totalClaims, `cacheHit=${after.cacheHit}`).toBeGreaterThan(before.totalClaims);
  });
});
