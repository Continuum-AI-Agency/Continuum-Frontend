import { describe, expect, it } from 'bun:test';
import { buildCarousel, carouselSignablePaths, coverSlideRefs } from './carousel';
import type { MediaAssetRow } from './schema';

const coverOriginRef = {
  kind: 'competitor_organic',
  postId: 'p1',
  slideIndex: 0,
  slideCount: 3,
  slides: [
    { slideIndex: 2, kind: 'video', bucket: 'competitor-ad-creatives', storagePath: 'b/2.mp4' },
    { slideIndex: 0, kind: 'image', bucket: 'competitor-ad-creatives', storagePath: 'b/0.jpg' },
    { slideIndex: 1, kind: 'image', bucket: 'competitor-ad-creatives', storagePath: 'b/1.jpg' },
  ],
};

const row = (originRef: unknown): Pick<MediaAssetRow, 'origin_ref'> => ({
  origin_ref: originRef as Record<string, unknown> | null,
});

describe('coverSlideRefs', () => {
  it('parses and sorts slides by index, dropping malformed entries', () => {
    const refs = coverSlideRefs(
      row({
        slides: [
          { slideIndex: 1, kind: 'image', bucket: 'b', storagePath: 'b/1.jpg' },
          { slideIndex: 0, kind: 'image', bucket: 'b', storagePath: 'b/0.jpg' },
          { slideIndex: 2, kind: 'image', bucket: 'b' }, // no storagePath → dropped
          'garbage',
        ],
      }),
    );
    expect(refs.map((r) => r.slideIndex)).toEqual([0, 1]);
  });

  it('returns [] when there is no slides index (single asset / non-carousel)', () => {
    expect(coverSlideRefs(row({ kind: 'competitor_organic', postId: 'p1' }))).toEqual([]);
    expect(coverSlideRefs(row(null))).toEqual([]);
  });
});

describe('carouselSignablePaths', () => {
  it('collects every slide path+bucket across rows for one batch sign', () => {
    expect(carouselSignablePaths([row(coverOriginRef), row(null)])).toEqual([
      { path: 'b/0.jpg', bucket: 'competitor-ad-creatives' },
      { path: 'b/1.jpg', bucket: 'competitor-ad-creatives' },
      { path: 'b/2.mp4', bucket: 'competitor-ad-creatives' },
    ]);
  });
});

describe('buildCarousel', () => {
  it('builds an ordered, signed carousel for a multi-slide cover', () => {
    const signed = new Map([
      ['b/0.jpg', 'https://signed/0'],
      ['b/1.jpg', 'https://signed/1'],
      // b/2.mp4 intentionally unsigned → null passthrough
    ]);
    const carousel = buildCarousel(row(coverOriginRef), signed);
    expect(carousel).toEqual({
      slideCount: 3,
      slides: [
        { slideIndex: 0, kind: 'image', signedUrl: 'https://signed/0' },
        { slideIndex: 1, kind: 'image', signedUrl: 'https://signed/1' },
        { slideIndex: 2, kind: 'video', signedUrl: null },
      ],
    });
  });

  it('returns null for a single-slide or non-carousel row', () => {
    expect(buildCarousel(row({ kind: 'competitor_organic', postId: 'p1' }), new Map())).toBeNull();
    const oneSlide = {
      slides: [{ slideIndex: 0, kind: 'image', bucket: 'b', storagePath: 'b/0.jpg' }],
    };
    expect(buildCarousel(row(oneSlide), new Map())).toBeNull();
  });
});
