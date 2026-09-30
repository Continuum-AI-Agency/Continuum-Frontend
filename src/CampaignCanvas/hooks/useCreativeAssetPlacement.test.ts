import { describe, expect, it } from 'bun:test';
import { placementFor } from './useCreativeAssetPlacement';

describe('placementFor', () => {
  it('places an image on an image creative without touching its format', () => {
    expect(
      placementFor({ label: 'C', assetType: 'image' }, [
        { id: 'img', kind: 'image', thumbnailUrl: 'https://t' },
      ]),
    ).toEqual({
      patch: { mediaId: 'img', thumbnailUrl: 'https://t', assetUrl: undefined },
      notice: null,
    });
  });

  it('switches the format to follow a dropped video instead of refusing it', () => {
    const placement = placementFor({ label: 'C', assetType: 'image' }, [
      { id: 'vid', kind: 'video' },
    ]);
    expect(placement.format).toBe('video');
    expect(placement.patch?.mediaId).toBe('vid');
    expect(placement.notice).toBeNull();
  });

  it('prefers the asset matching the format when several arrive', () => {
    expect(
      placementFor({ label: 'C', assetType: 'image' }, [
        { id: 'vid', kind: 'video' },
        { id: 'img', kind: 'image' },
      ]).patch?.mediaId,
    ).toBe('img');
  });

  it('appends carousel cards up to the cap and says how many were left out', () => {
    const existing = Array.from({ length: 9 }, (_, index) => ({
      mediaId: `c${index}`,
      kind: 'image' as const,
    }));
    const placement = placementFor({ label: 'C', assetType: 'carousel', cards: existing }, [
      { id: 'a', kind: 'image' },
      { id: 'b', kind: 'image' },
    ]);
    expect(placement.patch?.cards).toHaveLength(10);
    expect(placement.notice).toContain('1 were left out');
  });
});
