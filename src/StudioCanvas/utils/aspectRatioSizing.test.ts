import { describe, expect, it } from "bun:test";

import { getAspectRatioValue, snapNodeDimensionsToAspectRatio } from './aspectRatioSizing';

describe('aspectRatioSizing', () => {
  it('parses string aspect ratios into numeric values', () => {
    expect(getAspectRatioValue('16:9')).toBeCloseTo(16 / 9);
    expect(getAspectRatioValue('9:16')).toBeCloseTo(9 / 16);
    expect(getAspectRatioValue('4:3')).toBeCloseTo(4 / 3);
  });

  it('falls back to 1 for malformed ratios', () => {
    expect(getAspectRatioValue(undefined)).toBe(1);
    expect(getAspectRatioValue('abc')).toBe(1);
    expect(getAspectRatioValue('0:10')).toBe(1);
  });

  it('snaps dimensions to selected ratio while honoring minimums', () => {
    const next = snapNodeDimensionsToAspectRatio({
      aspectRatio: '16:9',
      currentWidth: 350,
      currentHeight: 350,
      minWidth: 200,
      minHeight: 200,
      fallbackWidth: 400,
    });

    expect(next.width).toBeGreaterThanOrEqual(200);
    expect(next.height).toBeGreaterThanOrEqual(200);
    expect(next.width / next.height).toBeCloseTo(16 / 9, 1);
  });
});
