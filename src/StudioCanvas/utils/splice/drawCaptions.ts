import type { CaptionCue, CaptionWord } from './captionCues';
import { DEFAULT_CAPTION_STYLE, type CaptionStyle } from '@/lib/clips/clipCaptionStyle';

// Burns one word-synced caption line onto the output frame. Drawn in the splice
// worker between the video frame and the encode, so it adds no extra decode/encode
// pass. Colors come from the (brand-derived) CaptionStyle; the word being spoken at
// time t is highlighted (karaoke). Positioned in the lower-third safe area.

const FONT_SCALE = 0.055; // font height as a fraction of the frame height
const MIN_FONT_PX = 16;
const MAX_TEXT_WIDTH_FRACTION = 0.9;
const BOTTOM_MARGIN_FRACTION = 0.12;
const LINE_HEIGHT_FACTOR = 1.25;
const OUTLINE_WIDTH_FACTOR = 0.18;
// System fallback families; a brand display family (when set) is prepended to this.
const FALLBACK_FONT_STACK = '"Helvetica Neue", Arial, sans-serif';

type MeasureText = (text: string) => number;
type Ctx = OffscreenCanvasRenderingContext2D;

// Greedy word wrap into lines no wider than maxWidth. Pure (takes a measure fn) so
// it unit-tests without a real canvas. A single word wider than maxWidth still gets
// its own line rather than being dropped.
export function wrapWords(
  measure: MeasureText,
  words: CaptionWord[],
  maxWidth: number,
  spaceWidth: number,
): CaptionWord[][] {
  const lines: CaptionWord[][] = [];
  let line: CaptionWord[] = [];
  let width = 0;
  for (const word of words) {
    const wordWidth = measure(word.text);
    if (line.length === 0) {
      line = [word];
      width = wordWidth;
    } else if (width + spaceWidth + wordWidth <= maxWidth) {
      line.push(word);
      width += spaceWidth + wordWidth;
    } else {
      lines.push(line);
      line = [word];
      width = wordWidth;
    }
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

function lineWidth(measure: MeasureText, line: CaptionWord[], spaceWidth: number): number {
  const wordsWidth = line.reduce((sum, word) => sum + measure(word.text), 0);
  return wordsWidth + spaceWidth * Math.max(0, line.length - 1);
}

export function drawActiveCaption(
  ctx: Ctx,
  cue: CaptionCue,
  outputTimeSec: number,
  targetWidth: number,
  targetHeight: number,
  style: CaptionStyle = DEFAULT_CAPTION_STYLE,
): void {
  const fontPx = Math.max(MIN_FONT_PX, Math.round(targetHeight * FONT_SCALE));
  const fontStack = style.fontFamily ? `"${style.fontFamily}", ${FALLBACK_FONT_STACK}` : FALLBACK_FONT_STACK;
  ctx.save();
  ctx.font = `700 ${fontPx}px ${fontStack}`;
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, fontPx * OUTLINE_WIDTH_FACTOR);
  ctx.strokeStyle = style.outlineColor;

  const measure: MeasureText = (text) => ctx.measureText(text).width;
  const spaceWidth = measure(' ');
  const maxWidth = targetWidth * MAX_TEXT_WIDTH_FRACTION;
  const lines = wrapWords(measure, cue.words, maxWidth, spaceWidth);
  const lineHeight = fontPx * LINE_HEIGHT_FACTOR;

  // Anchor the last line just above the bottom margin; earlier lines stack upward.
  let baselineY = targetHeight - targetHeight * BOTTOM_MARGIN_FRACTION - (lines.length - 1) * lineHeight;
  for (const line of lines) {
    let x = (targetWidth - lineWidth(measure, line, spaceWidth)) / 2;
    for (const word of line) {
      const active = outputTimeSec >= word.startSec && outputTimeSec < word.endSec;
      ctx.fillStyle = active ? style.highlightColor : style.textColor;
      ctx.strokeText(word.text, x, baselineY);
      ctx.fillText(word.text, x, baselineY);
      x += measure(word.text) + spaceWidth;
    }
    baselineY += lineHeight;
  }
  ctx.restore();
}
