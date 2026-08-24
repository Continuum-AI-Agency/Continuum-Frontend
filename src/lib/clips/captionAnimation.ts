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

export type CaptionAnimationKind = 'none' | 'pop' | 'scaleIn' | 'floatIn';

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
};

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
const DEFAULTS: Record<CaptionAnimationKind, { durationSec: number; amplitude: number }> = {
  none: { durationSec: 0, amplitude: 0 },
  pop: { durationSec: 0.18, amplitude: 0.28 },
  scaleIn: { durationSec: 0.22, amplitude: 0.28 },
  floatIn: { durationSec: 0.3, amplitude: 0.45 },
};

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

  if (kind === 'pop') {
    const from = 1 - amplitude;
    const peak = 1 + amplitude * 0.5;
    return {
      scale: popScale(p, from, peak),
      dx: 0,
      dy: 0,
      alpha: easeOutQuad(clamp01(p / 0.4)),
      visible: true,
    };
  }

  if (kind === 'scaleIn') {
    // Monotone on purpose: no overshoot. This is the calm entrance.
    return {
      scale: 1 - amplitude + amplitude * easeOutCubic(p),
      dx: 0,
      dy: 0,
      alpha: easeOutQuad(clamp01(p / 0.5)),
      visible: true,
    };
  }

  // floatIn — starts below the baseline and rises to it.
  return {
    scale: 1,
    dx: 0,
    dy: amplitude * fontPx * (1 - easeOutQuart(p)),
    alpha: easeOutQuad(clamp01(p / 0.6)),
    visible: true,
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
