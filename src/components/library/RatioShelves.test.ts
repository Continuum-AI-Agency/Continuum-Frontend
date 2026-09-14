import { describe, expect, test } from 'bun:test';
import { LIBRARY_ASPECT_RATIO_LABEL, type MediaAsset } from '@continuum/contracts';
import { groupAssetsByRatio } from './RatioShelves';

function asset(
  id: string,
  size: { width: number; height: number; aspectRatio?: MediaAsset['aspectRatio'] },
): MediaAsset {
  return {
    id,
    brandId: 'brand-1',
    kind: 'image',
    bucket: 'media-library',
    storagePath: `${id}.jpg`,
    fileName: `${id}.jpg`,
    mimeType: 'image/jpeg',
    width: size.width,
    height: size.height,
    aspectRatio: size.aspectRatio,
    source: 'upload',
    status: 'ready',
    createdAt: '2026-09-11T00:00:00Z',
    updatedAt: '2026-09-11T00:00:00Z',
  };
}

describe('Home ratio shelves', () => {
  test('groups stored bins and falls back to pixel ratio', () => {
    const grouped = groupAssetsByRatio([
      asset('story', { width: 1080, height: 1920, aspectRatio: '9:16' }),
      asset('square', { width: 1080, height: 1080 }),
      asset('wide', { width: 1920, height: 1080 }),
      asset('odd', { width: 1000, height: 300 }),
    ]);
    expect(grouped.map((group) => [group.bin, group.assets.map((row) => row.id)])).toEqual([
      ['9:16', ['story']],
      ['1:1', ['square']],
      ['16:9', ['wide']],
      ['other', ['odd']],
    ]);
    expect(LIBRARY_ASPECT_RATIO_LABEL['9:16']).toContain('phone');
  });
});
