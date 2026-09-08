import type { LayerEditorLayer } from '../../types';
import { type Point, type Rect, sourceToComposition, unrotate } from './layerTransform';

/**
 * The transform gizmo's arithmetic: resize by a handle, rotate about the anchor.
 *
 * Pure and separate from `LayerStage.tsx` because this is the part that is easy to get
 * subtly wrong under rotation and a negative (flipped) scale, and a component is an
 * expensive place to test arithmetic.
 *
 * The interaction shape — window `pointermove`/`pointerup`, an 8-handle box, shift to
 * constrain — is the one `ClipInspector` and `nodes/timeline/OverlayTrack.tsx` already
 * use. Only the MODEL underneath it is new (aep-interop §4.6).
 */

export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export const RESIZE_HANDLES: readonly ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** Below this a layer is a line the user can no longer grab. */
const MIN_SCALE = 0.01;

const OPPOSITE: Record<ResizeHandle, ResizeHandle> = {
  nw: 'se',
  n: 's',
  ne: 'sw',
  e: 'w',
  se: 'nw',
  s: 'n',
  sw: 'ne',
  w: 'e',
};

/** Where each handle sits in the layer's OWN source pixels. */
function handleLocal(layer: LayerEditorLayer, handle: ResizeHandle): Point {
  const w = layer.sourceWidth;
  const h = layer.sourceHeight;
  switch (handle) {
    case 'nw':
      return { x: 0, y: 0 };
    case 'n':
      return { x: w / 2, y: 0 };
    case 'ne':
      return { x: w, y: 0 };
    case 'e':
      return { x: w, y: h / 2 };
    case 'se':
      return { x: w, y: h };
    case 's':
      return { x: w / 2, y: h };
    case 'sw':
      return { x: 0, y: h };
    case 'w':
      return { x: 0, y: h / 2 };
  }
}

/** The eight handles in COMPOSITION pixels, so the stage can place them. */
export function handlePoints(layer: LayerEditorLayer): Record<ResizeHandle, Point> {
  return Object.fromEntries(
    RESIZE_HANDLES.map((handle) => [
      handle,
      sourceToComposition(layer, handleLocal(layer, handle)),
    ]),
  ) as Record<ResizeHandle, Point>;
}

const keepSign = (value: number, fallbackSign: number): number => {
  const magnitude = Math.max(MIN_SCALE, Math.abs(value));
  const sign = value === 0 ? fallbackSign : Math.sign(value);
  return magnitude * (sign === 0 ? 1 : sign);
};

/**
 * Resize by dragging `handle` to `pointer`.
 *
 * The OPPOSITE handle stays exactly where it was — that is what makes a drag feel like a
 * resize rather than a scale-and-slide — so `position` is recomputed rather than left
 * alone. Reading the pointer through `unrotate` is what makes this correct for a rotated
 * layer; reading raw screen deltas is the classic version that skews under rotation.
 *
 * A drag past the opposite handle flips the axis, because the scale simply goes
 * negative — the same field, no special case (aep-interop §4.2.3).
 */
export function resizeLayer(
  start: LayerEditorLayer,
  handle: ResizeHandle,
  pointer: Point,
  lockAspect = false,
  /**
   * Hold the layer's CENTRE still instead of the opposite handle — alt in every editor.
   *
   * Only the fixed point changes; the arithmetic below is untouched, because "resize
   * about a point" is the same operation whichever point you pin.
   */
  fromCentre = false,
): LayerEditorLayer {
  const local = handleLocal(start, handle);
  const oppositeLocal = fromCentre
    ? { x: start.sourceWidth / 2, y: start.sourceHeight / 2 }
    : handleLocal(start, OPPOSITE[handle]);
  const fixed = sourceToComposition(start, oppositeLocal);

  const along = unrotate({ x: pointer.x - fixed.x, y: pointer.y - fixed.y }, start.rotation);
  const dx = local.x - oppositeLocal.x;
  const dy = local.y - oppositeLocal.y;

  let scaleX = dx !== 0 ? along.x / dx : start.scale.x;
  let scaleY = dy !== 0 ? along.y / dy : start.scale.y;

  if (lockAspect) {
    // Hold the layer's own ratio by taking the dominant axis's growth factor. Using the
    // dominant one rather than an average means the dragged corner still tracks the
    // cursor on at least one axis, which is what makes the constraint feel intentional.
    const baseX = Math.abs(start.scale.x) || MIN_SCALE;
    const baseY = Math.abs(start.scale.y) || MIN_SCALE;
    const factor = Math.max(
      dx !== 0 ? Math.abs(scaleX) / baseX : 0,
      dy !== 0 ? Math.abs(scaleY) / baseY : 0,
    );
    const signX = dx !== 0 ? Math.sign(scaleX) || 1 : Math.sign(start.scale.x) || 1;
    const signY = dy !== 0 ? Math.sign(scaleY) || 1 : Math.sign(start.scale.y) || 1;
    scaleX = baseX * factor * signX;
    scaleY = baseY * factor * signY;
  }

  const scale = {
    x: keepSign(scaleX, Math.sign(start.scale.x) || 1),
    y: keepSign(scaleY, Math.sign(start.scale.y) || 1),
  };

  // Re-place so the opposite handle lands back on `fixed`. Evaluating the transform at
  // position (0,0) gives the anchor->opposite offset under the NEW scale.
  const offset = sourceToComposition({ ...start, scale, position: { x: 0, y: 0 } }, oppositeLocal);
  return { ...start, scale, position: { x: fixed.x - offset.x, y: fixed.y - offset.y } };
}

/**
 * Rotate about the ANCHOR — which is `position`, by definition of the §4.3 model.
 *
 * The delta is measured between two pointer angles rather than set from one, so grabbing
 * a rotate handle does not snap the layer to the cursor.
 */
export function rotateLayer(
  start: LayerEditorLayer,
  startPointer: Point,
  pointer: Point,
  snapDegrees = 0,
): LayerEditorLayer {
  const angleOf = (point: Point) =>
    (Math.atan2(point.y - start.position.y, point.x - start.position.x) * 180) / Math.PI;
  const delta = angleOf(pointer) - angleOf(startPointer);
  return turnLayer(start, delta, snapDegrees);
}

/**
 * Turn a layer by a number of degrees, however that number was arrived at.
 *
 * Split out of `rotateLayer` so the keyboard path — where the delta is a keypress, not an
 * angle between two pointers — normalises through the same arithmetic instead of growing
 * a second copy that drifts the first time the range convention changes.
 */
export function turnLayer(
  start: LayerEditorLayer,
  deltaDegrees: number,
  snapDegrees = 0,
): LayerEditorLayer {
  let rotation = start.rotation + deltaDegrees;
  if (snapDegrees > 0) rotation = Math.round(rotation / snapDegrees) * snapDegrees;
  // Keep it in (-180, 180] so the inspector never shows 1440 degrees.
  rotation = ((((rotation + 180) % 360) + 360) % 360) - 180;
  return { ...start, rotation };
}

/** Where the rotate grip sits: `distance` composition pixels above the top edge. */
export function rotateHandlePoint(layer: LayerEditorLayer, distance: number): Point {
  const top = sourceToComposition(layer, { x: layer.sourceWidth / 2, y: 0 });
  const bottom = sourceToComposition(layer, {
    x: layer.sourceWidth / 2,
    y: layer.sourceHeight,
  });
  const dx = top.x - bottom.x;
  const dy = top.y - bottom.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: top.x + (dx / length) * distance, y: top.y + (dy / length) * distance };
}

/** The CSS cursor for a handle, turned with the layer so it points the right way. */
export function handleCursor(handle: ResizeHandle, rotation: number): string {
  const base: Record<ResizeHandle, number> = {
    n: 0,
    ne: 45,
    e: 90,
    se: 135,
    s: 180,
    sw: 225,
    w: 270,
    nw: 315,
  };
  const cursors = ['ns-resize', 'nesw-resize', 'ew-resize', 'nwse-resize'];
  const turned = (((base[handle] + rotation) % 180) + 180) % 180;
  return cursors[Math.round(turned / 45) % 4];
}

/**
 * Scale a whole selection about the corner opposite the one being dragged.
 *
 * UNIFORM, and offered on the four CORNER handles only. That is a deliberate limit, not
 * an unfinished one: this model stores rotation plus a per-axis scale, and squashing a
 * ROTATED layer along the group's axes produces a parallelogram — a shape the model
 * cannot represent. A non-uniform group resize would therefore have to either silently
 * distort rotated members or silently ignore their rotation. A single layer has no such
 * problem, which is why `resizeLayer` keeps all eight handles.
 *
 * Each layer's own `scale` is multiplied and its `position` is moved along the same ray
 * from the fixed corner, so the arrangement scales as one piece.
 */
export function scaleGroup(input: {
  layers: readonly LayerEditorLayer[];
  ids: readonly string[];
  handle: 'nw' | 'ne' | 'se' | 'sw';
  pointer: Point;
  /** The selection's union bounds when the gesture started. */
  bounds: Rect;
  /** Alt: hold the group's centre still instead of the opposite corner. */
  fromCentre?: boolean;
}): LayerEditorLayer[] {
  const { layers, ids, handle, pointer, bounds, fromCentre = false } = input;

  const dragged = {
    x: handle === 'nw' || handle === 'sw' ? bounds.left : bounds.right,
    y: handle === 'nw' || handle === 'ne' ? bounds.top : bounds.bottom,
  };
  const fixed = fromCentre
    ? { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 }
    : {
        x: handle === 'nw' || handle === 'sw' ? bounds.right : bounds.left,
        y: handle === 'nw' || handle === 'ne' ? bounds.bottom : bounds.top,
      };

  const spanX = dragged.x - fixed.x;
  const spanY = dragged.y - fixed.y;
  if (spanX === 0 || spanY === 0) return [...layers];

  // The dominant axis wins, so the dragged corner tracks the cursor on at least one of
  // them — the same rule `resizeLayer` uses for a shift-constrained single layer.
  const ratioX = (pointer.x - fixed.x) / spanX;
  const ratioY = (pointer.y - fixed.y) / spanY;
  const magnitude = Math.max(MIN_SCALE, Math.max(Math.abs(ratioX), Math.abs(ratioY)));
  const factor = magnitude * (Math.sign(ratioX) || 1);

  const wanted = new Set(ids);
  return layers.map((layer) => {
    if (!wanted.has(layer.id) || layer.locked) return layer;
    return {
      ...layer,
      position: {
        x: fixed.x + (layer.position.x - fixed.x) * factor,
        y: fixed.y + (layer.position.y - fixed.y) * factor,
      },
      scale: { x: layer.scale.x * factor, y: layer.scale.y * factor },
    };
  });
}

/**
 * Rotate a whole selection about its centre.
 *
 * Exactly representable, unlike a non-uniform group scale: each layer turns by the same
 * delta and its anchor swings around the group centre, which is a rotation of the whole
 * arrangement and nothing else.
 */
export function rotateGroup(input: {
  layers: readonly LayerEditorLayer[];
  ids: readonly string[];
  /** The selection's union bounds when the gesture started. */
  bounds: Rect;
  startPointer: Point;
  pointer: Point;
  snapDegrees?: number;
}): LayerEditorLayer[] {
  const { layers, ids, bounds, startPointer, pointer, snapDegrees = 0 } = input;
  const centre = {
    x: (bounds.left + bounds.right) / 2,
    y: (bounds.top + bounds.bottom) / 2,
  };
  const angleOf = (point: Point) =>
    (Math.atan2(point.y - centre.y, point.x - centre.x) * 180) / Math.PI;

  let delta = angleOf(pointer) - angleOf(startPointer);
  if (snapDegrees > 0) delta = Math.round(delta / snapDegrees) * snapDegrees;
  const radians = (delta * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  const wanted = new Set(ids);
  return layers.map((layer) => {
    if (!wanted.has(layer.id) || layer.locked) return layer;
    const dx = layer.position.x - centre.x;
    const dy = layer.position.y - centre.y;
    const rotation = ((((layer.rotation + delta + 180) % 360) + 360) % 360) - 180;
    return {
      ...layer,
      position: { x: centre.x + dx * cos - dy * sin, y: centre.y + dx * sin + dy * cos },
      rotation,
    };
  });
}

/** The four corners, which is all a group offers — see `scaleGroup` for why. */
export type CornerHandle = 'nw' | 'ne' | 'se' | 'sw';
export const GROUP_HANDLES: readonly CornerHandle[] = ['nw', 'ne', 'se', 'sw'];
