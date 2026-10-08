import type { EditorTextAnimationClock } from '@continuum/contracts';

// Per-word caption motion, as closed-form functions of a word's AGE.
//
// The one law this module exists to enforce: a transform is a pure function of
// `age = outputTimeSec - anchorSec` and nothing else. No requestAnimationFrame delta, no
// stored per-word state, no easing that integrates. The splice frame loop computes
// `outputTimestamp` from a frame index rather than accumulating it (appendRange.ts), so a
// pure function of that timestamp renders identically at 24, 30 and 60 fps and stays
// seekable. Anything that remembers the previous frame breaks re-render determinism, and
// the render bench decodes specific frames precisely to catch it.
//
// Data only, no canvas and no DOM, so drawCaptions can import this inside the worker
// without dragging preset tables or FontFace code into the draw path.

export type CaptionAnimationKind =
  | 'none'
  | 'pop'
  | 'scaleIn'
  | 'floatIn'
  | 'fade'
  | 'slideUp'
  | 'slideDown'
  | 'slideLeft'
  | 'slideRight'
  | 'typewriter'
  | 'wordPop'
  | 'bounce'
  | 'blurIn'
  | 'zoomOut'
  | 'wipe';

export type CaptionAnimation = {
  kind: CaptionAnimationKind;
  /** Entry duration in seconds. Per-kind default when absent. */
  durationSec?: number;
  /** Kind-specific magnitude; for floatIn a fraction of the font px. Per-kind default. */
  amplitude?: number;
  /**
   * Whose clock the age is measured from. 'word' = each word animates from its own
   * startSec (the per-word pop). 'cue' = the whole line animates once from cue.startSec.
   */
  anchor?: 'word' | 'cue';
  /**
   * 'cue' = the whole line is painted from cue.startSec. 'word' = a word is not painted
   * before its own startSec, so the line builds up. Layout is always computed from ALL
   * words either way, so nothing shifts as words appear.
   */
  reveal?: 'cue' | 'word';
};

export type CaptionWordTransform = {
  /** Multiplier about the word's own centre. */
  scale: number;
  dx: number;
  /** Pixels added to the baseline; positive is down. */
  dy: number;
  alpha: number;
  /** False means skip the draw entirely (reveal: 'word', before the word starts). */
  visible: boolean;
  /** Blur radius in px (blurIn). Absent means sharp. */
  blurPx?: number;
  /** Share of the cue's characters typed so far, 0..1 (typewriter). Absent means all. */
  typed?: number;
  /** Share of each line wiped on from its left edge, 0..1 (wipe). Absent means all. */
  wiped?: number;
};

/** Where a word sits in its cue — what the sequenced kinds (wordPop) stagger by. */
export type CaptionWordSequence = { index: number; count: number };

export const IDENTITY_WORD_TRANSFORM: CaptionWordTransform = {
  scale: 1,
  dx: 0,
  dy: 0,
  alpha: 1,
  visible: true,
};

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

// Canonical easings, constants verbatim from easings.net.
export const easeOutQuad = (x: number): number => 1 - (1 - x) ** 2;
export const easeOutCubic = (x: number): number => 1 - (1 - x) ** 3;
export const easeOutQuart = (x: number): number => 1 - (1 - x) ** 4;
export const easeInOutCubic = (x: number): number =>
  x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2;
export function easeOutBounce(x: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x - 1.5 / d1) ** 2 + 0.75;
  if (x < 2.5 / d1) return n1 * (x - 2.25 / d1) ** 2 + 0.9375;
  return n1 * (x - 2.625 / d1) ** 2 + 0.984375;
}

/**
 * Rise from `from` to `peak` over `riseFrac` of the duration, then settle to exactly 1.
 *
 * Deliberately not easeOutBack. That curve's overshoot is 10% OF TRAVEL, so a pop from
 * 0.72 peaks at 1.028 and one from 0.9 peaks at 1.01 — the number a designer wants to set
 * is the PEAK, and expressing it as a travel fraction makes a preset table unreadable.
 * Taking the peak directly also gives three exact test points: popScale(0) === from,
 * popScale(riseFrac) === peak, popScale(1) === 1.
 */
export function popScale(p: number, from: number, peak: number, riseFrac = 0.55): number {
  if (p <= 0) return from;
  if (p >= 1) return 1;
  if (p < riseFrac) return from + (peak - from) * easeOutQuad(p / riseFrac);
  return peak + (1 - peak) * easeOutCubic((p - riseFrac) / (1 - riseFrac));
}

/**
 * Per-kind defaults.
 *
 * The band is 180-260ms for anything with an overshoot, and it is bounded on both sides by
 * something that is not taste. Above: conversational English runs ~400ms per word and
 * energetic social delivery ~333ms, so an entrance that outlasts its own word is still
 * growing when the next one starts. Below: at 30fps a 70ms entrance is two frames and
 * reads as a hard cut, and popScale's peak at 55% of the duration lands between frames.
 */
//
// The text-clip kinds below are whole-line entrances (titles, not spoken words), so they run
// longer: a title has to be seen arriving. Amplitudes are fractions of the font px (slides,
// bounce, blurIn) or of the scale (zoomOut); typewriter and wordPop spread their duration
// over the cue's characters or words.
const DEFAULTS: Record<CaptionAnimationKind, { durationSec: number; amplitude: number }> = {
  none: { durationSec: 0, amplitude: 0 },
  pop: { durationSec: 0.18, amplitude: 0.28 },
  scaleIn: { durationSec: 0.22, amplitude: 0.28 },
  floatIn: { durationSec: 0.3, amplitude: 0.45 },
  fade: { durationSec: 0.3, amplitude: 0 },
  slideUp: { durationSec: 0.4, amplitude: 1.2 },
  slideDown: { durationSec: 0.4, amplitude: 1.2 },
  slideLeft: { durationSec: 0.4, amplitude: 2.5 },
  slideRight: { durationSec: 0.4, amplitude: 2.5 },
  typewriter: { durationSec: 0.8, amplitude: 0 },
  wordPop: { durationSec: 0.6, amplitude: 0.35 },
  bounce: { durationSec: 0.6, amplitude: 1.5 },
  blurIn: { durationSec: 0.4, amplitude: 0.3 },
  zoomOut: { durationSec: 0.45, amplitude: 0.4 },
  wipe: { durationSec: 0.45, amplitude: 0 },
};

/** How long one word takes to pop inside a wordPop build. */
const WORD_POP_SEC = 0.2;
/** Slides travel toward their named direction on the way OUT, not back the way they came. */
const SLIDE_KINDS = new Set<CaptionAnimationKind>([
  'slideUp',
  'slideDown',
  'slideLeft',
  'slideRight',
]);

export function captionAnimationDefaults(kind: CaptionAnimationKind): {
  durationSec: number;
  amplitude: number;
} {
  return DEFAULTS[kind];
}

/**
 * The transform for one word at `ageSec` past its anchor.
 *
 * `fontPx` is passed because amplitude is a FRACTION of the font size — that is what keeps
 * a preset identical at 720x1280, 1080x1920 and 1920x1080.
 */
export function captionWordTransform(
  anim: CaptionAnimation | undefined,
  ageSec: number,
  fontPx: number,
  sequence?: CaptionWordSequence,
): CaptionWordTransform {
  // A word is not painted before its own start under reveal:'word'. Under reveal:'cue'
  // (the default) the whole line is on screen and words only change, which is also why
  // this design is not a "flash" under WCAG 2.3.1: nothing disappears, so there is no
  // pair of opposing luminance changes and the three-per-second limit never engages.
  const revealsPerWord = anim?.reveal === 'word';
  if (revealsPerWord && ageSec < 0) return { ...IDENTITY_WORD_TRANSFORM, visible: false };

  const kind = anim?.kind ?? 'none';
  if (kind === 'none') return IDENTITY_WORD_TRANSFORM;

  const defaults = DEFAULTS[kind];
  const durationSec = anim?.durationSec ?? defaults.durationSec;
  const amplitude = anim?.amplitude ?? defaults.amplitude;
  // A non-finite age (a malformed cue) must not produce NaN geometry — a NaN in ctx.scale
  // silently blanks the whole frame rather than throwing.
  if (!Number.isFinite(ageSec) || !Number.isFinite(durationSec) || durationSec <= 0) {
    return IDENTITY_WORD_TRANSFORM;
  }
  const p = clamp01(ageSec / durationSec);
  const fadeIn = (share: number): number => easeOutQuad(clamp01(p / share));
  const travel = amplitude * fontPx * (1 - easeOutCubic(p));
  const moved = (dx: number, dy: number, alpha: number): CaptionWordTransform => ({
    scale: 1,
    // `|| 0` turns a travelled-out -0 into 0, so a settled word is exactly the identity.
    dx: dx || 0,
    dy: dy || 0,
    alpha,
    visible: true,
  });

  switch (kind) {
    case 'pop': {
      const from = 1 - amplitude;
      const peak = 1 + amplitude * 0.5;
      return { scale: popScale(p, from, peak), dx: 0, dy: 0, alpha: fadeIn(0.4), visible: true };
    }
    case 'scaleIn':
      // Monotone on purpose: no overshoot. This is the calm entrance.
      return {
        scale: 1 - amplitude + amplitude * easeOutCubic(p),
        dx: 0,
        dy: 0,
        alpha: fadeIn(0.5),
        visible: true,
      };
    case 'floatIn':
      // Starts below the baseline and rises to it.
      return moved(0, amplitude * fontPx * (1 - easeOutQuart(p)), fadeIn(0.6));
    case 'fade':
      return moved(0, 0, easeOutQuad(p));
    // Each slide is named for the way it MOVES: slideUp starts below and rises.
    case 'slideUp':
      return moved(0, travel, fadeIn(0.5));
    case 'slideDown':
      return moved(0, -travel, fadeIn(0.5));
    case 'slideLeft':
      return moved(travel, 0, fadeIn(0.5));
    case 'slideRight':
      return moved(-travel, 0, fadeIn(0.5));
    case 'bounce':
      // Drops from above and lands with the bounces of easeOutBounce.
      return moved(0, -amplitude * fontPx * (1 - easeOutBounce(p)), fadeIn(0.25));
    case 'blurIn':
      return { ...moved(0, 0, fadeIn(0.6)), blurPx: travel };
    case 'zoomOut':
      return {
        scale: 1 + amplitude * (1 - easeOutCubic(p)),
        dx: 0,
        dy: 0,
        alpha: fadeIn(0.5),
        visible: true,
      };
    case 'typewriter':
      // Linear on purpose: a typist keeps an even pace.
      return { ...IDENTITY_WORD_TRANSFORM, typed: p };
    case 'wipe':
      return { ...IDENTITY_WORD_TRANSFORM, wiped: easeInOutCubic(p) };
    case 'wordPop': {
      // The build spans the duration: word i starts i/(n-1) of the way through, then pops
      // over WORD_POP_SEC. Still a pure function of age — the stagger is arithmetic.
      const count = Math.max(1, sequence?.count ?? 1);
      const index = Math.min(count - 1, Math.max(0, sequence?.index ?? 0));
      const popSec = Math.min(WORD_POP_SEC, durationSec);
      const startSec = count > 1 ? (index * (durationSec - popSec)) / (count - 1) : 0;
      if (ageSec < startSec) return { ...IDENTITY_WORD_TRANSFORM, alpha: 0, visible: false };
      const q = clamp01((ageSec - startSec) / popSec);
      return {
        scale: popScale(q, 1 - amplitude, 1 + amplitude * 0.4),
        dx: 0,
        dy: 0,
        alpha: easeOutQuad(clamp01(q / 0.4)),
        visible: true,
      };
    }
  }
}

/** The editor's durable ids (hyphenated, snake or camel) → the kinds this module draws. */
const EDITOR_KINDS = new Map<string, CaptionAnimationKind>([
  ['pop', 'pop'],
  ['scalein', 'scaleIn'],
  ['floatin', 'floatIn'],
  ['fade', 'fade'],
  ['slideup', 'slideUp'],
  ['slidedown', 'slideDown'],
  ['slideleft', 'slideLeft'],
  ['slideright', 'slideRight'],
  ['typewriter', 'typewriter'],
  ['wordpop', 'wordPop'],
  ['bounce', 'bounce'],
  ['blurin', 'blurIn'],
  ['zoomout', 'zoomOut'],
  ['wipe', 'wipe'],
]);

/** Resolve the editor's durable preset id without letting arbitrary strings reach the renderer. */
export function captionAnimationFromEditorId(id: string | undefined): CaptionAnimation | undefined {
  const kind = EDITOR_KINDS.get(id?.replace(/[-_\s]/g, '').toLowerCase() ?? '');
  return kind ? { kind, anchor: 'cue', reveal: 'cue' } : undefined;
}

/**
 * Entry plus the exit curve played backwards at the end of the cue. A slide leaves the way
 * it is named (slideUp exits upward), so its exit offset is mirrored; every other kind
 * simply reverses — a typewriter un-types, a wipe wipes back off, words leave last-first.
 */
export function captionMotionTransform(input: {
  entry?: CaptionAnimation;
  exit?: CaptionAnimation;
  cueStartSec: number;
  cueEndSec: number;
  cueAnimationClock?: EditorTextAnimationClock;
  wordStartSec: number;
  wordEndSec: number;
  outputTimeSec: number;
  fontPx: number;
  sequence?: CaptionWordSequence;
}): CaptionWordTransform {
  const cueStartSec = input.cueStartSec - (input.cueAnimationClock?.offsetSec ?? 0);
  const cueEndSec = input.cueAnimationClock
    ? cueStartSec + input.cueAnimationClock.durationSec
    : input.cueEndSec;
  const entry = captionWordTransform(
    input.entry,
    input.outputTimeSec - captionAnchorSec(input.entry, cueStartSec, input.wordStartSec),
    input.fontPx,
    input.sequence,
  );
  const exitEndSec = input.exit?.anchor === 'cue' ? cueEndSec : input.wordEndSec;
  const exiting = captionWordTransform(
    input.exit,
    exitEndSec - input.outputTimeSec,
    input.fontPx,
    input.sequence,
  );
  const mirror = input.exit && SLIDE_KINDS.has(input.exit.kind) ? -1 : 1;
  const blurPx = (entry.blurPx ?? 0) + (exiting.blurPx ?? 0);
  const typed = Math.min(entry.typed ?? 1, exiting.typed ?? 1);
  const wiped = Math.min(entry.wiped ?? 1, exiting.wiped ?? 1);
  return {
    scale: entry.scale * exiting.scale,
    dx: entry.dx + mirror * exiting.dx,
    dy: entry.dy + mirror * exiting.dy,
    alpha: entry.alpha * exiting.alpha,
    visible: entry.visible && exiting.visible,
    ...(blurPx > 0 ? { blurPx } : {}),
    ...(typed < 1 ? { typed } : {}),
    ...(wiped < 1 ? { wiped } : {}),
  };
}

/** The clock a word's age is measured against, given the animation's anchor. */
export function captionAnchorSec(
  anim: CaptionAnimation | undefined,
  cueStartSec: number,
  wordStartSec: number,
): number {
  return anim?.anchor === 'cue' ? cueStartSec : wordStartSec;
}
