// Property tests of the pure engine over the recorded twin's scenarios as fixtures (P2.4,
// docs/perfplus-campaign/02-phases.md#p24; 01-method.md#e3: the engine is pure, its scenarios
// are fixtures, no twin). `fast-check` is not a dependency and none is added: a small seeded
// generator with greedy shrinking lives at the top of this file.
//
// Each property is one `test`. A failing property prints a FINDING line with the shrunk input
// (scenario, ad sets, budgets, options) so the case can be rebuilt by hand, then fails.
// Properties that are EXPECTED RED by the ledger are named as such in their test title; the
// product code is not touched here.
//
//   (a) the sum of proposed budgets never exceeds the portfolio total    (Tours 960 vs 750)
//   (b) no change exceeds the velocity cap unless pacing drives the total (or capBreached)
//   (c) a frozen ad set follows the plan step                             (09292d57)
//   (d) a zero-spend portfolio proposes nothing and says why
//   (e) null currency → no money figure carries a symbol                  (UX-backend-prose-prints-dollars)
//   (f) every money figure on a card ≤ the account's spend                (plausibility ceiling)
//   (g) pacing status is `on_track` only with source 'pacing' and idealCumulative > 0
//   (h) 500 ad sets: runCycle < 5 s, at most N changes

import { test as bunTest, expect } from 'bun:test';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { EngineFixture } from '../../../scripts/perfplus/twin/engineFixtures';
import type { ScenarioName } from '../../../scripts/perfplus/twin/scenarios';
import type { TwinSeed } from '../../../scripts/perfplus/twin/types';
import { type CycleOptions, resolveConfig, runCycle } from '../src/index';
import type { AdSetSnapshot, CycleResult, PacingState } from '../src/types';

// ---------------------------------------------------------------------------
// The twin's scenarios live in the monorepo's scripts/perfplus/twin
// ---------------------------------------------------------------------------

type TwinModules = {
  engineFixtures: typeof import('../../../scripts/perfplus/twin/engineFixtures');
  scenarios: typeof import('../../../scripts/perfplus/twin/scenarios');
};

/** Walk up to the monorepo root to find scripts/perfplus/twin.
 *
 *  This package is VENDORED into the Frontend (`bun run sync:contracts`), so the same file
 *  runs from two different depths, and in a standalone Frontend clone the twin scripts do not
 *  exist at all. A fixed `../../../` resolves from one depth and lands outside the repo from
 *  the other; with no twin above, every property below is SKIPPED by name, never silently
 *  passed. */
function findTwinDir(): string | null {
  let dir = import.meta.dir;
  for (let i = 0; i < 8; i += 1) {
    const candidate = join(dir, 'scripts/perfplus/twin');
    if (existsSync(join(candidate, 'engineFixtures.ts'))) return candidate;
    dir = dirname(dir);
  }
  return null;
}

async function loadTwin(): Promise<TwinModules | null> {
  const dir = findTwinDir();
  if (!dir) return null;
  return {
    engineFixtures: await import(join(dir, 'engineFixtures.ts')),
    scenarios: await import(join(dir, 'scenarios.ts')),
  };
}

const twin = await loadTwin();

/** Each property is one `test`: a real one with the twin above, a named skip without. */
const test = twin ? bunTest : bunTest.skip;

function twinOf(): TwinModules {
  if (!twin) throw new Error('scripts/perfplus/twin not found above ' + import.meta.dir);
  return twin;
}

// ---------------------------------------------------------------------------
// A seeded generator with shrinking (no dependency)
// ---------------------------------------------------------------------------

type Rand = () => number;

const mulberry32 = (seed: number): Rand => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

type Gen<T> = { sample: (rand: Rand) => T; shrink: (value: T) => T[] };

type Counterexample<T> = { seed: number; run: number; original: T; shrunk: T; message: string };

type ForAllResult<T> = { ok: true; runs: number } | ({ ok: false } & Counterexample<T>);

/** `check` returns null when the property holds, else the sentence that says how it broke.
 *  Shrinking is greedy: the first shrunk candidate that still fails replaces the current one,
 *  until no candidate fails or the step budget is spent. */
function forAll<T>(
  gen: Gen<T>,
  check: (value: T) => string | null,
  opts: { runs?: number; seed?: number; maxShrinks?: number; examples?: T[] } = {},
): ForAllResult<T> {
  const runs = opts.runs ?? 60;
  const seed = opts.seed ?? 20261009;
  const rand = mulberry32(seed);
  const examples = opts.examples ?? [];
  // Named examples go first (run index < 0 names them), then the seeded stream.
  for (let run = -examples.length; run < runs; run += 1) {
    const original = run < 0 ? examples[run + examples.length]! : gen.sample(rand);
    const message = check(original);
    if (message === null) continue;
    let current = original;
    let currentMessage = message;
    let steps = 0;
    let progress = true;
    while (progress && steps < (opts.maxShrinks ?? 400)) {
      progress = false;
      for (const candidate of gen.shrink(current)) {
        steps += 1;
        const m = check(candidate);
        if (m !== null) {
          current = candidate;
          currentMessage = m;
          progress = true;
          break;
        }
        if (steps >= (opts.maxShrinks ?? 400)) break;
      }
    }
    return { ok: false, seed, run, original, shrunk: current, message: currentMessage };
  }
  return { ok: true, runs };
}

const pick = <T>(rand: Rand, xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
const between = (rand: Rand, lo: number, hi: number): number => lo + rand() * (hi - lo);

// ---------------------------------------------------------------------------
// The fixture domain: a twin scenario, a roster, live budgets, and the cycle's options
// ---------------------------------------------------------------------------

const FIXTURE_SCENARIOS = [
  'baseline',
  'no_spend',
  'overspend',
  'learning_phase',
  'rejected_ad',
  'fatigue',
  'multi_currency',
  'null_currency',
  'cbo_campaign',
  'lifetime_budget',
  'overspend+learning',
] as const;
type FixtureScenario = (typeof FIXTURE_SCENARIOS)[number];

const seedCache = new Map<string, TwinSeed>();
function seedOf(name: FixtureScenario | 'five_hundred_adsets'): TwinSeed {
  const cached = seedCache.get(name);
  if (cached) return cached;
  const { buildScenario, scenarios } = twinOf().scenarios;
  const seed =
    name === 'overspend+learning'
      ? scenarios.learning_phase(scenarios.overspend())
      : buildScenario(name as ScenarioName);
  seedCache.set(name, seed);
  return seed;
}

/** The ad sets a property may put in a roster: ACTIVE, on the first account, under a
 *  non-bulk campaign (the 500 generated ones are property (h)'s alone). */
function rosterPool(seed: TwinSeed): string[] {
  const accountId = seed.accounts[0]?.accountId;
  const bulk = new Set(seed.campaigns.filter((c) => c.name.startsWith('BULK')).map((c) => c.id));
  return seed.adsets
    .filter((s) => s.accountId === accountId && s.status === 'ACTIVE' && !bulk.has(s.campaignId))
    .map((s) => s.id);
}

type Input = {
  scenario: FixtureScenario;
  adsetIds: string[];
  /** Multiplier on each ad set's seed budget — what Meta holds vs what the seed recorded. */
  budgetScale: number[];
  mode: 'balanced' | 'efficiency';
  /** A fixed total (MAJOR) or null for "the live sum". Ignored when `pacing` is set. */
  total: number | null;
  pacing: PacingState | null;
  currency: string | null;
};

type Built = {
  input: Input;
  fixture: EngineFixture;
  snapshots: AdSetSnapshot[];
  opts: CycleOptions;
};

function build(input: Input): Built {
  const seed = seedOf(input.scenario);
  const scale = new Map(input.adsetIds.map((id, i) => [id, input.budgetScale[i] ?? 1]));
  const fixture = twinOf().engineFixtures.engineFixture(seed, {
    adsetIds: input.adsetIds,
    currency: input.currency,
    liveBudgetMinor: (id) => {
      const base = seed.adsets.find((s) => s.id === id)?.dailyBudgetMinor;
      return base == null ? base : Math.round(base * (scale.get(id) ?? 1));
    },
  });
  const liveSum = fixture.snapshots.reduce((s, x) => s + x.currentBudget, 0);
  const opts: CycleOptions = {
    mode: input.mode,
    objective: fixture.objective,
    ...(input.pacing ? { pacing: input.pacing } : { total: input.total ?? liveSum }),
    config: { currency: input.currency },
    asOf: fixture.today,
    applyCapPct: 0.2,
  };
  return { input, fixture, snapshots: fixture.snapshots, opts };
}

const describeInput = (input: Input): string =>
  JSON.stringify({
    ...input,
    adsetIds: input.adsetIds.map((id) => id.slice(-6)),
    budgetScale: input.budgetScale.map((x) => Number(x.toFixed(2))),
  });

function inputGen(
  over: Partial<Input> & { scenarios?: readonly FixtureScenario[]; allowPacing?: boolean } = {},
): Gen<Input> {
  const names = over.scenarios ?? FIXTURE_SCENARIOS;
  return {
    sample: (rand) => {
      const scenario = over.scenario ?? pick(rand, names);
      const pool = rosterPool(seedOf(scenario));
      const k = Math.max(1, Math.min(pool.length, 1 + Math.floor(rand() * 8)));
      const shuffled = [...pool].sort(() => rand() - 0.5);
      const adsetIds = over.adsetIds ?? shuffled.slice(0, k);
      const budgetScale =
        over.budgetScale ?? adsetIds.map(() => (rand() < 0.5 ? 1 : between(rand, 0.5, 2)));
      const wantPacing =
        over.allowPacing !== false && over.pacing === undefined ? rand() < 0.4 : false;
      const periodBudget = Math.round(between(rand, 5_000, 40_000));
      const periodDays = pick(rand, [7, 14, 30, 31]);
      const dayIndex = 1 + Math.floor(rand() * periodDays);
      const pacing: PacingState | null =
        over.pacing !== undefined
          ? over.pacing
          : wantPacing
            ? {
                periodBudget,
                periodDays,
                dayIndex,
                actualSpendToDate: Math.round(
                  (periodBudget / periodDays) * (dayIndex - 1) * between(rand, 0.2, 1.8),
                ),
              }
            : null;
      const total =
        over.total !== undefined
          ? over.total
          : rand() < 0.5
            ? null
            : Math.round(between(rand, 200, 2_000));
      return {
        scenario,
        adsetIds,
        budgetScale,
        mode: over.mode ?? pick(rand, ['balanced', 'efficiency']),
        total,
        pacing,
        currency: over.currency !== undefined ? over.currency : pick(rand, ['MXN', 'USD', null]),
      };
    },
    shrink: (v) => {
      const out: Input[] = [];
      if (v.adsetIds.length > 1 && over.adsetIds === undefined) {
        for (let i = 0; i < v.adsetIds.length; i += 1) {
          out.push({
            ...v,
            adsetIds: v.adsetIds.filter((_, j) => j !== i),
            budgetScale: v.budgetScale.filter((_, j) => j !== i),
          });
        }
      }
      if (v.budgetScale.some((x) => x !== 1) && over.budgetScale === undefined)
        out.push({ ...v, budgetScale: v.budgetScale.map(() => 1) });
      if (v.pacing && over.pacing === undefined) {
        out.push({ ...v, pacing: null });
        if (v.pacing.dayIndex > 1)
          out.push({ ...v, pacing: { ...v.pacing, dayIndex: 1, actualSpendToDate: 0 } });
      }
      if (v.total !== null && over.total === undefined) out.push({ ...v, total: null });
      if (v.mode !== 'balanced' && over.mode === undefined) out.push({ ...v, mode: 'balanced' });
      return out;
    },
  };
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function report(property: string, result: ForAllResult<Input>, productRef: string): void {
  if (result.ok) {
    console.log(`  ✓ ${property}: ${result.runs} inputs hold`);
    return;
  }
  console.log(`  ✗ FINDING ${property} — seed ${result.seed} run ${result.run}`);
  console.log(`    ${result.message}`);
  console.log(`    shrunk input: ${describeInput(result.shrunk)}`);
  console.log(`    product: ${productRef}`);
  expect(
    result.message,
    `${property}\n${result.message}\nshrunk: ${describeInput(result.shrunk)}`,
  ).toBeNull();
}

const EPS = 1e-6;
const money = (x: number): string => x.toFixed(2);

/** Every sentence a card could print from a cycle result. */
function allProse(r: CycleResult): string[] {
  return [
    ...r.recommendations.map((x) => x.reason),
    ...r.reallocation.notes,
    r.pacing.note,
    ...(r.scale ? [r.scale.reason] : []),
    ...r.confidence.actionables.map((a) => a.message),
  ];
}

// ---------------------------------------------------------------------------
// (a) the sum of proposed budgets never exceeds the portfolio total
// ---------------------------------------------------------------------------

/** The ledger's own case: the four Tours ad sets live at 960 MXN, frozen (learning), against
 *  the 750 MXN portfolio total — "solver con pool negativo". Built inside the test, not at
 *  module scope, so a copy with no twin above skips instead of throwing on import. */
const toursNineSixtyVsSevenFifty = (): Input => ({
  scenario: 'overspend+learning',
  adsetIds: rosterPool(seedOf('overspend+learning')).filter((id) =>
    seedOf('overspend+learning').adsets.some((s) => s.id === id && s.learningStage === 'LEARNING'),
  ),
  budgetScale: [1, 1, 1, 1],
  mode: 'balanced',
  total: 750,
  pacing: null,
  currency: 'MXN',
});

test('(a) proposed budgets sum to at most the portfolio total — Tours 960 vs 750', () => {
  const result = forAll(
    inputGen(),
    (input) => {
      const { snapshots, opts } = build(input);
      const r = runCycle(snapshots, opts);
      const total = r.reallocation.totalBudget;
      const proposed = r.reallocation.items.reduce((s, it) => s + it.finalBudget, 0);
      // Frozen (learning) ad sets alone above the total: the engine may not cut them (c), so
      // the only honest answer is a refusal by name with every budget held — not a proposal.
      const refused = r.reallocation.refusal?.reason === 'frozen_above_total';
      const heldEverything = r.reallocation.items.every(
        (it) => Math.abs(it.finalBudget - it.currentBudget) < EPS,
      );
      if (refused && heldEverything && !r.reallocation.conserved) return null;
      if (refused) {
        return `refused ${r.reallocation.refusal?.reason} yet a budget moved or conserved=${r.reallocation.conserved}`;
      }
      if (proposed > total + EPS) {
        return `proposed ${money(proposed)} > total ${money(total)} (pool ${money(r.reallocation.pool)}, frozen ${money(r.reallocation.frozenBudget)}, conserved=${r.reallocation.conserved}, notes: ${r.reallocation.notes.join(' | ') || 'none'})`;
      }
      return null;
    },
    // The ledger's own case goes first; the seeded stream follows.
    { examples: [toursNineSixtyVsSevenFifty()] },
  );
  report(
    '(a) sum ≤ total',
    result,
    'packages/optimization-engine/src/engine.ts reallocate — pool = total − frozen can go negative',
  );
});

// ---------------------------------------------------------------------------
// (b) no change exceeds the velocity cap unless pacing drives the total
// ---------------------------------------------------------------------------

test('(b) no proposed change exceeds the velocity cap unless the total is pacing-driven (or the solver names the breach)', () => {
  const result = forAll(inputGen(), (input) => {
    const { snapshots, opts } = build(input);
    const r = runCycle(snapshots, opts);
    if (r.pacing.source === 'pacing') return null;
    const cfg = resolveConfig({ objective: opts.objective, ...opts.config });
    const upPct = cfg.velocityUpPct ?? cfg.velocityCapPct;
    const downPct = cfg.velocityDownPct ?? cfg.velocityCapPct;
    for (const it of r.reallocation.items) {
      if (it.status === 'frozen' || it.status === 'flagged' || it.capBreached) continue;
      const snap = snapshots.find((s) => s.id === it.id);
      if (snap?.freeze) continue;
      const cap = it.changePct > 0 ? upPct : downPct;
      if (Math.abs(it.changePct) > cap + 1e-4) {
        return `${it.id.slice(-6)} (${it.status}) moves ${(it.changePct * 100).toFixed(1)}% > cap ${(cap * 100).toFixed(0)}% with capBreached=false, source=${r.pacing.source}; notes: ${r.reallocation.notes.join(' | ') || 'none'}`;
      }
    }
    return null;
  });
  report(
    '(b) velocity cap without pacing',
    result,
    'packages/optimization-engine/src/engine.ts "underflow: relaxed velocity down-cap" relaxes the cap without flagging capBreached on the item',
  );
});

// ---------------------------------------------------------------------------
// (c) a frozen ad set follows the plan step (09292d57)
// ---------------------------------------------------------------------------

test('(c) a frozen ad set moves by exactly the plan step on a pacing cycle, and not at all without one', () => {
  const result = forAll(
    inputGen({
      scenarios: [
        'learning_phase',
        'overspend+learning',
        'cbo_campaign',
        'lifetime_budget',
        'no_spend',
        'baseline',
      ],
    }),
    (input) => {
      const { snapshots, opts } = build(input);
      const r = runCycle(snapshots, opts);
      const liveTotal = snapshots.reduce((s, x) => s + x.currentBudget, 0);
      const step =
        r.pacing.source === 'pacing' && liveTotal > 0 ? r.reallocation.totalBudget / liveTotal : 1;
      for (const it of r.reallocation.items) {
        if (it.status !== 'frozen') continue;
        const want = it.currentBudget * step;
        if (Math.abs(it.finalBudget - want) > 1e-6) {
          return `frozen ${it.id.slice(-6)} (${it.freezeReason ?? 'operator'}) proposed ${money(it.finalBudget)}, plan step ${step.toFixed(4)} × ${money(it.currentBudget)} = ${money(want)} (source=${r.pacing.source})`;
        }
      }
      return null;
    },
  );
  report(
    '(c) frozen follows the plan step',
    result,
    'packages/optimization-engine/src/runCycle.ts frozenScale / engine.ts frozenTarget',
  );
});

// ---------------------------------------------------------------------------
// (d) a zero-spend portfolio proposes nothing and says why
// ---------------------------------------------------------------------------

test('(d) a zero-spend portfolio proposes no budget move and says why', () => {
  const result = forAll(
    inputGen({ scenario: 'no_spend', allowPacing: false, total: null }),
    (input) => {
      const { snapshots, opts } = build(input);
      const r = runCycle(snapshots, opts);
      const moved = r.reallocation.items.filter((it) => Math.abs(it.changeAbs) > EPS);
      if (moved.length > 0) {
        return `${moved.length} budget move(s) on zero spend: ${moved.map((it) => `${it.id.slice(-6)} ${money(it.currentBudget)}→${money(it.finalBudget)} (${it.status})`).join(', ')}`;
      }
      const says = allProse(r).some((t) =>
        /zero impressions|no spend|not delivering|no delivery|dark/i.test(t),
      );
      if (!says)
        return `nothing moved but nothing says why: recs=${r.recommendations.map((x) => x.trigger).join(',') || 'none'}, notes=${r.reallocation.notes.join('|') || 'none'}`;
      return null;
    },
  );
  report(
    '(d) zero spend → no move, with a reason',
    result,
    'packages/optimization-engine/src/delivery.ts D2_dark_with_budget / runCycle.ts no_conversions abstain',
  );
});

// ---------------------------------------------------------------------------
// (e) null currency → no money figure carries a symbol
// ---------------------------------------------------------------------------

test('(e) with a null currency no sentence prints a currency symbol — UX-backend-prose-prints-dollars', () => {
  const result = forAll(
    inputGen({ currency: null }),
    (input) => {
      const { snapshots, opts } = build(input);
      const r = runCycle(snapshots, opts);
      const offending = allProse(r).filter((t) => /(?:US|MX|CA|AU)?\$\s?\d|[€£¥]\s?\d/.test(t));
      if (offending.length > 0)
        return `symbol in: ${offending
          .slice(0, 3)
          .map((t) => JSON.stringify(t.slice(0, 120)))
          .join(' ; ')}`;
      return null;
    },
    { runs: 90 },
  );
  report(
    '(e) null currency prints bare',
    result,
    'producers: triggers.ts, creative.ts, fatigue.ts, settings.ts, pacing.ts, delivery.ts via formatMoney(contracts)',
  );
});

// M1 (2026-10-13): a peso figure prints "$306 MXN". The "$" is allowed only with the code
// right after its figure — a bare "$306" on a peso account still reads as dollars, and a
// foreign code ("USD") on a peso account is a different currency.
const DOLLAR_WITHOUT_MXN = /\$\s?\d[\d,]*(?:\.\d+)?(?![\d.,]| MXN\b)/;

test('(e′) with MXN every dollar sign carries the MXN code, and no other code appears', () => {
  const result = forAll(
    inputGen({ currency: 'MXN' }),
    (input) => {
      const { snapshots, opts } = build(input);
      const r = runCycle(snapshots, opts);
      const offending = allProse(r).filter((t) => DOLLAR_WITHOUT_MXN.test(t) || /\bUSD\b/.test(t));
      if (offending.length > 0)
        return `$ without MXN, or a foreign code, on a peso account in: ${offending
          .slice(0, 3)
          .map((t) => JSON.stringify(t.slice(0, 120)))
          .join(' ; ')}`;
      return null;
    },
    { runs: 60 },
  );
  report('(e′) MXN never prints $ without its code', result, 'same producers');
});

// ---------------------------------------------------------------------------
// (f) every money figure on a card ≤ the account's spend (plausibility ceiling)
// ---------------------------------------------------------------------------

const MXN_FIGURE = /(-?\d[\d,]*(?:\.\d+)?)\s(?:MXN)\b/g;

test('(f) every money figure a card prints is at most the account 30-day spend', () => {
  const result = forAll(
    inputGen({
      currency: 'MXN',
      scenarios: FIXTURE_SCENARIOS.filter((s) => s !== 'multi_currency'),
    }),
    (input) => {
      const { snapshots, opts, fixture } = build(input);
      const r = runCycle(snapshots, opts);
      const ceiling = Math.max(
        fixture.accountSpend30d,
        r.reallocation.totalBudget * 31,
        r.pacing.periodBudget ?? 0,
      );
      for (const text of allProse(r)) {
        for (const m of text.matchAll(MXN_FIGURE)) {
          const value = Number(m[1]!.replace(/,/g, ''));
          if (Number.isFinite(value) && Math.abs(value) > ceiling + EPS) {
            return `figure ${m[0]} > ceiling ${money(ceiling)} (account 30d spend ${money(fixture.accountSpend30d)}) in: ${JSON.stringify(text.slice(0, 140))}`;
          }
        }
      }
      return null;
    },
    { runs: 90 },
  );
  report(
    '(f) money figures ≤ account spend',
    result,
    'every producer that prints formatMoney(x, currency)',
  );
});

// ---------------------------------------------------------------------------
// (g) pacing status is `on_track` only with source 'pacing' and idealCumulative > 0
// ---------------------------------------------------------------------------

test('(g) `on_track` only when a real flight drove the total and there was an ideal to compare against', () => {
  const result = forAll(inputGen(), (input) => {
    const { snapshots, opts } = build(input);
    const r = runCycle(snapshots, opts);
    const p = r.pacing;
    if (p.status === 'on_track' && !(p.source === 'pacing' && p.idealCumulative > 0)) {
      return `pacing.status=on_track with source=${p.source ?? 'undefined'} idealCumulative=${p.idealCumulative} dayIndex=${p.dayIndex ?? 'n/a'} (note: ${JSON.stringify(p.note)})`;
    }
    return null;
  });
  report(
    '(g) on_track is a verdict, not a placeholder',
    result,
    'packages/optimization-engine/src/runCycle.ts (no-pacing fallback status) and pacing.ts (dayIndex 1 ⇒ idealCumulative 0 ⇒ on_track)',
  );
});

// ---------------------------------------------------------------------------
// (h) 500 ad sets: runCycle < 5 s and at most N changes
// ---------------------------------------------------------------------------

test('(h) five hundred ad sets: a cycle finishes under 5 s and proposes at most one change per ad set', () => {
  const seed = seedOf('five_hundred_adsets');
  const fixture = twinOf().engineFixtures.engineFixture(seed, { currency: 'MXN' });
  const n = fixture.snapshots.length;
  expect(n).toBeGreaterThanOrEqual(500);
  const variants: Array<[string, CycleOptions]> = [
    [
      'balanced/observed',
      {
        mode: 'balanced',
        objective: fixture.objective,
        total: fixture.total,
        config: { currency: 'MXN' },
        asOf: fixture.today,
      },
    ],
    [
      'efficiency/fixed',
      {
        mode: 'efficiency',
        objective: fixture.objective,
        total: fixture.total * 0.8,
        config: { currency: 'MXN' },
        asOf: fixture.today,
      },
    ],
    [
      'balanced/pacing',
      {
        mode: 'balanced',
        objective: fixture.objective,
        pacing: {
          periodBudget: fixture.total * 30,
          periodDays: 30,
          dayIndex: 12,
          actualSpendToDate: fixture.total * 14,
        },
        config: { currency: 'MXN' },
        asOf: fixture.today,
      },
    ],
  ];
  for (const [name, opts] of variants) {
    const t0 = performance.now();
    const r = runCycle(fixture.snapshots, opts);
    const ms = performance.now() - t0;
    const changes = r.reallocation.items.filter((it) => Math.abs(it.changeAbs) > EPS).length;
    console.log(
      `  (h) ${name}: ${n} ad sets in ${ms.toFixed(0)} ms, ${changes} changes, ${r.recommendations.length} recommendations`,
    );
    expect(ms, `${name} took ${ms.toFixed(0)} ms`).toBeLessThan(5_000);
    expect(changes).toBeLessThanOrEqual(n);
    expect(r.reallocation.items.length).toBe(n);
  }
});
