import { describe, expect, it } from 'bun:test';
import { computeLetterboxRect } from '../splice/letterbox';
import { computeCoverRect, parseAspectRatio, planCropToAspect, planPadToAspect } from './cropPad';

describe('parseAspectRatio', () => {
  it('reads the ratios the registry schema allows', () => {
    expect(parseAspectRatio('1:1')).toBe(1);
    expect(parseAspectRatio('16:9')).toBeCloseTo(16 / 9, 10);
    expect(parseAspectRatio('4:5')).toBe(0.8);
    expect(parseAspectRatio('1.91:1')).toBeCloseTo(1.91, 10);
    expect(parseAspectRatio(' 9:16 ')).toBeCloseTo(9 / 16, 10);
  });

  it('refuses anything that would divide by zero or is not a ratio', () => {
    for (const bad of ['0:1', '1:0', '0:0', '16/9', '16', '', 'a:b', '-1:1']) {
      expect(parseAspectRatio(bad)).toBeUndefined();
    }
  });
});

describe('computeCoverRect', () => {
  it('is the inverse of the letterbox fit: it leaves no margin', () => {
    // 1920x1080 into a 1:1 box. Letterbox pillarboxes it; cover crops the sides.
    const letterbox = computeLetterboxRect(1920, 1080, 1000, 1000);
    expect(letterbox.height).toBeLessThan(1000);

    const cover = computeCoverRect(1920, 1080, 1000, 1000);
    expect(cover).toEqual({ x: 420, y: 0, width: 1080, height: 1080 });
    expect(cover.width / cover.height).toBeCloseTo(1, 10);
  });

  it('takes the bite off the sides when the SOURCE is the wider shape', () => {
    // Source 4:1 into a 1:1 box — the width is what does not fit.
    const rect = computeCoverRect(2000, 500, 1, 1);
    expect(rect).toEqual({ x: 750, y: 0, width: 500, height: 500 });
  });

  it('takes the bite off the top and bottom when the SOURCE is the taller shape', () => {
    const rect = computeCoverRect(500, 2000, 1, 1);
    expect(rect).toEqual({ x: 0, y: 750, width: 500, height: 500 });
  });

  it('crops a square vertically for a landscape target, not horizontally', () => {
    // The direction that reads backwards until you draw it: a 1:1 source already
    // has all the width 16:9 needs, so the HEIGHT is what gets thrown away.
    const rect = computeCoverRect(1000, 1000, 16, 9);
    expect(rect.width).toBe(1000);
    expect(rect.height).toBe(563);
    expect(rect.y).toBeGreaterThan(0);
  });

  it('centres the crop — equal bite off each side', () => {
    const rect = computeCoverRect(1000, 500, 1, 1);
    expect(rect.x).toBe(250);
    expect(rect.x + rect.width).toBe(750);
  });

  it('is a no-op for a source that already matches the target ratio', () => {
    expect(computeCoverRect(1920, 1080, 16, 9)).toEqual({
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    });
  });

  it('degrades to the source rather than producing a zero-sized read', () => {
    expect(computeCoverRect(0, 100, 1, 1)).toEqual({ x: 0, y: 0, width: 0, height: 100 });
    expect(computeCoverRect(100, 100, 0, 1)).toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });
});

describe('planCropToAspect', () => {
  it('outputs the cropped region at its own size — never upscales', () => {
    const plan = planCropToAspect(1000, 1000, 16 / 9);
    expect(plan.width).toBe(1000);
    expect(plan.height).toBe(563);
    expect(plan.width).toBeLessThanOrEqual(1000);
    expect(plan.height).toBeLessThanOrEqual(1000);
  });

  it('hits the requested ratio within a pixel of rounding', () => {
    for (const aspect of [1, 16 / 9, 9 / 16, 4 / 5, 1.91]) {
      const plan = planCropToAspect(1200, 800, aspect);
      expect(plan.width / plan.height).toBeCloseTo(aspect, 1);
    }
  });

  it('draws the crop at the origin, filling the output exactly', () => {
    const plan = planCropToAspect(1200, 800, 1);
    expect(plan.destination).toEqual({ x: 0, y: 0, width: plan.width, height: plan.height });
    expect(plan.source.width).toBe(plan.width);
    expect(plan.source.height).toBe(plan.height);
  });

  it('changes the content, not just the dimensions — the read is offset', () => {
    const plan = planCropToAspect(1000, 500, 1);
    expect(plan.source.x).toBe(250);
  });
});

describe('planPadToAspect', () => {
  it('grows the short axis only and leaves the long one untouched', () => {
    const wide = planPadToAspect(1000, 500, 1);
    expect(wide.width).toBe(1000);
    expect(wide.height).toBe(1000);

    const tall = planPadToAspect(500, 1000, 1);
    expect(tall.width).toBe(1000);
    expect(tall.height).toBe(1000);
  });

  it('never shrinks either axis — that would be a crop wearing a pad name', () => {
    for (const aspect of [1, 16 / 9, 9 / 16, 4 / 5]) {
      const plan = planPadToAspect(800, 600, aspect);
      expect(plan.width).toBeGreaterThanOrEqual(800);
      expect(plan.height).toBeGreaterThanOrEqual(600);
    }
  });

  it('centres the source, so the margins split evenly', () => {
    const plan = planPadToAspect(1000, 500, 1);
    expect(plan.destination).toEqual({ x: 0, y: 250, width: 1000, height: 500 });
    expect(plan.destination.y).toBe(plan.height - plan.destination.y - plan.destination.height);
  });

  it('places the source at 1:1 — a pad resamples nothing', () => {
    const plan = planPadToAspect(640, 480, 9 / 16);
    expect(plan.destination.width).toBe(640);
    expect(plan.destination.height).toBe(480);
  });

  it('is a no-op box for a source that already matches the ratio', () => {
    const plan = planPadToAspect(1920, 1080, 16 / 9);
    expect(plan.width).toBe(1920);
    expect(plan.height).toBe(1080);
  });

  it('never returns a zero or fractional dimension', () => {
    for (const [w, h, a] of [
      [1, 1, 16 / 9],
      [3, 7, 1],
      [1234, 567, 1.91],
    ] as const) {
      const plan = planPadToAspect(w, h, a);
      expect(Number.isInteger(plan.width)).toBe(true);
      expect(Number.isInteger(plan.height)).toBe(true);
      expect(plan.width).toBeGreaterThan(0);
      expect(plan.height).toBeGreaterThan(0);
    }
  });
});
