import { describe, expect, it } from 'bun:test';

import { organicCalendarPlacementSchema } from './organic-pipeline';

function baseFields() {
  return {
    placementId: '11111111-1111-1111-1111-111111111111',
    schedule: { dayId: '2026-06-01', scheduledAt: '2026-06-01T11:00:00.000Z' },
    platform: { name: 'instagram' as const, accountId: null },
    content: { type: 'post', format: 'hyperframe' },
  };
}

describe('organicCalendarPlacementSchema — hyperframe asset', () => {
  it('accepts a placement whose mediaSuggestion carries a hyperframe asset', () => {
    const placement = {
      ...baseFields(),
      creative: {
        creativeIdea: 'Animated stat reveal',
        mediaSuggestion: {
          kind: 'hyperframe',
          alt: 'stat reveal',
          url: 'organic/job-1/comp.html',
          signedUrl: 'https://signed.example/comp.html?token=abc',
          mimeType: 'text/html',
          model: 'gemini-2.5-pro',
          hyperframe: {
            generated: true,
            compositionId: 'hf_abc',
            bucket: 'hyperframes-compositions',
            htmlPath: 'brand/2026/06/hf_abc.html',
            coverImageUrl: 'https://signed.example/cover.png?token=xyz',
            mp4Status: 'pending',
            spec: { title: 't', scenes: [] },
          },
        },
      },
    };
    const parsed = organicCalendarPlacementSchema.safeParse(placement);
    expect(parsed.success).toBe(true);
  });

  it('accepts a placement whose mediaSuggestion carries a multi-shot reel asset', () => {
    const placement = {
      ...baseFields(),
      content: { type: 'post', format: 'video' },
      creative: {
        mediaSuggestion: {
          kind: 'video',
          prompt: 'reel',
          reel: {
            generated: true,
            url: null,
            signedUrl: null,
            mimeType: 'video/mp4',
            durationSec: 18,
            scenes: [
              {
                index: 0,
                role: 'hook',
                prompt: 'hook frame',
                captionText: null,
                durationSec: 6,
                bucket: null,
                clipUrl: null,
                signedClipUrl: null,
                error: null,
              },
            ],
            error: null,
          },
        },
      },
    };
    const parsed = organicCalendarPlacementSchema.safeParse(placement);
    expect(parsed.success).toBe(true);
  });

  it('still accepts a legacy image placement (no hyperframe/reel)', () => {
    const placement = {
      ...baseFields(),
      content: { type: 'post', format: 'static' },
      creative: {
        mediaSuggestion: {
          kind: 'static',
          prompt: 'a product photo',
          width: 1080,
          height: 1350,
          assetBase64: 'iVBORw0KGgo=',
          mimeType: 'image/png',
        },
      },
    };
    const parsed = organicCalendarPlacementSchema.safeParse(placement);
    expect(parsed.success).toBe(true);
  });

  it('accepts a placement carrying durable publishingAssets', () => {
    const placement = {
      ...baseFields(),
      content: { type: 'carousel', format: 'carousel' },
      creative: {
        mediaSuggestion: { kind: 'carousel', assetUrl: 'https://s/1' },
      },
      publishingAssets: [
        {
          role: 'primary',
          kind: 'image',
          assetId: 'asset-1',
          bucket: 'brand-profile-assets',
          storagePath: 'b/p/1.png',
          storageUrl: 'https://s/1',
          mimeType: 'image/png',
          width: 512,
          height: 512,
        },
        {
          role: 'slide_2',
          kind: 'image',
          slideIndex: 2,
          bucket: 'brand-profile-assets',
          storagePath: 'b/p/2.png',
          storageUrl: 'https://s/2',
        },
      ],
    };
    const parsed = organicCalendarPlacementSchema.safeParse(placement);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.publishingAssets?.[0].assetId).toBe('asset-1');
    }
  });

  it('rejects a publishingAsset missing its storagePath (stays strict)', () => {
    const placement = {
      ...baseFields(),
      publishingAssets: [{ role: 'primary', kind: 'image', storageUrl: 'https://s/1' }],
    };
    const parsed = organicCalendarPlacementSchema.safeParse(placement);
    expect(parsed.success).toBe(false);
  });

  it('rejects an unknown key on mediaSuggestion (stays strict)', () => {
    const placement = {
      ...baseFields(),
      creative: { mediaSuggestion: { kind: 'static', bogusKey: 1 } },
    };
    const parsed = organicCalendarPlacementSchema.safeParse(placement);
    expect(parsed.success).toBe(false);
  });
});
