import type { LayerEditorLayer } from '../../types';
import type { Frame } from './frameModel';
import { layerBounds, type Rect, unionBounds } from './layerTransform';

/**
 * Alignment snapping for a layer drag: edges and centres, against the frame and against
 * the other layers.
 *
 * This replaces snapping `position` to a numeric grid, which was a mystery force. A
 * layer's `position` is where its ANCHOR lands, and the anchor defaults to the source
 * centre — so grid-snapping it aligned nothing a user can see. A 101px-wide layer snapped
 * to a 16px grid has its edges at x.5, forever. What people are actually reaching for is
 * "line this up with that", so the candidates here are the placed BOUNDS: left, centre,
 * right, top, middle, bottom of the frame and of every other visible layer.
 *
 * The nearest-within-threshold shape is `nodes/timeline/snapping.ts` generalised to two
 * axes. Kept as a copy rather than an abstraction over it: the timeline snaps one scalar
 * against times, this snaps a rect against rects, and the shared part is four lines.
 */

/** Screen pixels. Divided by the stage scale so the pull feels equal at every zoom. */
export const SNAP_THRESHOLD_PX = 6;

export interface SnapGuide {
  axis: 'x' | 'y';
  /** Composition coordinate of the line to draw. */
  at: number;
}

export interface SnapResult {
  /** Delta to ADD to the dragged layers' positions, in composition pixels. */
  dx: number;
  dy: number;
  /** The lines that were matched, for the stage to draw. Empty when nothing snapped. */
  guides: SnapGuide[];
}

const NO_SNAP: SnapResult = { dx: 0, dy: 0, guides: [] };

/** The three interesting coordinates of a rect on each axis. */
const xCandidates = (rect: Rect): number[] => [rect.left, (rect.left + rect.right) / 2, rect.right];
const yCandidates = (rect: Rect): number[] => [rect.top, (rect.top + rect.bottom) / 2, rect.bottom];

/**
 * Everything a drag can line up against: the frame, and every visible layer not being
 * dragged. A layer never snaps to itself, and a hidden layer is not a thing on screen to
 * align with.
 */
export function snapTargets(input: {
  layers: readonly LayerEditorLayer[];
  movingIds: readonly string[];
  frame: Frame;
}): Rect[] {
  const moving = new Set(input.movingIds);
  const rects: Rect[] = [{ left: 0, top: 0, right: input.frame.width, bottom: input.frame.height }];
  for (const layer of input.layers) {
    if (moving.has(layer.id) || !layer.visible) continue;
    rects.push(layerBounds(layer));
  }
  return rects;
}

/** The nearest candidate within `threshold`, as a delta. Zero when nothing is close. */
function bestDelta(values: number[], candidates: number[], threshold: number): number | null {
  let best: number | null = null;
  let bestDistance = threshold;
  for (const value of values) {
    for (const candidate of candidates) {
      const distance = Math.abs(candidate - value);
      // `<=` so a later candidate at an equal distance wins, which makes the frame — the
      // first rect in `snapTargets` — lose ties to an actual layer. Lining up with the
      // thing you can see beats lining up with the edge of the canvas.
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = candidate - value;
      }
    }
  }
  return best;
}

/**
 * Snap the dragged selection's bounds onto the nearest alignment.
 *
 * `moved` is the selection's union bounds AFTER the raw drag delta has been applied, so
 * the caller adds `dx`/`dy` on top. Both axes are decided independently — a layer can be
 * centred horizontally while its top edge sits on another layer's top.
 */
export function snapBounds(input: {
  moved: Rect;
  targets: readonly Rect[];
  /** Composition pixels. Convert from screen with `SNAP_THRESHOLD_PX / scale`. */
  threshold: number;
}): SnapResult {
  const { moved, targets, threshold } = input;
  if (threshold <= 0 || targets.length === 0) return NO_SNAP;

  const dx = bestDelta(xCandidates(moved), targets.flatMap(xCandidates), threshold);
  const dy = bestDelta(yCandidates(moved), targets.flatMap(yCandidates), threshold);

  const guides: SnapGuide[] = [];
  // The guide is drawn at the SNAPPED position, which is where the edges actually meet.
  if (dx !== null) {
    const snapped = xCandidates(moved).map((value) => value + dx);
    const matched = targets
      .flatMap(xCandidates)
      .find((candidate) => snapped.some((value) => Math.abs(value - candidate) < 0.001));
    if (matched !== undefined) guides.push({ axis: 'x', at: matched });
  }
  if (dy !== null) {
    const snapped = yCandidates(moved).map((value) => value + dy);
    const matched = targets
      .flatMap(yCandidates)
      .find((candidate) => snapped.some((value) => Math.abs(value - candidate) < 0.001));
    if (matched !== undefined) guides.push({ axis: 'y', at: matched });
  }

  return { dx: dx ?? 0, dy: dy ?? 0, guides };
}

/** The union bounds of the layers being dragged, which is what snapping measures. */
export function movingBounds(
  layers: readonly LayerEditorLayer[],
  ids: readonly string[],
): Rect | null {
  const wanted = new Set(ids);
  const rects = layers.filter((layer) => wanted.has(layer.id)).map(layerBounds);
  return rects.length === 0 ? null : unionBounds(rects);
}
