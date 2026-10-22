// A portfolio setting row, as a person reads it.
//
// optimizer_list_actions names a settings row by its COLUMN (`entity_id` = portfolio_audits
// .field) and carries the old/new values as the text the audit stored: 'true'/'false' for a
// boolean, 'on'/'off' for creative_analysis, an enum word for apply_mode. Printed verbatim that
// reads "autopilot_paused true → false"; this maps it to "Autopilot resumed".
//
// Unknown fields still render: a column the audit learns tomorrow is humanized from its
// snake_case name rather than shown raw or dropped.

/** The audited portfolio columns (optimizer.portfolio_audits.field) by their English name. */
const SETTING_LABELS: Record<string, string> = {
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

export function settingLabel(field: string | null | undefined): string {
  if (!field) return 'Setting';
  return SETTING_LABELS[field] ?? humanizeSnakeCase(field);
}

/** An enum word ('recommend', 'observed') reads capitalised; numbers, dates and free text
 *  are printed as the audit stored them. */
export function settingValue(value: string | null): string | null {
  if (value == null) return null;
  const known = VALUE_LABELS[value];
  if (known) return known;
  return SNAKE_WORD.test(value) ? humanizeSnakeCase(value) : value;
}

const ON = new Set(['true', 'on']);
const OFF = new Set(['false', 'off']);

/** A switch flipped, as one sentence — null when the change is not an on/off. */
export function settingSentence(
  field: string | null | undefined,
  after: string | null,
): string | null {
  if (after == null) return null;
  const value = after.toLowerCase();
  const on = ON.has(value);
  if (!on && !OFF.has(value)) return null;
  // autopilot_paused reads inverted: the column turning ON is the autopilot stopping.
  if (field === 'autopilot_paused') return on ? 'Autopilot paused' : 'Autopilot resumed';
  return `${settingLabel(field)} turned ${on ? 'on' : 'off'}`;
}
