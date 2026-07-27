// runCycle × rules wiring:
//   - no rules => byte-identical behavior to the pre-rules engine (production posture)
//   - rules provided => findings merge into recommendations, dedupe against the
//     built-ins (built-ins win), and rule starve/freeze shape the reallocation
//   - suppressBuiltinTriggers + seeded parity rules => reproduces the built-in
//     recommendations AND the built-in reallocation on the same portfolio
//   - ruleEvaluations surfaced on CycleResult (empty without rules)
// (bun test)
import { expect, test } from 'bun:test';
import type {
  AdSetSnapshot,
  Recommendation,
  RuleActionKind,
  RuleDefinition,
  WindowMetrics,
} from '../src/index';
import { DEFAULT_CONFIG, runCycle, seedParityRules } from '../src/index';

// --- Fixtures (parity-suite shapes) ----------------------------------------

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

/** P1-shaped: meaningful 3d spend, zero conversions, dead upper funnel.
 *  One d14 purchase keeps it out of the no_conversions abstain. */
const doomed = (id: string): AdSetSnapshot =>
  base(id, {
    windows: {
      d3: w(80, 0, 40, 4000, 0),
      d7: w(200, 0, 90, 9000, 0),
      d14: w(300, 1, 150, 15000, 0),
    },
  });

/** F1/F2-shaped: CPA rising (3d $60 vs 14d $40), CTR collapsing. Frequency
 *  under/over the prospecting cap selects creative_refresh vs audience_expand. */
const fatigued = (id: string, frequency7d: number): AdSetSnapshot =>
  base(id, {
    frequency7d,
    windows: {
      d3: w(600, 10, 80, 8000, 10),
      d7: w(1800, 35, 400, 18000, 40),
      d14: w(4000, 100, 1000, 40000, 90),
    },
  });

/** A rule matching exactly one ad set by id — the smallest possible condition. */
const ruleFor = (
  id: string,
  kind: RuleActionKind,
  adSetId: string,
  over: Partial<RuleDefinition> = {},
): RuleDefinition => ({
  id,
  version: 1,
  name: id,
  enabled: true,
  priority: 50,
  conditions: { fact: 'adset_id', operator: 'equal', value: adSetId },
  action: { kind, severity: 'medium', reasonTemplate: `${id} matched {{adset_id}}` },
  params: {},
  ...over,
});

const itemFor = (result: ReturnType<typeof runCycle>, id: string) => {
  const item = result.reallocation.items.find((i) => i.id === id);
  if (!item) throw new Error(`item ${id} missing from reallocation`);
  return item;
};

// --- No rules: identical behavior ------------------------------------------

test('no rules and rules:[] are identical to each other, with empty ruleEvaluations', () => {
  const snaps = () => [doomed('doom'), fatigued('fat', 4.0), base('ok')];
  const withoutKey = runCycle(snaps(), { total: 400 });
  const emptyRules = runCycle(snaps(), { total: 400, rules: [] });
  const explicitDefault = runCycle(snaps(), {
    total: 400,
    rules: [],
    suppressBuiltinTriggers: false,
  });

  expect(emptyRules).toEqual(withoutKey);
  expect(explicitDefault).toEqual(withoutKey);
  expect(withoutKey.ruleEvaluations).toEqual([]);
  // The built-ins still fired — the rules layer being inert is not the cycle being inert.
  expect(withoutKey.recommendations.length).toBeGreaterThan(0);
});

// --- Rules provided: merge, dedup, starve, freeze ---------------------------

test('rule findings merge into recommendations; built-ins win the (adSetId, kind) dedup', () => {
  const snaps = [doomed('doom'), base('target'), base('held'), base('ok')];
  const rules = [
    ruleFor('rule-pause-doom', 'pause', 'doom'), // built-in P1 already pauses doom => deduped
    ruleFor('rule-pause-target', 'pause', 'target'), // survives => Recommendation + starve
    ruleFor('rule-freeze-held', 'freeze', 'held'), // budget-shaping => hold at current budget
  ];
  const res = runCycle(snaps, { total: 400, rules });

  // Exactly one pause for doom, and it is the built-in's.
  const doomPauses = res.recommendations.filter((r) => r.adSetId === 'doom' && r.kind === 'pause');
  expect(doomPauses).toHaveLength(1);
  expect(doomPauses[0].trigger).toBe('P1_zero_upper_funnel');
  expect(doomPauses[0].ruleId).toBeUndefined();

  // The surviving rule finding maps 1:1 onto a Recommendation.
  const targetRec = res.recommendations.find((r) => r.adSetId === 'target');
  expect(targetRec).toEqual({
    adSetId: 'target',
    kind: 'pause',
    trigger: 'rule:rule-pause-target',
    severity: 'medium',
    reason: 'rule-pause-target matched target',
    needsApproval: true,
    ruleId: 'rule-pause-target',
  } satisfies Recommendation);

  // Rule starve reached the solver: target is driven toward its floor like a
  // built-in pause would drive it.
  expect(itemFor(res, 'target').status).toBe('starved');
  expect(itemFor(res, 'target').finalBudget).toBeLessThan(100);

  // Rule freeze reached the solver: held's budget is pinned, no recommendation.
  expect(itemFor(res, 'held').finalBudget).toBe(100);
  expect(res.recommendations.some((r) => r.adSetId === 'held')).toBe(false);

  // The deduped match is recorded (shadow-validation data), not surfaced.
  const dedupedRow = res.ruleEvaluations.find(
    (e) => e.ruleId === 'rule-pause-doom' && e.adSetId === 'doom',
  );
  expect(dedupedRow?.matched).toBe(true);
  expect(dedupedRow?.deduped).toBe(true);
  const survivorRow = res.ruleEvaluations.find(
    (e) => e.ruleId === 'rule-pause-target' && e.adSetId === 'target',
  );
  expect(survivorRow?.matched).toBe(true);
  expect(survivorRow?.deduped).toBeUndefined();
});

// --- Suppression: parity rules replace the built-ins ------------------------

test('suppressBuiltinTriggers + seeded parity rules reproduce built-in recommendations and reallocation', () => {
  const snaps = () => [
    doomed('doom-p1'),
    fatigued('fat-ctr', 1.8), // under cap => creative_refresh (F1)
    fatigued('fat-freq', 4.0), // over prospecting cap => audience_expand (F2)
    base('ok'),
  ];
  const builtin = runCycle(snaps(), { total: 500 });
  const rulesOnly = runCycle(snaps(), {
    total: 500,
    suppressBuiltinTriggers: true,
    rules: seedParityRules(DEFAULT_CONFIG),
  });

  const project = (recs: Recommendation[]) =>
    recs
      .map((r) => ({
        adSetId: r.adSetId,
        kind: r.kind,
        trigger: r.trigger.replace(/^rule:/, ''),
        severity: r.severity,
      }))
      .sort((a, b) => `${a.adSetId}|${a.trigger}`.localeCompare(`${b.adSetId}|${b.trigger}`));

  expect(builtin.recommendations.length).toBeGreaterThanOrEqual(3);
  expect(project(rulesOnly.recommendations)).toEqual(project(builtin.recommendations));

  // Same starves => same solver inputs => same money.
  for (const item of builtin.reallocation.items) {
    expect(itemFor(rulesOnly, item.id).status).toBe(item.status);
    expect(itemFor(rulesOnly, item.id).finalBudget).toBeCloseTo(item.finalBudget, 6);
  }
});

test('suppressBuiltinTriggers without rules produces no recommendations but a full cycle', () => {
  const res = runCycle([doomed('doom'), base('ok')], {
    total: 200,
    suppressBuiltinTriggers: true,
  });
  expect(res.recommendations).toEqual([]);
  expect(res.ruleEvaluations).toEqual([]);
  expect(res.reallocation.conserved).toBe(true);
});

// --- ruleEvaluations surfaced ------------------------------------------------

test('ruleEvaluations carries matched AND non-matched rows for every evaluated rule', () => {
  const snaps = [doomed('doom'), base('ok')];
  const rules = seedParityRules(DEFAULT_CONFIG);
  const res = runCycle(snaps, { total: 200, rules });

  expect(res.ruleEvaluations.length).toBeGreaterThan(0);
  // Non-matches are recorded too — the learning loop replays both sides.
  expect(res.ruleEvaluations.some((e) => !e.matched)).toBe(true);
  // Every row points back at a seeded rule and an evaluated ad set.
  const ruleIds = new Set(rules.map((r) => r.id));
  for (const row of res.ruleEvaluations) {
    expect(ruleIds.has(row.ruleId)).toBe(true);
    expect(['doom', 'ok']).toContain(row.adSetId);
  }
});
