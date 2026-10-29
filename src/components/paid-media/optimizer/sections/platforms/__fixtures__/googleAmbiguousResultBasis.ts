import recorded from './google-vivo47-paid-media-metrics.json';

// Vivo 47's recorded read, carried through the exact transforms the paid-media-metrics google
// handler (supabase/functions/paid-media-metrics/google/handler.ts) applies when the account's
// conversion goals name no single business result (`result_basis.unambiguous === false`):
// account_overview nulls `metrics.cpa`, `comparison.cpa` and each trend's conversions/cpa;
// top_campaigns nulls each row's conversions, cpa and costPerConversion, and both carry
// `result_basis`, `coverage` and `limitations`. Spend, clicks and impressions are untouched.

const AMBIGUOUS_BASIS = {
  rule: 'google_conversion_rule_v1',
  bucket: null,
  unambiguous: false,
} as const;

const coverage = (since: string, until: string) => ({
  requested: { since, until },
  read: { since, until },
  truncated: false,
  reason: null,
});

const account = recorded.account_overview;
const campaigns = recorded.top_campaigns;

export const ambiguousAccountOverview = {
  ...account,
  currency: 'MXN',
  metrics: { ...account.metrics, cpa: null },
  result_basis: AMBIGUOUS_BASIS,
  limitations: [
    'Current conversion-action metadata is applied to historical windows; historical goal-setting changes are not reconstructed.',
  ],
  coverage: coverage(account.range.since, account.range.until),
  comparison: { ...account.comparison, cpa: null },
  // The recording's trends are empty; the transform stays so the shape is the handler's.
  trends: (account.trends as Record<string, unknown>[]).map((row) => ({
    ...row,
    conversions: null,
    cpa: null,
  })),
};

export const ambiguousTopCampaigns = {
  ...campaigns,
  currency: 'MXN',
  result_basis: AMBIGUOUS_BASIS,
  coverage: coverage(campaigns.range.since, campaigns.range.until),
  limitations: [
    'Current conversion-action metadata is applied to the requested historical window; historical goal-setting changes are not reconstructed.',
  ],
  rows: campaigns.rows.map((row) => ({
    ...row,
    result_basis: AMBIGUOUS_BASIS,
    metrics: { ...row.metrics, conversions: null, cpa: null, costPerConversion: null },
  })),
};

/** The same read from an edge that counts each business result apart (`metrics.byResult`, Ramiro
 *  2026-10-28): Vivo 47's first Search campaign also counts 2 sign-ups (EKATAR's GA4
 *  file_download), so with no portfolio goal there is no single result to count. */
const BY_RESULT: Readonly<Record<string, { leads: number; purchases: number; signups: number }>> = {
  '20775796216': { leads: 26, purchases: 0, signups: 2 },
  '21287529107': { leads: 22, purchases: 0, signups: 0 },
  '19954538151': { leads: 5.5, purchases: 0, signups: 0 },
  '21985307202': { leads: 2.5, purchases: 0, signups: 0 },
  '22364972636': { leads: 0, purchases: 0, signups: 0 },
  '22706302206': { leads: 48, purchases: 0, signups: 0 },
  '22404522468': { leads: 18, purchases: 0, signups: 0 },
};

export const ambiguousTopCampaignsByResult = {
  ...ambiguousTopCampaigns,
  rows: ambiguousTopCampaigns.rows.map((row) => ({
    ...row,
    metrics: { ...row.metrics, byResult: BY_RESULT[row.id] },
  })),
};
