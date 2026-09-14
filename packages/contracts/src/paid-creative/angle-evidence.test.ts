import { describe, expect, it } from 'bun:test';

import { paidCreativeAngleEvidenceV1Schema } from './angle-evidence';

const evidence = {
  schemaVersion: 1,
  creativeId: 'creative-1',
  assetId: 'asset-1',
  platform: 'meta',
  accountId: 'act_1',
  currency: 'usd',
  campaignId: 'campaign-1',
  groupId: 'adset-1',
  angle: 'Proof over promises',
  hook: 'See the result in five seconds',
  format: 'video',
  audience: {
    label: 'Past purchasers',
    source: 'platform_targeting',
    coverage: 'known',
    segments: [
      {
        audienceCellId: 'aud:cell/buyers',
        observedAt: '2026-08-31T00:00:00.000Z',
        source: 'meta_graph',
        adsetCount: 1,
        eligibleAds: 1,
        spend: 100,
        geoNodeIds: ['geo:us', 'geo:ca'],
        customAudienceIds: ['custom:buyers'],
        excludedCustomAudienceIds: ['custom:suppressed'],
      },
    ],
  },
  reportingWindow: { since: '2026-08-01', until: '2026-08-31' },
  objectiveName: 'OUTCOME_SALES',
  kpiName: 'ROAS',
  metrics: {
    spend: 100,
    impressions: 1000,
    reach: 800,
    clicks: 50,
    conversions: 5,
    ctr: 0.05,
    cpm: 100,
    cpc: 2,
    cpa: 20,
    roas: 3.2,
  },
  sampleSize: 5,
  verdict: 'promising',
  confidence: 0.8,
  provenance: {
    source: 'meta_insights',
    capturedAt: '2026-09-01T00:00:00.000Z',
  },
};

describe('paidCreativeAngleEvidenceV1Schema', () => {
  it('carries creative identity, hierarchy, strategy, metrics, and provenance', () => {
    const parsed = paidCreativeAngleEvidenceV1Schema.parse(evidence);
    expect(parsed.assetId).toBe('asset-1');
    expect(parsed.groupId).toBe('adset-1');
    expect(parsed.currency).toBe('USD');
    expect(parsed.audience.segments[0]?.geoNodeIds).toEqual(['geo:us', 'geo:ca']);
    expect(parsed.audience.segments[0]?.customAudienceIds).toEqual(['custom:buyers']);
    expect(parsed.audience.segments[0]?.excludedCustomAudienceIds).toEqual(['custom:suppressed']);
    expect(parsed.metrics.roas).toBe(3.2);
    expect(parsed.audience.coverage).toBe('known');
  });

  it('keeps every unavailable metric nullable', () => {
    const parsed = paidCreativeAngleEvidenceV1Schema.parse({
      ...evidence,
      metrics: Object.fromEntries(Object.keys(evidence.metrics).map((key) => [key, null])),
    });
    expect(Object.values(parsed.metrics).every((value) => value === null)).toBe(true);
  });

  it('defaults omitted audience evidence to unknown rather than implying a segment', () => {
    const { audience: _audience, ...withoutAudience } = evidence;
    const parsed = paidCreativeAngleEvidenceV1Schema.parse(withoutAudience);
    expect(parsed.audience).toMatchObject({
      label: null,
      source: null,
      coverage: 'unknown',
      coveredAds: 0,
      temporalBasis: 'unknown',
      segments: [],
    });
  });

  it('keeps a missing account currency explicit instead of assuming a default', () => {
    const { currency: _currency, ...withoutCurrency } = evidence;
    expect(paidCreativeAngleEvidenceV1Schema.parse(withoutCurrency).currency).toBeNull();
    expect(
      paidCreativeAngleEvidenceV1Schema.safeParse({ ...evidence, currency: 'US1' }).success,
    ).toBe(false);
  });

  it('does not assign current targeting semantics to a legacy segment', () => {
    const parsed = paidCreativeAngleEvidenceV1Schema.parse({
      ...evidence,
      audience: {
        coverage: 'known',
        source: 'paid_media.adset_targeting_snapshots',
        segments: [
          {
            audienceCellId: 'aud:legacy',
            observedAt: '2026-08-01T00:00:00.000Z',
            source: 'meta_graph',
            adsetCount: 1,
            eligibleAds: 1,
            spend: 10,
          },
        ],
      },
    });
    expect(parsed.audience.temporalBasis).toBe('unknown');
    expect(parsed.audience.segments[0]?.targetingBasis).toBe('unknown');
    expect(parsed.audience.segments[0]?.geoNodeIds).toEqual([]);
    expect(parsed.audience.segments[0]?.customAudienceIds).toEqual([]);
    expect(parsed.audience.segments[0]?.excludedCustomAudienceIds).toEqual([]);
  });

  it('rejects claimed audience coverage without a source', () => {
    expect(
      paidCreativeAngleEvidenceV1Schema.safeParse({
        ...evidence,
        audience: { label: 'Past purchasers', source: null, coverage: 'known' },
      }).success,
    ).toBe(false);
  });
});
