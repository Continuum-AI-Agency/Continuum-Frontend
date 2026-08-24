import { describe, expect, it } from 'bun:test';
import {
  applyEmphasisIndices,
  type CaptionWord,
  groupWordsIntoCues,
  rebaseWordsToOutput,
  setWordEmphasis,
  updateCaptionCue,
} from './captionCues';

const cueOf = (words: CaptionWord[]) => groupWordsIntoCues(words)[0];

describe('updateCaptionCue', () => {
  it('re-times replacement copy across the selected cue interval', () => {
    const cue = groupWordsIntoCues([{ text: 'old', startSec: 1, endSec: 2 }])[0];
    expect(updateCaptionCue(cue, { text: 'new caption', startSec: 2, endSec: 4 })).toMatchObject({
      startSec: 2,
      endSec: 4,
      words: [
        { text: 'new', startSec: 2 },
        { text: 'caption', endSec: 4 },
      ],
    });
  });

  it('clears a cue override without discarding the global style', () => {
    const cue = {
      ...groupWordsIntoCues([{ text: 'hello', startSec: 0, endSec: 1 }])[0],
      style: { textColor: '#ff0000' },
    };
    expect(updateCaptionCue(cue, { style: undefined }).style).toBeUndefined();
  });
});

describe('updateCaptionCue — a timing edit is not a text edit', () => {
  const cue = cueOf([
    { text: 'you', startSec: 1, endSec: 1.2 },
    { text: 'never', startSec: 1.2, endSec: 1.9, emphasis: true },
    { text: 'lose', startSec: 2.4, endSec: 3 },
  ]);

  it('keeps emphasis through a pure timing drag', () => {
    // The whole reason this branch exists: dragging a cue used to rebuild the word array
    // from the joined text, which silently dropped every emphasis flag.
    const moved = updateCaptionCue(cue, { startSec: 5, endSec: 7 });
    expect(moved.words.map((w) => w.emphasis)).toEqual([undefined, true, undefined]);
  });

  it('keeps the real word rhythm through a timing drag instead of re-deriving it', () => {
    // The source has a 0.5s pause before "lose". Character-proportional re-derivation
    // smears that silence evenly and the karaoke sync visibly drifts.
    const moved = updateCaptionCue(cue, { startSec: 3, endSec: 5 });
    expect(moved.words[0].startSec).toBeCloseTo(3, 10);
    expect(moved.words[2].endSec).toBeCloseTo(5, 10);
    const gapBefore = cue.words[2].startSec - cue.words[1].endSec;
    const gapAfter = moved.words[2].startSec - moved.words[1].endSec;
    expect(gapAfter).toBeCloseTo(gapBefore, 10); // 1:1 span, so the pause is preserved exactly
    expect(gapAfter).toBeGreaterThan(0.4);
  });

  it('scales the rhythm proportionally when the span changes length', () => {
    const stretched = updateCaptionCue(cue, { startSec: 1, endSec: 5 }); // 2s -> 4s
    expect(stretched.words[1].startSec).toBeCloseTo(1 + (1.2 - 1) * 2, 10);
    expect(stretched.words[1].endSec).toBeCloseTo(1 + (1.9 - 1) * 2, 10);
    expect(stretched.words[2].endSec).toBeCloseTo(5, 10);
  });

  it('re-applies emphasis by positional token match when the text changes', () => {
    const edited = updateCaptionCue(cue, { text: 'you never win' });
    expect(edited.words.map((w) => w.text)).toEqual(['you', 'never', 'win']);
    expect(edited.words[1].emphasis).toBe(true); // same token, same index — flag survives
    expect(edited.words[2].emphasis).toBeUndefined(); // "lose" became "win" — flag dropped
  });

  it('drops emphasis when the emphasised token itself changes', () => {
    const edited = updateCaptionCue(cue, { text: 'you always lose' });
    expect(edited.words[1].emphasis).toBeUndefined();
  });

  it('never leaks the text patch onto the cue object', () => {
    const edited = updateCaptionCue(cue, { text: 'a b' }) as Record<string, unknown>;
    expect('text' in edited).toBe(false);
  });

  it('redistributes rather than dividing by zero on a degenerate source span', () => {
    const instant = { ...cueOf([{ text: 'hi', startSec: 2, endSec: 2 }]), endSec: 2 };
    const moved = updateCaptionCue(instant, { startSec: 0, endSec: 1 });
    expect(moved.words[0].startSec).toBeCloseTo(0, 10);
    expect(moved.words[0].endSec).toBeCloseTo(1, 10);
    expect(Number.isFinite(moved.words[0].startSec)).toBe(true);
  });
});

describe('setWordEmphasis', () => {
  const cue = cueOf([
    { text: 'ten', startSec: 0, endSec: 0.4 },
    { text: 'thousand', startSec: 0.4, endSec: 1 },
  ]);

  it('sets and clears one word without touching its neighbours', () => {
    const on = setWordEmphasis(cue, 1, true);
    expect(on.words.map((w) => w.emphasis)).toEqual([undefined, true]);
    const off = setWordEmphasis(on, 1, false);
    expect(off.words.map((w) => w.emphasis)).toEqual([undefined, undefined]);
    expect('emphasis' in off.words[1]).toBe(false); // cleared, not set to false
  });

  it('ignores an out-of-range index rather than corrupting the cue', () => {
    expect(setWordEmphasis(cue, 9, true)).toBe(cue);
    expect(setWordEmphasis(cue, -1, true)).toBe(cue);
  });

  it('does not mutate the input cue', () => {
    setWordEmphasis(cue, 0, true);
    expect(cue.words[0].emphasis).toBeUndefined();
  });
});

describe('applyEmphasisIndices', () => {
  const words: CaptionWord[] = [
    { text: 'you', startSec: 0, endSec: 0.2 },
    { text: 'show', startSec: 0.2, endSec: 0.5 },
    { text: 'up', startSec: 0.5, endSec: 0.7 },
    { text: 'show', startSec: 0.7, endSec: 1 },
  ];

  it('marks by INDEX, so a repeated token is not confused for its twin', () => {
    // Matching by string would flag both "show"s; the selector meant the first.
    const marked = applyEmphasisIndices(words, [1]);
    expect(marked.map((w) => w.emphasis)).toEqual([undefined, true, undefined, undefined]);
  });

  it('ignores out-of-range indices rather than throwing away the captions', () => {
    const marked = applyEmphasisIndices(words, [0, 99, -3]);
    expect(marked.map((w) => w.emphasis)).toEqual([true, undefined, undefined, undefined]);
  });

  it('returns the input untouched for empty or absent indices', () => {
    expect(applyEmphasisIndices(words, [])).toBe(words);
    expect(applyEmphasisIndices(words, undefined)).toBe(words);
  });
});

describe('rebaseWordsToOutput', () => {
  it('carries emphasis across a cut, including onto both halves of a split word', () => {
    const rebased = rebaseWordsToOutput(
      [{ text: 'unmissable', startSec: 1, endSec: 4, emphasis: true }],
      [
        { startSec: 0, endSec: 2 },
        { startSec: 3, endSec: 5 },
      ],
    );
    expect(rebased).toHaveLength(2);
    expect(rebased.every((w) => w.emphasis === true)).toBe(true);
  });

  it('leaves an unmarked word byte-identical to what it was before emphasis existed', () => {
    const [word] = rebaseWordsToOutput(
      [{ text: 'plain', startSec: 0, endSec: 1 }],
      [{ startSec: 0, endSec: 2 }],
    );
    expect(Object.keys(word).sort()).toEqual(['endSec', 'startSec', 'text']);
  });
});
