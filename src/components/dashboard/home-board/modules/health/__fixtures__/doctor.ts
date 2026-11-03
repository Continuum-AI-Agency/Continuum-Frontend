// Shaped on prod, 2026-11-03 (read-only probe). Easy Fit's Google customer 5251780631 is watched by
// the portfolio "Leads // Google Ads only" (b9cebbcf); its platform cards carry a
// google_delivery_issue with SERVING_STATUS_SUSPENDED (account_wide false on Nov 3 — the fixture
// below makes it account-wide, the case the account check reads). Its Meta account's daily read
// (optimizer_get_account_read) has no guards today; the guard fixture is a measurement_integrity
// card as the worker writes it.
import {
  type AccountCandidate,
  accountCandidateSchema,
  type PortfolioListItem,
} from '@continuum/contracts';
import type { AccountReadEnvelope } from '@/components/paid-media/optimizer/useOptimizerData';

export type DoctorPortfolio = Pick<
  PortfolioListItem,
  'id' | 'name' | 'status' | 'apply_mode' | 'ad_account_id' | 'platforms'
>;

export const GOOGLE_PORTFOLIO: DoctorPortfolio = {
  id: 'b9cebbcf-2832-440a-b326-3af20c19be37',
  name: 'Leads // Google Ads only',
  status: 'active',
  apply_mode: 'recommend',
  ad_account_id: '5251780631',
  platforms: ['google_ads'],
};

export const META_PORTFOLIO: DoctorPortfolio = {
  id: '0fd6f383-6a70-4ce1-baf8-c869bc5d4aec',
  name: 'Conversaciones Whatsapp',
  status: 'active',
  apply_mode: 'autopilot',
  ad_account_id: 'act_521903353286118',
  platforms: ['meta'],
};

export function candidate(overrides: Record<string, unknown>): AccountCandidate {
  return accountCandidateSchema.parse({
    id: 'platform_signal:0e8990e3-7411-4121-bbeb-95897c69bf05',
    detector: 'delivery_collapse',
    portfolio_ids: [GOOGLE_PORTFOLIO.id],
    impact_per_day: 350,
    impact_class: 'recoverable',
    impact_basis: '$350 MXN/day of budget with no ad shown',
    ...overrides,
  });
}

export const SUSPENDED_CARD = candidate({
  platform_card: {
    variant: 'google_delivery_issue',
    campaign_name: 'Search | Octubre | Easy Fit',
    reasons: ['SERVING_STATUS_SUSPENDED'],
    dark_days: 8,
    dark_since: '2026-10-26',
    currency: 'MXN',
    budget_per_day: 350,
    disapproved_ads: 0,
    account_wide: true,
  },
});

/** One dark campaign is that campaign's card, never the account's status. */
export const ONE_DARK_CAMPAIGN = candidate({
  platform_card: {
    variant: 'google_delivery_issue',
    campaign_name: 'Search | Octubre | Easy Fit',
    reasons: ['SERVING_STATUS_SUSPENDED'],
    dark_days: 8,
    dark_since: '2026-10-26',
    currency: 'MXN',
    budget_per_day: 350,
    disapproved_ads: 0,
    account_wide: false,
  },
});

export const MEASUREMENT_GUARD = candidate({
  id: 'measurement_integrity:account',
  detector: 'measurement_integrity',
  portfolio_ids: [],
  impact_per_day: 0,
  impact_basis: '2 campaigns record no conversion event',
  title: {
    entity: 'Easy Fit',
    figure: 2,
    unit: 'campañas sin eventos registrados',
    comparator: 'de 5 activas',
    window: 'd7',
  },
});

function envelope(guards: AccountCandidate[]): AccountReadEnvelope {
  return {
    utc_day: '2026-11-03',
    ready_at: '2026-11-03T00:05:00Z',
    refresh: null,
    read: {
      candidates: [],
      guards,
      narrative: '',
      lead_reason: null,
      justification_if_not_max: null,
      conflicts: [],
      starved: [],
      deck: null,
      assumptions: [],
      ceiling_defaults: {},
      scale_per_day: null,
      currency: 'MXN',
      model: 'deterministic',
    },
  };
}

export const READ_NO_GUARDS = envelope([]);
export const READ_WITH_GUARD = envelope([MEASUREMENT_GUARD]);
