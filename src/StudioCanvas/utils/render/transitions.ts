// Clip transition model + timing math, shared by the canvas export and the CSS
// preview. `cut`, `fade` (through black), and `dipWhite` are single-clip color
// ramps at the seam — no overlap, so they fit the sequential render loop.
// `crossDissolve` overlaps two clips and is handled by the frame compositor.
// The transition is attached to the *incoming* clip (the boundary before it).

export type ClipTransitionType =
  | 'cut'
  | 'fade'
  | 'dipWhite'
  | 'crossDissolve'
  | 'slideLeft'
  | 'slideRight'
  | 'slideUp'
  | 'slideDown'
  | 'wipeLeft'
  | 'wipeRight'
  | 'zoomIn'
  | 'spin';

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
]);

export interface FadeOverlay {
  color: string;
  durationSec: number;
}

/** The overlay color for a color-ramp transition, or null for cut/crossDissolve. */
export function fadeColorFor(type: ClipTransitionType | undefined): string | null {
  if (type === 'fade') return '#000000';
  if (type === 'dipWhite') return '#ffffff';
  return null;
}

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
      return { outgoing: { ...idleLayer(), translateX: -k * width }, incoming: { ...idleLayer(), translateX: (1 - k) * width } };
    case 'slideRight':
      return { outgoing: { ...idleLayer(), translateX: k * width }, incoming: { ...idleLayer(), translateX: -(1 - k) * width } };
    case 'slideUp':
      return { outgoing: { ...idleLayer(), translateY: -k * height }, incoming: { ...idleLayer(), translateY: (1 - k) * height } };
    case 'slideDown':
      return { outgoing: { ...idleLayer(), translateY: k * height }, incoming: { ...idleLayer(), translateY: -(1 - k) * height } };
    case 'wipeRight':
      return { outgoing: idleLayer(), incoming: { ...idleLayer(), clip: { x: 0, y: 0, w: k * width, h: height } } };
    case 'wipeLeft':
      return { outgoing: idleLayer(), incoming: { ...idleLayer(), clip: { x: (1 - k) * width, y: 0, w: k * width, h: height } } };
    case 'zoomIn':
      return { outgoing: idleLayer(), incoming: { ...idleLayer(k), scale: Math.max(0.001, k) } };
    case 'spin':
      return { outgoing: idleLayer(), incoming: { translateX: 0, translateY: 0, scale: Math.max(0.001, k), rotate: (1 - k) * Math.PI, alpha: k } };
    default: // crossDissolve
      return { outgoing: idleLayer(), incoming: idleLayer(k) };
  }
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
      placements[i].soloEndSec = placements[i].outputStartSec + placements[i].outputDurationSec - next.inOverlapSec;
    }
  }
  const last = placements[placements.length - 1];
  const totalSec = last ? last.outputStartSec + last.outputDurationSec : 0;
  return { placements, totalSec };
}

/** The head overlap an overlap-transition contributes (0 for cut/fade/dip). */
export function overlapInSecFor(transition: ClipTransition | undefined): number {
  return transition && isOverlapTransition(transition.type) ? Math.max(0, transition.durationSec) : 0;
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
  return { color, durationSec: isFirstClip ? transition.durationSec : transition.durationSec / 2 };
}

/**
 * The tail fade applied to a clip from the NEXT clip's incoming transition (the
 * outgoing half of an internal boundary). Never applies at the very end.
 */
export function tailFadeFor(nextTransition: ClipTransition | undefined): FadeOverlay | undefined {
  const color = fadeColorFor(nextTransition?.type);
  if (!color || !nextTransition) return undefined;
  return { color, durationSec: nextTransition.durationSec / 2 };
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
    return { color: headFade.color, alpha: 1 - localOutSec / headFade.durationSec };
  }
  if (tailFade && tailFade.durationSec > 0) {
    const tailStart = outputDurationSec - tailFade.durationSec;
    if (localOutSec > tailStart) {
      return {
        color: tailFade.color,
        alpha: Math.min(1, (localOutSec - tailStart) / tailFade.durationSec),
      };
    }
  }
  return null;
}
