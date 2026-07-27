import { describe, expect, it } from 'bun:test';

import {
  DEFAULT_MEDIA_REALIZE_BATCH_MAX,
  mediaRealizeFrameSchema,
  mediaRealizeRequestSchema,
} from './realize';

describe('mediaRealizeRequestSchema', () => {
  it('requires approval of the exact preview revision for every draft', () => {
    expect(
      mediaRealizeRequestSchema.safeParse({
        brandId: 'brand-1',
        approvals: [{ draftId: 'draft-1', previewRevision: 'preview-revision-1' }],
      }).success,
    ).toBe(true);
    expect(
      mediaRealizeRequestSchema.safeParse({ brandId: 'brand-1', draftIds: ['draft-1'] }).success,
    ).toBe(false);
  });
});

describe('mediaRealizeFrameSchema', () => {
  it('round-trips every frame variant', () => {
    const frames = [
      { type: 'realize_batch_started', total: 2 },
      { type: 'realize_started', draftId: 'd1' },
      { type: 'realize_progress', draftId: 'd1', stage: 'generating', message: 'working' },
      { type: 'realize_ready', draftId: 'd1', kind: 'carousel' },
      { type: 'realize_failed', draftId: 'd2', error: 'boom' },
      { type: 'realize_batch_completed', ready: 1, failed: 1 },
    ] as const;
    for (const frame of frames) {
      expect(mediaRealizeFrameSchema.safeParse(frame).success).toBe(true);
    }
  });

  it('accepts realize_started with an optional backend jobId (and without it)', () => {
    expect(
      mediaRealizeFrameSchema.safeParse({
        type: 'realize_started',
        draftId: 'd1',
        jobId: '11111111-1111-4111-8111-111111111111',
      }).success,
    ).toBe(true);
    // Graceful degradation: still valid when no job row was created.
    expect(
      mediaRealizeFrameSchema.safeParse({ type: 'realize_started', draftId: 'd1' }).success,
    ).toBe(true);
  });

  it('carries optional render-ready assets on realize_ready (and still accepts the minimal form)', () => {
    // Enriched form: the FE mounts these to render the creative immediately.
    expect(
      mediaRealizeFrameSchema.safeParse({
        type: 'realize_ready',
        draftId: 'd1',
        kind: 'carousel',
        assetUrl: 'https://signed.example/primary.png',
        publishingAssets: [
          {
            role: 'slide_1',
            kind: 'image',
            slideIndex: 1,
            bucket: 'brand-profile-assets',
            storagePath: 'organic/d1/slide1.png',
            storageUrl: 'https://signed.example/slide1.png',
            mimeType: 'image/png',
          },
        ],
      }).success,
    ).toBe(true);
    // Minimal form stays valid (additive/optional fields).
    expect(
      mediaRealizeFrameSchema.safeParse({ type: 'realize_ready', draftId: 'd1', kind: 'image' })
        .success,
    ).toBe(true);
  });

  it('rejects a base64 data: URL as a publishing asset storageUrl', () => {
    expect(
      mediaRealizeFrameSchema.safeParse({
        type: 'realize_ready',
        draftId: 'd1',
        kind: 'image',
        publishingAssets: [
          {
            role: 'primary',
            kind: 'image',
            storagePath: 'organic/d1/primary.png',
            storageUrl: 'data:image/png;base64,AAAA',
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('rejects an unknown stage and unknown frame type', () => {
    expect(
      mediaRealizeFrameSchema.safeParse({
        type: 'realize_progress',
        draftId: 'd1',
        stage: 'uploading',
      }).success,
    ).toBe(false);
    expect(
      mediaRealizeFrameSchema.safeParse({ type: 'realize_paused', draftId: 'd1' }).success,
    ).toBe(false);
  });

  it('exposes a sane default batch cap', () => {
    expect(DEFAULT_MEDIA_REALIZE_BATCH_MAX).toBe(10);
  });
});
