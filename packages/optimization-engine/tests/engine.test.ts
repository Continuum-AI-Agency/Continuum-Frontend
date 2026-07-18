// Engine test suite (bun test). Mirrors the upstream Node-test fidelity/solver/
// cycle suites, adapted to bun's runner + this repo's extensionless imports.
// Excluded from `next build` tsc via the root tsconfig `**/*.test.*` rule.
import { expect, test } from 'bun:test';
import type { AdSetSnapshot, OptimizationObjective, WindowMetrics } from '../src/index';
import {
  classifyStatus,
  computePacing,
  DEFAULT_CONFIG,
  evaluateTriggers,
  getObjectiveProfile,
  mapMetaRowToWindowMetrics,
  reallocate,
  resolveConfig,
  runCycle,
  scoreAdSet,
  windowScore,
} from '../src/index';

const approx = (a: number, b: number, tol = 1e-3) => expect(Math.abs(a - b) <= tol).toBe(true);

// --- Excel "Cycle Simulation" fixture (Total Daily Budget = $1000) ---------
const cpp = (c: number): WindowMetrics =>
  c > 0
    ? { spend: c, purchases: 1, addToCarts: 0, clicks: 0, impressions: 0 }
    : { spend: 0, purchases: 0, addToCarts: 0, clicks: 0, impressions: 0 };

const EXCEL_TOTAL = 1000;
const EXCEL: AdSetSnapshot[] = [
  {
    id: 'C-01',
    status: 'active',
    currentBudget: 125,
    ageDays: 45,
    windows: { d3: cpp(30), d7: cpp(32), d14: cpp(35) },
  },
  {
    id: 'C-02',
    status: 'learning',
    currentBudget: 125,
    learningPhase: true,
    ageDays: 10,
    windows: { d3: cpp(45), d7: cpp(48), d14: cpp(0) },
  },
  {
    id: 'C-03',
    status: 'active',
    currentBudget: 125,
    ageDays: 60,
    windows: { d3: cpp(28), d7: cpp(30), d14: cpp(28) },
  },
  {
    id: 'C-04',
    status: 'active',
    currentBudget: 125,
    ageDays: 20,
    windows: { d3: cpp(35), d7: cpp(55), d14: cpp(60) },
  },
  {
    id: 'C-05',
    status: 'active',
    currentBudget: 125,
    ageDays: 30,
    windows: { d3: cpp(65), d7: cpp(40), d14: cpp(38) },
  },
  {
    id: 'C-06',
    status: 'active',
    currentBudget: 125,
    ageDays: 90,
    windows: { d3: cpp(90), d7: cpp(85), d14: cpp(80) },
  },
  {
    id: 'C-07',
    status: 'grace',
    currentBudget: 125,
    ageDays: 4,
    windows: { d3: cpp(0), d7: cpp(0), d14: cpp(0) },
  },
  {
    id: 'C-08',
    status: 'flagged',
    currentBudget: 125,
    ageDays: 12,
    windows: { d3: cpp(0), d7: cpp(0), d14: cpp(0) },
  },
];
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

// --- Fidelity vs the Excel reference --------------------------------------
test('composite scores match the Excel sheet 1:1', () => {
  const res = reallocate(EXCEL, EXCEL_TOTAL);
  const by = (id: string) => res.items.find((i) => i.id === id)!;
  approx(by('C-01').score3d, 1 / 30, 1e-6);
  approx(by('C-01').compositeScore, 0.031339, 1e-5);
  approx(by('C-02').compositeScore, 0.021354, 1e-5);
  approx(by('C-03').compositeScore, 0.034524, 1e-5);
  approx(by('C-04').compositeScore, 0.023225, 1e-5);
  approx(by('C-05').compositeScore, 0.024696, 1e-5);
  approx(by('C-06').compositeScore, 0.011716, 1e-5);
  expect(by('C-04').trajectoryState).toBe('positive');
  expect(by('C-05').trajectoryState).toBe('negative');
  approx(by('C-01').floor, 18.75, 1e-6);
});

// --- Solver: conservation + water-filling ---------------------------------
test('final budgets conserve the total exactly', () => {
  const res = reallocate(EXCEL, EXCEL_TOTAL);
  approx(res.allocatedTotal, 1000, 1e-6);
  expect(res.conserved).toBe(true);
  expect(res.residual).toBe(0);
});

test('water-filling re-absorbs the Excel residual to exact values', () => {
  const res = reallocate(EXCEL, EXCEL_TOTAL);
  const f = (id: string) => res.items.find((i) => i.id === id)!.finalBudget;
  approx(f('C-01'), 162.5, 0.05);
  approx(f('C-03'), 162.5, 0.05);
  approx(f('C-06'), 87.5, 0.05);
  approx(f('C-02'), 132.93, 0.1);
  approx(f('C-04'), 144.58, 0.1);
  approx(f('C-05'), 153.74, 0.1);
  approx(f('C-07'), 156.25, 0.1);
});

test('every eligible final stays within its [lo, hi] box', () => {
  const res = reallocate(EXCEL, EXCEL_TOTAL);
  for (const i of res.items) {
    if (i.status === 'frozen' || i.status === 'flagged') continue;
    if (i.capBreached || i.floorRelaxed) continue;
    expect(i.finalBudget >= i.lowerBound - 1e-6).toBe(true);
    expect(i.finalBudget <= i.upperBound + 1e-6).toBe(true);
  }
});

test('flagged -> 0 and frozen keeps its budget; both still conserve', () => {
  const flagged = reallocate(EXCEL, EXCEL_TOTAL);
  expect(flagged.items.find((i) => i.id === 'C-08')!.finalBudget).toBe(0);

  const snaps = clone(EXCEL);
  snaps[0].status = 'frozen';
  snaps[0].freeze = true;
  const frozen = reallocate(snaps, EXCEL_TOTAL);
  expect(frozen.items.find((i) => i.id === 'C-01')!.finalBudget).toBe(125);
  approx(frozen.allocatedTotal, 1000, 1e-6);
});

test('overflow breaches caps, underflow relaxes floors — both conserve', () => {
  const snaps = clone(EXCEL);
  for (const id of ['C-02', 'C-05', 'C-06', 'C-07', 'C-08']) {
    snaps.find((s) => s.id === id)!.status = 'flagged';
  }
  const over = reallocate(snaps, EXCEL_TOTAL);
  expect(over.feasibility.overflow).toBe(true);
  approx(over.allocatedTotal, 1000, 1e-6);
  expect(over.items.some((i) => i.capBreached)).toBe(true);

  const under = reallocate(EXCEL, 60);
  expect(under.feasibility.underflow).toBe(true);
  approx(under.allocatedTotal, 60, 1e-6);
});

test('improvement toggles never break conservation', () => {
  const variants = [
    {
      toggles: {
        significanceGate: true,
        minEventsPerWindow: 2,
        nonOverlappingMomentum: false,
        saturationGamma: 1,
      },
    },
    {
      toggles: {
        significanceGate: false,
        minEventsPerWindow: 2,
        nonOverlappingMomentum: true,
        saturationGamma: 1,
      },
    },
    {
      toggles: {
        significanceGate: false,
        minEventsPerWindow: 2,
        nonOverlappingMomentum: false,
        saturationGamma: 0.5,
      },
    },
  ];
  for (const v of variants) approx(reallocate(EXCEL, EXCEL_TOTAL, v).allocatedTotal, 1000, 1e-6);
});

// --- Cycle layer: classify / triggers / pacing / modes --------------------
const W = (spend: number, purchases: number, atc = 0, clicks = 0, impr = 0): WindowMetrics => ({
  spend,
  purchases,
  addToCarts: atc,
  clicks,
  impressions: impr,
});
let _id = 0;
const mk = (over: Partial<AdSetSnapshot> = {}): AdSetSnapshot => ({
  id: `S-${++_id}`,
  status: 'active',
  currentBudget: 100,
  ageDays: 30,
  windows: { d3: W(90, 3), d7: W(210, 7), d14: W(420, 14) },
  ...over,
});

test('classify: lock / grace / learning / active', () => {
  expect(classifyStatus(mk({ ageDays: 1 }), DEFAULT_CONFIG)).toBe('frozen');
  expect(classifyStatus(mk({ ageDays: 5 }), DEFAULT_CONFIG)).toBe('grace');
  expect(
    classifyStatus(
      mk({ ageDays: 20, windows: { d3: W(50, 1), d7: W(120, 3), d14: W(240, 6) } }),
      DEFAULT_CONFIG,
    ),
  ).toBe('learning');
  expect(
    classifyStatus(
      mk({ ageDays: 40, windows: { d3: W(90, 20), d7: W(210, 55), d14: W(420, 110) } }),
      DEFAULT_CONFIG,
    ),
  ).toBe('active');
});

test('triggers: P1 zero-upper-funnel + P2 robust reference, grace skipped, all need approval', () => {
  const p1 = evaluateTriggers(
    [
      mk({ id: 'good', windows: { d3: W(90, 6), d7: W(210, 14), d14: W(420, 28) } }),
      mk({ id: 'bad', windows: { d3: W(120, 0, 0), d7: W(280, 0, 0), d14: W(560, 0, 0) } }),
    ],
    DEFAULT_CONFIG,
  );
  expect(
    p1.recommendations.some((r) => r.adSetId === 'bad' && r.trigger === 'P1_zero_upper_funnel'),
  ).toBe(true);
  expect(p1.starveIds.has('bad')).toBe(true);
  expect(p1.recommendations.every((r) => r.needsApproval === true)).toBe(true);

  const p2 = evaluateTriggers(
    [
      mk({ id: 'star', windows: { d3: W(30, 3), d7: W(70, 7), d14: W(140, 14) } }),
      mk({ id: 'ok', windows: { d3: W(60, 3), d7: W(140, 7), d14: W(280, 14) } }),
      mk({ id: 'dog', windows: { d3: W(300, 3), d7: W(700, 7), d14: W(1400, 14) } }),
      mk({ id: 'newbie', ageDays: 4, windows: { d3: W(300, 1), d7: W(300, 1), d14: W(300, 1) } }),
    ],
    DEFAULT_CONFIG,
  );
  expect(
    p2.recommendations.some((r) => r.adSetId === 'dog' && r.trigger === 'P2_sustained_poor'),
  ).toBe(true);
  expect(p2.recommendations.some((r) => r.adSetId === 'newbie')).toBe(false);
});

test('pacing: under/over adjust the daily total', () => {
  const under = computePacing({
    periodBudget: 3000,
    periodDays: 30,
    dayIndex: 11,
    actualSpendToDate: 700,
  });
  expect(under.status).toBe('underpacing');
  approx(under.dailyTotal, 115, 0.5);
  const over = computePacing({
    periodBudget: 3000,
    periodDays: 30,
    dayIndex: 11,
    actualSpendToDate: 1400,
  });
  expect(over.status).toBe('overpacing');
  approx(over.dailyTotal, 80, 0.5);
});

const portfolio = (): AdSetSnapshot[] => {
  _id = 0;
  return [
    mk({
      currentBudget: 100,
      ageDays: 40,
      windows: { d3: W(60, 6), d7: W(140, 14), d14: W(280, 28) },
    }),
    mk({
      currentBudget: 100,
      ageDays: 40,
      windows: { d3: W(90, 6), d7: W(210, 14), d14: W(420, 28) },
    }),
    mk({
      currentBudget: 100,
      ageDays: 40,
      windows: { d3: W(300, 3), d7: W(700, 7), d14: W(1400, 14) },
    }),
    mk({ currentBudget: 100, ageDays: 5, windows: { d3: W(0, 0), d7: W(0, 0), d14: W(0, 0) } }),
    mk({
      currentBudget: 100,
      ageDays: 30,
      windows: { d3: W(150, 0, 0), d7: W(350, 0, 0), d14: W(700, 0, 0) },
    }),
  ];
};

test('runCycle balanced conserves; starved driven toward floor (never zeroed)', () => {
  const res = runCycle(portfolio(), { mode: 'balanced', total: 500 });
  approx(res.reallocation.allocatedTotal, 500, 1e-2);
  expect(res.reallocation.conserved).toBe(true);
  expect(res.recommendations.length >= 1).toBe(true);
  const starved = res.reallocation.items.find((i) => i.status === 'starved')!;
  expect(starved.finalBudget > 0).toBe(true);
  expect(starved.finalBudget < starved.currentBudget).toBe(true);
});

test('runCycle efficiency underspends ceiling; scale grows to maxBudget', () => {
  const eff = runCycle(portfolio(), { mode: 'efficiency', total: 500 });
  expect(eff.reallocation.allocatedTotal <= 500 + 1e-6).toBe(true);
  approx(eff.reallocation.allocatedTotal + eff.reallocation.residual, 500, 1e-2);

  _id = 0;
  const scale = runCycle(
    [
      mk({
        currentBudget: 100,
        ageDays: 40,
        windows: { d3: W(30, 6), d7: W(70, 14), d14: W(140, 28) },
      }),
      mk({
        currentBudget: 100,
        ageDays: 40,
        windows: { d3: W(40, 6), d7: W(90, 14), d14: W(180, 28) },
      }),
    ],
    { mode: 'scale', total: 200, maxBudget: 260, weeklyGrowthPct: 0.05 },
  );
  expect(scale.reallocation.totalBudget > 200).toBe(true);
  expect(scale.reallocation.totalBudget <= 260).toBe(true);
  approx(scale.reallocation.allocatedTotal, scale.reallocation.totalBudget, 1e-2);
});

// --- Objective profiles ----------------------------------------------------
test('each objective scores on its own KPI field (events / spend)', () => {
  const m: WindowMetrics = {
    spend: 100,
    purchases: 5,
    addToCarts: 0,
    clicks: 0,
    impressions: 2000,
    appInstalls: 20,
    leads: 4,
    signups: 8,
    landingPageViews: 50,
  };
  approx(windowScore(m, resolveConfig({ objective: 'purchase' })), 5 / 100, 1e-9);
  approx(windowScore(m, resolveConfig({ objective: 'app_install' })), 20 / 100, 1e-9);
  approx(windowScore(m, resolveConfig({ objective: 'signup' })), 8 / 100, 1e-9);
  approx(windowScore(m, resolveConfig({ objective: 'lead' })), 4 / 100, 1e-9);
  approx(windowScore(m, resolveConfig({ objective: 'traffic' })), 50 / 100, 1e-9);
  approx(windowScore(m, resolveConfig({ objective: 'awareness' })), 2000 / 100, 1e-9);
});

test('default (no objective) keeps the legacy purchase/Tier-2 path', () => {
  // Zero purchases but clicks/ATC present => Tier-2 proxy (only on the legacy path).
  const m: WindowMetrics = { spend: 100, purchases: 0, addToCarts: 4, clicks: 20, impressions: 0 };
  approx(windowScore(m, DEFAULT_CONFIG), 4 / 20, 1e-9);
});

test('asymmetric velocity caps bound the [lo,hi] box per objective', () => {
  const A = (installs: number, spend = 100): WindowMetrics => ({
    spend,
    purchases: 0,
    addToCarts: 0,
    clicks: 0,
    impressions: 0,
    appInstalls: installs,
  });
  const snaps: AdSetSnapshot[] = [
    {
      id: 'a',
      status: 'active',
      currentBudget: 100,
      ageDays: 40,
      windows: { d3: A(10), d7: A(18), d14: A(30) },
    },
    {
      id: 'b',
      status: 'active',
      currentBudget: 100,
      ageDays: 40,
      windows: { d3: A(6), d7: A(12), d14: A(22) },
    },
    {
      id: 'c',
      status: 'active',
      currentBudget: 100,
      ageDays: 40,
      windows: { d3: A(8), d7: A(15), d14: A(28) },
    },
  ];
  // app_install: up +40%, down −45%. floor (15) < current*0.55, total feasible.
  const res = reallocate(snaps, 300, { objective: 'app_install' });
  approx(res.allocatedTotal, 300, 1e-6);
  expect(res.feasibility.overflow).toBe(false);
  expect(res.feasibility.underflow).toBe(false);
  for (const i of res.items) {
    approx(i.lowerBound, 55, 1e-6); // 100 * (1 - 0.45)
    approx(i.upperBound, 140, 1e-6); // 100 * (1 + 0.40)
  }
});

test('learning phase keeps the -8% down-cap as an additional floor', () => {
  const A = (installs: number): WindowMetrics => ({
    spend: 100,
    purchases: 0,
    addToCarts: 0,
    clicks: 0,
    impressions: 0,
    appInstalls: installs,
  });
  const snaps: AdSetSnapshot[] = [
    {
      id: 'a',
      status: 'active',
      currentBudget: 100,
      ageDays: 40,
      windows: { d3: A(10), d7: A(18), d14: A(30) },
    },
    {
      id: 'b',
      status: 'active',
      currentBudget: 100,
      ageDays: 40,
      windows: { d3: A(9), d7: A(16), d14: A(28) },
    },
    {
      id: 'L',
      status: 'learning',
      learningPhase: true,
      currentBudget: 100,
      ageDays: 10,
      windows: { d3: A(1), d7: A(2), d14: A(3) },
    },
  ];
  const res = reallocate(snaps, 400, { objective: 'app_install' });
  approx(res.allocatedTotal, 400, 1e-6);
  // Learning item: down = min(45%, 8%) = 8% => lower bound 92 (not 55).
  approx(res.items.find((i) => i.id === 'L')!.lowerBound, 92, 1e-6);
  approx(res.items.find((i) => i.id === 'a')!.lowerBound, 55, 1e-6);
});

test('significance gate (lead) drops sub-threshold windows from the composite', () => {
  const L = (leads: number, spend = 100): WindowMetrics => ({
    spend,
    purchases: 0,
    addToCarts: 0,
    clicks: 0,
    impressions: 0,
    leads,
  });
  // d3 has 2 leads (< gate of 5) at the same rate as d7 (neutral trajectory).
  const s: AdSetSnapshot = {
    id: 'x',
    status: 'active',
    currentBudget: 100,
    ageDays: 40,
    windows: { d3: L(2, 20), d7: L(10), d14: L(20) },
  };
  const cfg = resolveConfig({ objective: 'lead' });
  const sc = scoreAdSet(s, cfg);
  const w = cfg.weightsNeutral; // lead neutral .1/.4/.5
  const expected = (w.d7 * 0.1 + w.d14 * 0.2) / (w.d7 + w.d14); // d3 excluded by the gate
  approx(sc.composite, expected, 1e-9);
});

test('EWMA blends prior and raw composite by alpha (lead)', () => {
  const L = (leads: number): WindowMetrics => ({
    spend: 100,
    purchases: 0,
    addToCarts: 0,
    clicks: 0,
    impressions: 0,
    leads,
  });
  const s: AdSetSnapshot = {
    id: 'x',
    status: 'active',
    currentBudget: 100,
    ageDays: 40,
    windows: { d3: L(10), d7: L(10), d14: L(10) },
  };
  const cfg = resolveConfig({ objective: 'lead' }); // alpha 0.5
  const raw = scoreAdSet(s, cfg).composite; // no prior => raw
  const prior = 0.5;
  approx(scoreAdSet(s, cfg, prior).composite, 0.5 * raw + 0.5 * prior, 1e-9);
});

test('conservation holds across all objectives', () => {
  const objectives: OptimizationObjective[] = [
    'purchase',
    'app_install',
    'signup',
    'lead',
    'traffic',
    'awareness',
  ];
  for (const objective of objectives) {
    const kpi = getObjectiveProfile(objective).kpiField;
    const win = (events: number, spend: number): WindowMetrics => {
      const w: WindowMetrics = { spend, purchases: 0, addToCarts: 0, clicks: 0, impressions: 0 };
      (w as Record<string, number>)[kpi] = events;
      return w;
    };
    const snaps: AdSetSnapshot[] = [
      {
        id: 'a',
        status: 'active',
        currentBudget: 100,
        ageDays: 40,
        windows: { d3: win(10, 100), d7: win(18, 200), d14: win(30, 400) },
      },
      {
        id: 'b',
        status: 'active',
        currentBudget: 120,
        ageDays: 40,
        windows: { d3: win(5, 100), d7: win(9, 200), d14: win(16, 400) },
      },
      {
        id: 'c',
        status: 'active',
        currentBudget: 80,
        ageDays: 40,
        windows: { d3: win(8, 100), d7: win(15, 200), d14: win(26, 400) },
      },
    ];
    const res = runCycle(snaps, { mode: 'balanced', objective, total: 300 });
    approx(res.reallocation.allocatedTotal, 300, 1e-2);
    expect(res.reallocation.conserved).toBe(true);
  }
});

test('Meta ingest maps export columns to WindowMetrics', () => {
  const row = {
    'Amount spent': '1,234.50',
    'App installs': 20,
    'Link clicks': 300,
    Impressions: '45,000',
    'Adds to cart': 5,
    Leads: 4,
    'Checkouts initiated': 8,
    'Landing page views': 50,
    Reach: 1000,
    Purchases: 12,
    'Ignored col': 99,
  };
  const m = mapMetaRowToWindowMetrics(row);
  approx(m.spend, 1234.5, 1e-9);
  expect(m.appInstalls).toBe(20);
  expect(m.clicks).toBe(300);
  expect(m.impressions).toBe(45000);
  expect(m.addToCarts).toBe(5);
  expect(m.leads).toBe(4);
  expect(m.signups).toBe(8);
  expect(m.landingPageViews).toBe(50);
  expect(m.reach).toBe(1000);
  expect(m.purchases).toBe(12);
});

test('triggers: P1 reason names the condition that fired and invents no figure', () => {
  // The reason is the ONLY grounding source for the AI insight tooltip, so it must never
  // contain a placeholder standing in for an unmeasured value.
  const deadFunnel = evaluateTriggers(
    [mk({ id: 'dead', windows: { d3: W(120, 0, 0), d7: W(280, 0, 0), d14: W(560, 0, 0) } })],
    DEFAULT_CONFIG,
  ).recommendations.find((r) => r.trigger === 'P1_zero_upper_funnel');

  expect(deadFunnel?.reason).toBe('Spent 120 over 3d with 0 conversions and 0 add-to-carts.');

  // The other arm: an ad set WITH add-to-carts, but at a cost far above the portfolio
  // average. avgAtcCost is the unweighted mean of every evaluable ad set's 3d ATC cost —
  // including this one — so it takes several cheap peers to pull the mean below the 4x
  // override multiple.
  const cheap = Array.from({ length: 5 }, (_, i) =>
    mk({ id: `cheap-${i}`, windows: { d3: W(30, 2, 30), d7: W(70, 5, 70), d14: W(140, 10, 140) } }),
  );
  const expensiveFunnel = evaluateTriggers(
    [
      ...cheap,
      mk({ id: 'pricey', windows: { d3: W(300, 0, 1), d7: W(700, 0, 3), d14: W(1400, 0, 6) } }),
    ],
    DEFAULT_CONFIG,
  ).recommendations.find((r) => r.adSetId === 'pricey' && r.trigger === 'P1_zero_upper_funnel');

  expect(expensiveFunnel?.reason).toContain('add-to-cart cost of 300');
  expect(expensiveFunnel?.reason).toMatch(/portfolio average of \d+\.$/);

  for (const reason of [deadFunnel?.reason, expensiveFunnel?.reason]) {
    expect(reason).toBeDefined();
    expect(reason).not.toContain('null');
    expect(reason).not.toContain('undefined');
    expect(reason).not.toContain('NaN');
    expect(reason).not.toContain('Infinity');
  }
});
