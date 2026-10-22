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
