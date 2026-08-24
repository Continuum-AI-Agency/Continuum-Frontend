import { describe, expect, it } from 'bun:test';
import { rotatedBounds } from './imageOps';

// COVERAGE GAP, on purpose: `rotateImage` and `canvasToDataUrl` are NOT tested here.
// The test environment is bun + happy-dom, which implements neither OffscreenCanvas
// nor a 2D context, so any test of the drawing itself would only assert that the
// stub throws. The geometry — the part that actually gets a rotate wrong — is
// extracted into `rotatedBounds` and tested exhaustively below. The drawing path is
// covered by clicking the node, not by this file.

describe('rotatedBounds', () => {
  it('keeps the dimensions on a half turn or none at all', () => {
    expect(rotatedBounds(1920, 1080, 0)).toEqual({ width: 1920, height: 1080 });
    expect(rotatedBounds(1920, 1080, 180)).toEqual({ width: 1920, height: 1080 });
    expect(rotatedBounds(1920, 1080, 360)).toEqual({ width: 1920, height: 1080 });
  });

  it('swaps width and height on a quarter turn, exactly', () => {
    expect(rotatedBounds(1920, 1080, 90)).toEqual({ width: 1080, height: 1920 });
    expect(rotatedBounds(1920, 1080, 270)).toEqual({ width: 1080, height: 1920 });
  });

  it('folds negative and over-full-turn angles into the same rotation', () => {
    expect(rotatedBounds(1920, 1080, -90)).toEqual(rotatedBounds(1920, 1080, 270));
    expect(rotatedBounds(1920, 1080, -180)).toEqual(rotatedBounds(1920, 1080, 180));
    expect(rotatedBounds(1920, 1080, 450)).toEqual(rotatedBounds(1920, 1080, 90));
    expect(rotatedBounds(1920, 1080, -360)).toEqual({ width: 1920, height: 1080 });
  });

  it('sizes an arbitrary angle to the axis-aligned bounding box', () => {
    // A 100×100 square at 45° needs 100·√2 ≈ 141.42 in both directions.
    expect(rotatedBounds(100, 100, 45)).toEqual({ width: 141, height: 141 });
    // 200×100 at 45°: 200·cos45 + 100·sin45 ≈ 212.13 both ways.
    expect(rotatedBounds(200, 100, 45)).toEqual({ width: 212, height: 212 });
    // 30° on a non-square rectangle is asymmetric.
    expect(rotatedBounds(200, 100, 30)).toEqual({ width: 223, height: 187 });
  });

  it('never returns a fractional dimension — a canvas cannot have one', () => {
    for (const degrees of [7, 33, 45, 91, 179, 200, 333]) {
      const bounds = rotatedBounds(1234, 567, degrees);
      expect(Number.isInteger(bounds.width)).toBe(true);
      expect(Number.isInteger(bounds.height)).toBe(true);
    }
  });

  it('grows the box for any off-axis angle, never shrinks it', () => {
    const bounds = rotatedBounds(400, 300, 20);
    expect(bounds.width).toBeGreaterThan(400);
    expect(bounds.height).toBeGreaterThan(300);
  });
});
