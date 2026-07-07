import { describe, expect, it } from 'bun:test';

import { isCarouselFormat, isCarouselMediaType, resolveCarouselSlideCount } from './carousel';

describe('isCarouselFormat', () => {
  it('matches the carousel format regardless of casing/whitespace', () => {
    expect(isCarouselFormat('carousel')).toBe(true);
    expect(isCarouselFormat('Carousel')).toBe(true);
    expect(isCarouselFormat('  CAROUSEL ')).toBe(true);
  });

  it('rejects other formats and empty values', () => {
    expect(isCarouselFormat('Post')).toBe(false);
    expect(isCarouselFormat('Reel')).toBe(false);
    expect(isCarouselFormat('')).toBe(false);
    expect(isCarouselFormat(null)).toBe(false);
    expect(isCarouselFormat(undefined)).toBe(false);
  });
});

describe('isCarouselMediaType', () => {
  it('detects Instagram CAROUSEL_ALBUM media', () => {
    expect(isCarouselMediaType('CAROUSEL_ALBUM')).toBe(true);
    expect(isCarouselMediaType('carousel_album')).toBe(true);
  });

  it('rejects single-media types and empty values', () => {
    expect(isCarouselMediaType('IMAGE')).toBe(false);
    expect(isCarouselMediaType('VIDEO')).toBe(false);
    expect(isCarouselMediaType(null)).toBe(false);
    expect(isCarouselMediaType(undefined)).toBe(false);
  });
});

describe('resolveCarouselSlideCount', () => {
  it('prefers an explicit slide count', () => {
    expect(resolveCarouselSlideCount({ slideCount: 4, realizedMediaCount: 2 })).toBe(4);
  });

  it('falls back to realized media count when no explicit count', () => {
    expect(resolveCarouselSlideCount({ realizedMediaCount: 3 })).toBe(3);
  });

  it('returns zero when nothing is known', () => {
    expect(resolveCarouselSlideCount({})).toBe(0);
    expect(resolveCarouselSlideCount({ slideCount: 0, realizedMediaCount: 0 })).toBe(0);
  });
});
