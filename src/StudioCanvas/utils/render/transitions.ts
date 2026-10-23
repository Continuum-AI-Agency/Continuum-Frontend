// Clip transition timing math, shared by the canvas export and the CSS preview.
// `cut`, `fade` (through black), and `dipWhite` are single-clip color ramps at the
// seam — no overlap, so they fit the sequential render loop. `crossDissolve`
// overlaps two clips and is handled by the frame compositor. The transition is
// attached to the *incoming* clip (the boundary before it).
//
// The transition VOCABULARY lives in @continuum/contracts (workflow-graph.ts) so
// the Canvas Composer agent emits the same names this engine renders — adding a
// transition type starts there, then gets its math here.

import type { ClipTransitionType } from '@continuum/contracts';

export type { ClipTransitionType } from '@continuum/contracts';

export interface ClipTransition {
  type: ClipTransitionType;
  durationSec: number;
}

// Transitions that overlap two clips (rendered by the frame compositor), vs
// single-clip color ramps (fade / dipWhite) that fit the sequential loop.
const OVERLAP_TRANSITIONS = new Set<ClipTransitionType>([
  'crossDissolve',
  'slideLeft',
  'slideRight',
  'slideUp',
  'slideDown',
  'wipeLeft',
  'wipeRight',
  'zoomIn',
  'spin',
  'blur',
  'whipLeft',
  'whipRight',
  'whipUp',
  'whipDown',
  'zoomBlur',
  'glitch',
]);

export interface FadeOverlay {
  color: string;
  durationSec: number;
  /** Ramp exponent (default 1 = linear). Above 1 the colour arrives late and leaves fast. */
  curve?: number;
}

/** A flash: white like a dip, but it snaps in at the cut and falls away quickly. */
const FLASH_CURVE = 2.5;

/** The overlay color for a color-ramp transition, or null for cut/crossDissolve. */
export function fadeColorFor(type: ClipTransitionType | undefined): string | null {
  if (type === 'fade') return '#000000';
  if (type === 'dipWhite' || type === 'flash') return '#ffffff';
  return null;
}

const fadeCurveFor = (type: ClipTransitionType | undefined): Pick<FadeOverlay, 'curve'> =>
  type === 'flash' ? { curve: FLASH_CURVE } : {};

/** True for transitions that need a two-clip overlap (not a single-clip ramp). */
export function isOverlapTransition(type: ClipTransitionType | undefined): boolean {
  return type !== undefined && OVERLAP_TRANSITIONS.has(type);
}

// The per-frame draw transform for the outgoing (tail) and incoming (head) clip
// at normalized overlap time t (0..1). Pure numeric so it is unit-testable;
// crossDissolve.ts applies it to the canvas. crossDissolve blends by alpha; the
// slide/wipe/zoom/spin families move, reveal, scale, or rotate the incoming clip.
export interface OverlapLayerXform {
  translateX: number;
  translateY: number;
  scale: number;
  /** Radians, clockwise, about the frame center. */
  rotate: number;
  alpha: number;
  /** Screen-space reveal rect (wipe); absent = draw the whole frame. */
  clip?: { x: number; y: number; w: number; h: number };
  /** Post-processing for the blur / whip / zoom-blur / glitch families; absent = plain draw. */
  fx?: OverlapLayerFx;
}

/** A horizontal band of a glitch frame, pushed sideways by `shiftPx`. */
export interface GlitchSlice {
  y: number;
  h: number;
  shiftPx: number;
}

export interface OverlapLayerFx {
  /** Gaussian blur radius in px. */
  blurPx?: number;
  /** Directional motion-blur smear (px) along which the layer is sampled, centred on its position. */
  trail?: { dx: number; dy: number };
  /** Radial smear: the layer is sampled across scale * (1 .. 1 + zoomTrail), streaking outward. */
  zoomTrail?: number;
  /** Red and blue channels pushed apart by this many px. */
  rgbSplitPx?: number;
  slices?: GlitchSlice[];
  /** Whole-frame jitter in px. */
  shift?: { x: number; y: number };
}

const idleLayer = (alpha = 1): OverlapLayerXform => ({
  translateX: 0,
  translateY: 0,
  scale: 1,
  rotate: 0,
  alpha,
});

export function overlapTransitionAt(
  type: ClipTransitionType,
  t: number,
  width: number,
  height: number,
): { outgoing: OverlapLayerXform; incoming: OverlapLayerXform } {
  const k = Math.max(0, Math.min(1, t));
  switch (type) {
    case 'slideLeft':
      return {
        outgoing: { ...idleLayer(), translateX: -k * width },
        incoming: { ...idleLayer(), translateX: (1 - k) * width },
      };
    case 'slideRight':
      return {
        outgoing: { ...idleLayer(), translateX: k * width },
        incoming: { ...idleLayer(), translateX: -(1 - k) * width },
      };
    case 'slideUp':
      return {
        outgoing: { ...idleLayer(), translateY: -k * height },
        incoming: { ...idleLayer(), translateY: (1 - k) * height },
      };
    case 'slideDown':
      return {
        outgoing: { ...idleLayer(), translateY: k * height },
        incoming: { ...idleLayer(), translateY: -(1 - k) * height },
      };
    case 'wipeRight':
      return {
        outgoing: idleLayer(),
        incoming: { ...idleLayer(), clip: { x: 0, y: 0, w: k * width, h: height } },
      };
    case 'wipeLeft':
      return {
        outgoing: idleLayer(),
        incoming: { ...idleLayer(), clip: { x: (1 - k) * width, y: 0, w: k * width, h: height } },
      };
    case 'zoomIn':
      return { outgoing: idleLayer(), incoming: { ...idleLayer(k), scale: Math.max(0.001, k) } };
    case 'spin':
      return {
        outgoing: idleLayer(),
        incoming: {
          translateX: 0,
          translateY: 0,
          scale: Math.max(0.001, k),
          rotate: (1 - k) * Math.PI,
          alpha: k,
        },
      };
    case 'blur': {
      // Both layers go soft toward the middle of the overlap, and the new one fades in.
      const fx = { blurPx: Math.sin(Math.PI * k) * BLUR_PEAK * Math.max(width, height) };
      return { outgoing: { ...idleLayer(), fx }, incoming: { ...idleLayer(k), fx } };
    }
    case 'whipLeft':
    case 'whipRight':
    case 'whipUp':
    case 'whipDown': {
      const sign = type === 'whipLeft' || type === 'whipUp' ? -1 : 1;
      const horizontal = type === 'whipLeft' || type === 'whipRight';
      const extent = horizontal ? width : height;
      // Slow off the mark, violent in the middle, settling at the end; the smear is the
      // layer's own speed, so it is longest mid-whip and gone when the shot lands.
      const eased = easeInOutCubic(k);
      const speed = easeInOutCubicSlope(k) * extent * WHIP_SHUTTER;
      const trail = horizontal ? { dx: sign * speed, dy: 0 } : { dx: 0, dy: sign * speed };
      const at = (offset: number): OverlapLayerXform => ({
        ...idleLayer(),
        ...(horizontal ? { translateX: offset } : { translateY: offset }),
        fx: { trail },
      });
      return {
        outgoing: at(sign * eased * extent + 0),
        incoming: at(sign * (eased - 1) * extent + 0),
      };
    }
    case 'zoomBlur': {
      // Zoom through: the old shot rushes at the camera while the new one starts big
      // and settles; the radial smear peaks mid-way where both are in flight.
      const eased = easeInOutCubic(k);
      const zoomTrail = Math.sin(Math.PI * k) * ZOOM_BLUR_PEAK;
      return {
        outgoing: { ...idleLayer(), scale: 1 + ZOOM_BLUR_TRAVEL * eased, fx: { zoomTrail } },
        incoming: {
          ...idleLayer(eased),
          scale: 1 + ZOOM_BLUR_TRAVEL * (1 - eased) * 0.5,
          fx: { zoomTrail },
        },
      };
    }
    case 'glitch': {
      // A hard cut at the middle, torn by a colour split, sideways bands and jitter that
      // are all strongest at the cut. Deterministic in `t`: a re-render is byte-identical.
      const strength = 1 - Math.abs(2 * k - 1);
      const frame = Math.round(k * GLITCH_STEPS);
      const fx: OverlapLayerFx = {
        rgbSplitPx: strength * GLITCH_SPLIT * width,
        slices: glitchSlices(frame, strength, width, height),
        shift: {
          x: (hash01(frame * 3 + 1) - 0.5) * 2 * strength * GLITCH_JITTER * width,
          y: (hash01(frame * 3 + 2) - 0.5) * 2 * strength * GLITCH_JITTER * height,
        },
      };
      return {
        outgoing: { ...idleLayer(k < 0.5 ? 1 : 0), fx },
        incoming: { ...idleLayer(k < 0.5 ? 0 : 1), fx },
      };
    }
    default: // crossDissolve
      return { outgoing: idleLayer(), incoming: idleLayer(k) };
  }
}

// Blur radius at the middle of a blur transition, as a fraction of the longer frame edge.
const BLUR_PEAK = 0.02;
// A whip's smear is its per-unit-progress speed times this: the camera's "shutter".
const WHIP_SHUTTER = 0.1;
// How far (as extra scale) a zoom-through travels, and the radial smear at its peak.
const ZOOM_BLUR_TRAVEL = 1.2;
const ZOOM_BLUR_PEAK = 0.45;
// Glitch: channel split as a fraction of the width, jitter as a fraction of each edge, and
// how many distinct glitch frames one transition steps through.
const GLITCH_SPLIT = 0.025;
const GLITCH_JITTER = 0.006;
const GLITCH_STEPS = 12;
const GLITCH_SLICES = 4;

const easeInOutCubic = (k: number): number => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
const easeInOutCubicSlope = (k: number): number => (k < 0.5 ? 12 * k * k : 3 * (-2 * k + 2) ** 2);

/** Stateless noise in 0..1, so a glitch is a pure function of its frame. */
export function hash01(seed: number): number {
  const hashed = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return hashed - Math.floor(hashed);
}

/** The sideways bands of one glitch frame; empty when the glitch has no strength. */
export function glitchSlices(
  frame: number,
  strength: number,
  width: number,
  height: number,
): GlitchSlice[] {
  if (strength <= 0.02) return [];
  return Array.from({ length: GLITCH_SLICES }, (_, index) => {
    const seed = frame * 17 + index * 5;
    const h = Math.max(2, Math.round(height * (0.03 + hash01(seed + 1) * 0.09)));
    return {
      y: Math.round(hash01(seed + 2) * (height - h)),
      h,
      shiftPx: Math.round((hash01(seed + 3) - 0.5) * 2 * strength * 0.12 * width),
    };
  });
}

export interface OutputPlacement {
  /** Output time where this clip's content begins (may overlap the previous). */
  outputStartSec: number;
  outputDurationSec: number;
  /** Cross-dissolve overlap at the head (with the previous clip). */
  inOverlapSec: number;
  /** Cross-dissolve overlap at the tail (with the next clip). */
  outOverlapSec: number;
  /** Output range this clip renders alone (outside any overlap). */
  soloStartSec: number;
  soloEndSec: number;
}

/**
 * Lay clips end-to-end, pulling each cross-dissolving clip left so it overlaps
 * the previous one by its transition duration. Shared by the editor layout and
 * the render so the timeline the user scrubs matches the exported file. Overlaps
 * are clamped so neither clip is fully consumed.
 */
export function computeOutputPlacements(
  clips: { outputDurationSec: number; crossDissolveInSec: number }[],
): { placements: OutputPlacement[]; totalSec: number } {
  const placements: OutputPlacement[] = [];
  for (let i = 0; i < clips.length; i += 1) {
    const { outputDurationSec, crossDissolveInSec } = clips[i];
    const prev = placements[i - 1];
    let inOverlapSec = 0;
    if (i > 0 && prev && crossDissolveInSec > 0) {
      inOverlapSec = Math.min(
        crossDissolveInSec,
        outputDurationSec,
        // Leave the previous clip's own head overlap intact.
        prev.outputDurationSec - prev.inOverlapSec,
      );
      inOverlapSec = Math.max(0, inOverlapSec);
    }
    const prevEnd = prev ? prev.outputStartSec + prev.outputDurationSec : 0;
    const outputStartSec = i === 0 ? 0 : prevEnd - inOverlapSec;
    placements.push({
      outputStartSec,
      outputDurationSec,
      inOverlapSec,
      outOverlapSec: 0,
      soloStartSec: outputStartSec + inOverlapSec,
      soloEndSec: outputStartSec + outputDurationSec,
    });
  }
  // Second pass: a clip's tail overlap equals the next clip's head overlap.
  for (let i = 0; i < placements.length; i += 1) {
    const next = placements[i + 1];
    if (next && next.inOverlapSec > 0) {
      placements[i].outOverlapSec = next.inOverlapSec;
      placements[i].soloEndSec =
        placements[i].outputStartSec + placements[i].outputDurationSec - next.inOverlapSec;
    }
  }
  const last = placements[placements.length - 1];
  const totalSec = last ? last.outputStartSec + last.outputDurationSec : 0;
  return { placements, totalSec };
}

/** The head overlap an overlap-transition contributes (0 for cut/fade/dip). */
export function overlapInSecFor(transition: ClipTransition | undefined): number {
  return transition && isOverlapTransition(transition.type)
    ? Math.max(0, transition.durationSec)
    : 0;
}

/**
 * The head fade applied to a clip from its own incoming transition. The first
 * clip fades from color over the full duration (a fade-in); an internal boundary
 * splits the duration so the outgoing clip fades to color over the first half
 * and the incoming clip fades from color over the second half.
 */
export function headFadeFor(
  transition: ClipTransition | undefined,
  isFirstClip: boolean,
): FadeOverlay | undefined {
  const color = fadeColorFor(transition?.type);
  if (!color || !transition) return undefined;
  return {
    color,
    durationSec: isFirstClip ? transition.durationSec : transition.durationSec / 2,
    ...fadeCurveFor(transition.type),
  };
}

/**
 * The tail fade applied to a clip from the NEXT clip's incoming transition (the
 * outgoing half of an internal boundary). Never applies at the very end.
 */
export function tailFadeFor(nextTransition: ClipTransition | undefined): FadeOverlay | undefined {
  const color = fadeColorFor(nextTransition?.type);
  if (!color || !nextTransition) return undefined;
  return {
    color,
    durationSec: nextTransition.durationSec / 2,
    ...fadeCurveFor(nextTransition.type),
  };
}

/**
 * The color overlay to draw at output-local time `localOutSec` within a clip of
 * `outputDurationSec`, given its head/tail fades. Returns null outside any fade
 * window. Alpha ramps 1→0 across the head (fade from color) and 0→1 across the
 * tail (fade to color).
 */
export function transitionOverlayAt(
  localOutSec: number,
  outputDurationSec: number,
  headFade: FadeOverlay | undefined,
  tailFade: FadeOverlay | undefined,
): { color: string; alpha: number } | null {
  if (headFade && headFade.durationSec > 0 && localOutSec < headFade.durationSec) {
    return {
      color: headFade.color,
      alpha: (1 - localOutSec / headFade.durationSec) ** (headFade.curve ?? 1),
    };
  }
  if (tailFade && tailFade.durationSec > 0) {
    const tailStart = outputDurationSec - tailFade.durationSec;
    if (localOutSec > tailStart) {
      return {
        color: tailFade.color,
        alpha:
          Math.min(1, (localOutSec - tailStart) / tailFade.durationSec) ** (tailFade.curve ?? 1),
      };
    }
  }
  return null;
}
