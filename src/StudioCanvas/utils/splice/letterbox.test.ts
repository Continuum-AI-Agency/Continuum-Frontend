import { describe, expect, it } from 'bun:test';
import { computeCropRects, computeLetterboxRect } from './letterbox';

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

it('fits the cropped source aspect into the target and keeps all four source edges', () => {
  const rects = computeCropRects(1000, 500, 360, 640, {
    left: 0.1,
    right: 0.3,
    top: 0.2,
    bottom: 0.1,
  });
  expect(rects.source.x).toBe(100);
  expect(rects.source.y).toBe(100);
  expect(rects.source.width).toBeCloseTo(600, 10);
  expect(rects.source.height).toBeCloseTo(350, 10);
  expect(rects.target).toEqual({ x: 0, y: 215, width: 360, height: 210 });
  expect(computeCropRects(1000, 500, 360, 640).target).toEqual(
    computeLetterboxRect(1000, 500, 360, 640),
  );
});
