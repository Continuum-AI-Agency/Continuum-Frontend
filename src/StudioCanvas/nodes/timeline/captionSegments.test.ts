import { describe, expect, it } from 'bun:test';
import { captionSegmentsToWords } from './captionSegments';

describe('captionSegmentsToWords', () => {
  it('splits a segment into words spanning the segment, weighted by length', () => {
    const words = captionSegmentsToWords([{ startSec: 0, endSec: 4, text: 'ab cd' }]);
    expect(words.map((w) => w.text)).toEqual(['ab', 'cd']);
    expect(words[0].startSec).toBe(0);
    // Equal-length words split the 4s span evenly.
    expect(words[0].endSec).toBeCloseTo(2, 5);
    expect(words[1].startSec).toBeCloseTo(2, 5);
    expect(words[1].endSec).toBeCloseTo(4, 5);
  });

  it('keeps words inside the segment bounds and preserves order across segments', () => {
    const words = captionSegmentsToWords([
      { startSec: 0, endSec: 1, text: 'one' },
      { startSec: 2, endSec: 3, text: 'two three' },
    ]);
    expect(words.map((w) => w.text)).toEqual(['one', 'two', 'three']);
    expect(words[0].startSec).toBe(0);
    expect(words[words.length - 1].endSec).toBeLessThanOrEqual(3);
    for (const word of words) expect(word.endSec).toBeGreaterThanOrEqual(word.startSec);
  });

  it('ignores empty/whitespace-only segments', () => {
    expect(captionSegmentsToWords([{ startSec: 0, endSec: 1, text: '   ' }])).toEqual([]);
  });
});
