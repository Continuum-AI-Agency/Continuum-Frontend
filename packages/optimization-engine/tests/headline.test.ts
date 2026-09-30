// The headline every engine recommendation now LEADS with, held against the one schema the
// Frontend parses it back out with.
//
// The queue used to lead every row with money per day, which is the scale the queue SORTS on
// and almost never the thing a trigger FOUND. `evidence.headline` carries the trigger's own
// figure across, and the two ends of that wire are written in two different repositories — so
// the only proof worth having is the contract's own parser reading what the engine wrote,
// AFTER a JSON round-trip, which is what `optimizer_record_cycle`'s `r->'evidence'` and the
// jsonb column do to it on the way through.
//
// A test that asserted the object literal it just built would prove nothing. Every case here
// runs a real trigger, serialises the result, and parses it with `candidateHeadlineSchema`.
import { expect, test } from 'bun:test';
import { candidateHeadlineSchema } from '@continuum/contracts';
import type {
  AdSetSnapshot,
  DeliveryRead,
  ItemDiagnostics,
  ReallocationResult,
  Recommendation,
  WindowMetrics,
} from '../src/index';
import {
  DEFAULT_CONFIG,
  evaluateFatigue,
  evaluateSettings,
  evaluateTriggers,
  REACH_EXHAUSTED_EXPANSION,
} from '../src/index';

const w = (spend: number, purchases: number, addToCarts = 0, clicks = 0, impressions = 0) => ({
  spend,
  purchases,
  addToCarts,
  clicks,
  impressions,
});
const flat = (m: WindowMetrics): AdSetSnapshot['windows'] => ({ d3: m, d7: m, d14: m });

const mk = (over: Partial<AdSetSnapshot> = {}): AdSetSnapshot => ({
  id: 'x',
  status: 'active',
  currentBudget: 100,
  ageDays: 30,
  windows: flat(w(100, 5)),
  ...over,
});

/** Still converting, recent CPA well above the 14d baseline: the gate all three F's share. */
const decaying = (over: Partial<AdSetSnapshot> = {}): AdSetSnapshot =>
  mk({ ageDays: 40, windows: { d3: w(600, 10), d7: w(1800, 35), d14: w(4000, 100) }, ...over });

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

const realloc = (
  items: ItemDiagnostics[],
  over: Partial<ReallocationResult> = {},
): ReallocationResult => ({
  totalBudget: 400,
  pool: 400,
  frozenBudget: 0,
  items,
  allocatedTotal: 400,
  conserved: true,
  residual: 0,
  feasibility: { sumLowerBounds: 280, sumUpperBounds: 520, overflow: false, underflow: false },
  notes: [],
  ...over,
});

const delivery = (reachExpansion: number): DeliveryRead => ({
  state: 'delivering',
  darkDays: null,
  impressionsWow: null,
  reachExpansion,
  blockers: [],
  learningStage: null,
});

/**
 * The wire, as the database and the queue actually see it.
 *
 * `optimizer_record_cycle` copies `r->'evidence'` whole into a jsonb column and the Frontend
 * reads it back through a `.loose()` schema, so the shape that must survive is the JSON one —
 * not the in-memory object. Parsing with the CONTRACT's schema is the whole point: if the
 * engine's literal and `candidateHeadlineSchema` ever disagree, this is where it shows.
 */
function headlineOf(rec: Recommendation | undefined) {
  expect(rec).toBeDefined();
  const wire = JSON.parse(JSON.stringify(rec?.evidence));
  const parsed = candidateHeadlineSchema.safeParse(wire.headline);
  expect(parsed.success).toBe(true);
  return parsed.success ? parsed.data : null;
}

const fireTriggers = (snapshots: AdSetSnapshot[], trigger: string) =>
  evaluateTriggers(snapshots, DEFAULT_CONFIG).recommendations.find((r) => r.trigger === trigger);

// --- The pause family: what a pause is worth is the spend it stops ----------------------

test('P1 leads with the money the pause avoids, in dead_tail’s own words', () => {
  const rec = fireTriggers(
    [mk({ id: 'dead', windows: flat(w(90, 0, 0)) })],
    'P1_zero_upper_funnel',
  );
  expect(headlineOf(rec)).toEqual({
    kind: 'avoided',
    value: 30, // 90 spent over 3 days
    unit: 'currency_per_day',
    label: 'a day buying nothing',
    from: null,
    to: null,
  });
});

test('P3 leads with the same figure over its own window', () => {
  const rec = fireTriggers([mk({ id: 'dud', windows: flat(w(140, 0, 3)) })], 'P3_low_significance');
  expect(headlineOf(rec)).toMatchObject({
    kind: 'avoided',
    value: 10, // 140 spent over 14 days
    unit: 'currency_per_day',
  });
});

test('P2 leads with the price gap, not the spend, and prints both priced sides', () => {
  // Four cheap peers put the robust reference (P25 of CPP_14d) at $10; the subject pays $140.
  const peers = [1, 2, 3, 4].map((n) => mk({ id: `peer${n}`, windows: flat(w(100, 10)) }));
  const subject = mk({ id: 'dear', windows: flat(w(140, 1)) });
  const rec = fireTriggers([...peers, subject], 'P2_sustained_poor');
  expect(rec?.adSetId).toBe('dear');
  expect(headlineOf(rec)).toEqual({
    kind: 'efficiency',
    value: 1300, // $140 against a $10 reference
    unit: 'percent',
    label: 'more per result than best',
    from: 140,
    to: 10,
  });
});

// --- The fatigue family ----------------------------------------------------------------

test('F2 leads with the frequency and holds it against its cap', () => {
  const recs = evaluateFatigue(
    [decaying({ audienceType: 'prospecting', frequency7d: 4.0 })],
    DEFAULT_CONFIG,
  );
  expect(headlineOf(recs.find((r) => r.trigger === 'F2_audience_saturation'))).toEqual({
    kind: 'count',
    value: 4,
    unit: 'count',
    label: 'times each person saw it',
    from: 4,
    to: DEFAULT_CONFIG.fatigueFreqProspecting,
  });
});

test('F3 leads with the share of the 14-day reach the second week actually added', () => {
  const s = decaying({ id: 'used-up', audienceType: 'prospecting', frequency7d: 1.6 });
  const recs = evaluateFatigue(
    [s],
    DEFAULT_CONFIG,
    new Set(),
    new Map([['used-up', delivery(REACH_EXHAUSTED_EXPANSION - 0.11)]]),
  );
  const headline = headlineOf(recs.find((r) => r.trigger === 'F3_audience_exhausted'));
  expect(headline).toEqual({
    kind: 'share',
    value: 4, // 1.04 expansion → 4% new people
    unit: 'percent',
    label: 'of 14d reach is new',
    from: null,
    to: null,
  });
});

test('F1 leads with the engagement drop, and declares no sides it cannot print', () => {
  // CTR: 14d 1000/40000 = 2.5%; 3d 80/8000 = 1.0% — a 60% drop.
  const s = decaying({
    audienceType: 'prospecting',
    frequency7d: 1.8,
    windows: {
      d3: w(600, 10, 0, 80, 8000),
      d7: w(1800, 35, 0, 400, 18000),
      d14: w(4000, 100, 0, 1000, 40000),
    },
  });
  const recs = evaluateFatigue([s], DEFAULT_CONFIG);
  expect(headlineOf(recs.find((r) => r.trigger === 'F1_creative_fatigue'))).toEqual({
    kind: 'drift',
    value: 60,
    unit: 'percent',
    label: 'less click-through than 14d',
    // Two CTRs near 1% cannot be printed as whole percentages without saying "1% → 1%",
    // so the trigger declares no sides rather than a comparison that shows nothing.
    from: null,
    to: null,
  });
});

// --- The settings family: the one place a row has NO money at all -----------------------

const healthy = mk({ id: 'a', windows: { d3: w(300, 10), d7: w(700, 25), d14: w(1400, 50) } });

test('S1 and S2 lead with their share, which is the only figure a settings row holds', () => {
  const cap = DEFAULT_CONFIG.velocityCapPct;
  const recs = evaluateSettings(
    realloc([
      item('a', { changePct: cap, floorRelaxed: true }),
      item('b', { changePct: -cap, floorRelaxed: true }),
      item('c', { floorRelaxed: true }),
      item('d'),
    ]),
    [healthy],
    DEFAULT_CONFIG,
    { mode: 'balanced', applyCapPct: 0.2 },
  );

  const s1 = recs.find((r) => r.trigger === 'S1_velocity_cap_binding');
  // The money line has nothing to say here — which is exactly why the headline must.
  expect(s1?.evidence?.estImpactPerDay).toBeNull();
  expect(headlineOf(s1)).toEqual({
    kind: 'share',
    value: 50,
    unit: 'percent',
    label: 'of moves hit the cap',
    from: null,
    to: null,
  });

  expect(headlineOf(recs.find((r) => r.trigger === 'S2_floor_too_high'))).toMatchObject({
    kind: 'share',
    value: 75,
    label: 'of floors had to be relaxed',
  });
});

test('S3 leads with money that is not a saving, and shows the plan against what got placed', () => {
  const recs = evaluateSettings(
    realloc([item('a'), item('b')], { residual: 60, allocatedTotal: 340 }),
    [healthy],
    DEFAULT_CONFIG,
    { mode: 'efficiency' },
  );
  expect(headlineOf(recs.find((r) => r.trigger === 'S3_persistent_underspend'))).toEqual({
    kind: 'money',
    value: 60,
    unit: 'currency_per_day',
    label: 'a day left unplaced',
    from: 400,
    to: 340,
  });
});

test('S5 counts the ad sets, and never calls their spend money buying nothing', () => {
  const dark = mk({
    id: 'dark',
    windows: { d3: w(30, 0, 0, 0, 900), d7: w(70, 0, 0, 0, 2000), d14: w(140, 0, 0, 0, 4000) },
  });
  const recs = evaluateSettings(realloc([item('a')]), [healthy, dark], DEFAULT_CONFIG, {
    mode: 'balanced',
  });
  const headline = headlineOf(recs.find((r) => r.trigger === 'S5_tracking_gap'));
  expect(headline).toEqual({
    kind: 'count',
    value: 1,
    unit: 'count',
    label: 'ad set spending untracked',
    from: null,
    to: null,
  });
  // The other reading of these rows is that they WORK and the pixel does not. A headline
  // that said "a day buying nothing" would argue the case this trigger exists to doubt.
  expect(headline?.kind).not.toBe('avoided');
});

// --- The coverage rule ------------------------------------------------------------------

test('every recommendation that carries evidence carries a headline the contract accepts', () => {
  const cap = DEFAULT_CONFIG.velocityCapPct;
  const peers = [1, 2, 3, 4].map((n) => mk({ id: `peer${n}`, windows: flat(w(100, 10)) }));
  const snapshots = [
    ...peers,
    mk({ id: 'dead', windows: flat(w(90, 0, 0)) }),
    mk({ id: 'dear', windows: flat(w(140, 1)) }),
    mk({ id: 'dud', windows: flat(w(140, 0, 3)) }),
    decaying({ id: 'saturated', audienceType: 'prospecting', frequency7d: 4.0 }),
  ];
  const recs: Recommendation[] = [
    ...evaluateTriggers(snapshots, DEFAULT_CONFIG).recommendations,
    ...evaluateFatigue(snapshots, DEFAULT_CONFIG),
    ...evaluateSettings(
      realloc([item('a', { changePct: cap }), item('b', { changePct: -cap, floorRelaxed: true })], {
        residual: 60,
        allocatedTotal: 340,
      }),
      snapshots,
      DEFAULT_CONFIG,
      { mode: 'efficiency', applyCapPct: 0.2 },
    ),
  ];

  const withEvidence = recs.filter((r) => r.evidence);
  expect(withEvidence.length).toBeGreaterThanOrEqual(6);
  for (const rec of withEvidence) {
    const wire = JSON.parse(JSON.stringify(rec.evidence));
    const parsed = candidateHeadlineSchema.safeParse(wire.headline);
    if (!parsed.success) throw new Error(`${rec.trigger} has no contract-valid headline`);
  }
});
