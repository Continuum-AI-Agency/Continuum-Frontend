import { describe, expect, it } from "bun:test";

import { getAspectRatioValue, simplifyAspectRatio, snapNodeDimensionsToAspectRatio } from './aspectRatioSizing';

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

  it('simplifies pixel dimensions into a reduced ratio string', () => {
    expect(simplifyAspectRatio(1920, 1080)).toBe('16:9');
    expect(simplifyAspectRatio(1080, 1920)).toBe('9:16');
    expect(simplifyAspectRatio(500, 500)).toBe('1:1');
  });

  it('rounds fractional pixel dimensions before reducing', () => {
    expect(simplifyAspectRatio(1919.6, 1079.6)).toBe('16:9');
  });
});
