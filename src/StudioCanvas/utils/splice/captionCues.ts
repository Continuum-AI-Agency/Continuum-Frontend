// Word-synced caption cues for the browser splice engine. The cut concatenates N
// source keep-ranges into one clip with dead space removed, so a word's source
// time does NOT map linearly to its position in the output. These helpers re-map
// source-time words onto the output (post-splice) timeline using the same
// cumulative-offset arithmetic appendRange uses for frames, then group them into
// short rolling lines so captions read naturally. Pure + framework-free so they
// unit-test under bun and run inside the splice worker.

export type CaptionWord = { text: string; startSec: number; endSec: number };
export type CaptionCue = { startSec: number; endSec: number; words: CaptionWord[] };
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
    cues.push({ startSec: current[0].startSec, endSec: current[current.length - 1].endSec, words: current });
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

// Cues are ordered and non-overlapping, and there are only a handful per clip, so
// a linear scan per frame is cheap.
export function findActiveCue(cues: CaptionCue[], outputTimeSec: number): CaptionCue | null {
  for (const cue of cues) {
    if (outputTimeSec >= cue.startSec && outputTimeSec < cue.endSec) return cue;
  }
  return null;
}
