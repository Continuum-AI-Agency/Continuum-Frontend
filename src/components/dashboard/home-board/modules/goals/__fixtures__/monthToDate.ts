// Month-to-date account_overview answers for the Goal tile's tests, on Nov 3 2026 (the window is
// Nov 1–2). The Meta answers are SHAPED, not recorded: paidAccountOverviewSchema's keys with
// figures in the range of Easy Fit's live MXN account and one of its USD accounts. The Google
// answers are the REAL Pink Elephant recording (src/lib/home/__fixtures__), one read per result.
import type { PaidAccountOverview } from '@continuum/contracts';
import pink from '@/lib/home/__fixtures__/pink-google-account-overview.json';
import type { HomeAdAccount } from '@/lib/home/homeAccounts';

export const MTD_NOW = new Date('2026-11-03T15:00:00Z');
export const MTD_WINDOW = { since: '2026-11-01', until: '2026-11-02' } as const;

export const MXN_ACCOUNT: HomeAdAccount = {
  id: 'act_1001',
  name: 'Easy Fit MX',
  currency: 'MXN',
  platform: 'meta',
};
export const USD_ACCOUNT: HomeAdAccount = {
  id: 'act_2002',
  name: 'Easy Fit US',
  currency: 'USD',
  platform: 'meta',
};
export const GOOGLE_ACCOUNT: HomeAdAccount = {
  id: pink._source.customerId,
  name: 'Pink Elephant',
  currency: 'MXN',
  platform: 'google_ads',
};

export const MXN_OVERVIEW: PaidAccountOverview = {
  currency: 'MXN',
  metrics: {
    spend: 3120.5,
    roas: 1.7305,
    ctr: 1.42,
    clicks: 512,
    impressions: 36_050,
    purchases: 3,
    purchase_value: 5400,
    leads: 14,
    conversations: 41,
  },
  comparison: { spend: { current: 3120.5, previous: 2980.1 } },
  trends: [
    {
      date: '2026-11-01',
      spend: 1500.25,
      roas: 1.6,
      clicks: 250,
      impressions: 17_800,
      leads: 6,
      conversations: 19,
      purchases: 1,
    },
    {
      date: '2026-11-02',
      spend: 1620.25,
      roas: 1.85,
      clicks: 262,
      impressions: 18_250,
      leads: 8,
      conversations: 22,
      purchases: 2,
    },
  ],
};

export const USD_OVERVIEW: PaidAccountOverview = {
  currency: 'USD',
  metrics: {
    spend: 120,
    roas: 2.5,
    ctr: 1.1,
    clicks: 40,
    impressions: 3_600,
    purchases: 1,
    purchase_value: 300,
    leads: 2,
    conversations: 5,
  },
  comparison: { spend: { current: 120, previous: 0 } },
  trends: [
    { date: '2026-11-01', spend: 60, roas: 2, leads: 1, conversations: 2, purchases: 0 },
    { date: '2026-11-02', spend: 60, roas: 3, leads: 1, conversations: 3, purchases: 1 },
  ],
};

/** Pink Elephant's two Google reads, as the edge answered them (leads, purchases). */
export const GOOGLE_READS = {
  leads: pink.leads as PaidAccountOverview,
  purchases: pink.purchases as PaidAccountOverview,
};
