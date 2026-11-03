import { describe, expect, it } from 'bun:test';

import { paidAccountOverviewSchema } from './account-overview';

// PP-DT-E-home-google-results-absent (deep test 2026-10-31): the Home reads `account_overview` from
// two producers now, Meta and Google. One envelope parses both, so the Frontend never casts one
// platform's answer into the other's shape.

/** The deployed edge's real answer for Pink Elephant's Google Ads customer (6619636193), counting
 *  leads over 2026-10-24..10-30, recorded 2026-10-31. Only the trends are cut to two days. */
const googleLeads = {
  scope: 'account_overview',
  currency: 'MXN',
  metrics: {
    spend: 3099.5863,
    roas: 0,
    impressions: 7007,
    clicks: 244,
    ctr: 3.4822,
    cpc: 12.7032,
    cpa: 1549.7931,
    gaSessions: 0,
    gaConversions: 0,
  },
  result_basis: { rule: 'google_conversion_rule_v1', bucket: 'leads', unambiguous: true },
  comparison: {
    spend: { current: 3099.5863, previous: 3700.2649, percentageChange: -16.2334 },
    cpa: { current: 1549.7931, previous: 616.7108, percentageChange: 151.2998 },
  },
  trends: [
    {
      date: '2026-10-26',
      spend: 235.537645,
      clicks: 26,
      impressions: 768,
      conversions: 0,
      roas: 0,
      cpa: 0,
    },
    {
      date: '2026-10-27',
      spend: 945.511086,
      clicks: 74,
      impressions: 1795,
      conversions: 2,
      roas: 0,
      cpa: 472.7555,
    },
  ],
  range: { since: '2026-10-24', until: '2026-10-30', preset: 'custom' },
};

/** The same read with no single business result: Google nulls every count and CPA. */
const googleAmbiguous = {
  ...googleLeads,
  metrics: { ...googleLeads.metrics, cpa: null },
  result_basis: { rule: 'google_conversion_rule_v1', bucket: null, unambiguous: false },
  comparison: { ...googleLeads.comparison, cpa: null },
  trends: googleLeads.trends.map((day) => ({ ...day, conversions: null, cpa: null })),
};

const meta = {
  currency: 'MXN',
  timezone: 'America/Mexico_City',
  metrics: { spend: 23400, roas: 0, ctr: 1.2, purchases: 73, conversations: 525, leads: 40 },
  comparison: { purchases: { current: 73, previous: 50, percentageChange: 46 } },
  trends: [{ date: '2026-10-27', spend: 3000, purchases: 10, conversations: 70 }],
};

describe('paidAccountOverviewSchema', () => {
  it('parses a Google read with the result it counted', () => {
    const parsed = paidAccountOverviewSchema.parse(googleLeads);
    expect(parsed.result_basis).toEqual({
      rule: 'google_conversion_rule_v1',
      bucket: 'leads',
      unambiguous: true,
    });
    expect(parsed.trends?.map((day) => day.conversions)).toEqual([0, 2]);
    expect(parsed.metrics.cpa).toBe(1549.7931);
  });

  it('parses a Google read with no single result: its nulls stay nulls, never zeros', () => {
    const parsed = paidAccountOverviewSchema.parse(googleAmbiguous);
    expect(parsed.metrics.cpa).toBeNull();
    expect(parsed.comparison?.cpa).toBeNull();
    expect(parsed.trends?.every((day) => day.conversions === null)).toBe(true);
  });

  it('parses a Meta read, whose results carry their own names', () => {
    const parsed = paidAccountOverviewSchema.parse(meta);
    expect(parsed.metrics.purchases).toBe(73);
    expect(parsed.metrics.conversations).toBe(525);
    expect(parsed.result_basis).toBeUndefined();
  });

  it('refuses a read without the headline money', () => {
    expect(paidAccountOverviewSchema.safeParse({ metrics: { roas: 0, ctr: 1 } }).success).toBe(
      false,
    );
  });
});
