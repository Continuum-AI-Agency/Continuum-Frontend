import { describe, expect, test } from 'bun:test';

import {
  READINESS_DIMENSIONS,
  readinessAnalysisSchema,
  readinessIsAssessable,
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
              label: 'A quantified customer outcome is stated',
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

describe('readinessIsAssessable', () => {
  const withCoverage = (coverage: number | undefined) => ({
    dimensions: Object.fromEntries(
      READINESS_DIMENSIONS.map((key) => [key, { score: 0, rationale: 'r', coverage }]),
    ) as Parameters<typeof readinessIsAssessable>[0]['dimensions'],
  });

  test('no readable evidence in any dimension is not a score', () => {
    expect(readinessIsAssessable(withCoverage(0))).toBe(false);
  });

  test('any measured dimension, or a legacy row without coverage, is assessable', () => {
    expect(readinessIsAssessable(withCoverage(0.25))).toBe(true);
    expect(readinessIsAssessable(withCoverage(undefined))).toBe(true);
  });
});
