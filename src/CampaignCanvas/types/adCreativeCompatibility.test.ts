import { describe, expect, it } from 'bun:test';
import {
  adFormatForCreativeType,
  isAdFormatCompatibleWithCreativeType,
  retargetCreativeData,
} from './adCreativeCompatibility';

describe('isAdFormatCompatibleWithCreativeType', () => {
  it('pairs each single format with its own creative, and CAROUSEL only with a carousel', () => {
    expect(isAdFormatCompatibleWithCreativeType('IMAGE', 'image')).toBe(true);
    expect(isAdFormatCompatibleWithCreativeType('VIDEO', 'video')).toBe(true);
    expect(isAdFormatCompatibleWithCreativeType('CAROUSEL', 'carousel')).toBe(true);
    expect(isAdFormatCompatibleWithCreativeType('CAROUSEL', 'image')).toBe(false);
    expect(isAdFormatCompatibleWithCreativeType('IMAGE', 'carousel')).toBe(false);
    expect(isAdFormatCompatibleWithCreativeType('VIDEO', 'image')).toBe(false);
  });

  it('lets a COLLECTION lead with one image or video, never a carousel', () => {
    expect(isAdFormatCompatibleWithCreativeType('COLLECTION', 'image')).toBe(true);
    expect(isAdFormatCompatibleWithCreativeType('COLLECTION', 'video')).toBe(true);
    expect(isAdFormatCompatibleWithCreativeType('COLLECTION', 'carousel')).toBe(false);
  });

  it('derives the ad format from the creative', () => {
    expect(adFormatForCreativeType('carousel')).toBe('CAROUSEL');
    expect(adFormatForCreativeType('video')).toBe('VIDEO');
    expect(adFormatForCreativeType(undefined)).toBe('IMAGE');
  });
});

describe('retargetCreativeData', () => {
  it('seeds a carousel with the single asset as its first card', () => {
    expect(
      retargetCreativeData(
        { label: 'C', assetType: 'image', mediaId: 'asset-1', thumbnailUrl: 'https://t' },
        'carousel',
      ),
    ).toEqual({
      assetType: 'carousel',
      mediaId: undefined,
      assetUrl: undefined,
      thumbnailUrl: undefined,
      cards: [{ mediaId: 'asset-1', kind: 'image', thumbnailUrl: 'https://t' }],
    });
  });

  it('keeps the first card of the matching kind when leaving a carousel', () => {
    expect(
      retargetCreativeData(
        {
          label: 'C',
          assetType: 'carousel',
          cards: [
            { mediaId: 'img', kind: 'image' },
            { mediaId: 'vid', kind: 'video', thumbnailUrl: 'https://poster' },
          ],
        },
        'video',
      ),
    ).toMatchObject({ assetType: 'video', mediaId: 'vid', thumbnailUrl: 'https://poster', cards: undefined });
  });

  it('drops an image when the creative becomes a video, and changes nothing for the same format', () => {
    expect(
      retargetCreativeData({ label: 'C', assetType: 'image', mediaId: 'img' }, 'video'),
    ).toEqual({ assetType: 'video', mediaId: undefined, assetUrl: undefined, thumbnailUrl: undefined });
    expect(retargetCreativeData({ label: 'C', assetType: 'image' }, 'image')).toEqual({});
  });
});
