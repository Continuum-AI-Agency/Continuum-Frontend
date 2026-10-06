// One OptimizerAction per write a card can carry, each parsed through the contract so an
// action the engine could not emit fails at import, not in a render assertion. The Google
// campaign is Vivo 47's (escenario 07); the TikTok ad group is escenario 09's.

import { type OptimizerAction, OptimizerActionSchema } from '@continuum/contracts';

const parse = (action: unknown): OptimizerAction => OptimizerActionSchema.parse(action);

export const PORTFOLIO_ID = '6a49e1a8-0000-4000-8000-000000000047';

const GOOGLE_CAMPAIGN = {
  platform: 'google_ads',
  level: 'campaign',
  nativeLevel: 'campaign',
  id: '22357506300',
  accountId: '3710693645',
  name: 'VIVO 47-EKATAR',
} as const;

const GOOGLE_AD_GROUP = {
  platform: 'google_ads',
  level: 'group',
  nativeLevel: 'ad_group',
  id: '161234567890',
  accountId: '3710693645',
  name: 'Locations',
} as const;

const TIKTOK_AD_GROUP = {
  platform: 'tiktok_ads',
  level: 'group',
  nativeLevel: 'ad_group',
  id: '1790000000000202',
  accountId: '7301234567890123456',
  name: 'Prospecting MX',
} as const;

export const PAUSE_GOOGLE_CAMPAIGN = parse({
  kind: 'set_status',
  ref: GOOGLE_CAMPAIGN,
  expected: 'active',
  target: 'paused',
});

export const PAUSE_TIKTOK_AD_GROUP = parse({
  kind: 'set_status',
  ref: TIKTOK_AD_GROUP,
  expected: 'active',
  target: 'paused',
});

export const RAISE_GOOGLE_BUDGET = parse({
  kind: 'set_budget',
  ref: GOOGLE_CAMPAIGN,
  budget: {
    kind: 'daily',
    minor: 117_900,
    currency: 'MXN',
    shared: false,
    ownerRef: GOOGLE_CAMPAIGN,
  },
  expectedMinor: 117_900,
  targetMinor: 147_375,
});

export const LOWER_GOOGLE_TCPA = parse({
  kind: 'set_bid_target',
  ref: GOOGLE_CAMPAIGN,
  field: 'target_cpa_micros',
  expected: 35_000_000,
  target: 32_000_000,
});

export const ADD_GOOGLE_NEGATIVES = parse({
  kind: 'add_negatives',
  ref: GOOGLE_CAMPAIGN,
  terms: [
    { text: 'free gym', matchType: 'EXACT' },
    { text: 'gym jobs', matchType: 'EXACT' },
    { text: 'gym near me cheap', matchType: 'EXACT' },
  ],
  scope: 'campaign',
});

export const ADD_GOOGLE_KEYWORD = parse({
  kind: 'add_keyword',
  ref: GOOGLE_AD_GROUP,
  keyword: { text: '24 hour gym guadalajara', matchType: 'EXACT' },
});
