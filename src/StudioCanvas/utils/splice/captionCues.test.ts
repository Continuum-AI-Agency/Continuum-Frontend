import { describe, expect, it } from 'bun:test';

import {
  buildCaptionCues,
  type CaptionWord,
  findActiveCue,
  groupWordsIntoCues,
  rebaseWordsToOutput,
} from './captionCues';

const w = (text: string, startSec: number, endSec: number): CaptionWord => ({
  text,
  startSec,
  endSec,
});

describe('rebaseWordsToOutput', () => {
  it('shifts words in a single range to start at zero', () => {
    const out = rebaseWordsToOutput(
      [w('a', 10, 11), w('b', 11, 12)],
      [{ startSec: 10, endSec: 13 }],
    );
    expect(out).toEqual([
      { text: 'a', startSec: 0, endSec: 1 },
      { text: 'b', startSec: 1, endSec: 2 },
    ]);
  });

  it('collapses the dead space between two keep-ranges onto a continuous output timeline', () => {
    // keep [0,2] then [5,7]; the 3s gap (2..5) is removed, so range-2 words shift back by 3s
    const out = rebaseWordsToOutput(
      [w('a', 0, 1), w('b', 1, 2), w('c', 5, 6), w('d', 6, 7)],
      [
        { startSec: 0, endSec: 2 },
        { startSec: 5, endSec: 7 },
      ],
    );
    expect(out).toEqual([
      { text: 'a', startSec: 0, endSec: 1 },
      { text: 'b', startSec: 1, endSec: 2 },
      { text: 'c', startSec: 2, endSec: 3 },
      { text: 'd', startSec: 3, endSec: 4 },
    ]);
  });

  it('clips a word to the range bounds and drops words outside every range', () => {
    const out = rebaseWordsToOutput(
      [w('edge', 9, 11), w('outside', 20, 21)],
      [{ startSec: 10, endSec: 15 }],
    );
    expect(out).toEqual([{ text: 'edge', startSec: 0, endSec: 1 }]);
  });
});

describe('groupWordsIntoCues', () => {
  it('starts a new cue past the word-count cap', () => {
    const words = Array.from({ length: 7 }, (_, i) => w(`x${i}`, i * 0.3, i * 0.3 + 0.3));
    const cues = groupWordsIntoCues(words, {
      maxWordsPerCue: 3,
      maxCueDurationSec: 100,
      maxGapSec: 100,
    });
    expect(cues.map((c) => c.words.length)).toEqual([3, 3, 1]);
  });

  it('breaks a cue on a speech gap', () => {
    const cues = groupWordsIntoCues([w('a', 0, 1), w('b', 1, 2), w('c', 5, 6)], {
      maxWordsPerCue: 100,
      maxCueDurationSec: 100,
      maxGapSec: 0.8,
    });
    expect(cues).toHaveLength(2);
    expect(cues[0].words.map((x) => x.text)).toEqual(['a', 'b']);
    expect(cues[1].words.map((x) => x.text)).toEqual(['c']);
    expect(cues[0]).toMatchObject({ startSec: 0, endSec: 2 });
  });
});

describe('buildCaptionCues + findActiveCue', () => {
  it('keeps captions continuous across a removed dead-space gap (the cut is seamless)', () => {
    // The 3s gap (2..5) between the two keep-ranges is removed, so "c" rebases to
    // output [2,3] — adjacent to "b" — and the three words stay one continuous cue.
    const cues = buildCaptionCues(
      [w('a', 0, 1), w('b', 1, 2), w('c', 5, 6)],
      [
        { startSec: 0, endSec: 2 },
        { startSec: 5, endSec: 6 },
      ],
      { maxWordsPerCue: 100, maxCueDurationSec: 100, maxGapSec: 0.8 },
    );
    expect(cues).toHaveLength(1);
    expect(findActiveCue(cues, 1.5)?.words.map((x) => x.text)).toEqual(['a', 'b', 'c']);
    expect(findActiveCue(cues, 2.5)?.words.map((x) => x.text)).toEqual(['a', 'b', 'c']);
    expect(findActiveCue(cues, 4)).toBeNull();
  });

  it('still splits cues on a genuine in-range silence (output gap survives)', () => {
    // One range, but a 7s silence between words inside it stays a real output gap.
    const cues = buildCaptionCues([w('a', 0, 1), w('b', 8, 9)], [{ startSec: 0, endSec: 10 }], {
      maxWordsPerCue: 100,
      maxCueDurationSec: 100,
      maxGapSec: 0.8,
    });
    expect(cues).toHaveLength(2);
    expect(findActiveCue(cues, 0.5)?.words.map((x) => x.text)).toEqual(['a']);
    expect(findActiveCue(cues, 8.5)?.words.map((x) => x.text)).toEqual(['b']);
  });
});
