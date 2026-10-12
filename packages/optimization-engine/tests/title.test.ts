// The title every recommendation carries beside its reason — entity + figure + comparison,
// in Spanish, with ISO currency codes, and no verb — held against the contract the Frontend
// parses it back out with.
//
// Every case runs a REAL trigger, serialises the recommendation the way `optimizer_record_cycle`
// does (`r->'evidence'` whole, through JSON), and reads the title back with the contract's own
// accessor. The expected strings are the doc's own examples where the doc gives one
// (docs/performance-plus-redesign/overview.html, "Los títulos, hablando con datos"): the
// entity first, the figure a person can verify, the comparison; the saving on the button.
import { expect, test } from 'bun:test';
import {
  actionLabel,
  recommendationActionOf,
  recommendationTitleOf,
  titleCarriesVerb,
  titleText,
} from '@continuum/contracts';
import type {
  AdSetSnapshot,
  DeliveryRead,
  EngineConfig,
  ItemDiagnostics,
  ReallocationResult,
  Recommendation,
  WindowMetrics,
} from '../src/index';
import {
  DEFAULT_CONFIG,
  evaluateCreative,
  evaluateDelivery,
  evaluateFatigue,
  evaluateRules,
  evaluateSettings,
  evaluateTriggers,
  runCycle,
  seedParityRules,
} from '../src/index';

// --- Fixtures ---------------------------------------------------------------------------

const w = (
  spend: number,
  purchases: number,
  extra: Partial<WindowMetrics> = {},
): WindowMetrics => ({
  spend,
  purchases,
  addToCarts: 0,
  clicks: 0,
  impressions: 0,
  ...extra,
});
/** A leads window: what a lead portfolio buys, with purchases at zero. */
const wl = (spend: number, leads: number, extra: Partial<WindowMetrics> = {}): WindowMetrics =>
  w(spend, 0, { leads, ...extra });
const flat = (m: WindowMetrics): AdSetSnapshot['windows'] => ({ d3: m, d7: m, d14: m });

const mk = (over: Partial<AdSetSnapshot> = {}): AdSetSnapshot => ({
  id: 'x',
  name: 'CONJUNTO X',
  status: 'active',
  currentBudget: 100,
  ageDays: 30,
  windows: flat(w(100, 5)),
  ...over,
});

/** A lead portfolio priced in pesos: the account the doc's examples come from. */
const leadsMxn: EngineConfig = {
  ...DEFAULT_CONFIG,
  currency: 'MXN',
  kpiField: 'leads',
  cpaTarget: 35,
  sustainedPoorMultiplier: 2.5,
  newItemProtectDays: 7,
};
/** A purchase portfolio in pesos, for the families whose fixtures speak in purchases. */
const purchasesMxn: EngineConfig = {
  ...DEFAULT_CONFIG,
  currency: 'MXN',
  cpaTarget: 35,
  newItemProtectDays: 7,
  fatigueCpaDriftPct: 0.2,
  fatigueCtrDropPct: 0.2,
};

/** Three cheap lead ad sets and the one the doc pauses: 101 MXN per lead against a 20 MXN reference. */
const p2Cohort = (): AdSetSnapshot[] => [
  mk({ id: 'c1', name: 'BARATO 1', kpiField: 'leads', windows: flat(wl(400, 20)) }),
  mk({ id: 'c2', name: 'BARATO 2', kpiField: 'leads', windows: flat(wl(400, 20)) }),
  mk({ id: 'c3', name: 'BARATO 3', kpiField: 'leads', windows: flat(wl(400, 20)) }),
  mk({
    id: 'iteso',
    name: 'ITESO // AGOSTO - RTG',
    kpiField: 'leads',
    windows: flat(wl(1020, 10)),
  }),
];

/** Still converting, recent CPA 50% over the 14d baseline: the gate the F family shares. */
const decaying = (over: Partial<AdSetSnapshot> = {}): AdSetSnapshot =>
  mk({
    ageDays: 40,
    windows: {
      d3: w(600, 10, { clicks: 40, impressions: 2000 }),
      d7: w(1800, 35, { clicks: 140, impressions: 7000 }),
      d14: w(4000, 100, { clicks: 200, impressions: 10000 }),
    },
    ...over,
  });

const item = (id: string, over: Partial<ItemDiagnostics> = {}): ItemDiagnostics => ({
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
  ...over,
});

const realloc = (over: Partial<ReallocationResult> = {}): ReallocationResult => ({
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

const delivery = (reachExpansion: number): DeliveryRead => ({
  state: 'serving',
  darkDays: null,
  impressionsWow: null,
  reachExpansion,
  blockers: [],
  learningStage: null,
});

/**
 * The wire, as the database and the queue see it: `evidence` through a JSON round-trip, read
 * back with the contract's accessors. A test that asserted the object literal it just built
 * would prove nothing about the two repositories agreeing.
 */
function wire(rec: Recommendation | undefined) {
  expect(rec).toBeDefined();
  const evidence = JSON.parse(JSON.stringify(rec?.evidence ?? null));
  const title = recommendationTitleOf(evidence);
  const action = recommendationActionOf(evidence);
  expect(title).not.toBeNull();
  expect(action).not.toBeNull();
  if (!title || !action) throw new Error('unreachable');
  return { title, action, text: titleText(title), button: actionLabel(action) };
}

const byTrigger = (recs: Recommendation[], trigger: string) =>
  recs.find((r) => r.trigger === trigger);

// --- The pause family: P1 / P2 / P3 ------------------------------------------------------

test('P2 states the cost per lead against the reference, and the saving moves to the button', () => {
  const rec = byTrigger(
    evaluateTriggers(p2Cohort(), leadsMxn).recommendations,
    'P2_sustained_poor',
  );
  const { title, text, button } = wire(rec);
  expect(text).toBe('ITESO // AGOSTO - RTG: 102 MXN por lead, 5.1× la referencia de 20.00 MXN');
  expect(title.window).toBe('d14');
  expect(title.figure).toBe(102);
  expect(button).toBe('Pausar · 72.86 MXN/día');
  expect(rec?.reason).toContain('CPP 14d'); // the legacy line stays for one release
});

test('P3 states the spend, the window and the nothing it bought', () => {
  const dead = mk({
    id: 'aleira',
    name: 'ALEIRA // AGOSTO - LKL',
    kpiField: 'leads',
    windows: { d3: wl(0, 0), d7: wl(100, 0), d14: wl(298, 0) },
  });
  const rec = byTrigger(evaluateTriggers([dead], leadsMxn).recommendations, 'P3_low_significance');
  const { text, button } = wire(rec);
  expect(text).toBe(
    'ALEIRA // AGOSTO - LKL: 298 MXN, en 14 días y 0 leads, más que el objetivo de 35.00 MXN por lead',
  );
  expect(button).toBe('Pausar · 21.29 MXN/día');
});

test('P1 names the dead upper funnel in the objective’s own nouns', () => {
  const rec = byTrigger(
    evaluateTriggers([mk({ windows: flat(w(90, 0)) })], purchasesMxn).recommendations,
    'P1_zero_upper_funnel',
  );
  const { text, title } = wire(rec);
  expect(text).toBe('CONJUNTO X: 90.00 MXN, en 3 días con 0 compras y 0 agregados al carrito');
  expect(title.window).toBe('d3');
});

// --- The creative family: C1 / C2 -------------------------------------------------------

const standingWithLoser = (): AdSetSnapshot =>
  mk({
    id: 'set',
    name: 'RETARGETING',
    kpiField: 'leads',
    windows: flat(wl(960, 20)),
    creative: {
      winner: { adId: 'w', adName: 'Ganador', spend: 300, events: 10, costPerEvent: 30 },
      laggards: [
        {
          adId: 'l',
          adName: 'Perdedor',
          spend: 660,
          events: 10,
          costPerEvent: 66,
          vsWinner: 2.2,
          verdict: 'kill',
        },
      ],
      eligibleAds: 2,
      totalAds: 2,
      killSpendShare: 0.69,
      belowAvgSpendShare: 0,
      medianCostPerEvent: 48,
      flags: [],
    },
  });

test('C1 names the losing ad, its cost per lead and the winner beside it', () => {
  const rec = byTrigger(
    evaluateCreative([standingWithLoser()], leadsMxn).recommendations,
    'C1_creative_drag',
  );
  const { text, button } = wire(rec);
  expect(text).toBe(
    'Perdedor: 66.00 MXN por lead, 2.2× el ganador "Ganador" a 30.00 MXN, en 660 MXN de gasto',
  );
  expect(button).toBe('Pausar el anuncio · 47.14 MXN/día');
});

test('C2 names the winner and how much cheaper it buys a lead than its sibling', () => {
  const rec = byTrigger(
    evaluateCreative([standingWithLoser()], leadsMxn).recommendations,
    'C2_creative_winner',
  );
  const { text, button, action } = wire(rec);
  expect(text).toBe(
    'Ganador: 30.00 MXN por lead, 55% menos que "Perdedor" a 66.00 MXN en el mismo conjunto',
  );
  // Making variants puts no measured money on the table: the button is the verb alone.
  expect(action.sizing).toBeNull();
  expect(button).toBe('Hacer variantes');
});

// --- The delivery family: D2 -----------------------------------------------------------

test('D2 states the idle budget and the days with no impressions', () => {
  const dark = mk({
    id: 'iteso',
    name: 'ITESO // AGOSTO - RTG',
    currentBudget: 48.8,
    windows: flat(w(0, 0)),
    daily: [
      { date: '2026-09-20', spend: 10, purchases: 0, addToCarts: 0, clicks: 0, impressions: 100 },
    ],
  });
  const rec = byTrigger(
    evaluateDelivery([dark], [], '2026-09-28', 'MXN', 'leads').recommendations,
    'D2_dark_with_budget',
  );
  const { text, button } = wire(rec);
  expect(text).toBe(
    'ITESO // AGOSTO - RTG: 48.80 MXN por día de presupuesto, y 0 impresiones en 7 días',
  );
  expect(button).toBe('Restaurar la entrega · 48.80 MXN/día');
});

// --- The fatigue family: F1 / F3 -------------------------------------------------------

test('F1 states the recent CTR against its own 14 days, with the CPA rise that prices it', () => {
  const worn = decaying({
    windows: {
      d3: w(600, 10, { clicks: 10, impressions: 2000 }),
      d7: w(1800, 35, { clicks: 70, impressions: 7000 }),
      d14: w(4000, 100, { clicks: 200, impressions: 10000 }),
    },
  });
  const rec = byTrigger(evaluateFatigue([worn], purchasesMxn), 'F1_creative_fatigue');
  const { text, button } = wire(rec);
  expect(text).toBe(
    'CONJUNTO X: 0.5% de CTR en 3 días, 75% menos que los 14 días (2.00%) y CPA +50% (60.00 MXN frente a 40.00 MXN por compra)',
  );
  expect(button).toBe('Renovar el creativo · 66.67 MXN/día');
});

test('F3 states the share of new people against the floor it fell under', () => {
  const exhausted = decaying({ id: 'pool' });
  const rec = byTrigger(
    evaluateFatigue([exhausted], purchasesMxn, new Set(), new Map([['pool', delivery(1.04)]])),
    'F3_audience_exhausted',
  );
  const { text, title } = wire(rec);
  expect(text).toBe(
    'CONJUNTO X: 4% de personas nuevas al pasar de 7 a 14 días, bajo el piso de 15% y CPA +50% (60.00 MXN frente a 40.00 MXN por compra)',
  );
  expect(title.window).toBe('d14');
});

// --- The settings family: S3 / S5 ------------------------------------------------------

test('S3 states the money left unplaced against the pool; the plan → placed pair sizes the button', () => {
  const rec = byTrigger(
    evaluateSettings(realloc({ residual: 60, allocatedTotal: 340 }), [], leadsMxn, {
      mode: 'efficiency',
    }),
    'S3_persistent_underspend',
  );
  const { text, button } = wire(rec);
  expect(text).toBe(
    'Portafolio: 60.00 MXN por día sin colocar, de un pool de 400 MXN (15%) en modo eficiencia',
  );
  expect(button).toBe('Ajustar la configuración · 400 → 340 MXN');
});

test('S5 states the untracked spend and how many delivering ad sets carry it', () => {
  const untracked = mk({
    id: 'iteso',
    name: 'ITESO',
    kpiField: 'leads',
    windows: flat(wl(298, 0, { impressions: 500 })),
  });
  const rec = byTrigger(
    evaluateSettings(realloc(), [untracked], leadsMxn, { mode: 'balanced' }),
    'S5_tracking_gap',
  );
  const { text } = wire(rec);
  expect(text).toBe(
    'Portafolio: 298 MXN, en 14 días en 1 conjunto con impresiones y 0 leads registrados',
  );
});

// --- The rules layer says the same sentence the built-in does -----------------------------

test('a seeded parity rule carries the same title as the built-in trigger it mirrors', () => {
  const builtIn = wire(
    byTrigger(evaluateTriggers(p2Cohort(), leadsMxn).recommendations, 'P2_sustained_poor'),
  );
  const rules = evaluateRules(p2Cohort(), seedParityRules(leadsMxn), leadsMxn);
  const finding = rules.findings.find((f) => f.trigger === 'rule:P2_sustained_poor');
  expect(finding?.evidence).toBeDefined();
  const fromRule = recommendationTitleOf(JSON.parse(JSON.stringify(finding?.evidence)));
  expect(fromRule && titleText(fromRule)).toBe(builtIn.text);
});

// --- The rule no template may break: no verb, no "$", the code after the figure ----------

/** Every recommendation a full cycle over the fixtures above raises, under one currency. */
function everyTitle(currency: string | null) {
  const cfg = { ...leadsMxn, currency };
  const snapshots = [
    ...p2Cohort(),
    mk({
      id: 'aleira',
      name: 'ALEIRA // AGOSTO - LKL',
      kpiField: 'leads',
      windows: { d3: wl(0, 0), d7: wl(100, 0), d14: wl(298, 0) },
    }),
    standingWithLoser(),
  ];
  const result = runCycle(snapshots, {
    mode: 'efficiency',
    total: 4000,
    objective: 'lead',
    config: { currency, cpaTarget: 35, sustainedPoorMultiplier: 2.5, newItemProtectDays: 7 },
    rules: seedParityRules(cfg),
  });
  const titles = result.recommendations
    .map((r) => recommendationTitleOf(JSON.parse(JSON.stringify(r.evidence ?? null))))
    .filter((t): t is NonNullable<typeof t> => t !== null);
  expect(titles.length).toBeGreaterThanOrEqual(3);
  return titles.map(titleText);
}

test('no title carries an action verb, in any currency', () => {
  for (const text of [...everyTitle('MXN'), ...everyTitle('USD'), ...everyTitle(null)]) {
    expect(titleCarriesVerb(text)).toBe(false);
  }
});

test('a USD account prints "USD" after the figure and never "$"; an unknown currency prints bare', () => {
  for (const text of everyTitle('USD')) {
    expect(text).not.toContain('$');
    expect(text).toContain(' USD');
  }
  for (const text of everyTitle(null)) {
    expect(text).not.toContain('$');
    expect(text).not.toMatch(/\b(USD|MXN)\b/);
  }
  for (const text of everyTitle('MXN')) expect(text).toContain(' MXN');
});
