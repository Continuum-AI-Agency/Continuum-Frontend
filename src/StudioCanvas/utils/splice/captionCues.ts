import type { CaptionStyleOverride } from '@/lib/clips/clipCaptionStyle';

// Word-synced caption cues for the browser splice engine. The cut concatenates N
// source keep-ranges into one clip with dead space removed, so a word's source
// time does NOT map linearly to its position in the output. These helpers re-map
// source-time words onto the output (post-splice) timeline using the same
// cumulative-offset arithmetic appendRange uses for frames, then group them into
// short rolling lines so captions read naturally. Pure + framework-free so they
// unit-test under bun and run inside the splice worker.

export type CaptionWord = {
  text: string;
  startSec: number;
  endSec: number;
  // The word is SEMANTICALLY important — set by the emphasis selector or by hand in the
  // editor. Distinct from the karaoke highlight, which is only about what is being spoken
  // right now; this lasts the word's whole life. Optional so an unmarked word is byte-wise
  // exactly what it was before emphasis existed.
  emphasis?: boolean;
};
export type CaptionCue = {
  id: string;
  startSec: number;
  endSec: number;
  words: CaptionWord[];
  style?: CaptionStyleOverride;
};
type SourceRange = { startSec: number; endSec: number };

export type BuildCaptionCuesOptions = {
  maxWordsPerCue?: number;
  maxCueDurationSec?: number;
  maxGapSec?: number;
};

const DEFAULT_MAX_WORDS_PER_CUE = 6;
const DEFAULT_MAX_CUE_DURATION_SEC = 3.5;
const DEFAULT_MAX_GAP_SEC = 0.8;

// Clip each word to the ranges it overlaps and shift it onto the output timeline.
// A word straddling a dropped gap yields one piece per range it touches. Output
// start of range i is the summed duration of ranges 0..i-1 (dead space removed) —
// identical to appendRange's `cumulativeOffset`.
export function rebaseWordsToOutput(words: CaptionWord[], ranges: SourceRange[]): CaptionWord[] {
  const out: CaptionWord[] = [];
  let outOffset = 0;
  for (const range of ranges) {
    const span = Math.max(0, range.endSec - range.startSec);
    for (const word of words) {
      const start = Math.max(word.startSec, range.startSec);
      const end = Math.min(word.endSec, range.endSec);
      if (end <= start) continue;
      out.push({
        text: word.text,
        startSec: outOffset + (start - range.startSec),
        endSec: outOffset + (end - range.startSec),
        ...(word.emphasis ? { emphasis: true } : {}),
      });
    }
    outOffset += span;
  }
  return out.sort((a, b) => a.startSec - b.startSec);
}

// Break a flat word stream into rolling caption lines: a new cue starts when the
// current one is full (word count or duration) or a speech gap opens.
export function groupWordsIntoCues(
  words: CaptionWord[],
  opts: BuildCaptionCuesOptions = {},
): CaptionCue[] {
  const maxWords = opts.maxWordsPerCue ?? DEFAULT_MAX_WORDS_PER_CUE;
  const maxDuration = opts.maxCueDurationSec ?? DEFAULT_MAX_CUE_DURATION_SEC;
  const maxGap = opts.maxGapSec ?? DEFAULT_MAX_GAP_SEC;

  const cues: CaptionCue[] = [];
  let current: CaptionWord[] = [];
  const flush = () => {
    if (current.length === 0) return;
    cues.push({
      id: `caption-${cues.length + 1}`,
      startSec: current[0].startSec,
      endSec: current[current.length - 1].endSec,
      words: current,
    });
    current = [];
  };

  for (const word of words) {
    if (current.length > 0) {
      const prev = current[current.length - 1];
      const full = current.length >= maxWords;
      const tooLong = word.endSec - current[0].startSec > maxDuration;
      const gap = word.startSec - prev.endSec > maxGap;
      if (full || tooLong || gap) flush();
    }
    current.push(word);
  }
  flush();
  return cues;
}

export function buildCaptionCues(
  words: CaptionWord[],
  ranges: SourceRange[],
  opts: BuildCaptionCuesOptions = {},
): CaptionCue[] {
  return groupWordsIntoCues(rebaseWordsToOutput(words, ranges), opts);
}

export function captionCueText(cue: CaptionCue): string {
  return cue.words.map((word) => word.text).join(' ');
}

export function wordsForCaptionText(text: string, startSec: number, endSec: number): CaptionWord[] {
  const tokens = text
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const span = Math.max(0.01, endSec - startSec);
  const totalWeight = tokens.reduce((sum, token) => sum + token.length, 0) || tokens.length;
  let cursor = startSec;
  return tokens.map((token, index) => {
    const next =
      index === tokens.length - 1
        ? endSec
        : Math.min(endSec, cursor + span * (token.length / totalWeight));
    const word = { text: token, startSec: cursor, endSec: next };
    cursor = next;
    return word;
  });
}

// Linearly remap words from one span onto another, preserving every field but the timing.
// A degenerate source span (one instant) has no shape to preserve, so redistribute instead.
function rescaleWords(
  words: CaptionWord[],
  fromStartSec: number,
  fromEndSec: number,
  toStartSec: number,
  toEndSec: number,
): CaptionWord[] {
  const sourceSpan = fromEndSec - fromStartSec;
  if (!(sourceSpan > 0)) {
    const rebuilt = wordsForCaptionText(words.map((w) => w.text).join(' '), toStartSec, toEndSec);
    return rebuilt.map((word, index) =>
      words[index]?.emphasis ? { ...word, emphasis: true } : word,
    );
  }
  const factor = (toEndSec - toStartSec) / sourceSpan;
  return words.map((word) => ({
    ...word,
    startSec: toStartSec + (word.startSec - fromStartSec) * factor,
    endSec: toStartSec + (word.endSec - fromStartSec) * factor,
  }));
}

/**
 * Apply a cue edit.
 *
 * This used to rebuild the word array from the joined text on EVERY patch, including one
 * that only nudged a timestamp. That silently threw away two things: the real ASR word
 * timings (re-derived from character counts, which is a heuristic, not alignment) and — once
 * words could carry it — every `emphasis` flag. Dragging a cue by 100ms would quietly
 * un-emphasise the whole line.
 *
 * So the two cases are now genuinely different:
 *   timing-only  — shift and scale the existing words into the new span. Their relative
 *                  rhythm and their emphasis flags are real data; keep them.
 *   text changed — the words changed, so re-derive timings, then re-apply emphasis by
 *                  POSITIONAL TOKEN MATCH: the same token at the same index keeps its flag,
 *                  a changed token loses it.
 */
export function updateCaptionCue(
  cue: CaptionCue,
  patch: Partial<Pick<CaptionCue, 'startSec' | 'endSec' | 'style'>> & { text?: string },
): CaptionCue {
  const startSec = patch.startSec ?? cue.startSec;
  const endSec = Math.max(startSec + 0.01, patch.endSec ?? cue.endSec);

  let words: CaptionWord[];
  if (patch.text === undefined) {
    words = rescaleWords(cue.words, cue.startSec, cue.endSec, startSec, endSec);
  } else {
    const rebuilt = wordsForCaptionText(patch.text, startSec, endSec);
    words = rebuilt.map((word, index) => {
      const previous = cue.words[index];
      return previous?.emphasis && previous.text === word.text ? { ...word, emphasis: true } : word;
    });
  }

  const style = Object.hasOwn(patch, 'style') ? patch.style : cue.style;
  const { text: _text, ...cuePatch } = patch;
  return { ...cue, ...cuePatch, startSec, endSec, words, style };
}

/** Flip one word's emphasis flag. The editor's per-word toggle. */
export function setWordEmphasis(cue: CaptionCue, wordIndex: number, emphasis: boolean): CaptionCue {
  if (wordIndex < 0 || wordIndex >= cue.words.length) return cue;
  return {
    ...cue,
    words: cue.words.map((word, index) => {
      if (index !== wordIndex) return word;
      if (!emphasis) {
        const { emphasis: _dropped, ...rest } = word;
        return rest;
      }
      return { ...word, emphasis: true };
    }),
  };
}

/**
 * Stamp `emphasis` onto a flat word list from the selector's indices.
 *
 * Indices, never words: a transcript repeats tokens ("you need to SHOW UP, and you need to
 * SHOW them why"), so matching by string is wrong about half the time on any duplicate.
 * Out-of-range indices are ignored rather than throwing — a bad index is the model's fault
 * and must not cost the user their captions.
 */
export function applyEmphasisIndices(
  words: CaptionWord[],
  indices: readonly number[] | undefined,
): CaptionWord[] {
  if (!indices || indices.length === 0) return words;
  const marked = new Set(indices);
  return words.map((word, index) => (marked.has(index) ? { ...word, emphasis: true } : word));
}

// Cues are ordered and non-overlapping, and there are only a handful per clip, so
// a linear scan per frame is cheap.
export function findActiveCue(cues: CaptionCue[], outputTimeSec: number): CaptionCue | null {
  return findActiveCues(cues, outputTimeSec)[0] ?? null;
}

export function findActiveCues(cues: CaptionCue[], outputTimeSec: number): CaptionCue[] {
  return cues.filter((cue) => outputTimeSec >= cue.startSec && outputTimeSec < cue.endSec);
}
