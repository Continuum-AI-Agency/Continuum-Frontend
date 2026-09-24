import { describe, expect, test } from 'bun:test';

import {
  READINESS_DIMENSIONS,
  readinessAnalysisCoreSchema,
  readinessAnalysisSchema,
  readinessSeverity,
} from './readiness';

const legacyRow = {
  overall_score: 62,
  dimensions: Object.fromEntries(
    READINESS_DIMENSIONS.map((key) => [key, { score: 60, rationale: 'legacy rationale' }]),
  ),
  findings: [
    {
      dimension: 'success_metrics',
      score: 35,
      severity: 'high',
      headline: 'No outcomes',
      detail: 'No quantified outcome anywhere.',
      recommendation: 'State one measured customer result.',
    },
  ],
  generated_at: '2026-09-23T00:00:00.000Z',
};

describe('readinessAnalysisSchema', () => {
  test('legacy rows without criteria fields still parse', () => {
    expect(readinessAnalysisSchema.safeParse(legacyRow).success).toBe(true);
  });

  test('criteria fields survive a parse instead of being stripped', () => {
    const scored = {
      ...legacyRow,
      dimensions: {
        ...legacyRow.dimensions,
        success_metrics: {
          score: 35,
          rationale: 'Met 1 of 4.',
          coverage: 0.75,
          reachable: 80,
          criteria: [
            {
              id: 'sm_quantified_outcome',
              met: 'no',
              quote: null,
              source: null,
              verified: false,
            },
          ],
        },
      },
      completeness: 'partial',
      evidence_sources: { homepage: 'ok', subpages: 'thin', instagram: 'absent', search: 'ok' },
      reachable_score: 74,
      scorer_version: 'criteria-v1',
    };
    const parsed = readinessAnalysisSchema.parse(scored);
    expect(parsed.dimensions.success_metrics.criteria?.[0]?.id).toBe('sm_quantified_outcome');
    expect(parsed.evidence_sources?.subpages).toBe('thin');
    expect(parsed.reachable_score).toBe(74);
  });

  test('the model-facing core schema carries no criteria fields', () => {
    const core = readinessAnalysisCoreSchema.shape.dimensions.shape.success_metrics.shape;
    expect(Object.keys(core).sort()).toEqual(['rationale', 'score']);
  });
});

describe('readinessSeverity', () => {
  test('cutoffs are <40 high, 40–69 medium, ≥70 low', () => {
    expect([0, 39, 40, 69, 70, 100].map(readinessSeverity)).toEqual([
      'high',
      'high',
      'medium',
      'medium',
      'low',
      'low',
    ]);
  });
});
