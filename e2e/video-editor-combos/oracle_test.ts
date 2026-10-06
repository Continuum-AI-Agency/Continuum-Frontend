import { describe, expect, it } from 'bun:test';
import {
  audioError,
  boxesDisjoint,
  boxNear,
  changedFraction,
  contrast,
  gridCell,
  luminance,
  maeIn,
  onsetAlignment,
  readability,
} from './oracle';

const frame = (w: number, h: number, rgb: [number, number, number]) => {
  const out = Buffer.alloc(w * h * 3);
  for (let p = 0; p < w * h; p += 1) out.set(rgb, p * 3);
  return out;
};
const paint = (
  f: Buffer,
  w: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  rgb: number[],
) => {
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) f.set(rgb, (y * w + x) * 3);
};

describe('combination oracles', () => {
  it('reads white type on mid-grey as readable and inside the safe area', () => {
    const behind = frame(100, 100, [90, 90, 90]);
    const shown = Buffer.from(behind);
    paint(shown, 100, 30, 40, 70, 50, [255, 255, 255]);
    const result = readability(shown, behind, 100, 100);
    expect(result.count).toBe(400);
    expect(result.box).toEqual({ left: 30, top: 40, right: 69, bottom: 49 });
    expect(result.inside).toBe(true);
    expect(result.contrast).toBeCloseTo(contrast(1, luminance(90, 90, 90)), 6);
    expect(result.contrast).toBeGreaterThan(3);
  });

  it('flags type that touches the canvas edge and type that disappears into its background', () => {
    const behind = frame(100, 100, [200, 200, 200]);
    const shown = Buffer.from(behind);
    paint(shown, 100, 0, 10, 40, 20, [255, 255, 255]);
    const edge = readability(shown, behind, 100, 100);
    expect(edge.inside).toBe(false);
    expect(edge.contrast).toBeLessThan(3);
    expect(readability(behind, behind, 100, 100).count).toBe(0);
  });

  it('counts a narrow outline as part of the letter (WCAG 1.4.3), so outlined white type reads on a pale sky', () => {
    const behind = frame(100, 100, [150, 175, 185]);
    const shown = Buffer.from(behind);
    paint(shown, 100, 28, 38, 72, 52, [0, 0, 0]);
    paint(shown, 100, 30, 40, 70, 50, [255, 255, 255]);
    const result = readability(shown, behind, 100, 100);
    expect(contrast(1, luminance(150, 175, 185))).toBeLessThan(3);
    expect(result.contrast).toBeGreaterThan(3);
    // Without its outline the same white type is graded on its fill alone, and fails.
    const bare = Buffer.from(behind);
    paint(bare, 100, 30, 40, 70, 50, [255, 255, 255]);
    expect(readability(bare, behind, 100, 100).contrast).toBeLessThan(3);
  });

  it('finds a glyph where it landed and ignores pixels the codec only softened', () => {
    const without = frame(60, 40, [80, 80, 80]);
    paint(without, 60, 50, 30, 52, 32, [255, 255, 255]); // a dust speck the encoder blurs
    const withLayer = Buffer.from(without);
    paint(withLayer, 60, 10, 10, 30, 20, [255, 255, 255]);
    const near = { left: 10, top: 10, right: 29, bottom: 19 };
    const encoded = Buffer.from(withLayer);
    paint(encoded, 60, 50, 30, 52, 32, [140, 140, 140]);
    expect(boxNear(encoded, without, withLayer, 60, 40, near, 30)).toEqual(near);
    const shifted = Buffer.from(without);
    paint(shifted, 60, 15, 10, 35, 20, [255, 255, 255]);
    expect(boxNear(shifted, without, withLayer, 60, 40, near, 24)?.left).toBe(15);
  });

  it('measures confined change and boxes that overlap', () => {
    const a = frame(10, 10, [0, 0, 0]);
    const b = Buffer.from(a);
    paint(b, 10, 0, 0, 5, 5, [30, 30, 30]);
    expect(maeIn(a, b, 10, { x: 0, y: 0, w: 5, h: 5 })).toBe(30);
    expect(maeIn(a, b, 10, { x: 5, y: 5, w: 5, h: 5 })).toBe(0);
    expect(changedFraction(a, b, 10, { x: 0, y: 0, w: 10, h: 10 })).toBe(0.25);
    const one = { left: 0, top: 0, right: 4, bottom: 4 };
    expect(boxesDisjoint(one, { left: 4, top: 4, right: 9, bottom: 9 })).toBe(false);
    expect(boxesDisjoint(one, { left: 5, top: 0, right: 9, bottom: 9 })).toBe(true);
    expect(gridCell(3, 1080, 1920)).toEqual({ x: 540, y: 960, w: 540, h: 960 });
  });

  it('grades PCM by relative squared error and cuts by their nearest onset', () => {
    const expected = Float32Array.from({ length: 48_000 }, (_, i) => Math.sin(i / 10));
    expect(audioError(expected, expected).relativeError).toBe(0);
    const louder = expected.map((v) => v * 1.1);
    expect(audioError(louder, expected).relativeError).toBeCloseTo(0.01, 4);
    expect(audioError(expected.subarray(0, 40_000), expected).lengthMatches).toBe(false);
    const aligned = onsetAlignment([0.5, 1.0, 1.52], [0.499, 1.03, 1.6], 1 / 30);
    expect(aligned.fraction).toBeCloseTo(2 / 3, 6);
    expect(aligned.misses).toEqual([1.52]);
  });
});
