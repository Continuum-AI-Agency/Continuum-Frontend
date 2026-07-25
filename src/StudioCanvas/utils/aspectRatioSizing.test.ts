import { describe, expect, it } from 'bun:test';

import {
  generatorNodeStyle,
  getAspectRatioValue,
  IMAGE_GENERATOR_NODE_BOUNDS,
  OMNI_GENERATOR_NODE_BOUNDS,
  simplifyAspectRatio,
  snapNodeDimensionsToAspectRatio,
  VIDEO_GENERATOR_NODE_BOUNDS,
} from './aspectRatioSizing';

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

  // The canvas re-exports the contracts helpers so the browser and the agent write path
  // size a node identically. If this file ever stops seeing them, a hand-rolled copy has
  // crept back in — which is exactly how the library seeder drifted.
  it('re-exports the generator envelopes the canvas nodes are built from', () => {
    expect(IMAGE_GENERATOR_NODE_BOUNDS.area).toEqual({ width: 400, height: 225 });
    expect(VIDEO_GENERATOR_NODE_BOUNDS.area).toEqual({ width: 512, height: 288 });
    expect(OMNI_GENERATOR_NODE_BOUNDS.area).toEqual({ width: 512, height: 360 });
  });

  it('reads a locked node box back as the ratio that produced it', () => {
    for (const bounds of [
      IMAGE_GENERATOR_NODE_BOUNDS,
      VIDEO_GENERATOR_NODE_BOUNDS,
      OMNI_GENERATOR_NODE_BOUNDS,
    ]) {
      for (const ratio of ['16:9', '9:16', '1:1', '4:5']) {
        const style = generatorNodeStyle(ratio, bounds);
        const readBack = simplifyAspectRatio(style.width, style.height);
        expect(getAspectRatioValue(readBack)).toBeCloseTo(getAspectRatioValue(ratio), 2);
      }
    }
  });

  it('is idempotent, which is what an aspect-locked resizer re-snaps against', () => {
    const first = snapNodeDimensionsToAspectRatio({
      aspectRatio: '9:16',
      currentWidth: 777,
      currentHeight: 225,
      minWidth: 200,
      minHeight: 200,
      fallbackWidth: 400,
    });
    const second = snapNodeDimensionsToAspectRatio({
      aspectRatio: '9:16',
      currentWidth: first.width,
      currentHeight: first.height,
      minWidth: 200,
      minHeight: 200,
      fallbackWidth: 400,
    });
    expect(second).toEqual(first);
  });
});
