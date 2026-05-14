import { describe, expect, it } from 'bun:test';
import { computeLetterboxRect } from './letterbox';

describe('computeLetterboxRect', () => {
  it('returns full-bleed rect when aspect ratios match', () => {
    expect(computeLetterboxRect(1920, 1080, 1280, 720)).toEqual({
      x: 0,
      y: 0,
      width: 1280,
      height: 720,
    });
  });

  it('letterboxes a wider source into a narrower target with horizontal bars', () => {
    const rect = computeLetterboxRect(1920, 1080, 1080, 1080);
    expect(rect.width).toBe(1080);
    expect(rect.height).toBe(608);
    expect(rect.x).toBe(0);
    expect(rect.y).toBe(236);
  });

  it('pillarboxes a taller source into a wider target with vertical bars', () => {
    const rect = computeLetterboxRect(720, 1280, 1920, 1080);
    const expectedWidth = Math.round(1080 * (720 / 1280));
    expect(rect.height).toBe(1080);
    expect(rect.width).toBe(expectedWidth);
    expect(rect.y).toBe(0);
    expect(rect.x).toBe(Math.round((1920 - expectedWidth) / 2));
  });

  it('returns a safe rect when dimensions are non-positive', () => {
    expect(computeLetterboxRect(0, 1080, 1920, 1080)).toEqual({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    });
    expect(computeLetterboxRect(1920, 0, 1920, 1080)).toEqual({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    });
  });

  it('keeps fitted rect centered', () => {
    const rect = computeLetterboxRect(1000, 500, 500, 500);
    expect(rect.x).toBe(0);
    expect(rect.y).toBe(125);
    expect(rect.width).toBe(500);
    expect(rect.height).toBe(250);
  });
});
