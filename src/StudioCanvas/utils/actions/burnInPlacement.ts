// WHERE the burn-in's type block sits, as arithmetic on fractions.
//
// `planPlacement` (contracts, design-system/placement.ts) decides everything ABOUT the type —
// where the lines break, how big each one is, and what has to happen to the background for the
// ink to read. It does not decide where the block goes: it reads that from three
// `PlacementOptions` fields (`rightMarginFraction`, `boxTop`, `boxBottom`). This module is the
// translation from "the user dragged it here" into those three numbers, and back again for the
// preview the user drags on.
//
// FRACTIONS, NEVER PIXELS. The same node config has to hold when the node runs against a
// 1080x1350 and a 1080x1920 frame. A pixel offset means something different in each; a
// fraction of the axis it is on means the same thing in both.
//
// ZERO OFFSET IS THE ANCHOR, and that is what makes a snap worth having: a snapped placement
// carries no residual, so it stays anchor-relative and survives a change of output size. Only
// a block released away from every anchor keeps a fraction, and it keeps it against whichever
// anchor it ended up nearest.
//
// WHY NOT `utils/layers/layerGizmo.ts`. That gizmo's model is a `LayerEditorLayer` — source
// pixels, a scale per axis, a rotation, and eight resize handles that pin the OPPOSITE corner.
// A headline block has none of those degrees of freedom: `planPlacement` owns its size (the
// composition measure, by the line count the breaker chose), it never rotates, and it cannot
// be resized without re-breaking the lines. Reusing it would mean fabricating a layer and then
// ignoring eight of its nine controls. What IS shared is the idea in `layerOps.alignLayers` —
// snap an edge to a target edge — reduced here to a 3x3 table, because the target is the frame
// and there is exactly one block.

import {
  anchorAxes,
  BURN_IN_ANCHORS,
  type BurnInAnchor,
  breakLines,
  type FractionalBox,
  type HeadlineToken,
  type MeasureText,
  type PlacementOptions,
  type Size,
  VERNE_TITLE_BOLD_SIZE,
  VERNE_TITLE_LIGHT_SIZE,
  VERNE_TITLE_LINE_STEP,
} from '@continuum/contracts';

/** How near an anchor a release has to land to snap onto it, in frame fractions. */
export const BURN_IN_SNAP_RADIUS = 0.04;

/** The four numbers a node stores about placement — `textPlacementConfig`'s placement half. */
export interface BurnInPlacement {
  readonly anchor: BurnInAnchor;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly marginFrac: number;
}

/** The type block's own size, as fractions of the frame it will be drawn on. */
export interface BlockExtent {
  /**
   * Always the composition measure. The block IS the measure box: that is the span `titleBox`
   * hands the contrast probe, and a ragged-left headline whose lines fall short still breaks
   * against the full measure.
   */
  readonly widthFrac: number;
  readonly heightFrac: number;
  readonly lines: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Four decimals: enough for a sub-pixel nudge on a 4K frame, few enough that a config
 *  round-trip reads as a number a person chose rather than a float artefact. */
const round4 = (value: number): number => Number(value.toFixed(4));

const clampSpan = (value: number, size: number): number => {
  const limit = Math.max(0, 1 - size);
  return Math.min(limit, Math.max(0, value));
};

/**
 * How tall the headline block is, from the SAME breaker and the SAME metrics the plan will use.
 *
 * Measuring it any other way is the drift this module would otherwise introduce: a block whose
 * preview says two lines and whose plan breaks three sits somewhere the user never put it.
 * `measureText` must therefore be the measurer the render will use — `createMeasurer(faces, 0)`
 * in `imageText.ts`, not a fresh one over a different font stack.
 */
export function headlineBlockExtent(args: {
  tokens: readonly HeadlineToken[];
  frame: Size;
  measureText: MeasureText;
  measureFraction: number;
  scale?: number;
}): BlockExtent {
  const scale = args.scale ?? 1;
  const width = args.frame.width;
  const lightSizePx = width * VERNE_TITLE_LIGHT_SIZE * scale;
  const boldSizePx = width * VERNE_TITLE_BOLD_SIZE * scale;
  const stepPx = width * VERNE_TITLE_LINE_STEP * scale;
  const broken = breakLines(args.tokens, args.measureText, {
    measure: width * args.measureFraction,
    lightSizePx,
    boldSizePx,
  });

  const count = broken.lines.length;
  const last = broken.lines[count - 1];
  // The last line's own body size, not the step: the block ends at the deepest glyph box on
  // the final line, and a mixed-weight line's box is the bold one's.
  const lastSizePx = last
    ? last.words.reduce(
        (max, word) => Math.max(max, word.weight === 'bold' ? boldSizePx : lightSizePx),
        0,
      )
    : 0;
  const heightPx = count === 0 ? 0 : (count - 1) * stepPx + lastSizePx;

  return {
    widthFrac: args.measureFraction,
    heightFrac: Math.min(1, heightPx / Math.max(1, args.frame.height)),
    lines: count,
  };
}

/** The block's top-left for an anchor with NO offset — the nine places a snap can land. */
export function anchorOrigin(anchor: BurnInAnchor, extent: BlockExtent, marginFrac: number): Point {
  const { row, column } = anchorAxes(anchor);
  const x =
    column === 'left'
      ? marginFrac
      : column === 'right'
        ? 1 - marginFrac - extent.widthFrac
        : (1 - extent.widthFrac) / 2;
  const y =
    row === 'top'
      ? marginFrac
      : row === 'bottom'
        ? 1 - marginFrac - extent.heightFrac
        : (1 - extent.heightFrac) / 2;
  return { x: clampSpan(x, extent.widthFrac), y: clampSpan(y, extent.heightFrac) };
}

/** Where the block actually is: its anchor, nudged, held inside the frame. */
export function blockOrigin(placement: BurnInPlacement, extent: BlockExtent): Point {
  const base = anchorOrigin(placement.anchor, extent, placement.marginFrac);
  return {
    x: clampSpan(base.x + placement.offsetX, extent.widthFrac),
    y: clampSpan(base.y + placement.offsetY, extent.heightFrac),
  };
}

/** The block as a fractional box — what the preview draws and what the probe measures. */
export function blockRect(placement: BurnInPlacement, extent: BlockExtent): FractionalBox {
  const origin = blockOrigin(placement, extent);
  return {
    x0: origin.x,
    y0: origin.y,
    x1: Math.min(1, origin.x + extent.widthFrac),
    y1: Math.min(1, origin.y + extent.heightFrac),
  };
}

/**
 * The placement, as the `PlacementOptions` fields `titleBox` reads.
 *
 * `titleBox` spans `[x1 - measure, x1]` where `x1 = 1 - rightMarginFraction`, so pinning the
 * block's RIGHT edge is the whole horizontal story — which is also why the type stays
 * right-anchored at every one of the nine points.
 *
 * CEILING: a left-anchored block is still ragged-LEFT, because `placementAnchorSchema.edge` is
 * the literal `'right'` and the SVG draws `text-anchor="end"`. Placement moved; alignment did
 * not. Mirroring it is a contracts + renderer change and it lands with a re-bench, because it
 * changes the x of every measured line.
 */
export function placementOptionsFor(
  placement: BurnInPlacement,
  extent: BlockExtent,
): Required<
  Pick<PlacementOptions, 'rightMarginFraction' | 'boxTop' | 'boxBottom' | 'measureFraction'>
> {
  const origin = blockOrigin(placement, extent);
  return {
    measureFraction: extent.widthFrac,
    rightMarginFraction: Math.max(0, 1 - (origin.x + extent.widthFrac)),
    boxTop: origin.y,
    // A block taller than the frame is clamped rather than allowed to describe a box the probe
    // would read off the end of the pixel buffer.
    boxBottom: Math.min(1, origin.y + extent.heightFrac),
  };
}

export interface SnapResult extends BurnInPlacement {
  /** True when the release landed on an anchor and the offset was cleared. */
  readonly snapped: boolean;
  /** Distance to the anchor it resolved against, in frame fractions. */
  readonly distance: number;
}

/**
 * Turn a dragged top-left into a placement to store.
 *
 * The nearest anchor always becomes the base, snapped or not, so an unsnapped placement is
 * still a small residual off a named point rather than a large offset off whichever anchor the
 * node happened to start on.
 *
 * The distance is Euclidean in FRACTION space, so it is slightly anisotropic on a non-square
 * frame — the radius is 4 % of the width horizontally and 4 % of the height vertically. That is
 * the property a snap wants: it reads the same on screen at any output size, which a pixel
 * radius would not.
 */
export function snapToAnchor(
  origin: Point,
  extent: BlockExtent,
  marginFrac: number,
  radius: number = BURN_IN_SNAP_RADIUS,
): SnapResult {
  let best: { anchor: BurnInAnchor; dx: number; dy: number; distance: number } | null = null;
  for (const anchor of BURN_IN_ANCHORS) {
    const point = anchorOrigin(anchor, extent, marginFrac);
    const dx = origin.x - point.x;
    const dy = origin.y - point.y;
    const distance = Math.hypot(dx, dy);
    if (!best || distance < best.distance) best = { anchor, dx, dy, distance };
  }
  // BURN_IN_ANCHORS is a non-empty literal tuple, so `best` is always set; this is the guard
  // the type needs, not a state the loop can reach.
  if (!best) {
    return { anchor: 'center', offsetX: 0, offsetY: 0, marginFrac, snapped: false, distance: 0 };
  }

  const snapped = best.distance <= radius;
  return {
    anchor: best.anchor,
    offsetX: snapped ? 0 : round4(best.dx),
    offsetY: snapped ? 0 : round4(best.dy),
    marginFrac,
    snapped,
    distance: best.distance,
  };
}
