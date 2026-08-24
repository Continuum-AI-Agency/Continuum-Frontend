import {
  type CaptionAnimation,
  type CaptionWordTransform,
  captionAnchorSec,
  captionWordTransform,
} from '@/lib/clips/captionAnimation';
import { resolveStyleWithPreset } from '@/lib/clips/captionPresets';
import { type CaptionStyle, DEFAULT_CAPTION_STYLE } from '@/lib/clips/clipCaptionStyle';
import type { CaptionCue, CaptionWord } from './captionCues';

// Burns one word-synced caption line onto the output frame. Drawn in the splice worker
// between the video frame and the encode, so it adds no extra decode/encode pass. Captions
// are the last layer (frameComposition.ts), and the word being spoken at time t is
// highlighted while words the selector marked get their own louder treatment.
//
// Two invariants hold this file together, and both of them are bugs waiting to happen:
//
//   1. LAYOUT IS MEASURED ONCE PER CALL. drawActiveCaption runs once per output frame
//      (appendRange calls it inside the frame loop), so this is NOT a cross-frame cache:
//      each word is measured a single time up front instead of at pill, stroke and fill
//      time — roughly a 3x cut in shaping passes, not a per-cue one. The per-word
//      transform made the up-front pass a prerequisite, not a nicety.
//
//   2. LAYOUT USES UN-ANIMATED WIDTHS. A word's scale never advances the cursor. If it did,
//      every word after a popping word would jitter horizontally on every single frame.
//
// The motion itself lives in lib/clips/captionAnimation.ts as a pure function of word age,
// so this file never sees a delta, a clock, or any state between frames.

const MIN_FONT_PX = 16;
const MAX_TEXT_WIDTH_FRACTION = 0.9;
const LINE_HEIGHT_FACTOR = 1.25;
// System fallback families; a registered display family (when set) is prepended to this.
const FALLBACK_FONT_STACK = '"Helvetica Neue", Arial, sans-serif';
const BACKGROUND_PAD_X_FACTOR = 0.35;
const BACKGROUND_PAD_Y_FACTOR = 0.18;
// Safari shipped fontBoundingBox* late; this approximates a cap-height centre without it.
const FALLBACK_CENTER_OFFSET_FACTOR = 0.35;

type MeasureText = (text: string) => number;
type Ctx = OffscreenCanvasRenderingContext2D;

/** One word, measured once, with the exact font it will be drawn in. */
type MeasuredWord = {
  word: CaptionWord;
  /** Post-uppercase glyphs. Measured AND drawn — measuring the other casing wraps wrong. */
  glyphs: string;
  width: number;
  font: string;
  emphasis: boolean;
};

const clampWeight = (weight: number): number => Math.max(100, Math.min(900, weight));

/**
 * Greedy word wrap over pre-measured items. A single item wider than maxWidth still gets its
 * own line rather than being dropped.
 */
function wrapMeasured<T extends { width: number }>(
  items: T[],
  maxWidth: number,
  spaceWidth: number,
): T[][] {
  const lines: T[][] = [];
  let line: T[] = [];
  let width = 0;
  for (const item of items) {
    if (line.length === 0) {
      line = [item];
      width = item.width;
    } else if (width + spaceWidth + item.width <= maxWidth) {
      line.push(item);
      width += spaceWidth + item.width;
    } else {
      lines.push(line);
      line = [item];
      width = item.width;
    }
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

// Greedy word wrap into lines no wider than maxWidth. Pure (takes a measure fn) so it
// unit-tests without a real canvas.
export function wrapWords(
  measure: MeasureText,
  words: CaptionWord[],
  maxWidth: number,
  spaceWidth: number,
): CaptionWord[][] {
  const measured = words.map((word) => ({ word, width: measure(word.text) }));
  return wrapMeasured(measured, maxWidth, spaceWidth).map((line) => line.map((item) => item.word));
}

function lineWidthOf(line: MeasuredWord[], spaceWidth: number): number {
  const wordsWidth = line.reduce((sum, item) => sum + item.width, 0);
  return wordsWidth + spaceWidth * Math.max(0, line.length - 1);
}

/**
 * A radius the canvas will accept. roundRect throws a RangeError on a negative radius, and
 * auto-shrinks anything larger than the box allows, so clamping to half the short edge keeps
 * a full pill legal without hand-rolling the corner maths.
 */
function safeRadius(radius: number, width: number, height: number): number {
  if (!Number.isFinite(radius) || radius <= 0) return 0;
  return Math.min(radius, Math.min(width, height) / 2);
}

function fillBox(
  ctx: Ctx,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = safeRadius(radius, width, height);
  if (r === 0) {
    // Byte-identical to the historical square background, which is what keeps the
    // `classic` preset a render golden.
    ctx.fillRect(x, y, width, height);
    return;
  }
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, r);
  ctx.fill();
}

/** Fully transparent colours are common in the no-stroke presets; skip the work entirely. */
function isTransparent(color: string): boolean {
  const normalized = color.trim().toLowerCase();
  return (
    normalized === 'transparent' ||
    /^rgba\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*0?\.?0+\s*\)$/.test(normalized)
  );
}

export function drawActiveCaption(
  ctx: Ctx,
  cue: CaptionCue,
  outputTimeSec: number,
  targetWidth: number,
  targetHeight: number,
  style: CaptionStyle = DEFAULT_CAPTION_STYLE,
): void {
  // Preset < stored style < per-cue override. The DOM preview resolves through the SAME
  // helper, which is what stops the gallery from lying about what will be rendered.
  const resolvedStyle = resolveStyleWithPreset(style, cue.style);
  const fontPx = Math.max(
    MIN_FONT_PX,
    Math.round(targetHeight * (resolvedStyle.fontSizeFrac ?? 0.055)),
  );
  const fontStack = resolvedStyle.fontFamily
    ? `"${resolvedStyle.fontFamily}", ${FALLBACK_FONT_STACK}`
    : FALLBACK_FONT_STACK;

  ctx.save();
  const baseWeight = clampWeight(resolvedStyle.fontWeight ?? 700);
  const baseFont = `${baseWeight} ${fontPx}px ${fontStack}`;
  const emphasisWeight = resolvedStyle.emphasis?.weight;
  // A weight-emphasis face only exists if a VARIABLE font is registered for the family;
  // against a static file this resolves back to the base weight and the emphasis is a no-op.
  const emphasisFont =
    emphasisWeight !== undefined
      ? `${clampWeight(emphasisWeight)} ${fontPx}px ${fontStack}`
      : baseFont;

  ctx.font = baseFont;
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';

  // ── Layout: everything below is measured ONCE, for the whole cue ────────────────────
  const uppercase = resolvedStyle.uppercase === true;
  const measured: MeasuredWord[] = cue.words.map((word) => {
    // toLocaleUpperCase, not toUpperCase: Turkish dotless i, and we transcribe 100+ locales.
    const glyphs = uppercase ? word.text.toLocaleUpperCase() : word.text;
    const emphasis = word.emphasis === true;
    const font = emphasis ? emphasisFont : baseFont;
    if (ctx.font !== font) ctx.font = font;
    return { word, glyphs, width: ctx.measureText(glyphs).width, font, emphasis };
  });
  ctx.font = baseFont;
  const spaceWidth = ctx.measureText(' ').width;

  // Font-wide metrics, read once. NEVER actualBoundingBox*: those are glyph-dependent, so
  // "no" and "gyp" would scale about different vertical centres and the line would visibly
  // jitter word to word.
  const fontMetrics = ctx.measureText('Hg');
  const centerOffsetY = Number.isFinite(fontMetrics.fontBoundingBoxAscent)
    ? (fontMetrics.fontBoundingBoxAscent - fontMetrics.fontBoundingBoxDescent) / 2
    : fontPx * FALLBACK_CENTER_OFFSET_FACTOR;

  const maxWidth = targetWidth * MAX_TEXT_WIDTH_FRACTION;
  const lines = wrapMeasured(measured, maxWidth, spaceWidth);
  const lineHeight = fontPx * (resolvedStyle.lineHeightFactor ?? LINE_HEIGHT_FACTOR);

  const position = resolvedStyle.position ?? DEFAULT_CAPTION_STYLE.position!;
  const blockHeight = lines.length * lineHeight;

  const placed: { line: MeasuredWord[]; baselineY: number; left: number; width: number }[] = [];
  let baselineY = targetHeight * position.yFrac - blockHeight / 2 + lineHeight;
  for (const line of lines) {
    const width = lineWidthOf(line, spaceWidth);
    placed.push({ line, baselineY, left: targetWidth * position.xFrac - width / 2, width });
    baselineY += lineHeight;
  }

  // ── Paint ───────────────────────────────────────────────────────────────────────────
  const outlineWidthFrac = resolvedStyle.outlineWidthFrac ?? 0.18;
  // Canvas strokes are centred on the path and the fill paints over the inner half, so the
  // visible outline is half of this. A zero frac means the preset wants no stroke at all;
  // the historical max(2, ...) floor would otherwise paint a hairline nobody asked for.
  const strokes = outlineWidthFrac > 0 && !isTransparent(resolvedStyle.outlineColor);
  ctx.lineWidth = Math.max(2, fontPx * outlineWidthFrac);
  ctx.strokeStyle = resolvedStyle.outlineColor;

  const backgroundMode =
    resolvedStyle.backgroundMode ?? (resolvedStyle.backgroundColor ? 'line' : 'none');
  const backgroundRadius = fontPx * (resolvedStyle.backgroundRadiusFrac ?? 0);
  const backgroundOpacity = resolvedStyle.backgroundOpacity ?? 0.8;
  const padX = fontPx * BACKGROUND_PAD_X_FACTOR;
  const padY = fontPx * BACKGROUND_PAD_Y_FACTOR;

  const activeWordMode = resolvedStyle.activeWordMode ?? 'fill';
  const animation: CaptionAnimation | undefined = resolvedStyle.animation;
  const emphasisColor = resolvedStyle.emphasis?.color;
  const emphasisScale = resolvedStyle.emphasis?.scale ?? 1;
  const shadow = resolvedStyle.shadow;

  for (const { line, baselineY: lineBaseline, left, width } of placed) {
    // The line panel is deliberately static: it is the ground the words move on, and
    // keeping it out of the per-word transform is what makes `classic` byte-identical.
    if (backgroundMode === 'line' && resolvedStyle.backgroundColor) {
      ctx.save();
      ctx.globalAlpha = backgroundOpacity;
      ctx.fillStyle = resolvedStyle.backgroundColor;
      fillBox(
        ctx,
        left - padX,
        lineBaseline - lineHeight + padY,
        width + padX * 2,
        lineHeight,
        backgroundRadius,
      );
      ctx.restore();
    }

    let x = left;
    for (const item of line) {
      const { word, glyphs, width: wordWidth, font, emphasis } = item;
      const anchorSec = captionAnchorSec(animation, cue.startSec, word.startSec);
      const transform: CaptionWordTransform = captionWordTransform(
        animation,
        outputTimeSec - anchorSec,
        fontPx,
      );

      if (transform.visible) {
        const active = outputTimeSec >= word.startSec && outputTimeSec < word.endSec;
        // Emphasis and the karaoke highlight are two different signals; a word that is
        // simultaneously active-yellow, emphasis-green and scaled is three signals fighting.
        // The spoken word wins while it is being spoken, because that is momentary.
        const fillStyle =
          active && activeWordMode !== 'none'
            ? resolvedStyle.highlightColor
            : emphasis && emphasisColor
              ? emphasisColor
              : resolvedStyle.textColor;

        const scale = transform.scale * (emphasis ? emphasisScale : 1);
        const centerX = x + wordWidth / 2;
        const centerY = lineBaseline - centerOffsetY;

        ctx.save();
        ctx.globalAlpha = transform.alpha;
        ctx.translate(centerX + transform.dx, centerY + transform.dy);
        ctx.scale(scale, scale);
        ctx.translate(-centerX, -centerY);
        ctx.font = font;

        // Per-word order is pill, then stroke, then fill. Drawing all pills first would let
        // a wide word's pill overlap the previous word's glyphs.
        const boxColor =
          active && activeWordMode === 'box'
            ? (resolvedStyle.activeBoxColor ?? resolvedStyle.highlightColor)
            : backgroundMode === 'word'
              ? resolvedStyle.backgroundColor
              : undefined;
        if (boxColor) {
          ctx.save();
          ctx.globalAlpha = transform.alpha * backgroundOpacity;
          ctx.fillStyle = boxColor;
          fillBox(
            ctx,
            x - padX,
            lineBaseline - lineHeight + padY,
            wordWidth + padX * 2,
            lineHeight,
            backgroundRadius,
          );
          ctx.restore();
        }

        if (shadow) {
          ctx.shadowColor = shadow.color;
          // shadowBlur is NOT affected by the transform matrix, so it is computed in device
          // pixels from the font size and stays constant across a pop. That is the correct
          // trade: a blur that scaled would shimmer.
          ctx.shadowBlur = shadow.blurFrac * fontPx;
          ctx.shadowOffsetY = shadow.offsetYFrac * fontPx;
        }
        if (strokes) {
          ctx.strokeText(glyphs, x, lineBaseline);
          // A shadow applies to BOTH strokeText and fillText. Left set, the fill draws a
          // second shadow onto the first one's edge and visibly darkens it.
          if (shadow) ctx.shadowColor = 'transparent';
        }
        ctx.fillStyle = fillStyle;
        ctx.fillText(glyphs, x, lineBaseline);
        ctx.restore();
      }

      // The advance is always the UN-animated width — see invariant 2 at the top.
      x += wordWidth + spaceWidth;
    }
  }
  ctx.restore();
}
