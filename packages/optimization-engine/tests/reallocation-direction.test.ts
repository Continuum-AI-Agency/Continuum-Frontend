// A budget move follows efficiency RELATIVE TO WHAT EACH AD SET HAS TODAY.
//
// The solver used to target `pool × score ÷ Σscore`, which ignores the current budget: when the
// cheapest ad sets already hold most of the money (exactly what Meta does with its winners),
// their "share" came out below what they had and the engine cut them to fund pricier ones.
// The fixture is the real 2026-10-13 cycle of Easy Fit's "Conversaciones Whatsapp" portfolio
// (1,200 MXN/day, conversations): it cut ALEIRA (34.6 MXN per conversation, the cheapest) by 8 %
// and raised ITESO (50.1) by 25 %. Windows are rebuilt from that cycle's per-window scores and
// its 14-day event counts (d7 ≈ half, d3 ≈ 3/14).
import { expect, test } from 'bun:test';
import type { AdSetSnapshot, WindowMetrics } from '../src/index';
import { classifyStatus, getObjectiveProfile, reallocate, resolveConfig, scoreAdSet } from '../src/index';

const win = (spend: number, conversations: number): WindowMetrics => ({
  spend,
  purchases: 0,
  addToCarts: 0,
  clicks: Math.round(conversations * 4),
  impressions: Math.round(spend * 40),
  conversations,
});

const WHATSAPP_2026_10_13 = [
  { name: "ALEIRA // AGOSTO - BAU - Mensajes", current: 269.79, d3: win(886.42, 21), d7: win(1705.11, 50), d14: win(3464.11, 100) },
  { name: "CA\u00d1ADAS // AGOSTO - BROAD - Mensajes", current: 212.12, d3: win(1286.25, 15), d7: win(2042.12, 35), d14: win(3722.5, 70) },
  { name: "CA\u00d1ADAS // AGOSTO - LKL - Mensajes", current: 163.09, d3: win(865.11, 22), d7: win(2562.13, 51), d14: win(3895.02, 102) },
  { name: "AV CAMACHO // AGOSTO - LKL - Mensajes", current: 150.07, d3: win(678.5, 14), d7: win(1609.22, 34), d14: win(3210.27, 67) },
  { name: "AV CAMACHO // AGOSTO - Broad - Mensajes", current: 140.89, d3: win(928.16, 14), d7: win(1487.71, 32), d14: win(3236.36, 63) },
  { name: "AV CAMACHO // AGOSTO - BAU - Mensajes", current: 125.02, d3: win(566.87, 12), d7: win(1508.61, 27), d14: win(2865.24, 54) },
  { name: "ITESO // AGOSTO - BROAD - Mensajes", current: 104.49, d3: win(1351.16, 12), d7: win(1372.36, 27), d14: win(2705.68, 54) },
];

const profile = getObjectiveProfile('conversations');
const cfg = resolveConfig({ kpiField: profile.kpiField, upperFunnelField: profile.upperFunnelField, cpaTarget: 30 });

const snapshots = (status: AdSetSnapshot['status']): AdSetSnapshot[] =>
  WHATSAPP_2026_10_13.map((r, i) => ({
    id: `as-${i}`,
    name: r.name,
    status,
    currentBudget: r.current,
    ageDays: 60,
    windows: { d3: r.d3, d7: r.d7, d14: r.d14 },
  }));

const spendWeightedComposite = (snaps: AdSetSnapshot[]): number => {
  const total = snaps.reduce((s, x) => s + x.currentBudget, 0);
  return snaps.reduce((s, x) => s + x.currentBudget * scoreAdSet(x, cfg).composite, 0) / total;
};

for (const status of ['active', 'learning'] as const) {
  test(`${status}: an ad set better than the portfolio never loses budget, a worse one never gains`, () => {
    const snaps = snapshots(status);
    const avg = spendWeightedComposite(snaps);
    const result = reallocate(snaps, 1200, { kpiField: profile.kpiField, upperFunnelField: profile.upperFunnelField, cpaTarget: 30 });
    expect(result.conserved).toBe(true);
    for (const item of result.items) {
      const snap = snaps.find((s) => s.id === item.id)!;
      const better = scoreAdSet(snap, cfg).composite > avg;
      if (better) expect(item.changeAbs).toBeGreaterThanOrEqual(-1e-6);
      else expect(item.changeAbs).toBeLessThanOrEqual(1e-6);
    }
  });
}

test('the cheapest ad set gains and the dearest loses on the real WhatsApp cycle', () => {
  const result = reallocate(snapshots('active'), 1200, { kpiField: profile.kpiField, upperFunnelField: profile.upperFunnelField, cpaTarget: 30 });
  const byName = new Map(result.items.map((i, k) => [WHATSAPP_2026_10_13[k].name, i]));
  expect(byName.get('ALEIRA // AGOSTO - BAU - Mensajes')!.changeAbs).toBeGreaterThan(0);
  expect(byName.get('ITESO // AGOSTO - BROAD - Mensajes')!.changeAbs).toBeLessThan(0);
  expect(byName.get('CAÑADAS // AGOSTO - BROAD - Mensajes')!.changeAbs).toBeLessThan(0);
});

test('equal budgets allocate exactly as before: the anchor is a no-op when every ad set holds the same', () => {
  const equal = snapshots('active').map((s) => ({ ...s, currentBudget: 1200 / 7 }));
  const result = reallocate(equal, 1200, { kpiField: profile.kpiField, upperFunnelField: profile.upperFunnelField, cpaTarget: 30 });
  const best = result.items.reduce((a, b) => (a.compositeScore > b.compositeScore ? a : b));
  const worst = result.items.reduce((a, b) => (a.compositeScore < b.compositeScore ? a : b));
  expect(best.changeAbs).toBeGreaterThan(0);
  expect(worst.changeAbs).toBeLessThan(0);
});

test('an ad set with no budget today still receives one (it is anchored on the eligible average)', () => {
  const snaps = snapshots('active');
  snaps[1] = { ...snaps[1], currentBudget: 0 };
  const result = reallocate(snaps, 1200, { kpiField: profile.kpiField, upperFunnelField: profile.upperFunnelField, cpaTarget: 30 });
  expect(result.items[1].finalBudget).toBeGreaterThan(0);
});

test('Meta: the learning stage the read carries decides, the conversion proxy only when no read', () => {
  const iteso = snapshots('active').find((x) => x.name === 'ITESO // AGOSTO - BROAD - Mensajes')!;
  const base: AdSetSnapshot = { ...iteso, status: 'active', platform: 'meta' };
  // ITESO: 54 conversations in 14 days → 27 in 7, under the 50-in-7-days proxy.
  const exited = { ...base, delivery: { blockers: [] } };
  expect(classifyStatus(exited, cfg)).toBe('active');
  const learning = { ...base, delivery: { blockers: [], learningStage: 'LEARNING' } };
  expect(classifyStatus(learning, cfg)).toBe('learning');
  const limited = { ...base, delivery: { blockers: [], learningStage: 'LEARNING_LIMITED' } };
  expect(classifyStatus(limited, cfg)).toBe('active');
  const noRead = { ...base, delivery: undefined };
  expect(classifyStatus(noRead, cfg)).toBe('learning');
});
