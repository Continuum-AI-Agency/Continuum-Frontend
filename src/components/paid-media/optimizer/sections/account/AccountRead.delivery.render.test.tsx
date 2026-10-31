import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, render, screen, within } from '@testing-library/react';

// PP-DT-B-suspended-account-buried-as-low-card: on Easy Fit's Google tab (2026-10-31) the one
// fact that mattered — Google showed no ad in the whole account for five days — rendered as
// "Google · Lead · Low · Delivery" near the bottom, under "$0.00 MXN/mo · results". A card with
// no money on it takes the engine's severity, an account that shows no ad leads the list, and
// nothing prints a priced zero.

mock.module('motion/react', () => {
  const React = require('react');
  const passthrough = (tag: string) =>
    React.forwardRef((props: Record<string, unknown>, ref: unknown) => {
      const { variants: _v, initial: _i, animate: _a, ...rest } = props;
      return React.createElement(tag, { ...rest, ref });
    });
  return {
    motion: { section: passthrough('section'), span: passthrough('span'), div: passthrough('div') },
    useReducedMotion: () => false,
  };
});
const realOptimizerData = await import('../../useOptimizerData');
mock.module('../../useOptimizerData', () => ({
  ...realOptimizerData,
  useApplyOptimizerActions: () => ({ mutateAsync: async () => null }),
  useRevertOptimizerAction: () => ({ mutateAsync: async () => null, isPending: false }),
}));

import { type AccountCandidate, accountCandidateSchema } from '@continuum/contracts';
import { GOOGLE_BUDGET_LIMITED } from '../platformCards/__fixtures__/platformCards';
import { AccountRead } from './AccountRead';

afterEach(cleanup);

const PORTFOLIO = 'b9cebbcf-2832-440a-b326-3af20c19be37';

const card = (over: Record<string, unknown>): AccountCandidate =>
  accountCandidateSchema.parse({
    portfolio_ids: [PORTFOLIO],
    impact_class: 'deferred',
    result_label: 'results',
    cta: { kind: 'portfolio', target_id: PORTFOLIO },
    ...over,
  });

/** The G12 account card exactly as optimizer_get_platform_cards served it on 10-31. */
const accountDark = card({
  id: 'platform_signal:de541e8e-3c38-4cf0-b211-091e205ef0bf',
  detector: 'delivery_collapse',
  impact_per_day: 0,
  impact_basis:
    'This account has 2 campaigns that should be serving, with $670 MXN/day of budget, and none showed an ad in the last 5 days.',
  evidence: { rule: 'G12', severity: 'high' },
  platform_card: {
    variant: 'google_delivery_issue',
    campaign_name: 'Search | Octubre | Easy Fit',
    reasons: ['SERVING_STATUS_SUSPENDED', 'BUDGET_CONSTRAINED'],
    dark_days: 5,
    currency: 'MXN',
    budget_per_day: 670,
    disapproved_ads: 0,
    account_wide: true,
  },
});

/** A priced Google card that ranks above a zero-money card on money alone. */
const budgetCard = card({
  id: 'platform_signal:g03',
  detector: 'scale_readiness',
  impact_per_day: 80,
  impact_class: 'better_price',
  impact_basis: 'PMax loses 81% of impressions to budget.',
  evidence: { rule: 'G03', severity: 'medium' },
  platform_card: GOOGLE_BUDGET_LIMITED,
});

function cards() {
  render(
    <AccountRead
      candidates={[budgetCard, accountDark]}
      currency="MXN"
      dailySpend={670}
      platform="google_ads"
      portfolioNames={new Map([[PORTFOLIO, 'Leads // Google Ads only']])}
    />,
  );
  return screen.getAllByTestId('account-card');
}

describe('a suspended Google account on the Google tab’s cards', () => {
  it('leads the list, ahead of a card priced in money', () => {
    const [first] = cards();
    expect(first?.getAttribute('data-variant')).toBe('google_delivery_issue');
  });

  it('reads High — the engine’s severity — not Low from a zero it never priced', () => {
    const delivery = cards().find(
      (el) => el.getAttribute('data-variant') === 'google_delivery_issue',
    );
    if (!delivery) throw new Error('no delivery card');
    expect(within(delivery).getByText('High').getAttribute('data-tier')).toBe('high');
    expect(delivery.textContent).not.toContain('/mo');
    expect(delivery.textContent).not.toContain('$0.00');
  });

  it('quotes Google in words, not enum codes', () => {
    const delivery = cards().find(
      (el) => el.getAttribute('data-variant') === 'google_delivery_issue',
    );
    expect(delivery?.textContent).toContain('Google says: suspended; limited by budget');
    expect(delivery?.textContent).not.toContain('serving status');
  });
});
