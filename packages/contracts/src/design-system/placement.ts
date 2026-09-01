// The type-placement DECISION, as data.
//
// A diffusion model cannot set type: ask one for a headline and you get letterforms that
// are nearly letters. So the photo is generated with the headline geometry RESERVED and text
// FORBIDDEN, and the type is set afterwards by code. This module makes the decision — where
// the lines break, how big each one is, which edge it anchors to, and what has to happen to
// the BACKGROUND for the brand's ink to read on it — and emits it as a `PlacementPlan`.
// It draws nothing; a renderer consumes the plan. That split is the point: a decision that is
// a value can be diffed, replayed and tested without a canvas.
//
// PURITY IS THE LOAD-BEARING CONSTRAINT. Contracts code has no canvas and no pixels, so the
// two things placement actually needs are INJECTED:
//
//   • {@link MeasureText} — the advance width of a string in a font.
//   • {@link ProbeContrast} — the WCAG ratio inside a box of the candidate image.
//
// Same inputs plus same callbacks must produce a byte-identical plan. Nothing here reads a
// clock, a random number, or a file.
//
// Source of truth for every number below: `verne-demo-studio/render_pieza.py` —
// `_lineas_titular` (the breaker), `_flujo_titular` (the baseline-aligned mixed-weight flow)
// and `blq_foto_titular` (the framing search and the escalation ladder). EVERY FRACTION AND
// EVERY VEIL FLOOR IS CALIBRATED against one client's real artwork (Universidad del Pacífico),
// measured on ten real adaptations. They are not industry constants. Each is an optional
// parameter with the reference value as its documented default; do not invent new ones.

import { z } from 'zod';
import { coverCropRect, type FractionalBox, type PixelRect, type Rgb, type Size, VERNE_NAVY } from './image-analysis';

// ── Calibrated constants ─────────────────────────────────────────────────────────────────

/** Light face body size, as a fraction of the piece WIDTH (not of the height, not px). */
export const VERNE_TITLE_LIGHT_SIZE = 0.0443;

/** Bold face body size, fraction of width. 51 % larger than the light — they share a baseline. */
export const VERNE_TITLE_BOLD_SIZE = 0.067;

/** Line-to-line step, fraction of width. */
export const VERNE_TITLE_LINE_STEP = 0.066;

/** Right margin the headline anchors against, fraction of width. */
export const VERNE_TITLE_RIGHT_MARGIN = 0.075;

/** Composition measure — the width lines are broken to — as a fraction of width. */
export const VERNE_TITLE_MEASURE = 0.61;

/**
 * The headline box, vertically: 18 %–68 % of the photo. Measured on the four human band-A
 * adaptations. The horizontal extent is derived from the margin and the measure, so all four
 * edges move together when a brand retunes one of them — see {@link titleBox}.
 */
export const VERNE_TITLE_BOX_TOP = 0.18;
export const VERNE_TITLE_BOX_BOTTOM = 0.68;

/** A final line under this fraction of the measure is an orphan. */
export const VERNE_ORPHAN_FRACTION = 0.34;

/** Weight on the orphan term. Large enough to be refused unless there is no alternative. */
export const VERNE_ORPHAN_PENALTY = 6;

/**
 * WCAG AA for large text is 3:1 and the headline is always large text; the extra 0.2 is
 * headroom so JPEG rounding cannot leave a passing measurement just under the bar.
 */
export const VERNE_TITLE_MIN_CONTRAST = 3.2;

/**
 * The escalation ladder's candidate veil floors, in order. EXACTLY ONE of these is ever
 * applied — a higher floor replaces the lower one rather than stacking on top of it. See
 * {@link resolveTreatment}.
 */
export const VERNE_VEIL_FLOORS: readonly number[] = [0.15, 0.28, 0.42, 0.58, 0.75, 0.9];

/** Focal points tried on whichever axis has crop slack. The centre is the incumbent, not a candidate. */
export const VERNE_FRAMING_FOCALS: readonly number[] = [0.0, 0.15, 0.3, 0.65, 0.85, 1.0];

/**
 * "Good enough" bar for the framing search — well above {@link VERNE_TITLE_MIN_CONTRAST},
 * because the search is choosing between crops, not deciding whether the piece ships.
 */
export const VERNE_FRAMING_GOOD_ENOUGH = 7.0;

// ── Text ─────────────────────────────────────────────────────────────────────────────────

export const headlineWeightSchema = z.enum(['light', 'bold']);
export type HeadlineWeight = z.infer<typeof headlineWeightSchema>;

/**
 * A run of headline text in one weight. A headline is a LIST of these, not two blocks: the
 * reference's `«con University of London»` starts in the light face and changes to bold
 * mid-sentence, on the same line. Drawing them as two paragraphs is what made the type "look
 * different" even when the fonts were the brand's.
 */
export interface HeadlineToken {
  readonly text: string;
  readonly weight: HeadlineWeight;
}

export interface TextStyle {
  readonly weight: HeadlineWeight;
  readonly sizePx: number;
}

/** Advance width in px. Injected: contracts code has no font stack. */
export type MeasureText = (text: string, style: TextStyle) => number;

// ── Framing ──────────────────────────────────────────────────────────────────────────────

export const framingAxisSchema = z.enum(['horizontal', 'vertical']);
export type FramingAxis = z.infer<typeof framingAxisSchema>;

export const framingCandidateSchema = z.object({
  axis: framingAxisSchema,
  focal: z.number().min(0).max(1),
});
export type FramingCandidate = z.infer<typeof framingCandidateSchema>;

/** The centred crop — what an unmeasured `object-fit: cover` gives you. */
export const CENTRED_FRAMING: FramingCandidate = { axis: 'horizontal', focal: 0.5 };

// ── Treatment ────────────────────────────────────────────────────────────────────────────

export const treatmentStepSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('harmonise') }),
  z.object({ kind: z.literal('veil'), floor: z.number() }),
]);
export type TreatmentStep = z.infer<typeof treatmentStepSchema>;

/**
 * What the probe is being asked to measure.
 *
 * `treatments` is the treatment AS IT CURRENTLY STANDS — at most `[harmonise, veil]` — always
 * composited from the PRISTINE photo. It is not a growing stack. Escalating changes the veil's
 * floor; it never adds a second veil, because two whites at `m1` then `m2` leave effective
 * coverage `m1 + m2 − m1·m2`, and a photo that needed 0.42 would end up under ~64 % white
 * (the reference's `_velo_marca` raises ONE veil's floor: `v = max(v, piso)`).
 */
export interface PlacementProbeState {
  readonly framing: FramingCandidate;
  readonly treatments: readonly TreatmentStep[];
}

/**
 * WCAG ratio of the brand ink against `box` of the image in `state`. Injected: the caller
 * wires this to `darkPercentileContrast` over real pixels.
 *
 * The box comes first so that the simplest possible probe — `(box) => number`, for a caller
 * that only ever measures one already-composed image — is assignable to this type unchanged.
 */
export type ProbeContrast = (box: FractionalBox, state: PlacementProbeState) => number;

const placementBoxSchema = z.object({
  x0: z.number(),
  y0: z.number(),
  x1: z.number(),
  y1: z.number(),
});

const placementInkSchema = z.tuple([z.number(), z.number(), z.number()]);

const treatmentCommon = {
  /** Which rung stopped it: 0 untouched, 1 harmonised, 2+ harmonised plus ONE veil at `floors[rung-2]`. */
  rung: z.number().int().nonnegative(),
  /** The ratio this rung actually reached. Carried even when it fails to clear. */
  ratio: z.number(),
  cleared: z.boolean(),
  /** Everything applied, in order, so a renderer can reproduce it. At most two steps. */
  steps: z.array(treatmentStepSchema),
  /** Unchanged from the input, always. The ladder escalates the background, never the ink. */
  ink: placementInkSchema,
  /** Unchanged from the input, always. The ladder never moves or resizes the headline. */
  box: placementBoxSchema,
};

export const placementTreatmentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('direct'), ...treatmentCommon }),
  z.object({ kind: z.literal('harmonised'), ...treatmentCommon }),
  z.object({ kind: z.literal('veiled'), veilFloor: z.number(), ...treatmentCommon }),
]);
export type PlacementTreatment = z.infer<typeof placementTreatmentSchema>;

// ── The plan ─────────────────────────────────────────────────────────────────────────────

export const placedWordSchema = z.object({
  text: z.string(),
  weight: headlineWeightSchema,
  sizePx: z.number(),
});
export type PlacedWord = z.infer<typeof placedWordSchema>;

export const placedLineSchema = z.object({
  /** The line as one string, for a renderer that does not need per-word weights. */
  text: z.string(),
  words: z.array(placedWordSchema),
  widthPx: z.number(),
  /** The largest body size on the line — mixed weights share a baseline, not a box top. */
  sizePx: z.number(),
  trackingPx: z.number(),
  /** Add to the anchor's `yPx` to get this line's top. */
  baselineOffsetPx: z.number(),
});
export type PlacedLine = z.infer<typeof placedLineSchema>;

export const placementAnchorSchema = z.object({
  /** Always the right edge: the brand's headline is right-anchored in every adaptation. */
  edge: z.literal('right'),
  xPx: z.number(),
  yPx: z.number(),
  stepPx: z.number(),
});
export type PlacementAnchor = z.infer<typeof placementAnchorSchema>;

export const placementPlanSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  frame: z.object({ width: z.number().positive(), height: z.number().positive() }),
  box: placementBoxSchema,
  framing: framingCandidateSchema,
  anchor: placementAnchorSchema,
  lines: z.array(placedLineSchema),
  measurePx: z.number(),
  /** Fewest lines the text can occupy at this measure. */
  minimumLines: z.number().int().nonnegative(),
  /** True when the balanced pass overran `minimumLines` and greedy first-fit was used. */
  greedyFallback: z.boolean(),
  /** The objective value of the break set that was chosen. */
  breakCost: z.number(),
  treatment: placementTreatmentSchema,
  /** The ratio the piece actually achieved, after framing and treatment. */
  contrastRatio: z.number(),
  ink: placementInkSchema,
});
export type PlacementPlan = z.infer<typeof placementPlanSchema>;

// ── Line breaking ────────────────────────────────────────────────────────────────────────

export interface LineBreakOptions {
  /** Composition measure in px. */
  readonly measure: number;
  readonly lightSizePx: number;
  readonly boldSizePx: number;
  readonly orphanFraction?: number;
  readonly orphanPenalty?: number;
}

export interface BrokenLine {
  readonly words: readonly HeadlineToken[];
  readonly width: number;
}

export interface LineBreakResult {
  readonly lines: readonly BrokenLine[];
  readonly measure: number;
  readonly minimumLines: number;
  readonly greedyFallback: boolean;
  /** Objective value of the returned break set — after the greedy fallback, if it fired. */
  readonly cost: number;
  /** Distinct `(i, j)` segment widths actually computed. Evidence the memo is working. */
  readonly measurements: number;
}

/**
 * Cost of one line. The whole objective lives here so the DP and {@link scoreBreaks} cannot
 * disagree about what "better" means.
 *
 * Non-final lines pay `slack²` — one big gap costs more than two small ones, which is the
 * definition of an even paragraph. The final line's ordinary slack is FREE, because a short
 * last line is normal typography, not a defect. What IS a defect is an ORPHAN: greedy
 * first-fit puts everything that fits on each line and by construction dumps the remainder on
 * the last one, which is the line the eye lands on. In four of ten reference adaptations that
 * left one word alone at 6 % of the longest line.
 */
function lineCost(
  width: number,
  measure: number,
  isFinal: boolean,
  multiLine: boolean,
  orphanFraction: number,
  orphanPenalty: number,
): number {
  const slack = Math.max(0, measure - width);
  if (!isFinal) return slack * slack;
  const floor = measure * orphanFraction;
  if (width < floor && multiLine) {
    const short = floor - width;
    return slack * slack + orphanPenalty * short * short;
  }
  return 0;
}

export interface ScoreBreaksOptions {
  readonly measure: number;
  /**
   * Fewest lines the text COULD occupy. The orphan term is suppressed when it is 1 — a piece
   * that fits on one line has no last-line problem to solve. Defaults to the number of lines
   * given, which is right for a set that already came out of {@link breakLines}.
   */
  readonly minimumLines?: number;
  readonly orphanFraction?: number;
  readonly orphanPenalty?: number;
}

/** The objective, over an arbitrary break set. Lower is better. */
export function scoreBreaks(lineWidths: readonly number[], opts: ScoreBreaksOptions): number {
  const orphanFraction = opts.orphanFraction ?? VERNE_ORPHAN_FRACTION;
  const orphanPenalty = opts.orphanPenalty ?? VERNE_ORPHAN_PENALTY;
  const multiLine = (opts.minimumLines ?? lineWidths.length) > 1;
  let total = 0;
  for (let i = 0; i < lineWidths.length; i += 1) {
    total += lineCost(
      lineWidths[i],
      opts.measure,
      i === lineWidths.length - 1,
      multiLine,
      orphanFraction,
      orphanPenalty,
    );
  }
  return total;
}

/**
 * Split a word that does not fit whole, character by character. Without this a long unbroken
 * term overflows the canvas: the headline is anchored RIGHT, so what does not fit leaves the
 * frame on the left rather than sticking out on the right where someone would see it.
 */
function splitWord(word: string, measure: MeasureText, style: TextStyle, maxWidth: number): string[] {
  const pieces: string[] = [];
  let current = '';
  for (const ch of word) {
    if (current && measure(current + ch, style) > maxWidth) {
      pieces.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  if (current) pieces.push(current);
  return pieces.length > 0 ? pieces : [word];
}

/**
 * Break a mixed-weight headline into lines that fit `measure`.
 *
 * BALANCED, NOT GREEDY. The DP minimises {@link scoreBreaks} subject to one hard rule: it may
 * never spend more lines than greedy first-fit would, because extra lines shrink the headline.
 * The minimum is computed first with a backward pass; if the DP's answer overruns it the DP's
 * answer is discarded and greedy is used, which provably never exceeds the minimum.
 *
 * THE SPACE IS MEASURED IN THE FONT OF THE WORD THAT FOLLOWS IT, not the one before. On a
 * light→bold line that is the difference between the two faces' space advances, and it decides
 * whether the last word fits. This is the reference's choice and mixed-weight lines depend on it.
 *
 * MEMOISED ON `(i, j)`. The reference recomputes the segment width inside every DP transition,
 * which makes it O(n³) `textlength` calls; the width of `words[i..j)` does not depend on the
 * transition that asked for it, so it is cached. Identical output, and it matters because the
 * injected `measure` may be a real canvas call.
 */
export function breakLines(
  tokens: readonly HeadlineToken[],
  measure: MeasureText,
  opts: LineBreakOptions,
): LineBreakResult {
  const limit = opts.measure;
  const orphanFraction = opts.orphanFraction ?? VERNE_ORPHAN_FRACTION;
  const orphanPenalty = opts.orphanPenalty ?? VERNE_ORPHAN_PENALTY;
  const styleFor = (weight: HeadlineWeight): TextStyle => ({
    weight,
    sizePx: weight === 'bold' ? opts.boldSizePx : opts.lightSizePx,
  });

  const words: HeadlineToken[] = [];
  for (const token of tokens) {
    const style = styleFor(token.weight);
    for (const raw of token.text.split(/\s+/)) {
      if (!raw) continue;
      if (measure(raw, style) > limit) {
        for (const piece of splitWord(raw, measure, style, limit)) {
          words.push({ text: piece, weight: token.weight });
        }
      } else {
        words.push({ text: raw, weight: token.weight });
      }
    }
  }

  const n = words.length;
  // An empty headline is no lines. The reference returns one empty line here and advances the
  // cursor by a full line step for it; in a plan that is a phantom line a renderer would honour.
  if (n === 0) {
    return { lines: [], measure: limit, minimumLines: 0, greedyFallback: false, cost: 0, measurements: 0 };
  }

  let measurements = 0;
  const memo = new Float64Array((n + 1) * (n + 1)).fill(-1);
  const widthOf = (i: number, j: number): number => {
    const key = i * (n + 1) + j;
    const cached = memo[key];
    if (cached >= 0) return cached;
    let total = 0;
    for (let k = i; k < j; k += 1) {
      const style = styleFor(words[k].weight);
      if (k > i) total += measure(' ', style);
      total += measure(words[k].text, style);
    }
    measurements += 1;
    memo[key] = total;
    return total;
  };
  const fits = (i: number, j: number): boolean => widthOf(i, j) <= limit;

  // Fewest lines achievable. The `|| minimum[i + 1]` fallback covers a word that fits nowhere,
  // which can still happen after `splitWord` when a single character is wider than the measure.
  const minimum = new Int32Array(n + 1);
  for (let i = n - 1; i >= 0; i -= 1) {
    let best = Number.POSITIVE_INFINITY;
    for (let j = i + 1; j <= n; j += 1) {
      if (fits(i, j) && minimum[j] < best) best = minimum[j];
    }
    minimum[i] = 1 + (Number.isFinite(best) ? best : minimum[i + 1]);
  }
  const target = minimum[0];

  const cost = new Float64Array(n + 1).fill(Number.POSITIVE_INFINITY);
  const cut = new Int32Array(n + 1).fill(n);
  cost[n] = 0;
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = i + 1; j <= n; j += 1) {
      // A segment that already overruns only gets wider; the single-word case is kept so a
      // word that fits nowhere still has a transition out of `i`.
      if (!fits(i, j) && j > i + 1) break;
      if (!Number.isFinite(cost[j])) continue;
      const c = lineCost(widthOf(i, j), limit, j === n, target > 1, orphanFraction, orphanPenalty);
      if (c + cost[j] < cost[i]) {
        cost[i] = c + cost[j];
        cut[i] = j;
      }
    }
  }

  let spans: [number, number][] = [];
  for (let i = 0; i < n; ) {
    const j = cut[i] <= i ? i + 1 : cut[i];
    spans.push([i, j]);
    i = j;
  }

  let greedyFallback = false;
  if (spans.length > target) {
    greedyFallback = true;
    spans = [];
    let start = 0;
    for (let k = 0; k < n; k += 1) {
      if (k > start && widthOf(start, k + 1) > limit) {
        spans.push([start, k]);
        start = k;
      }
    }
    spans.push([start, n]);
  }

  const widths = spans.map(([i, j]) => widthOf(i, j));
  return {
    lines: spans.map(([i, j], k) => ({ words: words.slice(i, j), width: widths[k] })),
    measure: limit,
    minimumLines: target,
    greedyFallback,
    cost: scoreBreaks(widths, { measure: limit, minimumLines: target, orphanFraction, orphanPenalty }),
    measurements,
  };
}

// ── Framing search ───────────────────────────────────────────────────────────────────────

export interface FramingSet {
  readonly axis: FramingAxis;
  readonly incumbent: FramingCandidate;
  readonly candidates: readonly FramingCandidate[];
}

/**
 * The focal candidates worth trying, on whichever axis the crop actually has slack.
 *
 * A photo wider than the box can slide horizontally and not vertically, and vice versa; moving
 * on the pinned axis is a no-op that costs a probe. The incumbent is the centred crop — what
 * you get by not measuring — and it is deliberately not in the candidate list, so it is scored
 * exactly once.
 */
export function framingCandidates(
  source: Size,
  frame: Size,
  focals: readonly number[] = VERNE_FRAMING_FOCALS,
): FramingSet {
  const axis: FramingAxis =
    source.width / source.height > frame.width / Math.max(1, frame.height) ? 'horizontal' : 'vertical';
  return {
    axis,
    incumbent: { axis, focal: 0.5 },
    candidates: focals.map((focal) => ({ axis, focal })),
  };
}

/** The source rectangle a candidate crop reads — {@link coverCropRect} with the focal on its axis. */
export function framingCropRect(source: Size, frame: Size, candidate: FramingCandidate): PixelRect {
  return coverCropRect(source, {
    width: frame.width,
    height: frame.height,
    posx: candidate.axis === 'horizontal' ? candidate.focal : 0.5,
    pos: candidate.axis === 'vertical' ? candidate.focal : 0.5,
  });
}

export interface FramingSearchOptions {
  /**
   * The box to score in. ONE box, used here AND by {@link resolveTreatment}.
   *
   * The reference has a real bug here: `blq_foto_titular:881` scores the framing search against
   * the whole-photo default zone while `:898` re-measures the winner against the actual headline
   * box, so the search can hand the ladder a crop the ladder then has to rescue with a veil the
   * piece did not need. Taking the box as a parameter is how that is not reproduced.
   */
  readonly box: FractionalBox;
  readonly incumbent: FramingCandidate;
  readonly goodEnough?: number;
}

export interface FramingChoice {
  readonly chosen: FramingCandidate;
  readonly ratio: number;
  /** Probe calls made, incumbent included. */
  readonly probes: number;
  /** True when the loop stopped because the good-enough bar was met. */
  readonly earlyExit: boolean;
}

/**
 * Pick the crop that leaves the headline box cleanest.
 *
 * Strict `>` against the incumbent, so a tie leaves the centred crop in place and, among equal
 * candidates, the earliest wins. The bar check runs after the comparison and against the best
 * ratio so far, which is the reference's order: an incumbent that is already good enough still
 * costs one candidate probe before the loop breaks.
 */
export function searchFraming(
  candidates: readonly FramingCandidate[],
  probe: ProbeContrast,
  opts: FramingSearchOptions,
): FramingChoice {
  const goodEnough = opts.goodEnough ?? VERNE_FRAMING_GOOD_ENOUGH;
  let chosen = opts.incumbent;
  let ratio = probe(opts.box, { framing: chosen, treatments: [] });
  let probes = 1;
  let earlyExit = false;
  for (const candidate of candidates) {
    const candidateRatio = probe(opts.box, { framing: candidate, treatments: [] });
    probes += 1;
    if (candidateRatio > ratio) {
      chosen = candidate;
      ratio = candidateRatio;
    }
    if (ratio >= goodEnough) {
      earlyExit = true;
      break;
    }
  }
  return { chosen, ratio, probes, earlyExit };
}

// ── Escalation ladder ────────────────────────────────────────────────────────────────────

export interface TreatmentOptions {
  readonly box: FractionalBox;
  readonly ink?: Rgb;
  readonly minContrast?: number;
  readonly veilFloors?: readonly number[];
  readonly framing?: FramingCandidate;
}

/**
 * Decide what has to happen to the BACKGROUND so the headline reads — as a decision, not as
 * pixel work.
 *
 * THE BRAND'S HEADLINE COLOUR IS INVARIANT. Verified across mailing, post, story and tótem:
 * there is no white-headline variant and no "use the light ink on dark photos" rule. So when a
 * photo will not carry the ink, the photo escalates, and these are the only three things the
 * ladder is allowed to do about it:
 *
 *   • it NEVER changes the type colour — `ink` comes back exactly as it went in;
 *   • it NEVER moves or resizes the headline — `box` comes back exactly as it went in;
 *   • it NEVER rejects the piece — every rung is exhaustible and the last one still returns a
 *     plan, carrying the ratio it actually reached and `cleared: false` so the caller can see
 *     it fell short instead of inferring success from the absence of an error.
 *
 * The rungs: measure the untouched crop; harmonise (lift the shadows into the brand pastel);
 * then raise the floor of ONE veil through the calibrated floors, stopping the moment the box
 * reads.
 *
 * ESCALATION CHANGES A PARAMETER, IT DOES NOT ADD A LAYER — `_velo_marca`'s `v = max(v, piso)`.
 * The veil is recomputed from the pristine photo at each floor and there is never more than one
 * of it, so `steps` is at most `[harmonise, veil]`. Pushing a step per floor tried is the bug
 * this replaced: a photo needing 0.42 shipped under 0.15, 0.28 AND 0.42 white — 1 − (0.85 · 0.72
 * · 0.58) ≈ 64 % coverage — which is what "it always washes out the image" looked like.
 */
export function resolveTreatment(probe: ProbeContrast, opts: TreatmentOptions): PlacementTreatment {
  const ink = opts.ink ?? VERNE_NAVY;
  const minContrast = opts.minContrast ?? VERNE_TITLE_MIN_CONTRAST;
  const floors = opts.veilFloors ?? VERNE_VEIL_FLOORS;
  const framing = opts.framing ?? CENTRED_FRAMING;
  const box = opts.box;
  const steps: TreatmentStep[] = [];
  const common = () => ({ ink: [ink[0], ink[1], ink[2]] as [number, number, number], box: { ...box } });
  const measure = (): number => probe(box, { framing, treatments: [...steps] });

  let ratio = measure();
  if (ratio >= minContrast) {
    return { kind: 'direct', rung: 0, ratio, cleared: true, steps: [], ...common() };
  }

  steps.push({ kind: 'harmonise' });
  ratio = measure();
  if (ratio >= minContrast || floors.length === 0) {
    return {
      kind: 'harmonised',
      rung: 1,
      ratio,
      cleared: ratio >= minContrast,
      steps: [...steps],
      ...common(),
    };
  }

  let rung = 1;
  let veilFloor = floors[0];
  for (let i = 0; i < floors.length; i += 1) {
    // REPLACE, never append: `steps[1]` is THE veil, and a higher floor raises its floor.
    steps[1] = { kind: 'veil', floor: floors[i] };
    rung = 2 + i;
    veilFloor = floors[i];
    ratio = measure();
    if (ratio >= minContrast) break;
  }
  return {
    kind: 'veiled',
    rung,
    veilFloor,
    ratio,
    cleared: ratio >= minContrast,
    steps: [...steps],
    ...common(),
  };
}

// ── Composition ──────────────────────────────────────────────────────────────────────────

export interface PlacementOptions {
  readonly lightSizeFraction?: number;
  readonly boldSizeFraction?: number;
  readonly lineStepFraction?: number;
  readonly rightMarginFraction?: number;
  readonly measureFraction?: number;
  readonly boxTop?: number;
  readonly boxBottom?: number;
  /** Per-piece headline scale. Scales the faces and the step; the measure is not scaled. */
  readonly scale?: number;
  /**
   * Letter-spacing on the headline. The reference sets none — the kicker chip is the only
   * tracked run in the system — but a plan a renderer consumes needs the value stated rather
   * than assumed, and a brand that does track its display face has somewhere to put it.
   */
  readonly trackingPx?: number;
  readonly ink?: Rgb;
  readonly minContrast?: number;
  readonly veilFloors?: readonly number[];
  readonly focals?: readonly number[];
  readonly goodEnough?: number;
  readonly orphanFraction?: number;
  readonly orphanPenalty?: number;
}

// ── Anchors ───────────────────────────────────────────────────────────────────────────

/**
 * The nine places a burn-in can be pinned to — corners, edge midpoints, centre.
 *
 * The five names the video burn-in already uses (`utils/actions/overlayPresets.ts`) are reused
 * VERBATIM and the four midpoints follow the same `<row>-<column>` shape. A second vocabulary
 * for "top right" is how two placement pickers end up disagreeing about one idea.
 */
export const BURN_IN_ANCHORS = [
  'top-left',
  'top-center',
  'top-right',
  'center-left',
  'center',
  'center-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
] as const;

export const burnInAnchorSchema = z.enum(BURN_IN_ANCHORS);
export type BurnInAnchor = z.infer<typeof burnInAnchorSchema>;

export type AnchorRow = 'top' | 'center' | 'bottom';
export type AnchorColumn = 'left' | 'center' | 'right';

/** The row and column an anchor names. `center` is the one name that carries both axes. */
export function anchorAxes(anchor: BurnInAnchor): { row: AnchorRow; column: AnchorColumn } {
  if (anchor === 'center') return { row: 'center', column: 'center' };
  const [row, column] = anchor.split('-');
  return { row: row as AnchorRow, column: column as AnchorColumn };
}

/**
 * The reference headline's top edge is NOT one of the nine anchor points: `VERNE_TITLE_BOX_TOP`
 * (0.18) sits well below where `top-*` puts a block at `VERNE_TITLE_RIGHT_MARGIN`. Carried as
 * the nudge that reproduces it exactly, so moving `image.text` onto an anchor model does not
 * quietly move a placement calibrated on ten real adaptations. Rounded because the raw
 * subtraction is 0.10500000000000001 and that float would be persisted into every node config.
 */
export const VERNE_TITLE_ANCHOR_OFFSET_Y = Number(
  (VERNE_TITLE_BOX_TOP - VERNE_TITLE_RIGHT_MARGIN).toFixed(4),
);

/**
 * The headline box as fractions of the photo. Horizontally it is exactly the measure pinned to
 * the right margin, so it moves when either constant is retuned; vertically it is the measured
 * 18 %–68 % band.
 *
 * Using a fixed "right 55 %, top 45 %" zone instead is what let a tótem measure 2.17:1 on the
 * finished piece without the ladder firing: it was looking where there is no text.
 */
export function titleBox(opts: PlacementOptions = {}): FractionalBox {
  const margin = opts.rightMarginFraction ?? VERNE_TITLE_RIGHT_MARGIN;
  const measure = opts.measureFraction ?? VERNE_TITLE_MEASURE;
  const x1 = 1 - margin;
  return {
    x0: x1 - measure,
    y0: opts.boxTop ?? VERNE_TITLE_BOX_TOP,
    x1,
    y1: opts.boxBottom ?? VERNE_TITLE_BOX_BOTTOM,
  };
}

export interface PlacementInput {
  readonly tokens: readonly HeadlineToken[];
  /** The photo block in px — the box the crop fills, not the source image. */
  readonly frame: Size;
  readonly measureText: MeasureText;
  readonly probeContrast: ProbeContrast;
  /** The source image. Omit it to skip the framing search and take the centred crop. */
  readonly source?: Size;
  readonly options?: PlacementOptions;
}

/**
 * Framing → line breaking → treatment → a serialisable {@link PlacementPlan}.
 *
 * The framing search and the ladder are handed the SAME box ({@link titleBox}), which is the
 * one deliberate divergence from the reference — see {@link FramingSearchOptions.box}.
 */
export function planPlacement(input: PlacementInput): PlacementPlan {
  const o = input.options ?? {};
  const scale = o.scale ?? 1;
  const width = input.frame.width;
  const box = titleBox(o);
  const lightSizePx = width * (o.lightSizeFraction ?? VERNE_TITLE_LIGHT_SIZE) * scale;
  const boldSizePx = width * (o.boldSizeFraction ?? VERNE_TITLE_BOLD_SIZE) * scale;
  const stepPx = width * (o.lineStepFraction ?? VERNE_TITLE_LINE_STEP) * scale;
  const measurePx = width * (o.measureFraction ?? VERNE_TITLE_MEASURE);
  const trackingPx = o.trackingPx ?? 0;

  const candidates = input.source
    ? framingCandidates(input.source, input.frame, o.focals)
    : null;
  const framing: FramingChoice = candidates
    ? searchFraming(candidates.candidates, input.probeContrast, {
        box,
        incumbent: candidates.incumbent,
        goodEnough: o.goodEnough,
      })
    : {
        chosen: CENTRED_FRAMING,
        ratio: input.probeContrast(box, { framing: CENTRED_FRAMING, treatments: [] }),
        probes: 1,
        earlyExit: false,
      };

  const broken = breakLines(input.tokens, input.measureText, {
    measure: measurePx,
    lightSizePx,
    boldSizePx,
    orphanFraction: o.orphanFraction,
    orphanPenalty: o.orphanPenalty,
  });

  const treatment = resolveTreatment(input.probeContrast, {
    box,
    ink: o.ink,
    minContrast: o.minContrast,
    veilFloors: o.veilFloors,
    framing: framing.chosen,
  });

  const sizeOf = (weight: HeadlineWeight) => (weight === 'bold' ? boldSizePx : lightSizePx);

  return {
    schemaVersion: 1,
    frame: { width: input.frame.width, height: input.frame.height },
    box: { ...box },
    framing: framing.chosen,
    anchor: {
      edge: 'right',
      xPx: width * (1 - (o.rightMarginFraction ?? VERNE_TITLE_RIGHT_MARGIN)),
      yPx: input.frame.height * box.y0,
      stepPx,
    },
    lines: broken.lines.map((line, index) => ({
      text: line.words.map((w) => w.text).join(' '),
      words: line.words.map((w) => ({ text: w.text, weight: w.weight, sizePx: sizeOf(w.weight) })),
      widthPx: line.width,
      sizePx: line.words.reduce((max, w) => Math.max(max, sizeOf(w.weight)), 0),
      trackingPx,
      baselineOffsetPx: index * stepPx,
    })),
    measurePx,
    minimumLines: broken.minimumLines,
    greedyFallback: broken.greedyFallback,
    breakCost: broken.cost,
    treatment,
    contrastRatio: treatment.ratio,
    ink: treatment.ink,
  };
}
