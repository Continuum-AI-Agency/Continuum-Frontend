import { describe, expect, it } from 'bun:test';
import type { ShaderStackV1 } from '@continuum/contracts';
import { runAction } from './runAction';

const upstream: ShaderStackV1 = {
  version: 1,
  effects: [
    { effectId: 'vignette', enabled: true, parameters: { amount: 0.2 }, keyframes: [] },
    { effectId: 'film_grain', enabled: true, parameters: { amount: 0.1 }, keyframes: [] },
  ],
};

describe('deferred shader actions', () => {
  it('preserves image bytes and carries the canonical stack', async () => {
    const output = await runAction({
      actionId: 'image.shader',
      inputs: [
        {
          handle: 'in',
          imageUrl: 'blob:image',
          mimeType: 'image/webp',
          storageBucket: 'media-library',
          storagePath: 'brand/source.webp',
          sizeBytes: 123,
          assetId: 'asset-1',
          assetVersionId: 'version-1',
        },
      ],
      config: { mode: 'deferred', shaderStack: upstream },
    });
    expect(output).toEqual({
      type: 'image',
      url: 'blob:image',
      mimeType: 'image/webp',
      storageBucket: 'media-library',
      storagePath: 'brand/source.webp',
      sizeBytes: 123,
      assetId: 'asset-1',
      assetVersionId: 'version-1',
      shaderStack: upstream,
    });
  });

  it('replaces duplicate ids downstream and keeps at most one of each curated effect', async () => {
    const output = await runAction({
      actionId: 'video.shader',
      inputs: [
        {
          handle: 'in',
          imageUrl: 'blob:video',
          blob: new Blob(['video']),
          shaderStack: upstream,
        },
      ],
      config: {
        mode: 'deferred',
        shaderStack: {
          version: 1,
          effects: [
            { effectId: 'vignette', enabled: true, parameters: { amount: 0.9 }, keyframes: [] },
            { effectId: 'vhs', enabled: true, parameters: { amount: 0.3 }, keyframes: [] },
          ],
        },
      },
    });
    expect(output.type).toBe('video');
    if (output.type !== 'video') return;
    expect(
      output.shaderStack?.effects.map((effect) => [effect.effectId, effect.parameters]),
    ).toEqual([
      ['vignette', { amount: 0.9 }],
      ['film_grain', { amount: 0.1 }],
      ['vhs', { amount: 0.3 }],
    ]);
  });
});
