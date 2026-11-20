import { test, expect } from '../support/fixtures';
import { aClaimInput } from '../support/claim-data';

/**
 * Data isolation across real Keycloak tokens, BFF and Claims Service. A defect here
 * leaks one policyholder's claim (incident details, amounts) to another.
 */
test.describe('authorization across the BFF and Claims Service', () => {
  test("a claimant cannot read another claimant's claim", async ({ newClaimant }) => {
    const owner = await newClaimant();
    const stranger = await newClaimant();
    const claim = await owner.submitClaimOk(aClaimInput());

    const response = await stranger.getClaim(claim.claimId);

    expect([403, 404]).toContain(response.status());
  });

  test("a claimant's list contains only their own claims", async ({ newClaimant }) => {
    const owner = await newClaimant();
    const other = await newClaimant();
    const ownClaim = await owner.submitClaimOk(aClaimInput());
    const othersClaim = await other.submitClaimOk(aClaimInput());

    const ids = (await owner.listMyClaimsOk()).map((claim) => claim.claimId);

    expect(ids).toContain(ownClaim.claimId);
    expect(ids).not.toContain(othersClaim.claimId);
  });

  test('a claimant cannot list every claim through the admin API', async ({ newClaimant }) => {
    const claimant = await newClaimant();

    expect((await claimant.listAllClaims()).status()).toBe(403);
  });

  test("a claimant cannot change their own claim's status", async ({ newClaimant }) => {
    const claimant = await newClaimant();
    const claim = await claimant.submitClaimOk(aClaimInput());

    expect((await claimant.updateClaimStatus(claim.claimId, 'APPROVED')).status()).toBe(403);
  });
});