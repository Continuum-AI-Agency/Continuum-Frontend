import type { RuleActionStatus, RuleActionType } from '@continuum/contracts';
import type { useTranslations } from 'next-intl';

export type DashboardText = ReturnType<typeof useTranslations<'scale'>>;
type ScaleKey = Parameters<DashboardText>[0];
type DashboardMetric = 'spend' | 'roas' | 'ctr' | 'cpc' | 'cpa' | 'impressions' | 'clicks';
const METRIC_KEYS = {
  spend: 'spend_85f3d55',
  roas: 'roas_b81bd97',
  ctr: 'ctr_07fce34',
  cpa: 'optimizer_metricCPA',
  impressions: 'impressions_c6310e9',
  clicks: 'clicks_921fc98',
} as const satisfies Record<Exclude<DashboardMetric, 'cpc'>, ScaleKey>;
const ACTION_KEYS = {
  PAUSE_CAMPAIGN: 'dashboardActionPauseCampaign',
  PAUSE_AD: 'dashboardActionPauseAd',
  ALERT_ACCOUNT: 'dashboardActionAlertAccount',
  NOOP: 'dashboardActionNoop',
  PAUSE_ENTITY: 'dashboardActionPauseEntity',
  SWITCH_CREATIVE: 'dashboardActionSwitchCreative',
  CREATIVE_SWITCH_EXTERNAL: 'dashboardActionSwitchExternal',
  UPDATE_COPY: 'dashboardActionUpdateCopy',
  ADJUST_BUDGET: 'dashboardActionAdjustBudget',
  SCALE_BUDGET: 'dashboardActionScaleBudget',
  SCALE_CAMPAIGN: 'dashboardActionScaleCampaign',
  SCALE_AD: 'dashboardActionScaleAd',
  CREATE_VARIANT: 'dashboardActionCreateVariant',
  ARCHIVE_ENTITY: 'dashboardActionArchiveEntity',
} as const satisfies Record<RuleActionType, ScaleKey>;
const STATUS_KEYS = {
  APPROVED: 'dashboardStatusApproved',
  FAILED: 'dashboardStatusFailed',
  PENDING: 'dashboardStatusPending',
  SUCCESS: 'dashboardStatusSuccess',
  EXECUTED: 'dashboardStatusExecuted',
  REJECTED: 'dashboardStatusRejected',
} as const satisfies Record<RuleActionStatus, ScaleKey>;
const SCOPE_KEYS = {
  GLOBAL: 'global_a258b30',
  ACCOUNT: 'account_7e1b0d5',
  CAMPAIGN: 'campaign_268286d',
  ADSET: 'ad_set_8fa52e4',
  AD: 'ad_1d97c9f',
} as const satisfies Record<string, ScaleKey>;

export const dashboardMetricLabel = (metric: DashboardMetric, t: DashboardText): string =>
  metric === 'cpc' ? 'CPC' : t(METRIC_KEYS[metric]);
export function dashboardActionLabel(action: string, t: DashboardText): string {
  return t(
    Object.hasOwn(ACTION_KEYS, action)
      ? ACTION_KEYS[action as keyof typeof ACTION_KEYS]
      : 'dashboardActionOther',
  );
}
export function dashboardStatusLabel(status: string, t: DashboardText): string {
  return t(
    Object.hasOwn(STATUS_KEYS, status)
      ? STATUS_KEYS[status as keyof typeof STATUS_KEYS]
      : 'dashboardStatusUnknown',
  );
}
export function dashboardScopeLabel(scope: string, t: DashboardText): string {
  return t(
    Object.hasOwn(SCOPE_KEYS, scope)
      ? SCOPE_KEYS[scope as keyof typeof SCOPE_KEYS]
      : 'dashboardScopeEntity',
  );
}
export function dashboardFreshness(
  expiresAt: string | null | undefined,
  t: DashboardText,
  now = Date.now(),
): string | null {
  if (!expiresAt) return null;
  const remaining = new Date(expiresAt).getTime() - now;
  if (remaining <= 0) return t('dashboardStale');
  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  if (days > 0) return t('dashboardFreshDays', { days, hours: hours % 24 });
  if (hours > 0) return t('dashboardFreshHours', { hours });
  return t('dashboardFreshMinutes', { minutes: Math.ceil(remaining / (1000 * 60)) });
}
