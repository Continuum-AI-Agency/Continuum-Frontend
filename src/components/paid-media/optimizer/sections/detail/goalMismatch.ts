// Ad sets that bid for a different result than the portfolio measures (`kpi_mismatch`).
//
// The engine holds every one of them — it cannot rank a cheap event against an expensive
// one — so a portfolio whose ad sets ALL bid for something else moves nothing, every cycle,
// however long it waits. The live case: a `conversations` portfolio whose 12 of 12 ad sets
// optimise for pixel PURCHASE with a WhatsApp destination.
//
// Two sources, in order: the engine's own `kpi_mismatch` confidence actionable (it knows
// what the ad sets bid for and their share of spend), then the cycle items' freezeReason,
// which every body served today carries. The second cannot name the result they bid for,
// so it says "a different result" rather than guess.

import type { CycleItemRow, ParsedCycleRunReport } from '@continuum/contracts';

export type GoalMismatch = {
  scope: 'all' | 'some';
  mismatched: number;
  total: number;
  /** What the held ad sets bid for, in the engine's words ("purchases"); null when unknown. */
  bought: string | null;
  /** What the portfolio measures ("conversations"). */
  measures: string;
  /** Their share of spend (engine) or of the daily budget (items); null when it says nothing. */
  share: { pct: number; of: 'spend' | 'budget' } | null;
  text: string;
};

export type MismatchMessage = {
  mismatched: number;
  total: number;
  bought: string | null;
  priced: string;
};

/** The engine names a result it cannot identify "another result": that is not a name. */
const UNNAMED = 'another result';

/**
 * The engine's kpi_mismatch sentence (optimization-engine confidence.ts), read back:
 * "12 of 12 ad sets (100% of spend) bid for purchases, not the conversations this portfolio
 * prices, …". Null for a sentence in a shape this does not know.
 */
export function readMismatchMessage(message: string): MismatchMessage | null {
  const said = /^(\d+) of (\d+) ad sets.*? bid for (.+?), not the (.+?) this portfolio prices/.exec(
    message,
  );
  if (!said) return null;
  return {
    mismatched: Number(said[1]),
    total: Number(said[2]),
    bought: said[3] === UNNAMED ? null : said[3],
    priced: said[4],
  };
}

const isMismatched = (item: CycleItemRow): boolean =>
  item.diagnostics?.freezeReason === 'kpi_mismatch';

/** The held ad sets' share of the budget the cycle scored — the items carry no spend. */
function budgetShare(items: readonly CycleItemRow[]): GoalMismatch['share'] {
  const budget = (item: CycleItemRow) => Math.max(item.current_budget ?? 0, 0);
  const total = items.reduce((sum, item) => sum + budget(item), 0);
  if (total <= 0) return null;
  const held = items.filter(isMismatched).reduce((sum, item) => sum + budget(item), 0);
  return { pct: Math.round((held / total) * 100), of: 'budget' };
}

function sentence(m: Omit<GoalMismatch, 'text'>): string {
  const what = m.bought
    ? `for ${m.bought}, not the ${m.measures}`
    : `for a different result than the ${m.measures}`;
  if (m.scope === 'all') {
    const who = m.total === 1 ? 'The one ad set bids' : `All ${m.total} ad sets bid`;
    const them = m.total === 1 ? 'it' : 'them';
    return `${who} ${what} this portfolio measures — the optimizer holds ${them} and moves nothing.`;
  }
  const share = m.share ? ` (${m.share.pct}% of ${m.share.of})` : '';
  const verb = m.mismatched === 1 ? 'bids' : 'bid';
  const them = m.mismatched === 1 ? 'it' : 'them';
  return `${m.mismatched} of ${m.total} ad sets${share} ${verb} ${what} this portfolio measures — the optimizer holds ${them} and moves only the rest.`;
}

export function goalMismatchOf(args: {
  report: ParsedCycleRunReport | null;
  /** The result the portfolio measures, plural and lower-case ("conversations"). */
  measures: string;
}): GoalMismatch | null {
  const { report, measures } = args;
  if (!report) return null;
  const items = report.latest_items;
  const actionable =
    report.latest_run?.confidence?.actionables?.find((a) => a.code === 'kpi_mismatch') ?? null;
  const said = actionable ? readMismatchMessage(actionable.message) : null;

  const mismatched = actionable?.adsetIds.length ?? items.filter(isMismatched).length;
  if (mismatched === 0) return null;
  const total = Math.max(items.length || (said?.total ?? 0), mismatched);
  const scope = mismatched >= total ? 'all' : 'some';
  const spendShare = actionable?.spendShare;
  const share =
    scope === 'all'
      ? null
      : typeof spendShare === 'number' && Number.isFinite(spendShare)
        ? { pct: Math.round(spendShare * 100), of: 'spend' as const }
        : budgetShare(items);
  const shape = {
    scope,
    mismatched,
    total,
    bought: said?.bought ?? null,
    measures,
    share,
  } as const;
  return { ...shape, text: sentence(shape) };
}
