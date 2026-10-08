import { describe, expect, test } from 'bun:test';
import { bandScore, classifyFrames, judgeWordTiming } from './frames';

// `_test` suffix: bun runs it, Playwright's default testMatch (*.test.ts / *.spec.ts) does not.

describe('classifyFrames', () => {
  const windows = [
    { text: 'one', startSec: 1, endSec: 2 },
    { text: 'two', startSec: 2, endSec: 2.05 },
  ];

  test('inside frames stay one frame clear of the edges', () => {
    const { inside } = classifyFrames(90, 30, windows);
    expect(inside[0]?.[0]).toBe(31);
    expect(inside[0]?.at(-1)).toBe(59);
  });

  test('a window under three frames is judged on its middle frame', () => {
    expect(classifyFrames(90, 30, windows).inside[1]).toEqual([61]);
  });

  test('outside frames stay one frame clear of every window; before-first is their head', () => {
    const { outside, beforeFirst } = classifyFrames(90, 30, windows);
    expect(outside).not.toContain(29);
    expect(outside).toContain(28);
    expect(outside).not.toContain(62);
    expect(outside).toContain(63);
    expect(beforeFirst).toEqual(Array.from({ length: 29 }, (_, index) => index));
  });

  test('a caption burned 0.5 s early lights frames the judge calls outside', () => {
    const { outside } = classifyFrames(90, 30, windows);
    const earlyLit = (index: number) => index / 30 >= 0.5 && index / 30 < 1.5;
    expect(outside.some(earlyLit)).toBe(true);
  });
});

test('bandScore counts only glyph-sized moves as strong', () => {
  const base = new Uint8Array(100).fill(100);
  const noisy = base.map((value, index) => value + (index % 3));
  const glyph = base.map((value, index) => (index < 5 ? 255 : value));
  expect(bandScore(base, noisy).strongFrac).toBe(0);
  expect(bandScore(base, glyph).strongFrac).toBe(0.05);
});

describe('judgeWordTiming', () => {
  // Words A (frames 5–14) and B (15–24), silence around them; each lights 60 pixels of its own.
  const keys = Array.from({ length: 40 }, (_, index) =>
    index >= 5 && index < 15 ? 'A' : index >= 15 && index < 25 ? 'B' : '',
  );
  const masksFor = (shift: number, lit = true) =>
    keys.map((_, index) => {
      const mask = new Uint8Array(200);
      const key = keys[index - shift] ?? '';
      if (lit && key) mask.fill(1, key === 'A' ? 0 : 100, key === 'A' ? 60 : 160);
      return mask;
    });

  test('a highlight on time jumps exactly at every word change', () => {
    const timing = judgeWordTiming(keys, masksFor(0));
    expect(timing.offsets).toEqual([0, 0, 0]);
    expect(timing.unseen + timing.darkWhileSpoken + timing.litWhileSilent).toBe(0);
  });

  test('a highlight three frames early is caught at each change', () => {
    const timing = judgeWordTiming(keys, masksFor(-3));
    expect(timing.offsets).toEqual([-3, -3, -3]);
  });

  test('a word whose glyph sharpens over three frames is on from its first lit frame', () => {
    const masks = masksFor(0).map((mask, index) =>
      index >= 5 && index < 8
        ? mask.map((value, pixel) => (pixel < (index - 4) * 15 ? value : 0))
        : mask,
    );
    expect(judgeWordTiming(keys, masks).offsets).toEqual([0, 0, 0]);
  });

  test('a line that never lights (clip-relative words read as timeline times) is caught', () => {
    const timing = judgeWordTiming(keys, masksFor(0, false));
    expect(timing.unseen).toBe(3);
    expect(timing.darkWhileSpoken).toBeGreaterThan(0);
  });
});
