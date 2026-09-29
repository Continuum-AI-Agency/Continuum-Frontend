import { describe, expect, test } from 'bun:test';
import { RecommendationEvidenceSchema, recommendationWinnerOf } from './service';

// The winning ad behind a "make variations of the winner" card, as C2 writes it into
// `optimizer.recommendations.evidence`. The figures are Prueba's 25 Sep cycle.
const PRUEBA_WINNER = {
  ad_id: '120210000000000001',
  ad_name: 'AV CAMACHO // AGOSTO - Copy',
  cost_per_result: 29.1,
  results: 26,
  spend: 756.6,
};

const evidenceWith = (winner: unknown) => ({
  metric: 'cpp',
  value: 29.1,
  comparator: 'vs 163.68 (5.63x) for its dearest priced sibling, same audience and budget',
  threshold: null,
  window: 'd14',
  estImpactPerDay: null,
  source: 'engine',
  winner,
});

describe('recommendationWinnerOf', () => {
  test('reads the winner after the jsonb round-trip the queue sees', () => {
    const wire = JSON.parse(JSON.stringify(evidenceWith(PRUEBA_WINNER)));
    const evidence = RecommendationEvidenceSchema.parse(wire);
    expect(recommendationWinnerOf(evidence)).toEqual(PRUEBA_WINNER);
  });

  test('a winner with no name still reads — the id is the defendant', () => {
    expect(recommendationWinnerOf(evidenceWith({ ...PRUEBA_WINNER, ad_name: null }))).toEqual({
      ...PRUEBA_WINNER,
      ad_name: null,
    });
  });

  test('absent on rows written before C2 carried it', () => {
    expect(recommendationWinnerOf(evidenceWith(undefined))).toBeNull();
    expect(recommendationWinnerOf(null)).toBeNull();
    expect(recommendationWinnerOf(undefined)).toBeNull();
  });

  test('a winner that bought nothing is no winner: zero is never drawn as a cost', () => {
    expect(
      recommendationWinnerOf(evidenceWith({ ...PRUEBA_WINNER, results: 0, cost_per_result: 0 })),
    ).toBeNull();
    expect(
      recommendationWinnerOf(evidenceWith({ ...PRUEBA_WINNER, cost_per_result: 0 })),
    ).toBeNull();
  });

  test('a malformed winner reads as none and never breaks the evidence parse', () => {
    const wire = evidenceWith({ ad_id: 7, cost_per_result: 'cheap' });
    expect(RecommendationEvidenceSchema.safeParse(wire).success).toBe(true);
    expect(recommendationWinnerOf(wire)).toBeNull();
  });
});
