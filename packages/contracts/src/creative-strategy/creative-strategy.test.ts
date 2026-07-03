import { describe, expect, it } from 'bun:test';

import { angleEvidenceSourceEnum } from '../streaming/organic';
import { firstPartyCreativeAnalysisSchema } from './analysis';
import { creativeInsightSchema, creativeStrategyReportSchema } from './insight';

describe('firstPartyCreativeAnalysisSchema', () => {
  it('applies array defaults and tolerates extra LLM keys', () => {
    const parsed = firstPartyCreativeAnalysisSchema.parse({
      angle: 'make it feel effortless',
      hook: "You're doing this the hard way",
      hookArchetype: 'problem_agitation',
      primaryTheme: 'convenience',
      format: 'reel',
      visualStyle: 'handheld kitchen b-roll',
      targetAudienceSignal: 'busy parents',
      sentiment: 'aspirational',
      sentimentScore: 0.6,
      // extra key an LLM might add — must not fail parse (non-strict schema)
      confidenceNote: 'high',
    });
    expect(parsed.themes).toEqual([]);
    expect(parsed.valueProps).toEqual([]);
    expect(parsed.analyzedFromImage).toBe(false);
  });

  it('rejects an out-of-range sentiment score', () => {
    const bad = firstPartyCreativeAnalysisSchema.safeParse({
      angle: null,
      hook: null,
      hookArchetype: null,
      primaryTheme: null,
      format: null,
      visualStyle: null,
      targetAudienceSignal: null,
      sentiment: null,
      sentimentScore: 2,
    });
    expect(bad.success).toBe(false);
  });
});

describe('creativeInsightSchema', () => {
  it('parses an evidence-backed insight with defaults', () => {
    const insight = creativeInsightSchema.parse({
      id: 'hook-problem_agitation-1',
      kind: 'hook',
      archetype: 'problem_agitation',
      surface: 'organic',
      label: 'Call out the hard way',
      description: 'Opening on the pain of the status quo outperforms.',
      recommendation: "Lead with the reader's current friction before the fix.",
      confidence: 0.82,
      evidence: [
        {
          refId: 'post_123',
          surface: 'organic',
          metric: { name: 'hook_rate', value: 0.31, unit: 'rate' },
          capturedAt: '2026-07-01T00:00:00.000Z',
        },
      ],
    });
    expect(insight.tags).toEqual([]);
    expect(insight.exemplars).toEqual([]);
    expect(insight.evidence[0]?.metric?.unit).toBe('rate');
  });
});

describe('creativeStrategyReportSchema', () => {
  it('parses a minimal report and defaults the collections', () => {
    const report = creativeStrategyReportSchema.parse({
      brandId: 'brand_1',
      windowDays: 30,
      generatedAt: '2026-07-02T12:00:00.000Z',
      sourceCounts: { topOrganicPosts: 5, topAds: 5, analyzed: 10 },
    });
    expect(report.insights).toEqual([]);
    expect(report.angleLeaderboard).toEqual([]);
    expect(report.hookLeaderboard).toEqual([]);
  });
});

describe('angleEvidenceSourceEnum', () => {
  it('includes the new first-party creativeStrategy source', () => {
    expect(angleEvidenceSourceEnum.options).toContain('creativeStrategy');
  });
});
