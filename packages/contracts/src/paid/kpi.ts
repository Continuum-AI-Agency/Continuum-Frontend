// The conversion currency a paid ad is judged in.
//
// This lives in contracts because THREE independent systems must agree on it, and
// two of them cannot import from each other:
//
//   - Continuum-Backend  paid-creative-intel verdicts + win-rate cohorts
//   - Continuum-Optimizer the budget engine's scoring / freeze / fatigue decisions
//   - SQL                 paid_media.kpi_for_goal() / paid_media.kpi_conversion_key()
//
// If the TS map and the SQL functions drift, verdicts and win-rates quote different
// medians for the same ad and neither is wrong on its own terms — the most expensive
// kind of bug, because every number stays plausible. `kpi.parity.test.ts` asserts the
// two agree for every goal string; keep this file and the migration in lockstep.
//
// Source of truth for the SQL side:
//   supabase/migrations/20260712071706_paid_winrates_kpi_per_adset_goal.sql

/** The currencies an ad can be priced in. `clicks` is the floor, never a real buy. */
export type PaidKpi =
  | 'purchases'
  | 'leads'
  | 'conversations'
  | 'link_clicks'
  | 'landing_page_views'
  | 'thruplays'
  | 'post_engagement'
  | 'clicks';

/** What each KPI is called in prose. A cost-per-click is not a CPA, and narrating one
 *  as the other is how a human moves budget onto an ad that never produced a lead. */
export const KPI_COST_LABEL: Record<PaidKpi, string> = {
  purchases: 'CPA',
  leads: 'cost per lead',
  conversations: 'cost per conversation',
  link_clicks: 'cost per link click',
  landing_page_views: 'cost per landing-page view',
  thruplays: 'cost per thruplay',
  post_engagement: 'cost per engagement',
  clicks: 'cost per click',
};

/** Which measured vector each KPI is counted in — the jsonb key inside
 *  `paid_media.ads.windows`, and the WindowMetrics field the optimizer scores on.
 *  Mirrors SQL `paid_media.kpi_conversion_key()`. */
export const KPI_CONVERSION_FIELD = {
  purchases: 'purchases',
  leads: 'leads',
  conversations: 'conversations',
  link_clicks: 'linkClicks',
  landing_page_views: 'landingPageViews',
  thruplays: 'thruplays',
  post_engagement: 'postEngagement',
  clicks: 'clicks',
} as const satisfies Record<PaidKpi, string>;

/**
 * The ad set's DECLARED bid target decides how its ads are judged.
 *
 * This outranks both the campaign objective and anything we could infer from the
 * outcome. Verified live: one account ran CONVERSATIONS ad sets (to WhatsApp and to
 * Instagram Direct) alongside LEAD_GENERATION ad sets, ALL under a single
 * `OUTCOME_ENGAGEMENT` objective — and bought 949 messaging conversations against
 * 161 leads. A brand-level KPI graded the conversation ad sets on leads they never
 * bought, so a creative that started 200 threads looked like a failure.
 *
 * Declared, not observed, is the right primitive precisely because it is stable when
 * the outcome is zero: an ad in a LEAD_GENERATION set that produced no leads still
 * carries kpi=leads, so it is compared against the lead-buying peers it takes budget
 * from — which is how it earns a `kill`. Inferring the KPI from observed conversions
 * would drop that same ad into the `clicks` cohort, where its cheap clicks look fine.
 *
 * Returns null when Meta reported no goal (older rows) or when the goal buys attention
 * rather than an action (REACH / IMPRESSIONS / AD_RECALL_LIFT) — we do not invent a
 * conversion for those. The caller falls back.
 */
export function kpiForOptimizationGoal(
  goal: string | null | undefined,
  promotedEventType?: string | null,
): PaidKpi | null {
  const value = (goal ?? '').toUpperCase();
  if (!value) return null;

  switch (value) {
    case 'LEAD_GENERATION':
    case 'QUALITY_LEAD':
      return 'leads';
    case 'CONVERSATIONS':
    case 'REPLIES':
      return 'conversations';
    case 'LINK_CLICKS':
      return 'link_clicks';
    case 'LANDING_PAGE_VIEWS':
      return 'landing_page_views';
    case 'THRUPLAY':
    case 'VIDEO_VIEWS':
      return 'thruplays';
    case 'POST_ENGAGEMENT':
    case 'PAGE_LIKES':
    case 'EVENT_RESPONSES':
      return 'post_engagement';
    case 'VALUE':
      return 'purchases';
    case 'OFFSITE_CONVERSIONS':
    case 'ONSITE_CONVERSIONS':
      // The pixel event names the real buy: a conversions ad set optimizing for
      // LEAD is buying leads, not purchases.
      return (promotedEventType ?? '').toUpperCase().includes('LEAD') ? 'leads' : 'purchases';
    default:
      return null;
  }
}

/**
 * The objective STRING is only a hint, and a weak one. Meta's objective taxonomy does
 * not name the conversion an advertiser actually buys: a real lead-gen gym account runs
 * `OUTCOME_ENGAGEMENT` and reports its leads under `onsite_conversion.lead`. Matching
 * neither 'sales' nor 'lead' in that string, an older mapping fell through to `clicks`
 * — so every ad was judged on click efficiency while the verdict called it "CPA", and
 * cheap clicks on ads that never produced a lead read as `scale`.
 *
 * So the objective is the FALLBACK, never the source of truth.
 */
export function kpiForObjective(objective: string | null): PaidKpi {
  const value = (objective ?? '').toLowerCase();
  if (value.includes('sales') || value.includes('purchase')) return 'purchases';
  if (value.includes('lead')) return 'leads';
  return 'clicks';
}

/** The window-metrics field an event is counted in — a key of the optimizer's
 *  WindowMetrics and of the `paid_media.ads.windows` jsonb. Same set, one name. */
export type KpiWindowField = (typeof KPI_CONVERSION_FIELD)[PaidKpi];

/**
 * Meta's declared optimization_goal → the field its events are counted in.
 *
 * The one function every consumer resolves a currency through: the Optimizer's ingest
 * (stamping AdSetSnapshot.kpiField), the Frontend's what-if preview (so the preview
 * freezes the same ad sets the real cycle does, instead of confidently ranking one it is
 * about to hold), and anything else that has a goal and needs a number.
 *
 * Undefined ⇒ no declared currency (goal absent, or one that buys attention rather than
 * an action). Callers fall back to their own default; nobody invents a conversion.
 */
export function kpiFieldForOptimizationGoal(
  goal: string | null | undefined,
  promotedEventType?: string | null,
): KpiWindowField | undefined {
  const kpi = kpiForOptimizationGoal(goal, promotedEventType);
  return kpi ? KPI_CONVERSION_FIELD[kpi] : undefined;
}

/** Every Meta optimization_goal the mapping recognizes — the parity test's domain. */
export const KNOWN_OPTIMIZATION_GOALS: readonly string[] = [
  'LEAD_GENERATION',
  'QUALITY_LEAD',
  'CONVERSATIONS',
  'REPLIES',
  'LINK_CLICKS',
  'LANDING_PAGE_VIEWS',
  'THRUPLAY',
  'VIDEO_VIEWS',
  'POST_ENGAGEMENT',
  'PAGE_LIKES',
  'EVENT_RESPONSES',
  'VALUE',
  'OFFSITE_CONVERSIONS',
  'ONSITE_CONVERSIONS',
  'REACH',
  'IMPRESSIONS',
  'AD_RECALL_LIFT',
];
