// The Video Studio stage gizmo's arithmetic, in FRAME pixels in and normalized
// EditorTransform out.
//
// Not `utils/layers/layerGizmo.ts`: that model is composition pixels with an anchor in
// source pixels (LayerEditorLayer), while an EditorTransform is a normalized centre with
// scale relative to the frame. Bridging would mean faking a layer per pointer move.

import {
  type EditorClip,
  type EditorKeyframe,
  type EditorProjectV2,
  type EditorTransform,
  motionTrackTime,
  parentPositionDelta,
  parseMotionExpression,
  sampleNumericTrack,
} from '@continuum/contracts';
import { clipEffectSpecFromEditorClip } from '@/lib/client-render/executors/timelineEditor';
import type { Point } from '../../../utils/layers/layerTransform';
import { resolveTransformAt } from '../../../utils/render/effectSpec';
import { findClip, replaceClipEdit, type TimelineEdit } from './timelineEdits';

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

type StageClip = Extract<EditorClip, { kind: 'video' | 'overlay' | 'text' | 'nested_sequence' }>;

/** Handles use exactly the geometry drawn by preview and export. */
export function stageTransformAt(
  project: EditorProjectV2,
  clip: StageClip,
  timelineSec: number,
): EditorTransform {
  const sampled = resolveTransformAt(
    clipEffectSpecFromEditorClip(clip, project),
    (timelineSec - clip.timelineStartSec) / clip.durationSec,
  );
  return {
    ...clip.transform,
    position: { ...clip.transform.position, x: sampled.offsetX + 0.5, y: sampled.offsetY + 0.5 },
    scaleX: sampled.scaleX,
    scaleY: sampled.scaleY,
    rotationDeg: sampled.rotate,
  };
}

/** Author only the gesture's channels against the latest project, at its captured playhead. */
export function stageTransformEdit(
  project: EditorProjectV2,
  clipId: string,
  shown: EditorTransform,
  gesture: StageGesture,
  timelineSec: number,
): TimelineEdit | null {
  const found = findClip(project, clipId);
  if (
    !found ||
    found.track.locked ||
    found.clip.locked ||
    !found.clip.enabled ||
    !found.track.enabled ||
    !Number.isFinite(timelineSec) ||
    timelineSec < found.clip.timelineStartSec ||
    timelineSec >= found.clip.timelineStartSec + found.clip.durationSec ||
    !['video', 'overlay', 'text', 'nested_sequence'].includes(found.clip.kind)
  )
    return null;
  const clip = found.clip as StageClip;
  const parent = parentPositionDelta(project, clipId, timelineSec);
  const values: Array<[EditorKeyframe['property'], EditorKeyframe['value']]> =
    gesture === 'move'
      ? [['transform.position', { x: shown.position.x - parent.x, y: shown.position.y - parent.y }]]
      : gesture === 'scale'
        ? [
            ['transform.scaleX', shown.scaleX],
            ['transform.scaleY', shown.scaleY],
          ]
        : [['transform.rotationDeg', shown.rotationDeg]];
  let transform = { ...clip.transform };
  let keyframes = [...clip.keyframes];
  const clock = timelineSec - clip.timelineStartSec + (clip.keyframeOffsetSec ?? 0);
  for (const [property, target] of values) {
    const keys = clip.keyframes
      .filter((key) => key.property === property)
      .toSorted((a, b) => a.timeSec - b.timeSec);
    const timeSec = motionTrackTime(keys, clock);
    const noise = sampleNumericTrack(
      keys.map((key) => ({ ...key, value: 0 })),
      clock,
      0,
    );
    const value =
      typeof target === 'number'
        ? target - noise
        : typeof target === 'object' && target && 'x' in target
          ? { x: target.x - noise, y: target.y - noise }
          : target;
    if (!keys.length || timeSec < keys[0]!.timeSec - 1e-6) {
      if (property === 'transform.position' && typeof value === 'object' && value && 'x' in value)
        transform = { ...transform, position: { ...transform.position, x: value.x, y: value.y } };
      else if (property === 'transform.scaleX' && typeof value === 'number')
        transform.scaleX = value;
      else if (property === 'transform.scaleY' && typeof value === 'number')
        transform.scaleY = value;
      else if (property === 'transform.rotationDeg' && typeof value === 'number')
        transform.rotationDeg = value;
      continue;
    }
    const right = keys.find((key) => key.timeSec > timeSec);
    const left = keys.findLast((key) => key.timeSec <= timeSec);
    // Hold displays the arriving stop for the entire span, so edit that stop.
    const same =
      keys.length === 1 && parseMotionExpression(keys[0]?.expression)?.kind === 'loop'
        ? keys[0]
        : left?.interpolation === 'hold' && right
          ? right
          : keys.find((key) => Math.abs(key.timeSec - timeSec) <= 0.001);
    const key: EditorKeyframe = same
      ? { ...same, value }
      : {
          id: crypto.randomUUID(),
          property,
          timeSec,
          value,
          interpolation: left?.interpolation ?? 'linear',
          ...(left?.easing ? { easing: left.easing } : {}),
          ...(left?.spring ? { spring: left.spring } : {}),
        };
    keyframes = same
      ? keyframes.map((existing) => (existing.id === same.id ? key : existing))
      : [...keyframes, key];
  }
  return replaceClipEdit(project, { ...clip, transform, keyframes }, 'Transform clip');
}
