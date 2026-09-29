// The Video Studio stage gizmo's arithmetic, in FRAME pixels in and normalized
// EditorTransform out.
//
// Not `utils/layers/layerGizmo.ts`: that model is composition pixels with an anchor in
// source pixels (LayerEditorLayer), while an EditorTransform is a normalized centre with
// scale relative to the frame. Bridging would mean faking a layer per pointer move.

import type { EditorTransform } from '@continuum/contracts';
import type { Point } from '../../../utils/layers/layerTransform';

export type StageGesture = 'move' | 'scale' | 'rotate';
export type StageGuides = { x: boolean; y: boolean };

const SNAP_DISTANCE = 0.01;
const ROTATE_SNAP_DEG = 15;
const MIN_SCALE = 0.05;
const MAX_SCALE = 8;

const angleDeg = (point: Point, centre: Point) =>
  (Math.atan2(point.y - centre.y, point.x - centre.x) * 180) / Math.PI;

const scaleAxis = (value: number, factor: number) =>
  (Math.sign(value) || 1) * Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.abs(value) * factor));

const snapToCentre = (value: number) =>
  Math.abs(value - 0.5) < SNAP_DISTANCE ? { value: 0.5, snapped: true } : { value, snapped: false };

/** `shift` constrains a move to one axis and snaps a rotation to 15°. */
export function dragTransform(input: {
  gesture: StageGesture;
  start: EditorTransform;
  startPointer: Point;
  pointer: Point;
  frame: { width: number; height: number };
  shift: boolean;
}): { transform: EditorTransform; guides: StageGuides } {
  const { gesture, start, startPointer, pointer, frame, shift } = input;
  const centre = { x: start.position.x * frame.width, y: start.position.y * frame.height };
  const none: StageGuides = { x: false, y: false };

  if (gesture === 'move') {
    let dx = pointer.x - startPointer.x;
    let dy = pointer.y - startPointer.y;
    if (shift) {
      if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    const x = snapToCentre(start.position.x + dx / frame.width);
    const y = snapToCentre(start.position.y + dy / frame.height);
    return {
      transform: { ...start, position: { ...start.position, x: x.value, y: y.value } },
      guides: { x: x.snapped, y: y.snapped },
    };
  }

  if (gesture === 'scale') {
    const from = Math.hypot(startPointer.x - centre.x, startPointer.y - centre.y);
    if (from < 1) return { transform: start, guides: none };
    const factor = Math.hypot(pointer.x - centre.x, pointer.y - centre.y) / from;
    return {
      transform: {
        ...start,
        scaleX: scaleAxis(start.scaleX, factor),
        scaleY: scaleAxis(start.scaleY, factor),
      },
      guides: none,
    };
  }

  // A delta between two pointer angles, so grabbing the grip slightly off-centre does
  // not jump the clip to the cursor.
  let rotation = start.rotationDeg + angleDeg(pointer, centre) - angleDeg(startPointer, centre);
  if (shift) rotation = Math.round(rotation / ROTATE_SNAP_DEG) * ROTATE_SNAP_DEG;
  rotation = ((((rotation + 180) % 360) + 360) % 360) - 180;
  return { transform: { ...start, rotationDeg: rotation }, guides: none };
}
