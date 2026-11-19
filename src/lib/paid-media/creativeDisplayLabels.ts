import type { GlobalAngleId } from '@continuum/contracts';
import type { useTranslations } from 'next-intl';

type ScaleCopy = ReturnType<typeof useTranslations<'scale'>>;
const ANGLE_KEYS = {
  offer_discount: 'creativeAngle_offer_discount',
  offer_bundle: 'creativeAngle_offer_bundle',
  risk_reversal_trial: 'creativeAngle_risk_reversal_trial',
  risk_reversal_guarantee: 'creativeAngle_risk_reversal_guarantee',
  time_scarcity: 'creativeAngle_time_scarcity',
  stock_scarcity: 'creativeAngle_stock_scarcity',
  social_proof_volume: 'creativeAngle_social_proof_volume',
  social_proof_peer: 'creativeAngle_social_proof_peer',
  authority_expert: 'creativeAngle_authority_expert',
  authority_credential: 'creativeAngle_authority_credential',
  transformation_before_after: 'creativeAngle_transformation_before_after',
  transformation_aspiration: 'creativeAngle_transformation_aspiration',
  mechanism_how_it_works: 'creativeAngle_mechanism_how_it_works',
  mechanism_ingredient: 'creativeAngle_mechanism_ingredient',
  problem_agitation: 'creativeAngle_problem_agitation',
  cost_of_inaction: 'creativeAngle_cost_of_inaction',
  objection_handling: 'creativeAngle_objection_handling',
  comparison_alternative: 'creativeAngle_comparison_alternative',
  comparison_competitor: 'creativeAngle_comparison_competitor',
  convenience_time: 'creativeAngle_convenience_time',
  convenience_access: 'creativeAngle_convenience_access',
  identity_belonging: 'creativeAngle_identity_belonging',
  identity_status: 'creativeAngle_identity_status',
  value_stack: 'creativeAngle_value_stack',
  price_transparency: 'creativeAngle_price_transparency',
  seasonal_occasion: 'creativeAngle_seasonal_occasion',
  launch_newness: 'creativeAngle_launch_newness',
  local_proximity: 'creativeAngle_local_proximity',
  unknown: 'creativeAngle_unknown',
} as const satisfies Record<GlobalAngleId, Parameters<ScaleCopy>[0]>;
export function creativeAngleLabel(id: GlobalAngleId, t: ScaleCopy): string {
  return t(ANGLE_KEYS[id]);
}
