import { describe, expect, it } from 'bun:test';
import {
  createEditorProjectV2,
  type EditorTransform,
  editorProjectV2Schema,
} from '@continuum/contracts';
import { dragTransform, stageTransformAt, stageTransformEdit } from './stageTransform';
import { findClip, simulate } from './timelineEdits';

const frame = { width: 1000, height: 500 };
const start: EditorTransform = {
  position: { x: 0.3, y: 0.3, unit: 'normalized' },
  scaleX: -1,
  scaleY: 0.5,
  rotationDeg: 0,
  rotateXDeg: 0,
  rotateYDeg: 0,
  perspective: 0,
  anchorX: 0.5,
  anchorY: 0.5,
  opacity: 1,
};
const centre = { x: 300, y: 150 };

describe('dragTransform', () => {
  it('moves in normalized units, shift-locks the axis and snaps to the centre line', () => {
    const moved = dragTransform({
      gesture: 'move',
      start,
      startPointer: centre,
      pointer: { x: 496, y: 170 },
      frame,
      shift: true,
    });
    expect(moved.transform.position).toEqual({ x: 0.5, y: 0.3, unit: 'normalized' });
    expect(moved.guides).toEqual({ x: true, y: false });
  });

  it('scales uniformly about the centre, keeping the flip and clamping', () => {
    const doubled = dragTransform({
      gesture: 'scale',
      start,
      startPointer: { x: 400, y: 150 },
      pointer: { x: 300, y: 350 },
      frame,
      shift: false,
    });
    expect(doubled.transform.scaleX).toBe(-2);
    expect(doubled.transform.scaleY).toBe(1);

    const huge = dragTransform({
      gesture: 'scale',
      start,
      startPointer: { x: 301, y: 150 },
      pointer: { x: 900, y: 150 },
      frame,
      shift: false,
    });
    expect(huge.transform.scaleX).toBe(-8);
  });

  it('rotates by the pointer angle delta and snaps to 15 degrees with shift', () => {
    const turned = dragTransform({
      gesture: 'rotate',
      start,
      startPointer: { x: 300, y: 50 },
      pointer: { x: 400, y: 160 },
      frame,
      shift: true,
    });
    expect(turned.transform.rotationDeg).toBe(90);
  });
});

const animated = (interpolation: 'linear' | 'hold' = 'linear') =>
  editorProjectV2Schema.parse({
    ...createEditorProjectV2({ projectId: 'stage', title: 'Stage', width: 1000, height: 500 }),
    durationSec: 5,
    tracks: [
      {
        id: 'v',
        name: 'V',
        kind: 'video',
        order: 0,
        clips: [
          {
            id: 'parent',
            kind: 'video',
            timelineStartSec: 0,
            durationSec: 5,
            source: { sourceType: 'library_asset', assetId: 'a', renditionId: 'r' },
            keyframes: [
              {
                id: 'p0',
                property: 'transform.position',
                timeSec: 0,
                value: { x: 0.5, y: 0.5 },
                interpolation: 'linear',
              },
              {
                id: 'p1',
                property: 'transform.position',
                timeSec: 5,
                value: { x: 0.7, y: 0.6 },
                interpolation: 'linear',
              },
            ],
          },
          {
            id: 'child',
            kind: 'video',
            timelineStartSec: 1,
            durationSec: 4,
            parentClipId: 'parent',
            source: { sourceType: 'library_asset', assetId: 'a', renditionId: 'r' },
            transform: { ...start, opacity: 0.4 },
            keyframeOffsetSec: 1,
            keyframes: [
              { id: 'x0', property: 'transform.scaleX', timeSec: 0, value: -1, interpolation },
              {
                id: 'x1',
                property: 'transform.scaleX',
                timeSec: 2,
                value: -2,
                interpolation: 'linear',
              },
              {
                id: 'pos0',
                property: 'transform.position',
                timeSec: 0,
                value: { x: 0.3, y: 0.3 },
                interpolation: 'linear',
                expression: 'loop',
              },
              {
                id: 'pos1',
                property: 'transform.position',
                timeSec: 2,
                value: { x: 0.5, y: 0.5 },
                interpolation: 'linear',
                expression: 'wiggle(0.25, 0.03)',
              },
            ],
          },
        ],
      },
    ],
  });

const childOf = (project: ReturnType<typeof animated>) => {
  const clip = findClip(project, 'child')?.clip;
  if (!clip || clip.kind !== 'video') throw new Error('Missing child');
  return clip;
};

it('stage move authors the wrapped retained clock, compensates wiggle and parent, and preserves other fields', () => {
  const project = animated();
  const shown = stageTransformAt(project, childOf(project), 3.5);
  const desired = {
    ...shown,
    position: { ...shown.position, x: shown.position.x + 0.1, y: shown.position.y - 0.06 },
  };
  const edit = stageTransformEdit(project, 'child', desired, 'move', 3.5);
  if (!edit) throw new Error('Missing edit');
  const next = simulate(project, edit.forward);
  const sampled = stageTransformAt(next, childOf(next), 3.5);
  expect(sampled.position.x).toBeCloseTo(desired.position.x, 5);
  expect(sampled.position.y).toBeCloseTo(desired.position.y, 5);
  expect(childOf(next).transform).toEqual(childOf(project).transform);
  expect(childOf(next).keyframes.filter((k) => k.property !== 'transform.position')).toEqual(
    childOf(project).keyframes.filter((k) => k.property !== 'transform.position'),
  );
  expect(
    childOf(next).keyframes.find((k) => k.property === 'transform.position' && k.timeSec === 1.5)
      ?.expression,
  ).toBeUndefined();
  expect(childOf(next).keyframes.find((k) => k.id === 'pos1')?.expression).toBe(
    'wiggle(0.25, 0.03)',
  );
  expect(next.tracks[0]?.clips[0]).toEqual(project.tracks[0]?.clips[0]);
});

it('stage scale keeps axes signed and independent, edits the displayed hold stop, and respects latest locks', () => {
  const project = animated('hold');
  const shown = stageTransformAt(project, childOf(project), 1.5);
  expect([shown.scaleX, shown.scaleY]).toEqual([-2, 0.5]);
  const edit = stageTransformEdit(
    project,
    'child',
    { ...shown, scaleX: -3, scaleY: 0.75 },
    'scale',
    1.5,
  );
  if (!edit) throw new Error('Missing edit');
  const next = simulate(project, edit.forward);
  expect(stageTransformAt(next, childOf(next), 1.5)).toMatchObject({ scaleX: -3, scaleY: 0.75 });
  expect(childOf(next).keyframes.find((k) => k.id === 'x1')).toMatchObject({
    timeSec: 2,
    value: -3,
  });
  expect(childOf(next).keyframes.find((k) => k.id === 'x0')).toEqual(
    childOf(project).keyframes.find((k) => k.id === 'x0'),
  );
  expect(childOf(next).transform.opacity).toBe(0.4);
  const locked = editorProjectV2Schema.parse({
    ...project,
    tracks: project.tracks.map((t) => ({ ...t, locked: true })),
  });
  expect(stageTransformEdit(locked, 'child', shown, 'rotate', 1.5)).toBeNull();
});

it('non-center stage drags keep the pivot and convert picture-center moves back into canonical position', () => {
  const project = animated();
  const original = childOf(project);
  const changed = {
    ...original,
    transform: { ...original.transform, anchorX: 0.25, anchorY: 0.75 },
  };
  const altered = editorProjectV2Schema.parse({
    ...project,
    tracks: project.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => (clip.id === changed.id ? changed : clip)),
    })),
  });
  const shown = stageTransformAt(altered, childOf(altered), 1.5);
  const desired = { ...shown, position: { ...shown.position, x: shown.position.x + 0.1 } };
  const edit = stageTransformEdit(altered, 'child', desired, 'move', 1.5);
  if (!edit) throw new Error('Missing edit');
  const next = simulate(altered, edit.forward);
  expect(stageTransformAt(next, childOf(next), 1.5).position.x).toBeCloseTo(desired.position.x, 5);
  expect(childOf(next).transform.anchorX).toBe(0.25);
  const axis = {
    ...start,
    position: { x: 0.375, y: 0.5, unit: 'normalized' as const },
    anchorX: 0.25,
    scaleX: 0.5,
    scaleY: 0.5,
  };
  const scaled = dragTransform({
    gesture: 'scale',
    start: axis,
    startPointer: { x: 500, y: 250 },
    pointer: { x: 750, y: 250 },
    frame,
    shift: false,
  });
  expect(scaled.transform.scaleX).toBe(1);
  expect(scaled.transform.position.x).toBe(0.5);
});
