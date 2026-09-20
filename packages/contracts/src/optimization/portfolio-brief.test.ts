import { describe, expect, it } from 'bun:test';
import {
  allowedNumberTokens,
  type BriefCandidate,
  type BriefGrowth,
  briefFigures,
  deterministicBrief,
  heroThresholdMet,
  numbersOutsidePacket,
  portfolioBriefSchema,
  rankCandidates,
  validateHeroPick,
} from './portfolio-brief';

const cand = (over: Partial<BriefCandidate>): BriefCandidate => ({
  id: 'rec:1',
  module: 'pause',
  kind: 'pause',
  trigger: 'P1_zero_upper_funnel',
  adset_id: 'as-1',
  adset_name: 'Cold',
  impact_per_day: 120,
  impact_unit: 'currency',
  results_per_day: null,
  impact_basis: 'spend/day on an ad set with 0 conversions in 7d',
  reason: 'Spent $840 in 7 days and produced no conversions.',
  cta: { kind: 'queue_row', target_id: 'rec:1' },
  ...over,
});
const growth: BriefGrowth = {
  spend: 3200,
  results: 41,
  cost_per_result: 78.05,
  target: 70,
  deltas: { spend: 0.12, results: 0.3, cost_per_result: -0.14 },
  pacing: { status: 'on_track', ratio: 1.01, note: null },
  scale: null,
  window: 'd7',
  as_of: '2026-09-19T06:10:00Z',
  currency: 'USD',
  result_label: 'leads',
};

describe('portfolio brief', () => {
  it('ranks by money then module order, and applies the impact floor', () => {
    const ranked = rankCandidates([
      cand({ id: 'rec:a', module: 'creative', impact_per_day: 50 }),
      cand({ id: 'rec:b', module: 'budget', impact_per_day: 50 }),
      cand({ id: 'rec:c', impact_per_day: 120 }),
    ]);
    expect(ranked.map((c) => c.id)).toEqual(['rec:c', 'rec:b', 'rec:a']);
    expect(heroThresholdMet([cand({ impact_per_day: 4 })], 100)).toBe(false);
    expect(heroThresholdMet([cand({ impact_per_day: 6 })], 100)).toBe(true);
  });
  it('accepts the maximum, or a justified non-maximum with the maximum listed first', () => {
    const cands = [
      cand({ id: 'rec:max', impact_per_day: 200 }),
      cand({ id: 'rec:b', module: 'budget', impact_per_day: 90 }),
    ];
    expect(
      validateHeroPick({
        candidates: cands,
        chosenId: 'rec:max',
        justification: null,
        secondary: [],
      }),
    ).toEqual({ ok: true });
    expect(
      validateHeroPick({
        candidates: cands,
        chosenId: 'rec:b',
        justification: null,
        secondary: ['rec:max'],
      }).ok,
    ).toBe(false);
    expect(
      validateHeroPick({
        candidates: cands,
        chosenId: 'rec:b',
        justification: 'compounds daily',
        secondary: [],
      }).ok,
    ).toBe(false);
    expect(
      validateHeroPick({
        candidates: cands,
        chosenId: 'rec:b',
        justification: 'compounds daily',
        secondary: ['rec:max'],
      }),
    ).toEqual({ ok: true });
    expect(
      validateHeroPick({
        candidates: cands,
        chosenId: 'rec:zzz',
        justification: null,
        secondary: [],
      }).ok,
    ).toBe(false);
  });
  it('lets only packet figures through the digit gate', () => {
    const allowed = allowedNumberTokens(briefFigures(growth, [cand({})]));
    expect(
      numbersOutsidePacket(
        'Results up 30% while cost per lead fell 14% to $78; stop $120/day.',
        allowed,
      ),
    ).toEqual([]);
    expect(numbersOutsidePacket('Cost per lead is $99 now.', allowed)).toEqual(['99']);
    expect(numbersOutsidePacket('3 ad sets, 7 days', allowed)).toEqual([]);
  });
  it('composes a deterministic brief that validates, with the growth sentence from figures', () => {
    const brief = deterministicBrief({
      growth,
      candidates: [cand({}), cand({ id: 'rec:2', module: 'creative', impact_per_day: 40 })],
      dailyTotal: 500,
      promptVersion: 'v1',
      generatedAt: '2026-09-19T06:15:00Z',
    });
    expect(portfolioBriefSchema.parse(brief).hero).toMatchObject({
      module: 'pause',
      candidate_id: 'rec:1',
      cta: { kind: 'queue_row' },
    });
    expect(brief.hero.headline).toContain('USD 120/day');
    expect(brief.growth_sentence).toBe(
      'leads +30% · cost per result -14% · 12% over target · on track',
    );
    expect(brief.secondary).toEqual(['rec:2']);
    const none = deterministicBrief({
      growth,
      candidates: [],
      dailyTotal: 500,
      promptVersion: 'v1',
      generatedAt: 'x',
    });
    expect(none.hero.module).toBe('none');
  });
});
