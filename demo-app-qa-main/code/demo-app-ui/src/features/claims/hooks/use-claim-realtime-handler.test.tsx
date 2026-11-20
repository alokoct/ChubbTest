import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import toast from 'react-hot-toast';
import { useClaimRealtimeHandler } from './use-claim-realtime-handler';
import { useRealtimeClaimUpdates, type WebSocketMessage } from './use-realtime-claim-updates';
import { useAuthStore, type User } from '@/src/features/auth/stores/use-auth-store';
import { useClaimsStore } from '../stores/use-claims-store';
import { isServedByAppRoute } from '@/tests/support/app-routes';

/**
 * The realtime handler is the last hop of Kafka -> BFF -> WebSocket -> UI. These
 * tests drive it with WebSocket messages exactly as the BFF emits them and check
 * what the user experiences (store state, toast, navigation).
 */

const routerPush = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: routerPush }) }));
vi.mock('react-hot-toast', () => {
  const toastFn = Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() });
  return { default: toastFn };
});
vi.mock('./use-realtime-claim-updates', () => ({ useRealtimeClaimUpdates: vi.fn() }));

const CLAIM_ID = '7f3c2a10-5b4e-4c1d-9a8f-0e6d5c4b3a21';

const CLAIMANT: User = {
  userId: 'a5e10000-0000-4000-8000-000000000001',
  email: 'claimant@demo.com',
  name: 'Casey Claimant',
  role: 'CLAIMANT',
} as User;

function statusChanged(newStatus: string, oldStatus = 'SUBMITTED'): WebSocketMessage {
  return {
    type: 'CLAIM_STATUS_CHANGED',
    claimId: CLAIM_ID,
    newStatus,
    oldStatus,
    timestamp: '2026-11-19T04:00:00Z',
    correlationId: 'corr-1',
  };
}

/** Renders the handler and returns a function that pushes a message through the socket. */
function connectAs(user: User) {
  let deliver: (message: WebSocketMessage) => void = () => {
    throw new Error('WebSocket handler was never registered');
  };
  vi.mocked(useRealtimeClaimUpdates).mockImplementation((onMessage) => {
    deliver = onMessage!;
    return { isConnected: true, connectionState: 'connected', lastMessage: null, connectionError: false };
  });
  useAuthStore.setState({ user, isAuthenticated: true });
  renderHook(() => useClaimRealtimeHandler());
  return (message: WebSocketMessage) => deliver(message);
}

function lastClaimantToastOptions() {
  const call = vi.mocked(toast.success).mock.calls.at(-1);
  if (!call) throw new Error('Expected a success toast to be shown to the claimant');
  return { message: call[0], options: call[1] as { onClick?: () => void } };
}

describe('useClaimRealtimeHandler for a claimant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useClaimsStore.setState({ claims: [] } as never);
  });

  it('tells the claimant their claim moved to the new status', () => {
    const send = connectAs(CLAIMANT);

    send(statusChanged('UNDER_REVIEW'));

    expect(lastClaimantToastOptions().message).toContain('UNDER_REVIEW');
  });

  it('takes the claimant to a page that exists when they click the status toast', () => {
    const send = connectAs(CLAIMANT);
    send(statusChanged('APPROVED', 'UNDER_REVIEW'));

    lastClaimantToastOptions().options.onClick?.();

    expect(routerPush).toHaveBeenCalledTimes(1);
    const destination = routerPush.mock.calls[0][0] as string;
    expect(
      isServedByAppRoute(destination),
      `toast navigates to "${destination}", which no page in app/ serves (404)`
    ).toBe(true);
  });

  it('ignores a status it does not recognise instead of corrupting the claim list', () => {
    const send = connectAs(CLAIMANT);

    send(statusChanged('PAID'));

    expect(toast.success).not.toHaveBeenCalled();
  });
});