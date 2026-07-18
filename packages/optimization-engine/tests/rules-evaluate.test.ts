// evaluateRules() semantics: condition trees, fact refs, params-as-facts,
// loud errors, dedup precedence, built-in suppression, starve/freeze kinds,
// reason interpolation, global gates (bun test).
import { expect, test } from 'bun:test';
import type { AdSetSnapshot, WindowMetrics } from '../src/index';
import { DEFAULT_CONFIG } from '../src/index';
import { evalCondition, evaluateRules, interpolateReason } from '../src/rules/evaluate';
import type { RuleDefinition } from '../src/rules/types';

const w = (
  spend: number,
  purchases: number,
  clicks = 0,
  impressions = 0,
  addToCarts = 0,
): WindowMetrics => ({ spend, purchases, addToCarts, clicks, impressions });

const snap = (id: string, over: Partial<AdSetSnapshot> = {}): AdSetSnapshot => ({
  id,
  status: 'active',
  currentBudget: 100,
  ageDays: 40,
  windows: {
    d3: w(300, 10, 100, 10000),
    d7: w(700, 25, 250, 25000),
    d14: w(1400, 50, 500, 50000),
  },
  ...over,
});

const rule = (over: Partial<RuleDefinition> = {}): RuleDefinition => ({
  id: 'r1',
  templateId: 'test_rule',
  version: 1,
  name: 'test',
  enabled: true,
  priority: 50,
  conditions: { all: [{ fact: 'spend_d7', operator: 'greaterThan', value: 100 }] },
  action: { kind: 'pause', severity: 'medium', reasonTemplate: 'spend {{spend_d7}}' },
  params: {},
  ...over,
});

test('evalCondition: all/any trees and fact-ref indirection', () => {
  const facts = { spend: 500, min_spend: 400, ctr: 0.01 };
  expect(
    evalCondition(
      {
        all: [
          { fact: 'spend', operator: 'greaterThan', value: { fact: 'min_spend' } },
          { any: [{ fact: 'ctr', operator: 'lessThan', value: 0.02 }] },
        ],
      },
      facts,
    ),
  ).toBe(true);
  // json-rules-engine conventions: empty all => true, empty any => false
  expect(evalCondition({ all: [] }, facts)).toBe(true);
  expect(evalCondition({ any: [] }, facts)).toBe(false);
});

test('evalCondition: fact refs inside proportional operator params resolve', () => {
  const facts = { cpp: 120, reference: 40, multiplier: 2.5 };
  expect(
    evalCondition(
      {
        fact: 'cpp',
        operator: 'isGreaterThanRatio',
        value: { compareValue: { fact: 'reference' }, ratio: { fact: 'multiplier' } },
      },
      facts,
    ),
  ).toBe(true); // 120 > 40 × 2.5 = 100
});

test('unknown fact / operator is a loud per-evaluation error, never a throw', () => {
  const out = evaluateRules(
    [snap('a')],
    [
      rule({
        id: 'bad-fact',
        conditions: { all: [{ fact: 'no_such_fact', operator: 'greaterThan', value: 1 }] },
      }),
      rule({
        id: 'bad-op',
        conditions: {
          all: [{ fact: 'spend_d7', operator: 'squintsAt' as never, value: 1 }],
        },
      }),
    ],
    DEFAULT_CONFIG,
  );
  expect(out.findings.length).toBe(0);
  const errors = out.evaluations.filter((e) => e.error);
  expect(errors.length).toBe(2);
  expect(errors.find((e) => e.ruleId === 'bad-fact')?.error).toContain('no_such_fact');
  expect(errors.find((e) => e.ruleId === 'bad-op')?.error).toContain('squintsAt');
});

test('params merge as facts and OVERRIDE computed facts on collision', () => {
  const out = evaluateRules(
    [snap('a')],
    [
      rule({
        conditions: {
          all: [{ fact: 'spend_d7', operator: 'greaterThan', value: { fact: 'min_spend' } }],
        },
        params: { min_spend: 9999 }, // param threshold blocks the match
      }),
    ],
    DEFAULT_CONFIG,
  );
  expect(out.findings.length).toBe(0);
  expect(out.evaluations[0]?.matched).toBe(false);
});

test('dedup: higher priority wins per (adSetId, kind); loser recorded as deduped match', () => {
  const out = evaluateRules(
    [snap('a')],
    [rule({ id: 'low', priority: 10 }), rule({ id: 'high', priority: 90 })],
    DEFAULT_CONFIG,
  );
  expect(out.findings.length).toBe(1);
  expect(out.findings[0].ruleId).toBe('high');
  const evals = out.evaluations.filter((e) => e.matched);
  expect(evals.find((e) => e.ruleId === 'low')?.deduped).toBe(true);
  expect(evals.find((e) => e.ruleId === 'high')?.deduped).toBeUndefined();
  // matched evaluations carry the fact snapshot for the learning loop
  expect(evals.every((e) => e.facts !== undefined)).toBe(true);
});

test('built-ins win: alreadyFlagged kind suppresses the rule finding', () => {
  const out = evaluateRules(
    [snap('a')],
    [rule()],
    DEFAULT_CONFIG,
    new Map([['a', new Set(['pause' as const])]]),
  );
  expect(out.findings.length).toBe(0);
  expect(out.evaluations.find((e) => e.matched)?.deduped).toBe(true);
});

test('pause suppresses fatigue-kind findings on the same ad set (skipIds contract)', () => {
  const out = evaluateRules(
    [snap('a')],
    [
      rule({
        id: 'p',
        priority: 90,
        action: { kind: 'pause', severity: 'high', reasonTemplate: 'p' },
      }),
      rule({
        id: 'f',
        priority: 50,
        action: { kind: 'creative_refresh', severity: 'medium', reasonTemplate: 'f' },
      }),
    ],
    DEFAULT_CONFIG,
  );
  expect(out.findings.map((f) => f.ruleId)).toEqual(['p']);
  expect(out.starveIds.has('a')).toBe(true); // pause implies starve
});

test('starve and freeze kinds shape budget sets without findings', () => {
  const out = evaluateRules(
    [snap('a'), snap('b')],
    [
      rule({
        id: 's',
        action: { kind: 'starve', severity: 'low', reasonTemplate: 's' },
        conditions: { all: [{ fact: 'adset_id', operator: 'equal', value: 'a' }] },
      }),
      rule({
        id: 'z',
        action: { kind: 'freeze', severity: 'low', reasonTemplate: 'z' },
        conditions: { all: [{ fact: 'adset_id', operator: 'equal', value: 'b' }] },
      }),
    ],
    DEFAULT_CONFIG,
  );
  expect(out.findings.length).toBe(0);
  expect(out.starveIds.has('a')).toBe(true);
  expect(out.freezeIds.has('b')).toBe(true);
});

test('global gates: frozen/flagged and zero-data ad sets are skipped entirely', () => {
  const out = evaluateRules(
    [
      snap('frozen', { status: 'frozen' }),
      snap('flagged', { status: 'flagged' }),
      snap('nodata', {
        windows: { d3: w(0, 0), d7: w(0, 0), d14: w(0, 0) },
      }),
      snap('live'),
    ],
    [rule()],
    DEFAULT_CONFIG,
  );
  const evaluatedIds = new Set(out.evaluations.map((e) => e.adSetId));
  expect(evaluatedIds).toEqual(new Set(['live']));
});

test('disabled rules never evaluate', () => {
  const out = evaluateRules([snap('a')], [rule({ enabled: false })], DEFAULT_CONFIG);
  expect(out.evaluations.length).toBe(0);
  expect(out.findings.length).toBe(0);
});

test('reason interpolation formats numbers and tolerates unknowns', () => {
  expect(
    interpolateReason('spent ${{spend}} at {{ctr}} ctr ({{missing}}/{{inf}})', {
      spend: 700,
      ctr: 0.0123,
      inf: Number.POSITIVE_INFINITY,
    }),
  ).toBe('spent $700 at 0.01 ctr (?/∞)');
});

test('rule trigger id carries template lineage', () => {
  const out = evaluateRules([snap('a')], [rule()], DEFAULT_CONFIG);
  expect(out.findings[0].trigger).toBe('rule:test_rule');
  expect(out.findings[0].needsApproval).toBe(true);
});
