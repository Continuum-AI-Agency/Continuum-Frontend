import { describe, expect, it } from 'bun:test';

import {
  allBillingModelIds,
  canvasCreditActionCodeSchema,
  supportsBillingTier,
  toBillingModelBase,
  toBillingModelId,
  UnknownBillingModelError,
  UnsupportedBillingTierError,
} from './modelId';

describe('toBillingModelId', () => {
  it('collapses canvas ids and backend wire ids onto one billing id', () => {
    // The drift this exists to kill: three id spaces for one model.
    expect(toBillingModelId({ modelId: 'nano-banana-2', tier: '1K' })).toBe('nano-banana-2@1k');
    expect(toBillingModelId({ modelId: 'gemini-3.1-flash-image-preview', tier: '1K' })).toBe(
      'nano-banana-2@1k',
    );

    expect(toBillingModelId({ modelId: 'veo-3.1-fast', tier: '1080p' })).toBe('veo-3.1-fast@1080p');
    expect(toBillingModelId({ modelId: 'veo-3.1-fast-generate-preview', tier: '1080p' })).toBe(
      'veo-3.1-fast@1080p',
    );
    expect(toBillingModelId({ modelId: 'veo-3-1-fast', tier: '1080p' })).toBe('veo-3.1-fast@1080p');
  });

  it('canonicalizes tier casing so one tier is never two cost rows', () => {
    // '4K' and '4k' are both in flight across the codebase.
    expect(toBillingModelId({ modelId: 'veo-3.1', tier: '4K' })).toBe('veo-3.1@4k');
    expect(toBillingModelId({ modelId: 'veo-3.1', tier: '4k' })).toBe('veo-3.1@4k');
    expect(toBillingModelId({ modelId: 'nano-banana-pro', tier: '2K' })).toBe('nano-banana-pro@2k');
    expect(toBillingModelId({ modelId: 'nano-banana-pro', tier: '2k' })).toBe('nano-banana-pro@2k');
  });

  it('omits a tier for models that take no size parameter', () => {
    // nano-banana renders 1024 whatever it is asked for; fal models size by aspect only.
    for (const modelId of ['nano-banana', 'flux-2-pro', 'flux-2-max', 'gpt-image-2']) {
      expect(supportsBillingTier(modelId)).toBe(false);
      expect(toBillingModelId({ modelId })).toBe(toBillingModelBase(modelId));
      // A stray tier on an unsized model is ignored, not an error — the canvas may send
      // a default the model never honours.
      expect(toBillingModelId({ modelId, tier: '4K' })).toBe(toBillingModelBase(modelId));
    }
  });

  it('throws on an unknown model rather than billing the wildcard', () => {
    // Fail closed: an unpriced model must not reach a provider.
    expect(() => toBillingModelId({ modelId: 'sora-2', tier: '1080p' })).toThrow(
      UnknownBillingModelError,
    );
    expect(() => toBillingModelId({ modelId: '', tier: '1080p' })).toThrow(UnknownBillingModelError);
  });

  it('throws when a sized model is given a tier it does not price', () => {
    // Silently dropping the tier would bill 4K at 1K rates.
    expect(() => toBillingModelId({ modelId: 'veo-3.1-lite', tier: '4K' })).toThrow(
      UnsupportedBillingTierError,
    );
    // veo-3.1-lite is restricted to 720p/1080p by the backend schema.
    expect(toBillingModelId({ modelId: 'veo-3.1-lite', tier: '720p' })).toBe('veo-3.1-lite@720p');

    // nano-banana-pro has no 512px tier; nano-banana-2 does.
    expect(() => toBillingModelId({ modelId: 'nano-banana-pro', tier: '512px' })).toThrow(
      UnsupportedBillingTierError,
    );
    expect(toBillingModelId({ modelId: 'nano-banana-2', tier: '512px' })).toBe(
      'nano-banana-2@512px',
    );
  });

  it('throws when a sized model is given no tier at all', () => {
    expect(() => toBillingModelId({ modelId: 'veo-3.1' })).toThrow(UnsupportedBillingTierError);
    expect(() => toBillingModelId({ modelId: 'nano-banana-2', tier: null })).toThrow(
      UnsupportedBillingTierError,
    );
  });
});

describe('allBillingModelIds', () => {
  it('enumerates every id the cost table must price', () => {
    const ids = allBillingModelIds();

    // Sized models contribute one id per tier.
    expect(ids).toContain('nano-banana-2@512px');
    expect(ids).toContain('nano-banana-2@4k');
    expect(ids).toContain('veo-3.1@720p');
    expect(ids).toContain('veo-3.1@4k');
    expect(ids).toContain('veo-3.1-lite@1080p');

    // Unsized models contribute exactly one bare id.
    expect(ids).toContain('nano-banana');
    expect(ids).toContain('flux-2-max');

    // veo-3.1-lite is 720p/1080p only — no 2k/4k rows should exist to price.
    expect(ids).not.toContain('veo-3.1-lite@4k');
    expect(ids).not.toContain('veo-3.1-lite@2k');

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is fully reachable from toBillingModelId', () => {
    // Guards against an id appearing in the cost table that nothing can actually produce.
    for (const id of allBillingModelIds()) {
      const [base, tier] = id.split('@');
      expect(toBillingModelId({ modelId: base, tier: tier ?? null })).toBe(id);
    }
  });
});

describe('canvasCreditActionCodeSchema', () => {
  it('accepts the new per-medium codes and keeps the deprecated umbrella', () => {
    expect(canvasCreditActionCodeSchema.parse('canvas_image_generate')).toBe(
      'canvas_image_generate',
    );
    expect(canvasCreditActionCodeSchema.parse('canvas_video_generate')).toBe(
      'canvas_video_generate',
    );
    // Retained: the seeded MVP cost row and billing-mvp-e2e-bench still use it.
    expect(canvasCreditActionCodeSchema.parse('canvas_generation')).toBe('canvas_generation');
    expect(canvasCreditActionCodeSchema.parse('jaina_health_report')).toBe('jaina_health_report');
  });

  it('reserves the organic codes ahead of metering those paths', () => {
    expect(canvasCreditActionCodeSchema.parse('organic_reel_scene')).toBe('organic_reel_scene');
    expect(canvasCreditActionCodeSchema.parse('organic_image_generate')).toBe(
      'organic_image_generate',
    );
  });

  it('rejects an unknown action code', () => {
    expect(canvasCreditActionCodeSchema.safeParse('canvas_upscale').success).toBe(false);
  });
});
