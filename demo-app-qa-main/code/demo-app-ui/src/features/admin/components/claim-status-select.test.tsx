import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import toast from 'react-hot-toast';
import { ClaimStatusSelect } from './claim-status-select';
import { useAdminClaimsStore } from '../stores/use-admin-claims-store';
import { adminDashboardApi, type ClaimStatus } from '@/src/lib/api/bff-client';
import { aClaim, problemDetailError, RAW_CLIENT_ERROR_MESSAGE } from '@/tests/support/api-fakes';

/**
 * Admin status changes are the most consequential action in the app (they decide
 * payouts). The component and store run for real; only the HTTP client is faked.
 */

vi.mock('react-hot-toast', () => {
  const toastFn = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { default: toastFn };
});

vi.mock('@/src/lib/api/bff-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/src/lib/api/bff-client')>();
  return {
    ...actual,
    adminDashboardApi: { updateClaimStatus: vi.fn(), listAllClaims: vi.fn() },
  };
});

const user = userEvent.setup();

function renderSelectFor(status: ClaimStatus) {
  const claim = aClaim({ status });
  useAdminClaimsStore.setState({ claims: [claim], error: null });
  render(<ClaimStatusSelect claimId={claim.claimId} currentStatus={status} />);
  return claim;
}

const statusDropdown = () => screen.getByRole('combobox', { name: /update status for claim/i });
const optionLabels = () =>
  within(statusDropdown())
    .getAllByRole('option')
    .filter((option) => !(option as HTMLOptionElement).disabled)
    .map((option) => option.textContent);

async function chooseStatus(label: string) {
  await user.selectOptions(statusDropdown(), label);
}

const confirmDialog = () => screen.getByRole('dialog');

describe('ClaimStatusSelect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('offers only the transitions the business allows from SUBMITTED', () => {
    renderSelectFor('SUBMITTED');

    expect(optionLabels()).toEqual(['Under Review', 'Rejected']);
  });

  it('offers no status change once a claim is CLOSED', () => {
    renderSelectFor('CLOSED');

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/no status transitions available/i)).toBeInTheDocument();
  });

  it('does not change anything when the admin cancels the confirmation', async () => {
    renderSelectFor('SUBMITTED');

    await chooseStatus('Rejected');
    await user.click(within(confirmDialog()).getByRole('button', { name: 'Cancel' }));

    expect(adminDashboardApi.updateClaimStatus).not.toHaveBeenCalled();
  });

  it('sends the chosen status and confirms success once the admin confirms', async () => {
    const claim = renderSelectFor('SUBMITTED');
    vi.mocked(adminDashboardApi.updateClaimStatus).mockResolvedValue({ ...claim, status: 'UNDER_REVIEW' });

    await chooseStatus('Under Review');
    await user.click(within(confirmDialog()).getByRole('button', { name: 'Confirm' }));

    expect(adminDashboardApi.updateClaimStatus).toHaveBeenCalledWith({
      claimId: claim.claimId,
      updateClaimStatusRequest: { newStatus: 'UNDER_REVIEW' },
    });
    expect(toast.success).toHaveBeenCalledWith('Claim status updated to Under Review');
    expect(useAdminClaimsStore.getState().claims[0].status).toBe('UNDER_REVIEW');
  });

  it("shows the server's reason and rolls back when the transition is rejected", async () => {
    renderSelectFor('UNDER_REVIEW');
    const reason = 'Cannot transition from APPROVED to REJECTED';
    vi.mocked(adminDashboardApi.updateClaimStatus).mockRejectedValue(problemDetailError(400, reason));

    await chooseStatus('Rejected');
    await user.click(within(confirmDialog()).getByRole('button', { name: 'Confirm' }));

    expect(toast.error).toHaveBeenCalledWith(reason);
    expect(useAdminClaimsStore.getState().claims[0].status).toBe('UNDER_REVIEW');
  });

  it('shows a human-readable message, not a client-library error, when the server fails', async () => {
    // Today the backend answers an invalid transition (e.g. a stale screen after another
    // admin already moved the claim) with HTTP 500 - see BUG-01 in TEST_STRATEGY.md.
    renderSelectFor('UNDER_REVIEW');
    vi.mocked(adminDashboardApi.updateClaimStatus).mockRejectedValue(problemDetailError(500));

    await chooseStatus('Approved');
    await user.click(within(confirmDialog()).getByRole('button', { name: 'Confirm' }));

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalledWith(RAW_CLIENT_ERROR_MESSAGE);
  });
});