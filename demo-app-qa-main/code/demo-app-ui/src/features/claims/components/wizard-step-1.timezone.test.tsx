import { render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { WizardStep1 } from './wizard-step-1';
import { useClaimWizardStore } from '../stores/use-claim-wizard-store';

/**
 * Risk: Chubb APAC users are all ahead of UTC. The incident-date picker's `max`
 * must be the user's *local* today, otherwise early-morning users cannot report
 * an incident that happened today (the browser greys the date out).
 *
 * Each case pins the clock to an early-morning local time where the UTC calendar
 * date is still "yesterday".
 */

vi.mock('../stores/use-claim-wizard-store', () => ({ useClaimWizardStore: vi.fn() }));

interface ApacMorning {
  readonly city: string;
  readonly timeZone: string;
  readonly instant: string; // ISO instant with local offset
  readonly localToday: string; // yyyy-mm-dd as seen on the user's wall calendar
}

const APAC_EARLY_MORNINGS: readonly ApacMorning[] = [
  { city: 'Sydney', timeZone: 'Australia/Sydney', instant: '2026-11-20T08:30:00+11:00', localToday: '2026-11-20' },
  { city: 'Singapore', timeZone: 'Asia/Singapore', instant: '2026-11-20T06:15:00+08:00', localToday: '2026-11-20' },
  { city: 'Tokyo', timeZone: 'Asia/Tokyo', instant: '2026-11-20T07:00:00+09:00', localToday: '2026-11-20' },
  { city: 'Mumbai', timeZone: 'Asia/Kolkata', instant: '2026-11-20T05:00:00+05:30', localToday: '2026-11-20' },
];

const INCIDENT_DATE_LABEL = /When did the incident occur\?/i;
const originalTimeZone = process.env.TZ;

function stubWizardStore() {
  vi.mocked(useClaimWizardStore).mockReturnValue({
    formData: {},
    fieldErrors: {},
    updateFormData: vi.fn(),
    nextStep: vi.fn(),
    step: 1,
    isSubmitting: false,
    error: null,
    setStep: vi.fn(),
    previousStep: vi.fn(),
    submitClaim: vi.fn(),
    resetWizard: vi.fn(),
  });
}

describe('WizardStep1 incident date picker in APAC time zones', () => {
  beforeAll(stubWizardStore);

  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = originalTimeZone;
  });

  afterAll(() => {
    process.env.TZ = originalTimeZone;
  });

  it.each(APAC_EARLY_MORNINGS)(
    "lets a user in $city select today's local date ($localToday) as the incident date",
    ({ timeZone, instant, localToday }) => {
      process.env.TZ = timeZone;
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(instant));

      render(<WizardStep1 />);

      expect(screen.getByLabelText(INCIDENT_DATE_LABEL)).toHaveAttribute('max', localToday);
    }
  );
});