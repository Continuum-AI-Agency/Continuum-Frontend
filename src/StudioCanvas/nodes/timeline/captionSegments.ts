import type { CaptionWord } from '../../utils/splice/captionCues';

// Gemini returns phrase-level caption segments (reliable timestamps). The render's
// karaoke burn-in works at WORD level, so we split each segment into words with
// per-word timing interpolated across the segment span, weighted by word length so
// longer words hold longer. Words are already in OUTPUT time (the transcription
// audio was extracted in output time), ready for grouping into cues.

export interface CaptionSegment {
  startSec: number;
  endSec: number;
  text: string;
}

export function captionSegmentsToWords(segments: CaptionSegment[]): CaptionWord[] {
  const words: CaptionWord[] = [];
  for (const segment of segments) {
    const span = Math.max(0, segment.endSec - segment.startSec);
    const tokens = segment.text
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean);
    if (tokens.length === 0) continue;
    const totalChars = tokens.reduce((sum, token) => sum + token.length, 0) || tokens.length;
    let cursor = segment.startSec;
    for (const token of tokens) {
      const weight = (token.length || 1) / totalChars;
      const end = Math.min(segment.endSec, cursor + span * weight);
      words.push({ text: token, startSec: cursor, endSec: end });
      cursor = end;
    }
  }
  return words;
}
