import { describe, expect, it } from 'bun:test';

import {
  assetPerformanceSchema,
  assetVersionRollupSchema,
  isInferredLinkMethod,
  recordDeploymentInputSchema,
} from './deployments';

describe('recordDeploymentInputSchema', () => {
  const base = { brandId: 'b1', assetId: 'a1', linkMethod: 'declared' as const };

  it('accepts a paid deployment carrying a creative row', () => {
    const parsed = recordDeploymentInputSchema.parse({
      ...base,
      surface: 'meta_ad',
      creativeRowId: 'cr1',
      adId: 'ad1',
      versionNumber: 2,
    });
    expect(parsed.confidence).toBe(1);
    expect(parsed.versionNumber).toBe(2);
  });

  it('accepts an organic deployment carrying a platform post id', () => {
    const parsed = recordDeploymentInputSchema.parse({
      ...base,
      surface: 'organic_post',
      platformPostId: 'post_1',
      platform: 'instagram',
    });
    expect(parsed.platformPostId).toBe('post_1');
  });

  // The DB has a CHECK constraint for this; failing at the boundary turns a
  // Postgres 23514 into a readable error.
  it('rejects a paid deployment with no creative row', () => {
    const result = recordDeploymentInputSchema.safeParse({ ...base, surface: 'meta_ad' });
    expect(result.success).toBe(false);
  });

  it('rejects an organic deployment with no platform post id', () => {
    const result = recordDeploymentInputSchema.safeParse({ ...base, surface: 'organic_post' });
    expect(result.success).toBe(false);
  });

  it('allows a matched link to admit it does not know the version', () => {
    const parsed = recordDeploymentInputSchema.parse({
      ...base,
      surface: 'meta_ad',
      creativeRowId: 'cr1',
      linkMethod: 'visual_embedding',
      confidence: 0.91,
      versionNumber: null,
    });
    expect(parsed.versionNumber).toBeNull();
    expect(isInferredLinkMethod(parsed.linkMethod)).toBe(true);
  });

  it('treats every method except visual_embedding as a fact', () => {
    expect(isInferredLinkMethod('declared')).toBe(false);
    expect(isInferredLinkMethod('import')).toBe(false);
    expect(isInferredLinkMethod('storage_path')).toBe(false);
    expect(isInferredLinkMethod('byte_hash')).toBe(false);
  });
});

describe('assetPerformanceSchema', () => {
  it('parses the RPC shape, keeping a missing measurement distinct from zero', () => {
    const parsed = assetPerformanceSchema.parse({
      assetId: 'a1',
      window: 'd30',
      deployments: [
        {
          deploymentId: 'd1',
          surface: 'meta_ad',
          versionNumber: 2,
          linkMethod: 'declared',
          confidence: 1,
          linkedAt: '2026-07-11T00:00:00Z',
          ad: {
            adId: 'ad_1',
            verdict: 'kill',
            verdictFlags: [],
            window: 'd30',
            // Great clicks, zero conversions, revenue never captured: exactly the
            // "worked for clicks, not for ROAS" read this panel exists to show.
            metrics: {
              spend: 800,
              impressions: 90000,
              clicks: 2700,
              ctr: 0.03,
              purchases: 0,
              revenue: null,
              roas: null,
              costPerPurchase: null,
            },
          },
        },
      ],
      versionRollups: [],
    });

    const metrics = parsed.deployments[0]?.ad?.metrics;
    expect(metrics?.clicks).toBe(2700);
    expect(metrics?.purchases).toBe(0);
    // null (never measured) must survive the parse as null, not collapse to 0.
    expect(metrics?.roas).toBeNull();
  });

  it('defaults an asset that has never been deployed to empty, not an error', () => {
    const parsed = assetPerformanceSchema.parse({ assetId: 'a1', window: 'd30' });
    expect(parsed.deployments).toEqual([]);
    expect(parsed.versionRollups).toEqual([]);
  });
});

describe('assetVersionRollupSchema', () => {
  it('carries the trust flags that qualify its numbers', () => {
    const parsed = assetVersionRollupSchema.parse({
      versionNumber: null,
      adCount: 1,
      spend: 12,
      impressions: 400,
      trustFlags: ['low_evidence', 'inferred_link', 'unknown_version'],
      verdictMix: { watch: 1 },
    });
    expect(parsed.trustFlags).toHaveLength(3);
    expect(parsed.verdictMix.watch).toBe(1);
  });

  it('rejects a trust flag outside the vocabulary', () => {
    const result = assetVersionRollupSchema.safeParse({ trustFlags: ['looks_fine'] });
    expect(result.success).toBe(false);
  });
});
