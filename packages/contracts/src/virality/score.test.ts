import { describe, expect, it } from 'bun:test';
import {
  composeViralityOverall,
  type ViralityComponentScore,
  viralityComponentScoreSchema,
  viralityConfidence,
  viralityGradeForScore,
  viralityScoreSchema,
} from './score';

function component(raw: number, weight: number): ViralityComponentScore {
  return { component: 'hook_strength', raw, weight, rationale: 'x' };
}

describe('viralityGradeForScore', () => {
  it('maps scores to the analyzeHookRate bands at their thresholds', () => {
    expect(viralityGradeForScore(0)).toBe('weak');
    expect(viralityGradeForScore(34)).toBe('weak');
    expect(viralityGradeForScore(35)).toBe('okay');
    expect(viralityGradeForScore(59)).toBe('okay');
    expect(viralityGradeForScore(60)).toBe('strong');
    expect(viralityGradeForScore(84)).toBe('strong');
    expect(viralityGradeForScore(85)).toBe('viral');
    expect(viralityGradeForScore(100)).toBe('viral');
  });
});

describe('composeViralityOverall', () => {
  it('normalizes a raw 1-5 to 0-100 (1 -> 0, 5 -> 100)', () => {
    expect(composeViralityOverall([component(1, 1)])).toBe(0);
    expect(composeViralityOverall([component(5, 1)])).toBe(100);
    expect(composeViralityOverall([component(3, 1)])).toBe(50);
  });

  it('is a weight-normalized mean across components', () => {
    // raw 5 (weight 3) and raw 1 (weight 1): weighted mean of {1.0, 0.0}
    // = (1.0*3 + 0.0*1) / 4 = 0.75 -> 75
    const overall = composeViralityOverall([component(5, 3), component(1, 1)]);
    expect(overall).toBe(75);
  });

  it('returns 0 when total weight is zero rather than dividing by zero', () => {
    expect(composeViralityOverall([component(5, 0)])).toBe(0);
    expect(composeViralityOverall([])).toBe(0);
  });
});

describe('viralityConfidence', () => {
  it('clamps to [0.35, 0.95] and rises with evidence (mirrors creative_strategy)', () => {
    expect(viralityConfidence(0)).toBeCloseTo(0.35, 5);
    expect(viralityConfidence(1)).toBeCloseTo(0.5, 5);
    expect(viralityConfidence(4)).toBeCloseTo(0.95, 5);
    expect(viralityConfidence(100)).toBeCloseTo(0.95, 5);
  });
});

describe('viralityScoreSchema', () => {
  it('parses a fully scored payload', () => {
    const parsed = viralityScoreSchema.parse({
      status: 'scored',
      rubricVersion: 'v1',
      overall: 74,
      grade: 'strong',
      components: [component(4, 0.24)],
      grounding: {
        source: 'brand_grounded',
        archetype: 'curiosity_gap',
        brandArchetypeWinRate: 0.5,
        brandTopHookRate: 42,
        comparedRefIds: ['post_1'],
        evidenceCount: 3,
      },
      confidence: 0.8,
      observed: null,
      model: 'gemini-3.1-flash-lite-preview',
      computedAt: '2026-07-16T00:00:00.000Z',
    });
    expect(parsed.overall).toBe(74);
    expect(parsed.grounding?.source).toBe('brand_grounded');
  });

  it('applies defaults for a pending stub with only required fields', () => {
    const parsed = viralityScoreSchema.parse({
      status: 'pending',
      rubricVersion: 'v1',
      computedAt: '2026-07-16T00:00:00.000Z',
    });
    expect(parsed.overall).toBeNull();
    expect(parsed.grade).toBeNull();
    expect(parsed.components).toEqual([]);
    expect(parsed.grounding).toBeNull();
  });

  it('rejects an out-of-range component raw', () => {
    expect(() =>
      viralityComponentScoreSchema.parse({
        component: 'hook_strength',
        raw: 6,
        weight: 0.2,
        rationale: 'x',
      }),
    ).toThrow();
  });
});
