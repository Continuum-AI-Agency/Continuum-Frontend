import type { useTranslations as ScaleTranslationHook } from 'next-intl';

type ScaleCopy = ReturnType<typeof ScaleTranslationHook<'scale'>>;

// A portfolio setting row, as a person reads it.
//
// optimizer_list_actions names a settings row by its COLUMN (`entity_id` = portfolio_audits
// .field) and carries the old/new values as the text the audit stored: 'true'/'false' for a
// boolean, 'on'/'off' for creative_analysis, an enum word for apply_mode. Printed verbatim that
// reads "autopilot_paused true → false"; this maps it to "Autopilot resumed".
//
// Unknown fields still render: a column the audit learns tomorrow is humanized from its
// snake_case name rather than shown raw or dropped.
//
// Platform settings are audited per platform as `<column>:<platform>` (apply_enabled:google_ads,
// allowed_actions:google_ads); the platform is named in words, never printed as its id. Their
// values are a JSON array of action kinds (allowed_actions) or `<platform>:<account>`
// (host_account), and read as words too.

import { PLATFORM_NAMES, readAdPlatform } from './platforms/platformTabsModel';

/** The audited portfolio columns (optimizer.portfolio_audits.field) by their English name. */
const SETTING_LABELS: Record<string, string> = {
  allowed_actions: 'Allowed actions',
  apply_enabled: 'Auto-apply',
  apply_mode: 'Mode',
  autogen: 'Auto-generated recommendations',
  autopilot_paused: 'Autopilot',
  autopilot_scopes: 'Autopilot scope',
  budget_source: 'Budget source',
  cpa_target: 'CPA target',
  creative_analysis: 'Creative analysis',
  currency: 'Currency',
  daily_total: 'Total daily budget',
  enrolled: 'Enrolled ad sets',
  host_account: 'Host account',
  lookback_window: 'Lookback window',
  max_change_pct_per_cycle: 'Max change per cycle',
  max_daily_apply_minor: 'Max daily auto-apply',
  objective: 'Objective',
  period_budget: 'Period budget',
  period_end: 'Period end',
  period_start: 'Period start',
  scale_cadence_days: 'Scale cadence (days)',
  scale_growth_pct: 'Scale growth',
  scale_max_daily: 'Scale ceiling (daily)',
  target_metric: 'Target metric',
  velocity_cap_pct: 'Velocity cap',
};

/** Enum words whose plain capitalisation would mislead. */
const VALUE_LABELS: Record<string, string> = {
  observe: 'Observe only',
};

const SNAKE_WORD = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

/** 'max_change_pct' → 'Max change pct'. */
export function humanizeSnakeCase(raw: string): string {
  const spaced = raw.replace(/_+/g, ' ').trim();
  return spaced === '' ? raw : spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** 'apply_enabled:google_ads' → its column and the platform's name; a plain column has none. */
function scopedField(field: string): { column: string; platform: string | null } {
  const separator = field.lastIndexOf(':');
  if (separator <= 0) return { column: field, platform: null };
  const platform = readAdPlatform(field.slice(separator + 1));
  return platform
    ? { column: field.slice(0, separator), platform: PLATFORM_NAMES[platform] }
    : { column: field, platform: null };
}

/** The audited columns that hold money, in the unit the audit stored them: the portfolio row
 *  keeps budgets and targets in MAJOR units ("100" → "79.82"), and max_daily_apply_minor
 *  says its own. Printed bare they read "100 → 79.82"; they print as "$79.82 MXN" (M1). */
const MONEY_SETTINGS: Record<string, 'major' | 'minor'> = {
  cpa_target: 'major',
  daily_total: 'major',
  max_daily_apply_minor: 'minor',
  period_budget: 'major',
  scale_max_daily: 'major',
};

/** Which money unit an audited column is stored in; null for a column that holds no money. */
export function settingMoneyUnit(field: string | null | undefined): 'major' | 'minor' | null {
  if (!field) return null;
  return MONEY_SETTINGS[scopedField(field).column] ?? null;
}

export function settingLabel(field: string | null | undefined, uiTranslate?: ScaleCopy): string {
  if (!field) return uiTranslate ? uiTranslate('setting_818cd8d') : 'Setting';
  const { column, platform } = scopedField(field);
  const label = uiTranslate
    ? Object.hasOwn(SETTING_MESSAGE_KEYS, column)
      ? uiTranslate(SETTING_MESSAGE_KEYS[column as keyof typeof SETTING_MESSAGE_KEYS])
      : uiTranslate('setting_818cd8d')
    : (SETTING_LABELS[column] ?? humanizeSnakeCase(column));
  return platform
    ? uiTranslate
      ? uiTranslate('helper_fd32956785c1', { v0: label, v1: platform })
      : `${label} on ${platform}`
    : label;
}

/** '["set_budget","set_status"]' → 'Set budget, Set status'; null when not a JSON string array. */
function listValue(value: string): string | null {
  if (!value.trimStart().startsWith('[')) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) return null;
    return parsed.length === 0 ? 'None' : parsed.map(humanizeSnakeCase).join(', ');
  } catch {
    return null;
  }
}

/** 'google_ads:5251780631' → 'Google 5251780631'; null when the prefix is not a platform. */
function accountValue(value: string): string | null {
  const separator = value.indexOf(':');
  if (separator <= 0) return null;
  const platform = readAdPlatform(value.slice(0, separator));
  return platform ? `${PLATFORM_NAMES[platform]} ${value.slice(separator + 1)}` : null;
}

/** An enum word ('recommend', 'observed') reads capitalised; numbers, dates and free text
 *  are printed as the audit stored them. */
export function settingValue(value: string | null, uiTranslate?: ScaleCopy): string | null {
  if (value == null) return null;
  if (uiTranslate) {
    if (SETTING_ENUM_VALUES.has(value)) return uiTranslate('settingEnumValue', { value });
    if (value.trimStart().startsWith('[')) {
      try {
        const values: unknown = JSON.parse(value);
        if (Array.isArray(values) && values.every((item) => typeof item === 'string'))
          return values.length
            ? values
                .map((item) =>
                  SETTING_ENUM_VALUES.has(item)
                    ? uiTranslate('settingEnumValue', { value: item })
                    : item,
                )
                .join(', ')
            : uiTranslate('settingEnumValue', { value: 'none' });
      } catch {}
    }
    return accountValue(value) ?? value;
  }
  const known = VALUE_LABELS[value];
  if (known) return known;
  const words = listValue(value) ?? accountValue(value);
  if (words) return words;
  return SNAKE_WORD.test(value) ? humanizeSnakeCase(value) : value;
}

const ON = new Set(['true', 'on']);
const OFF = new Set(['false', 'off']);

/** A switch flipped, as one sentence — null when the change is not an on/off. */
export function settingSentence(
  field: string | null | undefined,
  after: string | null,
  uiTranslate?: ScaleCopy,
): string | null {
  if (after == null) return null;
  const value = after.toLowerCase();
  const on = ON.has(value);
  if (!on && !OFF.has(value)) return null;
  // autopilot_paused reads inverted: the column turning ON is the autopilot stopping.
  if (field === 'autopilot_paused')
    return uiTranslate
      ? uiTranslate('settingAutopilotPaused', { paused: on ? 'yes' : 'no' })
      : on
        ? 'Autopilot paused'
        : 'Autopilot resumed';
  if (uiTranslate)
    return uiTranslate('settingToggled', {
      setting: settingLabel(field, uiTranslate),
      on: on ? 'yes' : 'no',
    });
  return `${settingLabel(field, uiTranslate)} turned ${on ? 'on' : 'off'}`;
}

const SETTING_MESSAGE_KEYS = {
  allowed_actions: 'allowed_actions_f1ee293',
  apply_enabled: 'settingField_apply_enabled',
  apply_mode: 'mode_5e23ec6',
  autogen: 'settingField_autogen',
  autopilot_paused: 'optimizer_modeAutopilot',
  autopilot_scopes: 'settingField_autopilot_scopes',
  budget_source: 'settingField_budget_source',
  cpa_target: 'settingField_cpa_target',
  creative_analysis: 'creative_analysis_d28c315',
  currency: 'currency_3ac1a9e',
  daily_total: 'settingField_daily_total',
  enrolled: 'enrolled_ad_sets_6b4145f',
  host_account: 'settingField_host_account',
  lookback_window: 'lookback_window_dd152e0',
  max_change_pct_per_cycle: 'settingField_max_change_pct_per_cycle',
  max_daily_apply_minor: 'settingField_max_daily_apply_minor',
  objective: 'objective_3b20adc',
  period_budget: 'settingField_period_budget',
  period_end: 'settingField_period_end',
  period_start: 'settingField_period_start',
  scale_cadence_days: 'settingField_scale_cadence_days',
  scale_growth_pct: 'settingField_scale_growth_pct',
  scale_max_daily: 'settingField_scale_max_daily',
  target_metric: 'target_metric_5e5b274',
  velocity_cap_pct: 'settingField_velocity_cap_pct',
} as const;
const SETTING_ENUM_VALUES = new Set([
  'observe',
  'recommend',
  'autopilot',
  'balanced',
  'efficiency',
  'scale',
  'fixed',
  'follows_spend',
  'set_budget',
  'set_status',
  'set_bid',
  'add_negatives',
  'add_keyword',
  'budget',
  'status_pause',
  'settings',
  'audience_expand',
  'creative_refresh',
  'pause',
  'true',
  'on',
  'false',
  'off',
]);
