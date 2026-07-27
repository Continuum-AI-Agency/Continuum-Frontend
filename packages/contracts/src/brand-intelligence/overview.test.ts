import { describe, expect, test } from 'bun:test';
import { brandIntelligenceOverviewSchema } from './overview';

const brandId = '6db1f6b3-e2ed-47e3-a5a8-0a76c93ddfe6';

describe('brandIntelligenceOverviewSchema', () => {
  test('accepts a partial projection and preserves the AEO evidence limitation', () => {
    const parsed = brandIntelligenceOverviewSchema.parse({
      brandId,
      schemaVersion: 1,
      generatedAt: '2026-07-27T12:00:00.000Z',
      refreshedAt: null,
      sourceVersions: {},
      status: 'partial',
      enrichment: {
        runId: null,
        status: 'idle',
        trigger: null,
        startedAt: null,
        completedAt: null,
        heartbeatAt: null,
        sections: {
          identity: 'missing',
          competitors: 'missing',
          creative_competition: 'missing',
          answer_visibility: 'missing',
        },
        error: null,
      },
      scorecard: {
        identityReadiness: {
          value: null,
          band: null,
          label: 'Identity readiness',
          explanation: 'Not measured.',
          measured: false,
        },
        evidenceCoverage: {
          value: 0,
          band: 'limited',
          label: 'Evidence coverage',
          explanation: 'No sections available.',
          measured: true,
        },
        competitorCoverage: {
          value: null,
          band: null,
          label: 'Competitor coverage',
          explanation: 'No active competitors.',
          measured: false,
        },
        observedVisibility: {
          value: null,
          band: null,
          label: 'Observed visibility',
          explanation: 'Simulated only.',
          measured: false,
        },
      },
      identity: { dna: null, readiness: null, evidenceRefs: [] },
      competitors: [],
      creativeCompetition: {
        status: 'missing',
        windowDays: null,
        refreshedAt: null,
        attributionNote: null,
        sourceCounts: null,
        gapCategoryCounts: {
          they_scale_you_absent: 0,
          they_scale_you_losing: 0,
          you_win_they_ignore: 0,
          shared_battleground: 0,
        },
        topGaps: [],
        evidenceRefs: [],
      },
      answerVisibility: {
        snapshot: null,
        methodology: {
          mode: 'simulated',
          engine: null,
          citationsVerified: false,
          limitations: ['V1 answers are simulated and are not observed engine responses.'],
        },
        evidenceRefs: [],
      },
      opportunities: [],
      coverage: [
        {
          section: 'identity',
          status: 'missing',
          mode: 'inferred',
          observedAt: null,
          limitations: [],
          error: null,
        },
        {
          section: 'competitors',
          status: 'missing',
          mode: 'inferred',
          observedAt: null,
          limitations: [],
          error: null,
        },
        {
          section: 'creative_competition',
          status: 'missing',
          mode: 'observed',
          observedAt: null,
          limitations: [],
          error: null,
        },
        {
          section: 'answer_visibility',
          status: 'missing',
          mode: 'simulated',
          observedAt: null,
          limitations: ['V1 answers are simulated and citations are not verified.'],
          error: null,
        },
      ],
    });

    expect(parsed.answerVisibility.methodology.mode).toBe('simulated');
    expect(parsed.answerVisibility.methodology.citationsVerified).toBe(false);
  });

  test('rejects an observed AEO methodology claim', () => {
    const result = brandIntelligenceOverviewSchema.safeParse({
      brandId,
      schemaVersion: 1,
      generatedAt: '2026-07-27T12:00:00.000Z',
      refreshedAt: null,
      sourceVersions: {},
      status: 'empty',
      enrichment: {
        runId: null,
        status: 'idle',
        trigger: null,
        startedAt: null,
        completedAt: null,
        heartbeatAt: null,
        sections: {
          identity: 'missing',
          competitors: 'missing',
          creative_competition: 'missing',
          answer_visibility: 'missing',
        },
        error: null,
      },
      scorecard: {
        identityReadiness: {
          value: null,
          band: null,
          label: 'Identity readiness',
          explanation: 'Not measured.',
          measured: false,
        },
        evidenceCoverage: {
          value: 0,
          band: 'limited',
          label: 'Evidence coverage',
          explanation: 'No sections available.',
          measured: true,
        },
        competitorCoverage: {
          value: null,
          band: null,
          label: 'Competitor coverage',
          explanation: 'No active competitors.',
          measured: false,
        },
        observedVisibility: {
          value: null,
          band: null,
          label: 'Observed visibility',
          explanation: 'Simulated only.',
          measured: false,
        },
      },
      identity: { dna: null, readiness: null, evidenceRefs: [] },
      competitors: [],
      creativeCompetition: {
        status: 'missing',
        windowDays: null,
        refreshedAt: null,
        attributionNote: null,
        sourceCounts: null,
        gapCategoryCounts: {
          they_scale_you_absent: 0,
          they_scale_you_losing: 0,
          you_win_they_ignore: 0,
          shared_battleground: 0,
        },
        topGaps: [],
        evidenceRefs: [],
      },
      answerVisibility: {
        snapshot: null,
        methodology: {
          mode: 'observed',
          engine: null,
          citationsVerified: false,
          limitations: ['Not observed.'],
        },
        evidenceRefs: [],
      },
      opportunities: [],
      coverage: [],
    });

    expect(result.success).toBe(false);
  });
});
