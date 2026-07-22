import { describe, expect, it } from 'bun:test';

import { buildUserSuppliedContentJson } from './userSuppliedContentJson';

const BUCKET = 'creative-assets';

// An agent-generated draft: media has NO user_supplied sentinel and carries the
// agent's carousel assets + storyboard — exactly the state that reverts today.
function agentContentJson(): Record<string, unknown> {
  return {
    content: { format: 'Carousel' },
    copy: { caption: 'agent caption' },
    creative: {
      mediaSuggestion: {
        kind: 'carousel',
        mediaStatus: 'pending',
        assets: [
          {
            role: 'slide_1',
            order: 1,
            url: 'organic/d1/agent-1.png',
            bucket: BUCKET,
            generated: true,
          },
          {
            role: 'slide_2',
            order: 2,
            url: 'organic/d1/agent-2.png',
            bucket: BUCKET,
            generated: true,
          },
        ],
        storyboard: [
          { role: 'slide_1', storagePath: 'organic/d1/preview/a.png', storageUrl: 'https://x/a' },
        ],
        generationContext: { finalPrompt: 'agent prompt' },
        blueprintReady: true,
        textReady: true,
      },
    },
    publishingAssets: [
      {
        role: 'slide_1',
        kind: 'image',
        slideIndex: 1,
        bucket: BUCKET,
        storagePath: 'organic/d1/agent-1.png',
        storageUrl: 'https://x/agent-1',
      },
    ],
  };
}

describe('buildUserSuppliedContentJson', () => {
  it('stamps user_supplied and mounts BOTH the URL and the re-signable media for a single image', () => {
    const next = buildUserSuppliedContentJson({
      existingContentJson: agentContentJson(),
      bucket: BUCKET,
      assets: [
        {
          role: 'primary',
          kind: 'image',
          storagePath: 'organic/d1/applied.png',
          storageUrl: 'https://signed/applied.png',
          mimeType: 'image/png',
          width: 1024,
          height: 1024,
        },
      ],
    });

    const ms = (next.creative as Record<string, unknown>).mediaSuggestion as Record<
      string,
      unknown
    >;
    // user_supplied sentinel → every downstream attach-wins guard preserves it.
    expect(ms.mediaStatus).toBe('user_supplied');
    expect(ms.kind).toBe('image');
    // URL mounted (render) ...
    expect(ms.assetUrl).toBe('https://signed/applied.png');
    expect(ms.signedUrl).toBe('https://signed/applied.png');
    // ... and durable media mounted (re-sign + publish): storagePath + bucket.
    expect(ms.url).toBe('organic/d1/applied.png');
    expect(ms.bucket).toBe(BUCKET);

    const publishing = next.publishingAssets as Array<Record<string, unknown>>;
    expect(publishing).toHaveLength(1);
    expect(publishing[0]).toMatchObject({
      kind: 'image',
      bucket: BUCKET,
      storagePath: 'organic/d1/applied.png',
      storageUrl: 'https://signed/applied.png',
    });

    // Stale agent media is gone so the carousel/storyboard cannot re-render.
    expect(ms.assets).toBeUndefined();
    expect(ms.storyboard).toBeUndefined();
    // Non-media context is preserved.
    expect(ms.generationContext).toEqual({ finalPrompt: 'agent prompt' });
    expect(ms.blueprintReady).toBe(true);
    // Sibling content (caption) is untouched.
    expect((next.copy as Record<string, unknown>).caption).toBe('agent caption');
  });

  it('builds a user_supplied carousel (slide order = array order) with per-slide publishingAssets', () => {
    const next = buildUserSuppliedContentJson({
      existingContentJson: agentContentJson(),
      bucket: BUCKET,
      assets: [
        {
          role: 'slide_1',
          kind: 'image',
          storagePath: 'organic/d1/u1.png',
          storageUrl: 'https://signed/u1',
        },
        {
          role: 'slide_2',
          kind: 'image',
          storagePath: 'organic/d1/u2.png',
          storageUrl: 'https://signed/u2',
        },
      ],
    });

    const ms = (next.creative as Record<string, unknown>).mediaSuggestion as Record<
      string,
      unknown
    >;
    expect(ms.mediaStatus).toBe('user_supplied');
    expect(ms.kind).toBe('carousel');
    const assets = ms.assets as Array<Record<string, unknown>>;
    expect(assets).toHaveLength(2);
    expect(assets[0]).toMatchObject({ order: 1, url: 'organic/d1/u1.png', bucket: BUCKET });
    const publishing = next.publishingAssets as Array<Record<string, unknown>>;
    expect(publishing).toHaveLength(2);
  });

  it('builds a user_supplied reel for an applied video', () => {
    const next = buildUserSuppliedContentJson({
      existingContentJson: agentContentJson(),
      bucket: BUCKET,
      assets: [
        {
          role: 'primary',
          kind: 'video',
          storagePath: 'organic/d1/clip.mp4',
          storageUrl: 'https://signed/clip',
          mimeType: 'video/mp4',
        },
      ],
    });

    const ms = (next.creative as Record<string, unknown>).mediaSuggestion as Record<
      string,
      unknown
    >;
    expect(ms.mediaStatus).toBe('user_supplied');
    expect(ms.kind).toBe('reel');
    expect((ms.reel as Record<string, unknown>).url).toBe('organic/d1/clip.mp4');
    const publishing = next.publishingAssets as Array<Record<string, unknown>>;
    expect(publishing[0]).toMatchObject({ kind: 'video', storagePath: 'organic/d1/clip.mp4' });
  });
});
