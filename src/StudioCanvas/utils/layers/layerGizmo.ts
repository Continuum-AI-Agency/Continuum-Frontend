import type { LayerEditorLayer } from '../../types';
import { type Point, sourceToComposition, unrotate } from './layerTransform';

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
): LayerEditorLayer {
  const local = handleLocal(start, handle);
  const oppositeLocal = handleLocal(start, OPPOSITE[handle]);
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
  let rotation = start.rotation + delta;
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
