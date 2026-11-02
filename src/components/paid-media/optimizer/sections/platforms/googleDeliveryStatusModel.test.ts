import { describe, expect, it } from 'bun:test';
import { type AccountCandidate, accountCandidateSchema } from '@continuum/contracts';
import { googleReasonInWords } from '../platformCards/platformCardModel';
import { googleDeliveryStatusOf } from './googleDeliveryStatusModel';

// PP-DT-B-suspended-account-buried-as-low-card + -dark-account-window-frozen-on-last-delivering-
// week (Ramiro's small-defaults decision, 2026-10-31): a Google account that is suspended or not
// delivering LEADS the Google tab with its status in plain words and the day it stopped — never
// a "Low" card at the bottom reading "Google says: SERVING_STATUS_SUSPENDED" and "$0.00 MXN/mo".

/** A G12 card as optimizer_get_platform_cards serves it (detector delivery_collapse, no money). */
function g12(card: Record<string, unknown>, id = 'platform_signal:de541e8e'): AccountCandidate {
  return accountCandidateSchema.parse({
    id,
    detector: 'delivery_collapse',
    portfolio_ids: ['b9cebbcf-2832-440a-b326-3af20c19be37'],
    impact_per_day: 0,
    impact_class: 'deferred',
    impact_basis: 'This account has 2 campaigns that should be serving…',
    evidence: { rule: 'G12', severity: 'high' },
    result_label: 'results',
    cta: { kind: 'portfolio', target_id: 'b9cebbcf-2832-440a-b326-3af20c19be37' },
    platform_card: {
      variant: 'google_delivery_issue',
      campaign_name: 'Search | Octubre | Easy Fit',
      reasons: ['SERVING_STATUS_SUSPENDED', 'BUDGET_CONSTRAINED'],
      dark_days: 5,
      currency: 'MXN',
      budget_per_day: 670,
      disapproved_ads: 0,
      account_wide: true,
      ...card,
    },
  });
}

describe('the Google tab leads with the account’s delivery status', () => {
  it('Easy Fit 2026 on 10-31: suspended by Google, no ad since Oct 26', () => {
    const status = googleDeliveryStatusOf([g12({ dark_since: '2026-10-26' })]);
    expect(status?.tone).toBe('suspended');
    expect(status?.title).toBe('Google suspended this account’s campaigns');
    expect(status?.detail).toContain('No ad shown since Oct 26 (5 days)');
    expect(status?.detail).toContain('$670 MXN/day of budget');
    expect(status?.detail).not.toMatch(/SERVING_STATUS|_/);
    expect(status?.href).toBe('https://ads.google.com/aw/campaigns');
  });

  it('dark for another reason Google names: not delivering, with the date and the reason', () => {
    const status = googleDeliveryStatusOf([
      g12({
        reasons: ['HAS_ADS_DISAPPROVED'],
        disapproved_ads: 3,
        dark_days: 6,
        dark_since: '2026-10-25',
      }),
    ]);
    expect(status?.tone).toBe('not_delivering');
    expect(status?.title).toBe('Google is not showing this account’s ads');
    expect(status?.detail).toContain('No ad shown since Oct 25 (6 days)');
    expect(status?.detail).toContain('ads disapproved by policy');
    expect(status?.href).toBe('https://ads.google.com/aw/policymanager');
  });

  it('a card written before the date existed says how long, never a guessed day', () => {
    const status = googleDeliveryStatusOf([g12({})]);
    expect(status?.detail).toContain('No ad shown for 5 days');
    expect(status?.detail).not.toContain('since');
  });

  it('a single dark campaign is that campaign’s card, not the account’s status', () => {
    expect(googleDeliveryStatusOf([g12({ account_wide: false })])).toBeNull();
    expect(googleDeliveryStatusOf([])).toBeNull();
  });

  it('serving status codes read as words', () => {
    expect(googleReasonInWords('SERVING_STATUS_SUSPENDED')).toBe('suspended');
    expect(googleReasonInWords('SERVING_STATUS_ENDED')).toBe('its end date has passed');
    expect(googleReasonInWords('SERVING_STATUS_PENDING')).toBe('not started yet');
  });
});
