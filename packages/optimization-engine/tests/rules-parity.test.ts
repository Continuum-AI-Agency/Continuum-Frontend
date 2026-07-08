// PARITY PROOF: the data-driven rule templates (BUILTIN_PARITY_TEMPLATES,
// instantiated from the same EngineConfig) produce the SAME recommendations
// and starve set as the native evaluateTriggers() + evaluateFatigue() code —
// on hand-built edge cases and on a seeded randomized sweep of portfolios.
//
// Compared: (adSetId, kind, trigger, severity) and starveIds. Reason STRINGS
// are not compared — the DSL interpolates its own template; the numbers inside
// come from the same facts. (bun test)
import { expect, test } from 'bun:test';
import type { AdSetSnapshot, EngineConfig, Recommendation, WindowMetrics } from '../src/index';
import { DEFAULT_CONFIG, evaluateFatigue, evaluateTriggers, resolveConfig } from '../src/index';
import { evaluateRules } from '../src/rules/evaluate';
import {
  BUILTIN_PARITY_TEMPLATES,
  instantiateTemplate,
  seedParityRules,
} from '../src/rules/templates';

// --- Comparable projections ------------------------------------------------

type Projected = { adSetId: string; kind: string; trigger: string; severity: string };

const projectBuiltin = (recs: Recommendation[]): Projected[] =>
  recs
    .map((r) => ({ adSetId: r.adSetId, kind: r.kind, trigger: r.trigger, severity: r.severity }))
    .sort((a, b) => `${a.adSetId}|${a.trigger}`.localeCompare(`${b.adSetId}|${b.trigger}`));

const runBuiltins = (snapshots: AdSetSnapshot[], cfg: EngineConfig) => {
  const { recommendations: pauseRecs, starveIds } = evaluateTriggers(snapshots, cfg);
  const fatigueRecs = evaluateFatigue(snapshots, cfg, starveIds);
  return { projected: projectBuiltin([...pauseRecs, ...fatigueRecs]), starveIds };
};

const runRules = (snapshots: AdSetSnapshot[], cfg: EngineConfig) => {
  const out = evaluateRules(snapshots, seedParityRules(cfg), cfg);
  const projected: Projected[] = out.findings
    .map((f) => ({
      adSetId: f.adSetId,
      kind: f.kind,
      trigger: f.trigger.replace(/^rule:/, ''),
      severity: f.severity,
    }))
    .sort((a, b) => `${a.adSetId}|${a.trigger}`.localeCompare(`${b.adSetId}|${b.trigger}`));
  return { projected, starveIds: out.starveIds };
};

const expectParity = (snapshots: AdSetSnapshot[], cfg: EngineConfig, label: string) => {
  const builtin = runBuiltins(snapshots, cfg);
  const rules = runRules(snapshots, cfg);
  expect(rules.projected, label).toEqual(builtin.projected);
  expect([...rules.starveIds].sort(), label).toEqual([...builtin.starveIds].sort());
  return builtin.projected.length;
};

// --- Hand-built edge cases -------------------------------------------------

const w = (
  spend: number,
  purchases: number,
  clicks = 0,
  impressions = 0,
  addToCarts = 0,
): WindowMetrics => ({ spend, purchases, addToCarts, clicks, impressions });

const base = (id: string, over: Partial<AdSetSnapshot> = {}): AdSetSnapshot => ({
  id,
  status: 'active',
  currentBudget: 100,
  ageDays: 40,
  audienceType: 'prospecting',
  frequency7d: 1.5,
  windows: {
    d3: w(300, 8, 150, 12000, 20),
    d7: w(700, 20, 350, 28000, 45),
    d14: w(1400, 40, 700, 56000, 90),
  },
  ...over,
});

test('parity — P1 fires: 3d spend, zero conversions, dead upper funnel', () => {
  const s = base('p1', {
    windows: {
      d3: w(80, 0, 40, 4000, 0),
      d7: w(200, 0, 90, 9000, 0),
      d14: w(300, 1, 150, 15000, 0),
    },
  });
  const healthy = base('ok');
  const n = expectParity([s, healthy], DEFAULT_CONFIG, 'P1');
  expect(n).toBeGreaterThan(0);
});

test('parity — P2 fires: sustained poor CPP vs robust reference, flat trajectory', () => {
  // Three cheap performers set the P25 reference; 'poor' runs ~10x their CPP.
  const cheap = (id: string) =>
    base(id, {
      windows: {
        d3: w(90, 9, 100, 9000, 15),
        d7: w(210, 21, 220, 20000, 40),
        d14: w(420, 42, 450, 42000, 80),
      },
    });
  const poor = base('poor', {
    windows: {
      d3: w(240, 2, 90, 9000, 10),
      d7: w(560, 5, 200, 20000, 22),
      d14: w(1120, 10, 400, 40000, 45),
    },
  });
  const n = expectParity([cheap('a'), cheap('b'), cheap('c'), poor], DEFAULT_CONFIG, 'P2');
  expect(n).toBeGreaterThan(0);
});

test('parity — P3 fires: > 1 target CPA spent over 14d with zero events', () => {
  const dead = base('dead', {
    windows: { d3: w(15, 0, 5, 800, 3), d7: w(30, 0, 12, 1500, 6), d14: w(60, 0, 25, 3000, 12) },
  });
  const n = expectParity([dead, base('ok')], DEFAULT_CONFIG, 'P3');
  expect(n).toBeGreaterThan(0);
});

test('parity — F1/F2 fire: decaying CPA with CTR drop vs frequency over cap', () => {
  // Decaying: 3d CPA $60 vs 14d $40 (+50% > 20% drift), CTR 1% vs 2.5% (-60%).
  const fatigued = (id: string, over: Partial<AdSetSnapshot>) =>
    base(id, {
      windows: {
        d3: w(600, 10, 80, 8000, 10),
        d7: w(1800, 35, 400, 18000, 40),
        d14: w(4000, 100, 1000, 40000, 90),
      },
      ...over,
    });
  const n = expectParity(
    [
      fatigued('f1', { frequency7d: 1.8 }), // under cap => creative_refresh
      fatigued('f2', { frequency7d: 4.0 }), // over prospecting cap => audience_expand
      fatigued('f2-rmkt', { frequency7d: 4.0, audienceType: 'remarketing' }), // under remarketing cap => F1 path
    ],
    DEFAULT_CONFIG,
    'F1/F2',
  );
  expect(n).toBeGreaterThanOrEqual(3);
});

test('parity — protections: young, frozen, flagged, starved ad sets', () => {
  const p1ish = {
    windows: {
      d3: w(80, 0, 40, 4000, 0),
      d7: w(200, 0, 90, 9000, 0),
      d14: w(300, 0, 150, 15000, 0),
    },
  };
  expectParity(
    [
      base('young', { ...p1ish, ageDays: 4 }),
      base('frozen', { ...p1ish, status: 'frozen' }),
      base('flagged', { ...p1ish, status: 'flagged' }),
      // starved: pause triggers may still evaluate it, fatigue must skip it
      base('starved-decay', {
        status: 'starved',
        windows: {
          d3: w(600, 10, 80, 8000, 10),
          d7: w(1800, 35, 400, 18000, 40),
          d14: w(4000, 100, 1000, 40000, 90),
        },
        frequency7d: 4.0,
      }),
      base('ok'),
    ],
    DEFAULT_CONFIG,
    'protections',
  );
});

test('parity — objective profile (lead): KPI-aware facts match the built-ins', () => {
  const cfg = resolveConfig({ objective: 'lead' });
  const leadWin = (spend: number, leads: number, clicks = 0, impressions = 0): WindowMetrics => ({
    spend,
    purchases: 0,
    addToCarts: 0,
    clicks,
    impressions,
    leads,
  });
  const dead = base('lead-dead', {
    windows: {
      d3: leadWin(30, 0, 20, 2000),
      d7: leadWin(60, 0, 45, 4500),
      d14: leadWin(90, 0, 90, 9000),
    },
  });
  const fine = base('lead-ok', {
    windows: {
      d3: leadWin(90, 9, 100, 9000),
      d7: leadWin(210, 20, 220, 20000),
      d14: leadWin(420, 40, 450, 42000),
    },
  });
  expectParity([dead, fine], cfg, 'lead objective');
});

// --- Seeded randomized sweep ------------------------------------------------

const lcg = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

const STATUSES: AdSetSnapshot['status'][] = [
  'active',
  'active',
  'active',
  'active',
  'learning',
  'grace',
  'starved',
  'frozen',
  'flagged',
];
const AUDIENCES: AdSetSnapshot['audienceType'][] = [
  'prospecting',
  'retargeting',
  'remarketing',
  'unknown',
  undefined,
];

function randomSnapshot(id: string, rnd: () => number): AdSetSnapshot {
  const inc = (lo: number, hi: number) => lo + rnd() * (hi - lo);
  const count = (hi: number, zeroBias: number) => (rnd() < zeroBias ? 0 : Math.floor(inc(0, hi)));
  const win = (mult: number): WindowMetrics => ({
    spend: Math.round(inc(0, 120) * mult),
    purchases: count(6 * mult, 0.4),
    addToCarts: count(15 * mult, 0.35),
    clicks: count(200 * mult, 0.2),
    impressions: count(15000 * mult, 0.15),
  });
  // Cumulative by construction: d3 ⊆ d7 ⊆ d14.
  const d3 = win(1);
  const add = (a: WindowMetrics, b: WindowMetrics): WindowMetrics => ({
    spend: a.spend + b.spend,
    purchases: a.purchases + b.purchases,
    addToCarts: a.addToCarts + b.addToCarts,
    clicks: a.clicks + b.clicks,
    impressions: a.impressions + b.impressions,
  });
  const d7 = add(d3, win(1.4));
  const d14 = add(d7, win(2.2));
  return {
    id,
    status: STATUSES[Math.floor(rnd() * STATUSES.length)],
    currentBudget: Math.round(inc(20, 300)),
    ageDays: Math.floor(inc(1, 60)),
    audienceType: AUDIENCES[Math.floor(rnd() * AUDIENCES.length)],
    frequency7d: rnd() < 0.3 ? undefined : inc(0.5, 6.5),
    windows: { d3, d7, d14 },
  };
}

test('parity — randomized sweep: 300 seeded portfolios, zero divergence', () => {
  let totalRecs = 0;
  const kinds = new Set<string>();
  for (let seed = 1; seed <= 300; seed++) {
    const rnd = lcg(seed * 2654435761);
    const n = 4 + Math.floor(rnd() * 8);
    const snapshots = Array.from({ length: n }, (_, i) => randomSnapshot(`s${seed}-${i}`, rnd));
    const fired = expectParity(snapshots, DEFAULT_CONFIG, `seed ${seed}`);
    totalRecs += fired;
    for (const p of runBuiltins(snapshots, DEFAULT_CONFIG).projected) kinds.add(p.trigger);
  }
  // Guard against vacuous parity: the sweep must actually exercise the rules.
  expect(totalRecs).toBeGreaterThan(100);
  expect(kinds).toEqual(
    new Set([
      'P1_zero_upper_funnel',
      'P2_sustained_poor',
      'P3_low_significance',
      'F1_creative_fatigue',
      'F2_audience_saturation',
    ]),
  );
});

test('instantiateTemplate derives params from the resolved portfolio config', () => {
  const cfg: EngineConfig = resolveConfig({
    sustainedPoorMultiplier: 3.5,
    newItemProtectDays: 10,
  });
  const p2Template = BUILTIN_PARITY_TEMPLATES.find((t) => t.templateId === 'P2_sustained_poor');
  if (!p2Template) throw new Error('P2 template missing');
  const p2 = instantiateTemplate(p2Template, cfg);
  expect(p2.params.sustained_poor_multiplier).toBe(3.5);
  expect(p2.params.protect_days).toBe(10);
  // param override surface (the learning loop's tuning knob)
  const tuned = instantiateTemplate(p2Template, cfg, {
    paramOverrides: { sustained_poor_multiplier: 4.0 },
  });
  expect(tuned.params.sustained_poor_multiplier).toBe(4.0);
});
