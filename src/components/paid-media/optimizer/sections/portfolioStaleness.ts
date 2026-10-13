// What a portfolio's staleness read says on screen — pure, so every row, tile and dateline
// that names it says the same thing.
//
// Three production portfolios sat dead on Meta for 47–61 days while the Portfolios list read
// "Autopilot · next cycle tomorrow": the claim step reschedules next_realloc_at whether or
// not a cycle lands. optimizer_list_portfolios (migration 20260923202000) now carries
// stale_for_days, last_actual_cycle_at and the roster's presence on Meta; these reads turn
// them into words. Every function returns null when the fields are absent — a row from the
// RPC before the migration renders exactly as it did — and never invents a figure it was
// not handed.

import type { PacingStamp, PortfolioListItem } from '@continuum/contracts';
import { pacingPlanFreshness } from '@continuum/contracts';

export type StalenessRead = Pick<
  PortfolioListItem,
  | 'stale_for_days'
  | 'last_actual_cycle_at'
  | 'roster_state'
  | 'roster_absent_since'
  | 'roster_missing_count'
  | 'adset_count'
>;

const SINCE_FMT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** True once the read says a cycle was missed. Absent or null reads as fresh: an unknown
 *  must never colour a row. */
export function isStale(portfolio: Pick<StalenessRead, 'stale_for_days'>): boolean {
  return typeof portfolio.stale_for_days === 'number' && portfolio.stale_for_days >= 0;
}

/**
 * "last cycle 49 days ago" — or, for a portfolio that never had one, "no cycle in 48 days",
 * because a last cycle that never happened cannot be N days ago. Null while fresh.
 */
export function staleLine(
  portfolio: Pick<StalenessRead, 'stale_for_days' | 'last_actual_cycle_at'>,
): string | null {
  if (!isStale(portfolio)) return null;
  const days = portfolio.stale_for_days as number;
  if (portfolio.last_actual_cycle_at) {
    return days === 0 ? 'a cycle was missed today' : `last cycle ${plural(days, 'day')} ago`;
  }
  return days === 0 ? 'no cycle yet' : `no cycle in ${plural(days, 'day')}`;
}

/**
 * The roster's standing on Meta, only when some of it is gone:
 *   absent  → "roster gone since Aug 6 · 12 of 12 ad sets"
 *   partial → "3 of 12 ad sets gone"
 * 'present', 'empty', null and undefined all say nothing — an empty roster is a setup
 * state the row already shows as "0 ad sets", not a loss.
 */
export function rosterLine(
  portfolio: Pick<
    StalenessRead,
    'roster_state' | 'roster_absent_since' | 'roster_missing_count' | 'adset_count'
  >,
): string | null {
  const gone = portfolio.roster_missing_count ?? null;
  if (portfolio.roster_state === 'absent') {
    const count = gone ?? portfolio.adset_count;
    const since = parseIso(portfolio.roster_absent_since);
    const when = since === null ? '' : ` since ${SINCE_FMT.format(new Date(since))}`;
    return `roster gone${when} · ${count} of ${plural(portfolio.adset_count, 'ad set')}`;
  }
  if (portfolio.roster_state === 'partial' && gone !== null && gone > 0) {
    return `${gone} of ${plural(portfolio.adset_count, 'ad set')} gone`;
  }
  return null;
}

/** Colour by state: a roster wholly gone is a loss, a partial one a warning. */
export function rosterTone(
  portfolio: Pick<StalenessRead, 'roster_state'>,
): 'danger' | 'warning' | null {
  if (portfolio.roster_state === 'absent') return 'danger';
  if (portfolio.roster_state === 'partial') return 'warning';
  return null;
}

/**
 * The ad sets the book actually manages, against the ones its rosters have lost.
 *
 * adset_count is enrollments, and a portfolio whose 12 enrollments have all left Meta still
 * counts 12 — so the Overview's "24 ad sets under management" was counting 14 that no cycle
 * could touch. Subtract the read's roster_missing_count when it carries one; a row without
 * it (the RPC before the migration) counts as it always did.
 */
export function underManagement(
  portfolios: readonly Pick<StalenessRead, 'adset_count' | 'roster_missing_count'>[],
): { enrolled: number; managed: number; gone: number } {
  let enrolled = 0;
  let gone = 0;
  for (const portfolio of portfolios) {
    enrolled += portfolio.adset_count;
    gone += Math.min(portfolio.adset_count, Math.max(0, portfolio.roster_missing_count ?? 0));
  }
  return { enrolled, managed: enrolled - gone, gone };
}

/** What a `pacingPlanVersion` stamp (`start..end@budget`) says in words: "Oct 1–Oct 31 at 45,000". */
function describePlan(version: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})@(.+)$/.exec(version);
  if (!match) return version;
  const [, start, end, budget] = match;
  const day = (iso: string) => SINCE_FMT.format(new Date(`${iso}T00:00:00Z`));
  const amount = Number(budget);
  return `${day(start as string)}–${day(end as string)} at ${
    Number.isFinite(amount) ? amount.toLocaleString('en-US') : budget
  }`;
}

/**
 * The pacing verdict's standing against the flight the row holds NOW. The last run paced the
 * portfolio row as it was at cycle time; after a rebase the row carries a new flight and the
 * verdict is about a plan it no longer has. `pacingPlanFreshness` (contracts) is the one
 * derivation both the Optimizer's stamp and this reader use, so "stale" is a comparison, never
 * a guess. Null unless the verdict is stale: a current, unversioned or absent stamp says nothing.
 */
export function pacingStaleLine(
  pacing: PacingStamp | null | undefined,
  portfolio: Pick<PortfolioListItem, 'period_start' | 'period_end' | 'period_budget'>,
): { text: string; title: string } | null {
  const reading = pacingPlanFreshness(pacing, portfolio);
  if (reading.freshness !== 'stale' || reading.runPlan === null) return null;
  const flight =
    reading.currentPlan === null ? 'no complete flight' : describePlan(reading.currentPlan);
  return {
    text: 'pacing stale',
    title: `The last cycle paced the ${describePlan(reading.runPlan)} plan; the flight is now ${flight}. The verdict is about a plan this portfolio no longer has.`,
  };
}

/** How many of the given portfolios have missed a cycle. */
export function staleCount(portfolios: readonly Pick<StalenessRead, 'stale_for_days'>[]): number {
  return portfolios.filter(isStale).length;
}

function parseIso(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}
