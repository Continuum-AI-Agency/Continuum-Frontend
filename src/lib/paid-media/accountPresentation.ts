import type { AccountDetector, ActionFamily, ActionVerb } from '@continuum/contracts';
import type { useTranslations } from 'next-intl';

type ScaleCopy = ReturnType<typeof useTranslations<'scale'>>;
const DETECTOR_KEYS = {
  platform_diversification: 'accountDetector_platform_diversification',
  target_economics: 'accountDetector_target_economics',
  portfolio_reallocation: 'accountDetector_portfolio_reallocation',
  structure_consolidation: 'accountDetector_structure_consolidation',
  funnel_coverage: 'accountDetector_funnel_coverage',
  optimization_event: 'accountDetector_optimization_event',
  creative_supply: 'accountDetector_creative_supply',
  audience_overlap: 'accountDetector_audience_overlap',
  account_pacing: 'accountDetector_account_pacing',
  scale_readiness: 'accountDetector_scale_readiness',
  dead_tail: 'accountDetector_dead_tail',
  delivery_collapse: 'accountDetector_delivery_collapse',
  measurement_integrity: 'accountDetector_measurement_integrity',
  bid_strategy: 'accountDetector_bid_strategy',
  decision_window: 'accountDetector_decision_window',
  placement_mix: 'accountDetector_placement_mix',
  format_gap: 'accountDetector_format_gap',
  market_allocation: 'accountDetector_market_allocation',
  seasonality: 'accountDetector_seasonality',
  post_click: 'accountDetector_post_click',
  account_saturation: 'accountDetector_account_saturation',
  new_vs_returning: 'accountDetector_new_vs_returning',
  angle_concentration: 'accountDetector_angle_concentration',
  testing_discipline: 'accountDetector_testing_discipline',
  auction_pressure: 'accountDetector_auction_pressure',
  guardrail_bottleneck: 'accountDetector_guardrail_bottleneck',
} as const satisfies Record<AccountDetector, Parameters<ScaleCopy>[0]>;
const FAMILY_LABEL_KEYS = {
  budget: 'accountFamilyLabel_budget',
  creative_swap: 'accountFamilyLabel_creative_swap',
  audience_change: 'accountFamilyLabel_audience_change',
  new_audience: 'accountFamilyLabel_new_audience',
  new_creatives: 'accountFamilyLabel_new_creatives',
  structure: 'accountFamilyLabel_structure',
  measurement: 'accountFamilyLabel_measurement',
} as const satisfies Record<ActionFamily, Parameters<ScaleCopy>[0]>;
const FAMILY_BODY_KEYS = {
  budget: 'accountFamilyBody_budget',
  creative_swap: 'accountFamilyBody_creative_swap',
  audience_change: 'accountFamilyBody_audience_change',
  new_audience: 'accountFamilyBody_new_audience',
  new_creatives: 'accountFamilyBody_new_creatives',
  structure: 'accountFamilyBody_structure',
  measurement: 'accountFamilyBody_measurement',
} as const satisfies Record<ActionFamily, Parameters<ScaleCopy>[0]>;
const VERB_KEYS = {
  pause: 'accountVerb_pause',
  pause_ad: 'accountVerb_pause_ad',
  creative_refresh: 'accountVerb_creative_refresh',
  audience_expand: 'accountVerb_audience_expand',
  variate_creative: 'accountVerb_variate_creative',
  seed_experiment: 'accountVerb_seed_experiment',
  restore_delivery: 'accountVerb_restore_delivery',
  settings: 'accountVerb_settings',
  reallocate: 'accountVerb_reallocate',
  consolidate: 'accountVerb_consolidate',
  review: 'accountVerb_review',
} as const satisfies Record<ActionVerb, Parameters<ScaleCopy>[0]>;
export function accountDetectorLabel(detector: AccountDetector, t: ScaleCopy): string {
  return t(DETECTOR_KEYS[detector]);
}
export function accountActionVerbLabel(verb: ActionVerb, t: ScaleCopy): string {
  return t(VERB_KEYS[verb]);
}
export function accountFamilyCopy(
  family: ActionFamily,
  t: ScaleCopy,
): { label: string; body: string } {
  return { label: t(FAMILY_LABEL_KEYS[family]), body: t(FAMILY_BODY_KEYS[family]) };
}

const COMPARISON_KEYS = {
  platform_diversification: 'accountCompare_platform_diversification',
  target_economics: 'accountCompare_target_economics',
  portfolio_reallocation: 'accountCompare_portfolio_reallocation',
  structure_consolidation: 'accountCompare_structure_consolidation',
  funnel_coverage: 'accountCompare_funnel_coverage',
  optimization_event: 'accountCompare_optimization_event',
  creative_supply: 'accountCompare_creative_supply',
  audience_overlap: 'accountCompare_audience_overlap',
  account_pacing: 'accountCompare_account_pacing',
  scale_readiness: 'accountCompare_scale_readiness',
  dead_tail: 'accountCompare_dead_tail',
  delivery_collapse: 'accountCompare_delivery_collapse',
  measurement_integrity: 'accountCompare_measurement_integrity',
  bid_strategy: 'accountCompare_bid_strategy',
  decision_window: 'accountCompare_decision_window',
  placement_mix: 'accountCompare_placement_mix',
  format_gap: 'accountCompare_format_gap',
  market_allocation: 'accountCompare_market_allocation',
  seasonality: 'accountCompare_seasonality',
  post_click: 'accountCompare_post_click',
  account_saturation: 'accountCompare_account_saturation',
  new_vs_returning: 'accountCompare_new_vs_returning',
  angle_concentration: 'accountCompare_angle_concentration',
  testing_discipline: 'accountCompare_testing_discipline',
  auction_pressure: 'accountCompare_auction_pressure',
  guardrail_bottleneck: 'accountCompare_guardrail_bottleneck',
} as const satisfies Record<AccountDetector, Parameters<ScaleCopy>[0]>;
export function accountDetectorComparison(detector: AccountDetector, t: ScaleCopy): string {
  return t(COMPARISON_KEYS[detector]);
}
