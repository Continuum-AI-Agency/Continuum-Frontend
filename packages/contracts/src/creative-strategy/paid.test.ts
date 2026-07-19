import { describe, expect, it } from 'bun:test';

import {
  creativeWinRateRowSchema,
  META_REPORTED_ATTRIBUTION_NOTE,
  paidCreativeLabelsSchema,
  paidCreativeReportSchema,
  paidCreativeVerdictSchema,
} from './paid';

describe('paidCreativeLabelsSchema', () => {
  it('extends the first-party analysis with paid fields, defaults, and LLM tolerance', () => {
    const parsed = paidCreativeLabelsSchema.parse({
      angle: 'the hard way is costing you',
      hook: 'Stop scrubbing timelines by hand',
      hookArchetype: 'problem_agitation',
      primaryTheme: 'time saved',
      format: 'ugc testimonial',
      visualStyle: 'selfie-cam',
      targetAudienceSignal: 'media buyers',
      sentiment: 'urgent',
      sentimentScore: 0.4,
      assetType: 'video',
      funnelStage: 'tof',
      funnelStageConfidence: 0.8,
      funnelStageRationale: 'broad problem-awareness framing, no brand recall assumed',
      hookTranscript: 'Stop scrubbing timelines by hand.',
      // extra key an LLM might add — must not fail parse (non-strict schema)
      extraLlmKey: 'ignored',
    });
    expect(parsed.assetType).toBe('video');
    expect(parsed.funnelStage).toBe('tof');
    expect(parsed.themes).toEqual([]);
  });

  it('defaults assetType and funnelStage to unknown when the labeler omits them', () => {
    const parsed = paidCreativeLabelsSchema.parse({
      angle: null,
      hook: null,
      hookArchetype: null,
      primaryTheme: null,
      format: null,
      visualStyle: null,
      targetAudienceSignal: null,
      sentiment: null,
      sentimentScore: null,
    });
    expect(parsed.assetType).toBe('unknown');
    expect(parsed.funnelStage).toBe('unknown');
    expect(parsed.hookTranscript).toBeNull();
  });

  it('rejects a funnel stage outside the taxonomy', () => {
    const bad = paidCreativeLabelsSchema.safeParse({
      angle: null,
      hook: null,
      hookArchetype: null,
      primaryTheme: null,
      format: null,
      visualStyle: null,
      targetAudienceSignal: null,
      sentiment: null,
      sentimentScore: null,
      funnelStage: 'retargeting',
    });
    expect(bad.success).toBe(false);
  });
});

describe('creativeWinRateRowSchema', () => {
  it('parses a flagged win-rate row with defaults', () => {
    const row = creativeWinRateRowSchema.parse({
      dimension: 'hook_archetype',
      value: 'social_proof',
      funnelStage: 'tof',
      eligibleAds: 12,
      winners: 8,
      winRate: 8 / 12,
      spendShare: 0.72,
      flags: ['spend_concentrated'],
    });
    expect(row.window).toBe('d30');
    expect(row.spendWeightedWinRate).toBeNull();
    expect(row.flags).toEqual(['spend_concentrated']);
  });

  it('rejects a win rate above 1', () => {
    const bad = creativeWinRateRowSchema.safeParse({
      dimension: 'angle',
      value: 'effortless',
      funnelStage: 'unknown',
      eligibleAds: 3,
      winners: 4,
      winRate: 1.33,
    });
    expect(bad.success).toBe(false);
  });
});

describe('paidCreativeVerdictSchema', () => {
  it('parses a kill verdict with a figure-bearing reason', () => {
    const verdict = paidCreativeVerdictSchema.parse({
      adId: 'ad_1',
      adsetId: 'adset_1',
      verdict: 'kill',
      reason: 'CPA $41.20 is 1.9x the TOF purchase cohort median ($21.70) on both d7 and d14.',
      spend: 512.4,
      cpa: 41.2,
      cpaVsCohortMedian: 1.9,
      funnelStage: 'tof',
    });
    expect(verdict.window).toBe('d30');
    expect(verdict.optimizerRecommendationId).toBeNull();
    expect(verdict.flags).toEqual([]);
  });
});

describe('paidCreativeReportSchema', () => {
  it('round-trips a report and bakes the attribution disclosure in by default', () => {
    const report = paidCreativeReportSchema.parse({
      brandId: 'brand_1',
      generatedAt: '2026-07-10T00:00:00.000Z',
    });
    expect(report.attributionNote).toBe(META_REPORTED_ATTRIBUTION_NOTE);
    expect(report.windowDays).toBe(90);
    expect(report.winRates).toEqual([]);
    expect(report.sourceCounts).toEqual({
      ads: 0,
      creatives: 0,
      labeled: 0,
      videoTranscribed: 0,
    });
    // round-trip: a parsed report re-parses identically
    expect(paidCreativeReportSchema.parse(report)).toEqual(report);
  });
});
