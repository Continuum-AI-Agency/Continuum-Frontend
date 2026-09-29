import { describe, expect, it } from 'bun:test';

import {
  creativePreviewSources,
  resolveCreativePreviewRatio,
  unsignedCreativeAssetIds,
} from './CreativeNode';

describe('resolveCreativePreviewRatio', () => {
  it('parses colon-delimited aspect ratios', () => {
    expect(resolveCreativePreviewRatio('9:16', 'image')).toBeCloseTo(9 / 16, 8);
  });

  it('parses slash-delimited aspect ratios with spacing', () => {
    expect(resolveCreativePreviewRatio('16 / 9', 'image')).toBeCloseTo(16 / 9, 8);
  });

  it('falls back to media defaults when aspect ratio is invalid', () => {
    expect(resolveCreativePreviewRatio('invalid', 'image')).toBe(1);
    expect(resolveCreativePreviewRatio(undefined, 'video')).toBeCloseTo(16 / 9, 8);
  });
});

describe('creative previews after a save', () => {
  it('signs only the assets a creative names but holds no URL for', () => {
    expect(unsignedCreativeAssetIds({ mediaId: 'saved' })).toEqual(['saved']);
    expect(unsignedCreativeAssetIds({ mediaId: 'picked', thumbnailUrl: 'https://t' })).toEqual([]);
    expect(
      unsignedCreativeAssetIds({
        cards: [
          { mediaId: 'a', kind: 'image' },
          { mediaId: 'b', kind: 'image', thumbnailUrl: 'https://t' },
        ],
      }),
    ).toEqual(['a']);
  });

  it('draws a saved image from a fresh signature instead of a placeholder', () => {
    expect(
      creativePreviewSources({ assetType: 'image', mediaId: 'saved' }, { saved: 'https://signed' }),
    ).toEqual({ thumbnailUrl: 'https://signed', assetUrl: 'https://signed' });
  });

  it('never uses a video file as an image source', () => {
    expect(
      creativePreviewSources({ assetType: 'video', mediaId: 'clip' }, { clip: 'https://clip.mp4' }),
    ).toEqual({ thumbnailUrl: undefined, assetUrl: 'https://clip.mp4' });
  });

  it('keeps the URLs a fresh pick already carries', () => {
    expect(
      creativePreviewSources(
        { assetType: 'image', mediaId: 'picked', thumbnailUrl: 'https://own' },
        { picked: 'https://other' },
      ).thumbnailUrl,
    ).toBe('https://own');
  });
});
