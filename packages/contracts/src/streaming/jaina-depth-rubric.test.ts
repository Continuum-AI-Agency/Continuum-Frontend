import { describe, expect, it } from 'bun:test';
import {
  type DepthJudgement,
  depthSummaryOf,
  depthVerdictOf as depthOf,
  describeDepthSummary,
  missingActionParts,
} from './jaina-depth-rubric';
import type { JainaDepthLabel } from './jaina-question-plan';

const depthVerdictOf = (
  label: JainaDepthLabel,
  transcript: { toolResults: { name: string; ok: boolean }[] },
  blocks: unknown[],
  judgement: DepthJudgement | null,
) =>
  depthOf({
    label,
    okToolNames: new Set(transcript.toolResults.filter((r) => r.ok).map((r) => r.name)),
    blocks,
    judgement,
  });

const why: JainaDepthLabel = {
  class: 'diagnostic',
  asks: ['cause', 'recommendation'],
  named_levels: [],
  about_budget: false,
};

const ok = (...names: string[]) => ({ toolResults: names.map((name) => ({ name, ok: true })) });

const fullRow = {
  priority: 'P1',
  entity: { id: '1', name: 'Prospecting', kind: 'adset', level: 'adset' },
  action: 'Cut budget',
  sizing: '−30%',
  evidence: { metric: 'CPA', value: 48.2, unit: 'MXN', window: 'L14D', comparator: null },
};

const deepJudgement: DepthJudgement = {
  asks: [
    { ask: 'cause', answered: true },
    { ask: 'recommendation', answered: true },
  ],
  hypotheses: [
    { hypothesis: 'mix_vs_efficiency', status: 'confirmed' },
    { hypothesis: 'cpm', status: 'rejected' },
    { hypothesis: 'ctr', status: 'rejected' },
    { hypothesis: 'cvr', status: 'confirmed' },
    { hypothesis: 'settling', status: 'waived' },
    { hypothesis: 'recent_edit', status: 'rejected' },
    { hypothesis: 'fatigue', status: 'rejected' },
  ],
};

describe('depthVerdictOf', () => {
  it('scores a why that read every layer, closed every hypothesis and sized its move above a shallow one', () => {
    const deep = depthVerdictOf(
      why,
      ok(
        'get_key_metrics',
        'get_campaigns',
        'get_campaign_daily_trends',
        'get_ad_sets',
        'get_breakdown_insights_summary',
        'get_top_ads',
      ),
      [{ category: 'actions', rows: [fullRow] }],
      deepJudgement,
    );
    const shallow = depthVerdictOf(why, ok('get_key_metrics'), [], {
      asks: [{ ask: 'cause', answered: true }],
      hypotheses: [{ hypothesis: 'cpm', status: 'confirmed' }],
    });
    // change_history has no read yet and pacing is not mandated without a budget ask.
    expect(deep.missing).toEqual(['change_history']);
    expect(deep.parts.actions).toBe(1);
    expect(shallow.parts.actions).toBe(0);
    expect(shallow.parts.asks).toBe(0.5);
    expect(deep.score!).toBeGreaterThan(0.85);
    expect(shallow.score!).toBeLessThan(0.35);
  });

  it('mandates only account totals for a lookup, so one read is a full lookup', () => {
    const lookup = depthVerdictOf(
      { class: 'lookup', asks: ['figure'], named_levels: [], about_budget: false },
      ok('get_key_metrics'),
      [],
      { asks: [{ ask: 'figure', answered: true }], hypotheses: [] },
    );
    expect(lookup.mandated).toEqual(['account_totals']);
    expect(lookup.parts.hypotheses).toBeNull();
    expect(lookup.parts.actions).toBeNull();
    expect(lookup.score).toBe(1);
  });

  it('adds the named level and pacing only when the question carries them', () => {
    const named = depthVerdictOf(
      { class: 'compare', asks: ['comparison'], named_levels: ['adset'], about_budget: false },
      ok(),
      [],
      null,
    );
    expect(named.mandated).toContain('adset_audience');
    const budget = depthVerdictOf({ ...why, about_budget: true }, ok(), [], null);
    expect(budget.mandated).toContain('pacing');
    expect(budget.parts.asks).toBeNull();
  });

  it('ignores a failed read', () => {
    const verdict = depthVerdictOf(
      { class: 'lookup', asks: ['figure'], named_levels: [], about_budget: false },
      { toolResults: [{ name: 'get_key_metrics', ok: false }] },
      [],
      null,
    );
    expect(verdict.read).toEqual([]);
  });
});

describe('missingActionParts', () => {
  it('names each part an action lacks before a card can be made from it', () => {
    expect(missingActionParts(fullRow)).toEqual([]);
    expect(
      missingActionParts({ ...fullRow, sizing: null, entity: { ...fullRow.entity, level: null } }),
    ).toEqual(['entity', 'size']);
    expect(missingActionParts('pause it')).toEqual(['entity', 'metric', 'size', 'window']);
  });
});

describe('depthSummaryOf', () => {
  it('averages the graded tasks overall and per class, skipping unlabelled and ungraded ones', () => {
    const verdict = (score: number | null) =>
      ({ score }) as unknown as Parameters<typeof depthSummaryOf>[0][number]['depth'];
    const summary = depthSummaryOf([
      { label: why, depth: verdict(0.5) },
      { label: why, depth: verdict(1) },
      { label: { ...why, class: 'lookup' }, depth: verdict(1) },
      { label: undefined, depth: verdict(0) },
      { label: why, depth: null },
    ]);
    expect(summary.graded).toBe(3);
    expect(summary.mean).toBeCloseTo(2.5 / 3);
    expect(summary.byClass.diagnostic).toEqual({ graded: 2, mean: 0.75 });
    expect(describeDepthSummary(summary)).toContain('diagnostic 75% (2)');
  });
});
