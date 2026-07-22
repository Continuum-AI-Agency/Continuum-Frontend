// Pure classifiers and field readers for the optimizer Logs feed. The feed unions
// three event families into one stream (money writes, portfolio config audits,
// cycle results), and these helpers are the single place that decides which family
// a row belongs to and how to read the loosely-typed `fields` bag the service
// writes. Kept pure (no React) so the classification is unit-tested directly.

import type { OptimizerLogRow } from '@continuum/contracts';

export type EventFamily = 'money' | 'settings' | 'cycles';
export type LogFilter = 'all' | EventFamily;

/** Sentinel for the portfolio Select's "every portfolio" option — a real
 *  portfolio name can never collide with it. */
export const ALL_PORTFOLIOS = '__all__';

/** Every money write the service persists is an `apply_*` (budget), `convert_*`
 *  (CBO→ABO), or `adset_status_*` (spend-stopping pause/unpause) event; the config
 *  audit trail arrives as the single `setting_changed` event; everything else
 *  (cycle_*, ingest_*, ops warnings) is a cycle-family row. */
export function classifyEvent(event: string): EventFamily {
  if (event === 'setting_changed') return 'settings';
  if (
    event.startsWith('apply_') ||
    event.startsWith('convert_') ||
    event.startsWith('adset_status_')
  ) {
    return 'money';
  }
  return 'cycles';
}

export function matchesFamily(row: OptimizerLogRow, filter: LogFilter): boolean {
  return filter === 'all' || classifyEvent(row.event) === filter;
}

/** The portfolio names actually present in the loaded window — feeds the portfolio
 *  Select with zero extra reads. Sorted, de-duped, nulls dropped. */
export function distinctPortfolioNames(rows: readonly OptimizerLogRow[]): string[] {
  const names = new Set<string>();
  for (const row of rows) {
    if (row.portfolio_name) names.add(row.portfolio_name);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

export function filterLogs(
  rows: readonly OptimizerLogRow[],
  opts: { family: LogFilter; portfolio: string },
): OptimizerLogRow[] {
  return rows.filter(
    (row) =>
      matchesFamily(row, opts.family) &&
      (opts.portfolio === ALL_PORTFOLIOS || row.portfolio_name === opts.portfolio),
  );
}

export type FamilyCounts = Record<LogFilter, number>;

export function familyCounts(rows: readonly OptimizerLogRow[]): FamilyCounts {
  const counts: FamilyCounts = { all: rows.length, money: 0, settings: 0, cycles: 0 };
  for (const row of rows) {
    counts[classifyEvent(row.event)] += 1;
  }
  return counts;
}

type Fields = Record<string, unknown>;

/** A finite number, tolerating the numeric-string form Postgres/JSON can produce. */
function readNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** A non-empty text value (audit old/new values are `text`; a number is stringified). */
function readText(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() === '' ? null : value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

/** The budget move a money row carries. Prior/target are MINOR currency units as
 *  the service writes them (no account currency travels with the log row, so they
 *  are rendered as the raw values that exist — never converted/invented). */
export type MoneyMove = {
  prior: number | null;
  target: number | null;
  /** Status transition on an `adset_status_executed` row (PAUSED/ACTIVE) — a status
   *  write moves no minor units, so prior/target stay null and these carry the change. */
  priorStatus: string | null;
  targetStatus: string | null;
  actorKind: string | null;
  receipt: string | null;
};

/** Read an `apply_executed`- or `adset_status_executed`-shaped row. Returns null when
 *  the row carries no budget/status/receipt fields at all, so the caller falls back to
 *  the generic renderer. */
export function readMoneyMove(fields: Fields): MoneyMove | null {
  const prior = readNumber(fields.priorMinor);
  const target = readNumber(fields.targetMinor);
  const priorStatus = readText(fields.priorStatus);
  const targetStatus = readText(fields.targetStatus);
  const actorKind = readText(fields.authorizedKind);
  const receipt = readText(fields.fbtraceId);
  if (prior == null && target == null && targetStatus == null && receipt == null) return null;
  return { prior, target, priorStatus, targetStatus, actorKind, receipt };
}

/** The config-audit fields the RPC union writes for a `setting_changed` row. */
export type SettingChange = {
  setting: string;
  from: string | null;
  to: string | null;
  by: string | null;
  note: string | null;
};

export function readSettingChange(fields: Fields): SettingChange | null {
  const setting = readText(fields.setting);
  if (setting == null) return null;
  return {
    setting,
    from: readText(fields.from),
    to: readText(fields.to),
    by: readText(fields.by),
    note: readText(fields.note),
  };
}
