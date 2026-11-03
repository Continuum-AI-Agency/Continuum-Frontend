import { describe, expect, it } from 'bun:test';

import type { PaidAccountOverview } from '@continuum/contracts';
import pinkGoogle from './__fixtures__/pink-google-account-overview.json';
import {
  deltaPercent,
  googleOverviewForHome,
  objectiveFigure,
  resultTotalsAcross,
  sumOverviews,
  totalsByCurrency,
} from './homeOverviewModel';

const tours = { id: 'tours', label: 'Tours booked', metric: 'purchases', role: 'primary' } as const;
const chats = {
  id: 'conversations',
  label: 'Conversations started',
  metric: 'conversations',
  role: 'secondary',
} as const;

const easyFit: PaidAccountOverview = {
  metrics: { spend: 23400, roas: 0, ctr: 1.2, purchases: 73, conversations: 525, leads: 40 },
  comparison: {
    spend: { current: 23400, previous: 20000, percentageChange: 17 },
    purchases: { current: 73, previous: 50, percentageChange: 46 },
    conversations: { current: 525, previous: 600, percentageChange: -12.5 },
  },
  trends: [
    { date: '2026-10-02', spend: 3000, purchases: 10, conversations: 70 },
    { date: '2026-10-01', spend: 3500, purchases: 12, conversations: 80 },
  ],
};

const olderEdge: PaidAccountOverview = {
  metrics: { spend: 1000, roas: 2, ctr: 1, purchases: 5, purchase_value: 2000 },
  comparison: {
    spend: { current: 1000, previous: 800, percentageChange: 25 },
    roas: { current: 2, previous: 1.5, percentageChange: 33 },
    purchases: { current: 5, previous: 4, percentageChange: 25 },
  },
};

describe('sumOverviews', () => {
  it('keeps a metric the edge never counted missing instead of zero', () => {
    const totals = sumOverviews([olderEdge]);
    expect(totals.current.conversations).toBeUndefined();
    expect(totals.current.purchase_value).toBe(2000);
    expect(totals.previous.purchase_value).toBe(1200);
  });

  it('adds accounts together and orders the daily series by date', () => {
    const totals = sumOverviews([easyFit, olderEdge]);
    expect(totals.current.purchases).toBe(78);
    expect(totals.current.spend).toBe(24400);
    expect(totals.series.purchases).toEqual([12, 10]);
    expect(totals.accountCount).toBe(2);
  });

  it('drops the previous total when one account has no comparison for it', () => {
    const totals = sumOverviews([easyFit, olderEdge]);
    expect(totals.previous.conversations).toBeUndefined();
    expect(totals.previous.purchases).toBe(54);
  });
});

describe('objectiveFigure', () => {
  it("prints Easy Fit's tours with their cost and change", () => {
    const figure = objectiveFigure(tours, sumOverviews([easyFit]));
    expect(figure.available).toBe(true);
    expect(figure.value).toBe(73);
    expect(figure.deltaPct).toBeCloseTo(46, 0);
    expect(figure.cost?.label).toBe('Cost per purchase');
    expect(figure.cost?.value).toBeCloseTo(23400 / 73, 5);
    expect(figure.cost?.previous).toBeCloseTo(20000 / 50, 5);
  });

  it('marks an objective unavailable when its count is missing', () => {
    const figure = objectiveFigure(chats, sumOverviews([olderEdge]));
    expect(figure.available).toBe(false);
    expect(figure.value).toBeNull();
    expect(figure.cost).toBeNull();
  });

  it('reads revenue against spend as ROAS', () => {
    const revenue = {
      id: 'r',
      label: 'Revenue',
      metric: 'purchase_value',
      role: 'primary',
    } as const;
    const figure = objectiveFigure(revenue, sumOverviews([olderEdge]));
    expect(figure.cost).toEqual({ label: 'ROAS', value: 2, previous: 1.5, kind: 'ratio' });
  });
});

describe('helpers', () => {
  it('has no change against a zero or missing baseline', () => {
    expect(deltaPercent(5, 0)).toBeNull();
    expect(deltaPercent(5, null)).toBeNull();
    expect(deltaPercent(15, 10)).toBe(50);
  });
});

// PP-DT-E-home-no-meta-account-error: the paid modules read Meta accounts only. A brand with none
// (Pink Elephant, Tangassi — Google-only) is told to connect one; it never reads as a failed
// load or as a week in which its campaigns brought nothing.
// PP-DT-E-home-google-results-absent (deep test 2026-10-31, lane E): the Home read Meta accounts
// only, so Pink Elephant — Google-only, ≈3,100 MXN a week — was told "Connect a Meta ad account".
// Google counts ONE business result per read (its `resultBucket`) as `conversions`, so the Home
// reads each Google account twice, once per result it counts, and puts both in its own words.
describe('a Google account in the Home’s words', () => {
  const pink = pinkGoogle as unknown as {
    leads: PaidAccountOverview;
    purchases: PaidAccountOverview;
  };

  it('counts the leads read as leads and the purchases read as purchases, each with its week before', () => {
    const totals = sumOverviews([googleOverviewForHome(pink)]);
    expect(totals.current.leads).toBe(2);
    // The week before, from the read's own cost per result: 3,700.2649 MXN at 616.7108 a lead.
    expect(totals.previous.leads).toBeCloseTo(6, 4);
    expect(totals.current.purchases).toBe(0);
    expect(totals.previous.purchases).toBeCloseTo(1, 4);
    expect(totals.series.leads).toEqual([0, 0, 0, 2, 0, 0, 0]);
  });

  it('reads spend, clicks and impressions as they are, with the week before', () => {
    const totals = sumOverviews([googleOverviewForHome(pink)]);
    expect(totals.current.spend).toBeCloseTo(3099.5863, 4);
    expect(totals.previous.spend).toBeCloseTo(3700.2649, 4);
    expect(totals.current.clicks).toBe(244);
    expect(totals.current.impressions).toBe(7007);
    expect(totals.series.spend).toHaveLength(7);
  });

  it('values purchases from the purchases read only', () => {
    const totals = sumOverviews([googleOverviewForHome(pink)]);
    expect(totals.current.purchase_value).toBe(0);
    // ROAS 0.1993 on 3,700.2649 MXN the week before.
    expect(totals.previous.purchase_value).toBeCloseTo(0.1993 * 3700.2649, 4);
  });

  it('reports no conversations: a Google account takes no part in them, sum or comparison', () => {
    const google = googleOverviewForHome(pink);
    expect(sumOverviews([google]).current.conversations).toBeUndefined();
    const mixed = sumOverviews([easyFit, google]);
    expect(mixed.current.conversations).toBe(525);
    expect(mixed.previous.conversations).toBe(600);
    expect(mixed.current.leads).toBe(42);
  });

  it('counts no result from a read with no single one, and no result from a missing read', () => {
    const ambiguous: PaidAccountOverview = {
      ...pink.leads,
      result_basis: { rule: 'google_conversion_rule_v1', bucket: null, unambiguous: false },
      trends: pink.leads.trends?.map((day) => ({ ...day, conversions: null, cpa: null })),
    };
    const totals = sumOverviews([googleOverviewForHome({ leads: ambiguous, purchases: null })]);
    expect(totals.current.leads).toBeUndefined();
    expect(totals.current.purchases).toBeUndefined();
    expect(totals.current.spend).toBeCloseTo(3099.5863, 4);
  });
});

describe('money by currency', () => {
  const usd: PaidAccountOverview = { ...olderEdge, currency: 'USD' };

  it('never adds money across currencies', () => {
    const groups = totalsByCurrency([
      { currency: 'MXN', overview: easyFit },
      { currency: 'USD', overview: usd },
    ]);
    expect(groups.map((group) => group.currency)).toEqual(['MXN', 'USD']);
    expect(groups[0]?.totals.current.spend).toBe(23400);
    expect(groups[1]?.totals.current.spend).toBe(1000);
  });

  it('adds the accounts of one currency together', () => {
    const groups = totalsByCurrency([
      { currency: 'MXN', overview: easyFit },
      { currency: 'MXN', overview: olderEdge },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.totals.current.spend).toBe(24400);
    expect(groups[0]?.totals.accountCount).toBe(2);
  });

  it('leads with the currency most accounts report in', () => {
    const groups = totalsByCurrency([
      { currency: 'USD', overview: usd },
      { currency: 'MXN', overview: easyFit },
      { currency: 'MXN', overview: olderEdge },
    ]);
    expect(groups.map((group) => group.currency)).toEqual(['MXN', 'USD']);
  });

  // Easy Fit (deep test 2026-10-31, lane K): one live MXN account and a Google customer beside six
  // read-only USD accounts that spent nothing. A currency with more accounts but no spend never
  // leads; it is the MXN money the Home should open on.
  it('never leads with a currency whose accounts spent nothing in either week', () => {
    const idle: PaidAccountOverview = {
      currency: 'USD',
      metrics: { spend: 0, roas: 0, ctr: 0, purchases: 0 },
      comparison: { spend: { current: 0, previous: 0 } },
    };
    const groups = totalsByCurrency([
      { currency: 'USD', overview: idle },
      { currency: 'USD', overview: idle },
      { currency: 'USD', overview: idle },
      { currency: 'MXN', overview: easyFit },
      { currency: 'MXN', overview: { ...idle, currency: 'MXN' } },
    ]);
    expect(groups.map((group) => [group.currency, group.spending])).toEqual([
      ['MXN', 1],
      ['USD', 0],
    ]);
  });

  it('counts results across currencies for the goal, and takes money from the lead currency only', () => {
    const groups = totalsByCurrency([
      { currency: 'MXN', overview: easyFit },
      { currency: 'USD', overview: usd },
    ]);
    const results = resultTotalsAcross(groups);
    expect(results.purchases).toBe(78);
    expect(results.purchase_value).toBeUndefined();
    expect(results.spend).toBe(23400);
  });
});
