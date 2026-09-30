// The story behind a cycle's budget moves: every scored ad set's cost per result over a
// chosen lookback, against the target, beside the budget it has and the budget it is
// getting. Read together the picture explains itself — money leaves the rows priced above
// target and lands on the rows priced below it — and the summary says so in one sentence,
// with the blended cost the move is expected to buy.
//
// Pure and DOM-free. Costs come from the account snapshots' engine windows (d3 / d7 / d14,
// the same numbers the engine scored on); the 14-day Poisson interval from the cycle
// diagnostics rides along when the lookback is 14 days. Nothing here recomputes the
// engine's reason — `item.reason` is rendered verbatim by the caller.

import type {
  AdSetSnapshot,
  CycleItemRow,
  OptimizationMetricDefinition,
} from '@continuum/contracts';
import { resolveAdsetName } from '../adsetName';
import { deriveEfficiency, formatCurrency } from '../format';
import { measuredCpa } from '../reportModel';

export type StoryLookback = 3 | 7 | 14;
export const STORY_LOOKBACKS: readonly StoryLookback[] = [3, 7, 14];

export type StoryRow = {
  adsetId: string;
  name: string;
  /** Cost per result in DISPLAY units over the lookback; null with no results. */
  cost: number | null;
  /** 95% interval (display units) — only with the 14-day engine window. */
  ci: { lo: number; hi: number } | null;
  results: number;
  spend: number;
  current: number;
  proposed: number;
  changeAbs: number;
  changePct: number | null;
  held: boolean;
  freezeReason: string | null;
  deliveryState: string | null;
  /** Standing against the target: below (good), above, or unknown (no target / no cost). */
  standing: 'below' | 'above' | 'unknown';
  reason: string | null;
};

export type ReallocationStory = {
  lookback: StoryLookback;
  rows: StoryRow[];
  /** Shared axis maximum for cost (display units), padded so whiskers fit. */
  costMax: number;
  /** Shared axis maximum for budget bars. */
  budgetMax: number;
  target: number | null;
  moved: number;
  movedCount: number;
  gainers: number;
  losers: number;
  /** Ad sets losing budget that are priced above target, and gainers priced below it. */
  losersAboveTarget: number;
  gainersBelowTarget: number;
  /** Spend-weighted cost per result before and after, assuming each ad set keeps its cost. */
  blendedBefore: number | null;
  blendedAfter: number | null;
  summary: string;
};

const WINDOW_BY_LOOKBACK: Record<StoryLookback, 'd3' | 'd7' | 'd14'> = {
  3: 'd3',
  7: 'd7',
  14: 'd14',
};

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Spend-weighted cost per result of a set of budgets, assuming each ad set's cost holds:
 *  Σbudget / Σ(budget / cost). Null when nothing priced carries budget. */
export function blendedCost(rows: Array<{ budget: number; cost: number | null }>): number | null {
  let spend = 0;
  let results = 0;
  for (const row of rows) {
    if (row.cost == null || row.cost <= 0 || row.budget <= 0) continue;
    spend += row.budget;
    results += row.budget / row.cost;
  }
  return results > 0 ? spend / results : null;
}

export function buildReallocationStory(args: {
  items: CycleItemRow[];
  metric: OptimizationMetricDefinition;
  snapshotById?: Map<string, AdSetSnapshot> | null;
  nameById?: Map<string, string> | null;
  lookback: StoryLookback;
  /** Target in DISPLAY units. */
  target: number | null | undefined;
  currency?: string | null;
}): ReallocationStory {
  const { items, metric, snapshotById, nameById, lookback, currency } = args;
  const target = args.target != null && args.target > 0 ? args.target : null;
  const window = WINDOW_BY_LOOKBACK[lookback];
  const mult = metric.denominatorMultiplier;

  const rows: StoryRow[] = items.map((item) => {
    const snapshot = snapshotById?.get(item.adset_id) ?? null;
    const w = (snapshot?.windows?.[window] ?? null) as Record<string, unknown> | null;
    const spend = num(w?.spend) ?? 0;
    const results = num(w?.[metric.kpiField]) ?? 0;
    const ciRaw = item.diagnostics?.ci ?? null;
    const costFromWindow = w ? deriveEfficiency(spend, results, mult) : null;
    // Without a snapshot window the engine's 14-day CI point is the only cost we have.
    const measured = measuredCpa(ciRaw);
    const costFromCi = measured != null ? measured * mult : null;
    const cost = costFromWindow ?? (lookback === 14 ? costFromCi : null);
    const ci =
      lookback === 14 && num(ciRaw?.lo) != null && num(ciRaw?.hi) != null
        ? { lo: (ciRaw?.lo as number) * mult, hi: (ciRaw?.hi as number) * mult }
        : null;
    const current = item.current_budget ?? 0;
    const proposed = item.final_budget ?? current;
    const freezeReason = item.diagnostics?.freezeReason ?? null;
    const standing: StoryRow['standing'] =
      target == null || cost == null ? 'unknown' : cost <= target ? 'below' : 'above';
    return {
      adsetId: item.adset_id,
      name: resolveAdsetName(item, nameById) ?? item.adset_id,
      cost,
      ci,
      results,
      spend,
      current,
      proposed,
      changeAbs: item.change_abs ?? proposed - current,
      changePct: item.change_pct ?? null,
      held: Boolean(freezeReason),
      freezeReason,
      deliveryState: item.diagnostics?.delivery?.state ?? null,
      standing,
      reason: item.reason ?? null,
    };
  });

  // Best value first; unpriced rows sink to the bottom, held rows below the moved ones.
  rows.sort((a, b) => {
    if (a.held !== b.held) return a.held ? 1 : -1;
    if (a.cost == null && b.cost == null) return b.changeAbs - a.changeAbs;
    if (a.cost == null) return 1;
    if (b.cost == null) return -1;
    return a.cost - b.cost;
  });

  const costValues = rows.flatMap((row) => [row.cost ?? 0, row.ci?.hi ?? 0]);
  const costMax = Math.max(target ?? 0, ...costValues, 1) * 1.08;
  const budgetMax = Math.max(...rows.flatMap((row) => [row.current, row.proposed]), 1) * 1.05;

  const gainers = rows.filter((row) => row.changeAbs > 0.5);
  const losers = rows.filter((row) => row.changeAbs < -0.5);
  const moved = gainers.reduce((sum, row) => sum + row.changeAbs, 0);
  const blendedBefore = blendedCost(rows.map((r) => ({ budget: r.current, cost: r.cost })));
  const blendedAfter = blendedCost(rows.map((r) => ({ budget: r.proposed, cost: r.cost })));
  const losersAboveTarget = losers.filter((row) => row.standing === 'above').length;
  const gainersBelowTarget = gainers.filter((row) => row.standing === 'below').length;

  let summary: string;
  if (gainers.length === 0 && losers.length === 0) {
    summary = 'No budget moved this cycle — every ad set keeps what it has.';
  } else {
    const fromPart =
      losers.length > 0
        ? `from ${losers.length} ad set${losers.length === 1 ? '' : 's'}${
            target != null && losersAboveTarget > 0 ? ` (${losersAboveTarget} above target)` : ''
          }`
        : 'from the pool';
    const toPart =
      gainers.length > 0
        ? `to ${gainers.length} ad set${gainers.length === 1 ? '' : 's'}${
            target != null && gainersBelowTarget > 0 ? ` (${gainersBelowTarget} below target)` : ''
          }`
        : 'back to the pool';
    const blend =
      blendedBefore != null && blendedAfter != null && Math.abs(blendedBefore - blendedAfter) >= 0.5
        ? ` Blended ${metric.costLabel} ${blendedAfter < blendedBefore ? 'improves' : 'moves'} from ${formatCurrency(blendedBefore, currency)} to ${formatCurrency(blendedAfter, currency)} if each ad set keeps its ${lookback}-day cost.`
        : '';
    summary = `Moving ${formatCurrency(moved, currency)}/day ${fromPart} ${toPart}.${blend}`;
  }

  return {
    lookback,
    rows,
    costMax,
    budgetMax,
    target,
    moved,
    movedCount: gainers.length + losers.length,
    gainers: gainers.length,
    losers: losers.length,
    losersAboveTarget,
    gainersBelowTarget,
    blendedBefore,
    blendedAfter,
    summary,
  };
}

/** Which lookback a stored portfolio window maps to (d7 → 7, d14/d30 → 14, else 7). */
export function defaultStoryLookback(window: string | null | undefined): StoryLookback {
  if (window === 'd7') return 7;
  if (window === 'd14' || window === 'd30') return 14;
  return 7;
}
