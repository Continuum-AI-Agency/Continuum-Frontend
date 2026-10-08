// One money rule for every sentence the engine writes.
//
// A Mexican account whose currency is null read "$29.10 per lead" and "CPP 14d $198" on the
// same card that printed the Frontend's bare "28.68/day": each template carried its own
// `$${x.toFixed(...)}`. The rule is now `formatMoney` from contracts — the Frontend's own
// formatCurrency, mirrored — and this file pins every producer to it: null currency prints
// BARE, USD prints "$", any other code follows the figure. Delete the formatter in one
// producer and exactly that case fails.
import { expect, test } from 'bun:test';
import type {
  AdSetSnapshot,
  DailyMetrics,
  EngineConfig,
  ItemDiagnostics,
  ReallocationResult,
  WindowMetrics,
} from '../src/index';
import {
  computePacing,
  DEFAULT_CONFIG,
  evaluateDelivery,
  evaluateFatigue,
  evaluateSettings,
  evaluateTriggers,
} from '../src/index';

const w = (
  spend: number,
  purchases: number,
  clicks = 0,
  impressions = 0,
  addToCarts = 0,
): WindowMetrics => ({
  spend,
  purchases,
  addToCarts,
  clicks,
  impressions,
});
const mk = (over: Partial<AdSetSnapshot> = {}): AdSetSnapshot => ({
  id: 'x',
  status: 'active',
  currentBudget: 100,
  ageDays: 30,
  windows: { d3: w(100, 5), d7: w(100, 5), d14: w(100, 5) },
  ...over,
});
const withCurrency = (currency: string | null): EngineConfig => ({ ...DEFAULT_CONFIG, currency });

/** The three spellings one figure must take: bare, dollars, pesos. */
const CASES: { currency: string | null; expect: (figure: string) => string }[] = [
  { currency: null, expect: (f) => f },
  { currency: 'USD', expect: (f) => `$${f}` },
  { currency: 'MXN', expect: (f) => `${f} MXN` },
];

test('P1, P2 and P3 pause reasons carry the account currency, or none', () => {
  const cohort = [
    mk({ id: 'c10', windows: { d3: w(50, 5), d7: w(100, 10), d14: w(200, 20) } }),
    mk({ id: 'c20', windows: { d3: w(100, 5), d7: w(200, 10), d14: w(400, 20) } }),
    mk({ id: 'c30', windows: { d3: w(150, 5), d7: w(300, 10), d14: w(600, 20) } }),
  ];
  const p1 = mk({ id: 'p1', windows: { d3: w(8, 0), d7: w(8, 0), d14: w(8, 0) } });
  const p2 = mk({ id: 'p2', windows: { d3: w(153, 3), d7: w(357, 7), d14: w(510, 10) } });
  const p3 = mk({
    id: 'p3',
    windows: { d3: w(20, 0, 0, 0, 1), d7: w(35, 0, 0, 0, 1), d14: w(51, 0, 0, 0, 1) },
  });
  for (const c of CASES) {
    const out = evaluateTriggers([...cohort, p1, p2, p3], withCurrency(c.currency)).recommendations;
    expect(out.find((r) => r.adSetId === 'p1')?.reason).toContain(
      `Spent ${c.expect('8.00')} over 3d`,
    );
    expect(out.find((r) => r.adSetId === 'p2')?.reason).toContain(
      `CPP 14d ${c.expect('51.00')} > 2.5× the robust reference (${c.expect('20.00')})`,
    );
    expect(out.find((r) => r.adSetId === 'p3')?.reason).toContain(
      `Spent ${c.expect('51.00')} over 14d`,
    );
  }
});

test('the P1 upper-funnel arm never puts an article before the substituted label', () => {
  // "an landing-page view cost of 86" shipped on a lead portfolio: the article was fixed
  // while the label was not. Every objective's label reads without one now.
  const cheap = Array.from({ length: 5 }, (_, i) =>
    mk({
      id: `cheap-${i}`,
      windows: { d3: w(30, 2, 0, 0, 30), d7: w(70, 5, 0, 0, 70), d14: w(140, 10, 0, 0, 140) },
    }),
  );
  const pricey = mk({
    id: 'pricey',
    windows: { d3: w(300, 0, 0, 0, 1), d7: w(700, 0, 0, 0, 3), d14: w(1400, 0, 0, 0, 6) },
  });
  for (const label of ['add-to-cart', 'landing-page view', 'link click', 'click', 'impression']) {
    const cfg: EngineConfig = { ...DEFAULT_CONFIG, upperFunnelLabel: label };
    const reason = evaluateTriggers([...cheap, pricey], cfg).recommendations.find(
      (r) => r.adSetId === 'pricey',
    )?.reason;
    expect(reason).toContain(`paying 300 per ${label} — over 4× the portfolio average of`);
    expect(reason).not.toMatch(new RegExp(`\\ban? ${label}`));
  }
});

test('F2 audience saturation prints the two CPAs in the account currency, or bare', () => {
  const decaying = mk({
    ageDays: 40,
    audienceType: 'prospecting',
    frequency7d: 4.0,
    windows: { d3: w(600, 10), d7: w(1800, 35), d14: w(4000, 100) },
  });
  for (const c of CASES) {
    const rec = evaluateFatigue([decaying], withCurrency(c.currency))[0];
    expect(rec?.trigger).toBe('F2_audience_saturation');
    expect(rec?.reason).toContain(`(3d ${c.expect('60.00')} vs 14d ${c.expect('40.00')})`);
  }
});

const item = (id: string): ItemDiagnostics => ({
  id,
  status: 'active',
  currentBudget: 100,
  score3d: 1,
  score7d: 1,
  score14d: 1,
  trajectoryRatio: 1,
  trajectoryState: 'flat',
  weights: { d3: 0.2, d7: 0.4, d14: 0.4 },
  compositeScore: 1,
  effectiveScore: 1,
  portfolioShare: 0.25,
  rawBudget: 100,
  velocityCapped: 100,
  floor: 15,
  lowerBound: 70,
  upperBound: 130,
  finalBudget: 100,
  changeAbs: 0,
  changePct: 0,
  capBreached: false,
  floorRelaxed: false,
});
const realloc = (over: Partial<ReallocationResult>): ReallocationResult => ({
  totalBudget: 400,
  pool: 400,
  frozenBudget: 0,
  items: [item('a'), item('b')],
  allocatedTotal: 400,
  conserved: true,
  residual: 0,
  feasibility: { sumLowerBounds: 280, sumUpperBounds: 520, overflow: false, underflow: false },
  notes: [],
  ...over,
});

test('S3 and S5 settings reasons follow the same rule', () => {
  const healthy = mk({
    id: 'h',
    windows: { d3: w(300, 5, 50, 3000), d7: w(700, 12, 120, 7000), d14: w(1400, 25, 250, 14000) },
  });
  const dark = mk({
    id: 'dark',
    windows: { d3: w(30, 0, 0, 500), d7: w(60, 0, 0, 900), d14: w(120, 0, 0, 1800) },
  });
  for (const c of CASES) {
    const recs = evaluateSettings(
      realloc({ residual: 60, allocatedTotal: 340 }),
      [healthy, dark],
      withCurrency(c.currency),
      { mode: 'efficiency' },
    );
    expect(recs.find((r) => r.trigger === 'S3_persistent_underspend')?.reason).toContain(
      `left ${c.expect('60.00')} of the ${c.expect('400')} pool`,
    );
    expect(recs.find((r) => r.trigger === 'S5_tracking_gap')?.reason).toContain(
      `spent ${c.expect('120')} over 14 days`,
    );
  }
});

test('D2 prints the budget it is ACTIVE with in the account currency, or bare', () => {
  const asOf = '2026-09-06';
  const day = (daysBack: number, impressions: number): DailyMetrics => ({
    date: new Date(Date.parse(`${asOf}T00:00:00Z`) - daysBack * 86_400_000)
      .toISOString()
      .slice(0, 10),
    spend: 10,
    purchases: 0,
    addToCarts: 0,
    clicks: 0,
    impressions,
  });
  const s = mk({ ageDays: 60, daily: [day(6, 4000)], delivery: { blockers: [] } });
  for (const c of CASES) {
    const d2 = evaluateDelivery([s], [], asOf, c.currency).recommendations.find(
      (r) => r.trigger === 'D2_dark_with_budget',
    );
    expect(d2?.reason).toContain(`ACTIVE on Meta with ${c.expect('100')}/day of budget`);
  }
});

test('the pacing note prints the daily total in the account currency, or bare', () => {
  const state = { periodBudget: 3000, periodDays: 30, dayIndex: 11, actualSpendToDate: 700 };
  expect(computePacing(state).note).toContain('daily raised to 115 to catch up');
  expect(computePacing(state, 'USD').note).toContain('daily raised to $115');
  expect(computePacing(state, 'MXN').note).toContain('daily raised to 115 MXN');
});
