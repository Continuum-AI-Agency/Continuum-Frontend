import { afterEach, describe, expect, it } from 'bun:test';
import { type AccountCandidate, accountCandidateSchema } from '@continuum/contracts';
import { cleanup, screen } from '@testing-library/react';
import { render } from '@/i18n/__tests__/render';
import { GoogleDeliveryStatus } from './GoogleDeliveryStatus';

// The status block the Google tab leads with when Google shows no ad in the whole account
// (PP-DT-B-suspended-account-buried-as-low-card). It reads the tab's own cards; with no
// account-wide delivery card it renders nothing at all.

afterEach(cleanup);

const g12 = (over: Record<string, unknown> = {}): AccountCandidate =>
  accountCandidateSchema.parse({
    id: 'platform_signal:de541e8e',
    detector: 'delivery_collapse',
    portfolio_ids: ['b9cebbcf-2832-440a-b326-3af20c19be37'],
    impact_per_day: 0,
    impact_class: 'deferred',
    impact_basis: 'This account has 2 campaigns that should be serving…',
    evidence: { rule: 'G12', severity: 'high' },
    result_label: 'results',
    cta: {
      kind: 'portfolio',
      target_id: 'b9cebbcf-2832-440a-b326-3af20c19be37',
    },
    platform_card: {
      variant: 'google_delivery_issue',
      campaign_name: 'Search | Octubre | Easy Fit',
      reasons: ['SERVING_STATUS_SUSPENDED', 'BUDGET_CONSTRAINED'],
      dark_days: 5,
      dark_since: '2026-10-26',
      currency: 'MXN',
      budget_per_day: 670,
      disapproved_ads: 0,
      account_wide: true,
      ...over,
    },
  });

describe('GoogleDeliveryStatus', () => {
  it('says the account is suspended, since when, and where to fix it', () => {
    render(<GoogleDeliveryStatus cards={[g12()]} />);
    const status = screen.getByTestId('google-delivery-status');
    expect(status.getAttribute('role')).toBe('status');
    expect(status.getAttribute('data-tone')).toBe('suspended');
    expect(status.textContent).toContain('Google suspended this account’s campaigns');
    expect(status.textContent).toContain('No ad shown since Oct 26 (5 days)');
    const link = screen.getByRole('link', { name: /open in google ads/i });
    expect(link.getAttribute('href')).toBe('https://ads.google.com/aw/campaigns');
  });

  it('renders nothing while the account serves', () => {
    const { container } = render(<GoogleDeliveryStatus cards={[g12({ account_wide: false })]} />);
    expect(container.textContent).toBe('');
  });
});
