// `reverseChunks` is the whole correctness argument of the reverse engine that a unit
// test can reach: the decode is forward-only, so reversal is "consume the chunks
// backwards, then each chunk's frames backwards". Get the chunk ORDER wrong and the
// output is a clip whose half-seconds play forwards inside a backwards sequence — a
// bug that looks almost right in a thumbnail and is obvious in a frame-numbered bench.
//
// NOT covered here: `appendReversedRange` / `renderReverse`, which need WebCodecs.
// Those are `studio:actions:video:e2e:bench`, which asserts reverse frame 0 equals the
// last source frame from DECODED pixels.

import { describe, expect, it } from 'bun:test';
import { reverseChunks } from './reverseRange';

describe('reverseChunks', () => {
  it('walks the range from its END back to its start', () => {
    expect(reverseChunks(0, 2, 0.5)).toEqual([
      { startSec: 1.5, endSec: 2 },
      { startSec: 1, endSec: 1.5 },
      { startSec: 0.5, endSec: 1 },
      { startSec: 0, endSec: 0.5 },
    ]);
  });

  it('covers the range exactly once — no gap, no overlap', () => {
    const chunks = reverseChunks(0.25, 3.1, 0.4);
    const ordered = [...chunks].reverse();
    expect(ordered[0].startSec).toBeCloseTo(0.25, 6);
    expect(ordered[ordered.length - 1].endSec).toBeCloseTo(3.1, 6);
    for (let i = 1; i < ordered.length; i += 1) {
      expect(ordered[i].startSec).toBeCloseTo(ordered[i - 1].endSec, 6);
    }
  });

  it('gives the trailing chunk the leftover rather than overrunning the range', () => {
    const chunks = reverseChunks(0, 1.1, 0.5);
    expect(chunks[0]).toEqual({ startSec: 1, endSec: 1.1 });
  });

  it('is one chunk when the range is shorter than the chunk size', () => {
    expect(reverseChunks(0, 0.2, 0.5)).toEqual([{ startSec: 0, endSec: 0.2 }]);
  });

  it('is empty for an empty or inverted range', () => {
    expect(reverseChunks(1, 1, 0.5)).toEqual([]);
    expect(reverseChunks(2, 1, 0.5)).toEqual([]);
  });

  it('falls back to the default size rather than looping forever on a bad one', () => {
    // A zero or negative chunk size would make `Math.ceil(span / size)` Infinity.
    for (const bad of [0, -1, Number.NaN]) {
      expect(reverseChunks(0, 1, bad).length).toBe(2);
    }
  });
});
