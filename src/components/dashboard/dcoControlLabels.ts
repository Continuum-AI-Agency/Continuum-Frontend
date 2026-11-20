import type { useTranslations } from 'next-intl';
import type { ActionStatus, ActionType, ScopeType } from '@/lib/types/dco';

type Translate = ReturnType<typeof useTranslations<'dashboard'>>;
const statuses = {
  APPROVED: 'approved_87b42e4',
  FAILED: 'failed_031a8f0',
  PENDING: 'pending_331551b',
  SUCCESS: 'success_c88a0b9',
  EXECUTED: 'executed_3aa8b68',
  REJECTED: 'rejected_aea4a04',
} as const satisfies Record<ActionStatus, string>;
const actions = {
  PAUSE_CAMPAIGN: 'pause_campaign_0f63c6b',
  PAUSE_AD: 'pause_ad_4f3b26a',
  ALERT_ACCOUNT: 'alert_account_04d4764',
  NOOP: 'no_op_d5440dd',
  PAUSE_ENTITY: 'm_b963492ff6',
  SWITCH_CREATIVE: 'switch_creative_3040cdc',
  CREATIVE_SWITCH_EXTERNAL: 'creative_switch_external_201b340',
  UPDATE_COPY: 'm_ef559f1168',
  ADJUST_BUDGET: 'adjust_budget_e6fadbc',
  SCALE_BUDGET: 'scale_budget_ea66b21',
  SCALE_CAMPAIGN: 'scale_campaign_db3b15e',
  SCALE_AD: 'scale_ad_b92ac59',
  CREATE_VARIANT: 'create_variant_94ef3ff',
  ARCHIVE_ENTITY: 'archive_entity_7b12ae7',
} as const satisfies Record<ActionType, string>;
const scopes = {
  GLOBAL: 'global_a258b30',
  ACCOUNT: 'account_7e1b0d5',
  CAMPAIGN: 'campaign_268286d',
  ADSET: 'ad_set_8fa52e4',
  AD: 'ad_1d97c9f',
} as const satisfies Record<ScopeType, string>;
export function dcoStatusLabel(value: ActionStatus, t: Translate) {
  return t(statuses[value]);
}
export function dcoActionLabel(value: ActionType, t: Translate) {
  return t(actions[value]);
}
export function dcoScopeLabel(value: ScopeType, t: Translate) {
  return t(scopes[value]);
}
