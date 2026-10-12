// No evidence, no move.
//
// The solver ranks ad sets on events per unit of spend. An established ad set that spent
// NOTHING in the decision window has no such ratio — not a bad one, none — and it used to
// enter the pool anyway with a composite of 0. With every score at 0 the solver spreads the
// pool evenly inside the velocity boxes, so a roster with zero spend got ±0.08 moves on
// budgets of ~96 (twin scenario no_spend, 2026-10-09): figures with nothing behind them,
// and each one a Meta write once a human approved the cycle.
//
// A zero-spend ad set is now HELD (`freezeReason: 'no_spend'`), exactly as a spending ad set
// with zero conversions is held `no_conversions`. The delivery stage says WHY beside it: an
// ad set that is funded and served nothing for days gets a D2 finding that names the dark
// days and quotes Meta's blockers. On a pacing cycle the held budget still follows the
// plan's step, as every held budget does.
import { describe, expect, test } from 'bun:test';
import type { AdSetSnapshot, DailyMetrics, WindowMetrics } from '../src/index';
import { runCycle } from '../src/index';

const ASOF = '2026-10-09';

const win = (spend: number, purchases: number, impressions = 0): WindowMetrics => ({
  spend,
  purchases,
  addToCarts: 0,
  clicks: 0,
  impressions,
});

const zero = (): WindowMetrics => win(0, 0);

/** `days` complete days before ASOF, each with zero delivery. */
function darkSeries(days: number): DailyMetrics[] {
  const out: DailyMetrics[] = [];
  for (let back = days; back >= 1; back -= 1) {
    const at = new Date(`${ASOF}T00:00:00Z`);
    at.setUTCDate(at.getUTCDate() - back);
    out.push({ date: at.toISOString().slice(0, 10), ...zero() });
  }
  return out;
}

function spending(id: string, currentBudget: number): AdSetSnapshot {
  return {
    id,
    status: 'active',
    currentBudget,
    ageDays: 40,
    windows: { d3: win(30, 3, 3000), d7: win(70, 7, 7000), d14: win(140, 14, 14000) },
  };
}

function silent(
  id: string,
  currentBudget: number,
  over: Partial<AdSetSnapshot> = {},
): AdSetSnapshot {
  return {
    id,
    status: 'active',
    currentBudget,
    ageDays: 40,
    windows: { d3: zero(), d7: zero(), d14: zero() },
    daily: darkSeries(14),
    ...over,
  };
}

const itemOf = (r: ReturnType<typeof runCycle>, id: string) =>
  r.reallocation.items.find((i) => i.id === id)!;

describe('runCycle — a zero-spend ad set is held, and the result says why', () => {
  test('a roster that spent nothing proposes no budget move', () => {
    const r = runCycle([silent('a', 97.58), silent('b', 95.56)], {
      mode: 'balanced',
      total: 97.58 + 95.56,
      asOf: ASOF,
      config: { cpaTarget: 50 },
    });
    for (const id of ['a', 'b']) {
      const it = itemOf(r, id);
      expect(it.freezeReason).toBe('no_spend');
      expect(it.finalBudget).toBe(it.currentBudget);
      expect(it.changeAbs).toBe(0);
    }
    // The delivery stage names the reason beside the held budget.
    const d2 = r.recommendations.filter((x) => x.trigger === 'D2_dark_with_budget');
    expect(d2.map((x) => x.adSetId).sort()).toEqual(['a', 'b']);
    expect(d2[0]?.reason).toMatch(/zero impressions/i);
  });

  test('a learning-phase ad set with no spend is held just the same', () => {
    const r = runCycle([silent('young', 100, { ageDays: 10 }), spending('a', 100)], {
      mode: 'balanced',
      total: 200,
      asOf: ASOF,
      config: { cpaTarget: 50 },
    });
    const young = itemOf(r, 'young');
    expect(young.freezeReason).toBe('no_spend');
    expect(young.finalBudget).toBe(100);
  });

  test('in a mixed roster only the silent ad set is held; the rest still conserve the total', () => {
    const r = runCycle([silent('dark', 100), spending('a', 100), spending('b', 100)], {
      mode: 'balanced',
      total: 330,
      asOf: ASOF,
      config: { cpaTarget: 50 },
    });
    expect(itemOf(r, 'dark').freezeReason).toBe('no_spend');
    expect(itemOf(r, 'dark').finalBudget).toBe(100);
    expect(itemOf(r, 'a').freezeReason).toBeUndefined();
    expect(itemOf(r, 'b').freezeReason).toBeUndefined();
    expect(r.reallocation.allocatedTotal).toBeCloseTo(330, 6);
    expect(r.reallocation.conserved).toBe(true);
  });

  test('a spending ad set with zero conversions is never mistaken for a zero-spend one', () => {
    const spentNothingBack: AdSetSnapshot = {
      ...spending('quiet', 100),
      windows: { d3: win(30, 0, 3000), d7: win(70, 0, 7000), d14: win(140, 0, 14000) },
    };
    // Spend without results is a judged case — a pause trigger starves it, or the
    // no_conversions abstain holds it — never the unjudgeable zero-spend one.
    const r = runCycle([spentNothingBack, spending('a', 100)], {
      mode: 'balanced',
      total: 200,
      asOf: ASOF,
      config: { cpaTarget: 50 },
    });
    expect(itemOf(r, 'quiet').freezeReason).not.toBe('no_spend');
  });

  test('on a pacing cycle the held budget follows the plan step like every held budget', () => {
    const r = runCycle([silent('dark', 100), spending('a', 100)], {
      mode: 'balanced',
      pacing: { periodBudget: 300, periodDays: 2, dayIndex: 1, actualSpendToDate: 0 },
      asOf: ASOF,
      config: { cpaTarget: 50 },
    });
    expect(itemOf(r, 'dark').freezeReason).toBe('no_spend');
    expect(itemOf(r, 'dark').finalBudget).toBeCloseTo(75, 6);
    expect(r.reallocation.allocatedTotal).toBeCloseTo(150, 6);
  });
});
