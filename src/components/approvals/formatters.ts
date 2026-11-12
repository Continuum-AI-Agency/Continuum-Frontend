import { useLocale, useTranslations } from 'next-intl';
import type { UiLocale } from '@/i18n/config';

type Translator = ReturnType<typeof useTranslations<'common'>>;
const LABEL_KEYS = {
  'Acct avg ROAS': 'm_9f11c2de66',
  Spend: 'm_14eeee8d40',
  Impressions: 'm_b5fb66f61a',
  Clicks: 'm_8b97ba460c',
  Global: 'm_5f1184f7df',
  Unscoped: 'm_17aab7bfad',
  'No rationale provided': 'm_b8e560038d',
  'Pause ad': 'm_0d534beed2',
  'Pause ad set': 'm_ce173f1bb4',
  'Pause campaign': 'm_81b2c20472',
  'Scale ad set': 'm_1fe0419435',
  'Scale campaign': 'm_dc50433296',
  'Scale ad': 'm_0dbdec6804',
  'Activate ad': 'm_c818d5f77b',
  'Activate ad set': 'm_8644625c84',
  'Activate campaign': 'm_2b819835f1',
  'Account alert': 'm_76bedadfbc',
  'Campaign alert': 'm_a6d25a9db1',
  'Swap creative': 'm_5829c205af',
  'No-op': 'm_76729f98c4',
  Campaign: 'm_69390e1665',
  Adset: 'm_a030059365',
  Ad: 'm_94b6931d19',
  Account: 'm_85dfa32c97',
} as const;
function label(value: string, t?: Translator) {
  return t && Object.hasOwn(LABEL_KEYS, value)
    ? t(LABEL_KEYS[value as keyof typeof LABEL_KEYS])
    : value;
}

import type { RuleAction } from '@/lib/approvals/types';
import { formatRelativeTime as formatRelativeTimeShared } from '@/lib/time/relativeTime';

// Shared formatter for QueueTable/LaneStrip/FocusComposer/QueueList. Delegates to
// the canonical relative-time helper; the export + signature stay stable so callers
// are untouched.
export function formatRelativeTime(iso: string, locale: UiLocale = 'en'): string {
  return formatRelativeTimeShared(iso, Date.now(), locale);
}

const METRIC_FORMAT: Record<string, Intl.NumberFormatOptions> = {
  spend: { style: 'currency', currency: 'USD', maximumFractionDigits: 0 },
  cpc: { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 },
  cpm: { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 },
  roas: { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  account_avg_roas: { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  ctr: { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 },
  impressions: { notation: 'compact', maximumFractionDigits: 1 },
  clicks: { notation: 'compact', maximumFractionDigits: 1 },
};

export function formatMetric(key: string, value: number, locale: UiLocale = 'en'): string {
  const formatter = new Intl.NumberFormat(
    locale,
    METRIC_FORMAT[key] ?? { maximumFractionDigits: 2 },
  );
  // CTR comes in as 0.71 meaning 0.71% per APPROVALS_API.md fixtures; treat as a raw percent.
  if (key === 'ctr') return formatter.format(value / 100);
  return formatter.format(value);
}

const METRIC_LABELS: Record<string, string> = {
  roas: 'ROAS',
  account_avg_roas: 'Acct avg ROAS',
  spend: 'Spend',
  impressions: 'Impressions',
  clicks: 'Clicks',
  ctr: 'CTR',
  cpc: 'CPC',
  cpm: 'CPM',
};

export function metricLabel(key: string, t?: Translator): string {
  return label(METRIC_LABELS[key] ?? key.replace(/_/g, ' '), t);
}

export function scopeLabel(action: RuleAction, t?: Translator): string {
  if (action.scope_type === 'GLOBAL') return label('Global', t);
  if (!action.scope_type) return label('Unscoped', t);
  const id = action.scope_id ?? '—';
  const short = id.length > 12 ? `…${id.slice(-8)}` : id;
  const type = action.scope_type.charAt(0) + action.scope_type.slice(1).toLowerCase();
  return `${label(type, t)} ${short}`;
}

export function whyText(action: RuleAction, t?: Translator): string {
  if (action.rule_name) return action.rule_name;
  if (action.flow_run_id) {
    const short = action.flow_run_id.slice(0, 8);
    return t ? t('m_a93637098a', { id: short }) : `Emitted by flow run · ${short}`;
  }
  return label('No rationale provided', t);
}

const ACTION_TYPE_LABELS: Record<string, string> = {
  PAUSE_AD: 'Pause ad',
  PAUSE_ADSET: 'Pause ad set',
  PAUSE_CAMPAIGN: 'Pause campaign',
  SCALE_ADSET: 'Scale ad set',
  SCALE_CAMPAIGN: 'Scale campaign',
  SCALE_AD: 'Scale ad',
  ACTIVATE_AD: 'Activate ad',
  ACTIVATE_ADSET: 'Activate ad set',
  ACTIVATE_CAMPAIGN: 'Activate campaign',
  ALERT_ACCOUNT: 'Account alert',
  ALERT_CAMPAIGN: 'Campaign alert',
  SWAP_CREATIVE: 'Swap creative',
  NOOP: 'No-op',
};

export function actionTypeLabel(type: string, t?: Translator): string {
  return label(ACTION_TYPE_LABELS[type] ?? type, t);
}

const UNSUPPORTED_ACTIONS = new Set([
  'SCALE_AD',
  'ACTIVATE_AD',
  'ACTIVATE_ADSET',
  'ACTIVATE_CAMPAIGN',
  'ALERT_CAMPAIGN',
  'SWAP_CREATIVE',
]);

export function isExecutorUnsupported(type: string): boolean {
  return UNSUPPORTED_ACTIONS.has(type);
}

export function useApprovalFormatters() {
  const t = useTranslations('common');
  const locale = useLocale();
  return {
    formatRelativeTime: (iso: string) => formatRelativeTime(iso, locale),
    formatMetric: (key: string, value: number) => formatMetric(key, value, locale),
    metricLabel: (key: string) => metricLabel(key, t),
    scopeLabel: (action: RuleAction) => scopeLabel(action, t),
    whyText: (action: RuleAction) => whyText(action, t),
    actionTypeLabel: (type: string) => actionTypeLabel(type, t),
  };
}
