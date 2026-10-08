import { expect, test } from 'bun:test';
import { applyEditorCommandBatch, createEditorProjectV2 } from './editor-project-reducer';
import {
  type EditorCommand,
  type EditorProjectV2,
  editorProjectV2Schema,
} from './editor-project-v2';
import {
  parentPositionDelta,
  parentPositionTracks,
  sampleParentPositionTracks,
} from './motion-parent';

test('parentPositionDelta adds the parent motion offset', () => {
  const overlay = {
    id: 'overlay',
    name: 'Overlay',
    order: 0,
    kind: 'overlay' as const,
    clips: [
      {
        id: 'parent',
        kind: 'overlay' as const,
        mediaKind: 'image' as const,
        timelineStartSec: 0,
        durationSec: 2,
        source: { sourceType: 'library_asset' as const, assetId: 'a', renditionId: 'v' },
        transform: {
          position: { x: 0.5, y: 0.5, unit: 'normalized' as const },
          scaleX: 1,
          scaleY: 1,
          rotationDeg: 0,
          rotateXDeg: 0,
          rotateYDeg: 0,
          perspective: 0,
          anchorX: 0.5,
          anchorY: 0.5,
          opacity: 1,
        },
        keyframes: [
          {
            id: 'p0',
            property: 'transform.position' as const,
            timeSec: 0,
            value: { x: 0.5, y: 0.5 },
            interpolation: 'linear' as const,
          },
          {
            id: 'p1',
            property: 'transform.position' as const,
            timeSec: 2,
            value: { x: 0.7, y: 0.5 },
            interpolation: 'linear' as const,
          },
        ],
      },
      {
        id: 'child',
        kind: 'overlay' as const,
        mediaKind: 'image' as const,
        timelineStartSec: 0,
        durationSec: 2,
        parentClipId: 'parent',
        source: { sourceType: 'library_asset' as const, assetId: 'b', renditionId: 'v' },
      },
    ],
  };
  const project = editorProjectV2Schema.parse({
    ...createEditorProjectV2({
      projectId: '11111111-1111-4111-8111-111111111111',
      title: 'Parent',
      width: 1080,
      height: 1080,
    }),
    durationSec: 2,
    tracks: [overlay],
  });
  expect(parentPositionDelta(project, 'child', 1).x).toBeCloseTo(0.1);
});

function parentClockProject(): EditorProjectV2 {
  return editorProjectV2Schema.parse({
    ...createEditorProjectV2({
      projectId: 'parents',
      title: 'Parent clocks',
      width: 360,
      height: 640,
    }),
    durationSec: 7,
    tracks: [
      {
        id: 'titles',
        name: 'Titles',
        kind: 'text',
        order: 0,
        clips: [
          {
            id: 'grandparent',
            kind: 'text',
            text: 'G',
            timelineStartSec: 1,
            durationSec: 1,
            style: { fontFamily: 'Arial', fontSizePx: 64, fontWeight: 700, color: '#fff' },
            keyframes: [
              {
                id: 'g0',
                property: 'transform.position',
                timeSec: 0,
                value: { x: 0.5, y: 0.5 },
                interpolation: 'linear',
              },
              {
                id: 'g4',
                property: 'transform.position',
                timeSec: 4,
                value: { x: 0.5, y: 0.9 },
                interpolation: 'linear',
              },
            ],
          },
          {
            id: 'parent',
            parentClipId: 'grandparent',
            kind: 'text',
            text: 'P',
            timelineStartSec: 2,
            durationSec: 1,
            keyframeOffsetSec: 1,
            style: { fontFamily: 'Arial', fontSizePx: 64, fontWeight: 700, color: '#fff' },
            keyframes: [
              {
                id: 'p0',
                property: 'transform.position',
                timeSec: 0,
                value: { x: 0.5, y: 0.5 },
                interpolation: 'linear',
              },
              {
                id: 'p4',
                property: 'transform.position',
                timeSec: 4,
                value: { x: 0.9, y: 0.5 },
                interpolation: 'linear',
              },
            ],
          },
          {
            id: 'child',
            parentClipId: 'parent',
            kind: 'text',
            text: 'C',
            timelineStartSec: 3,
            durationSec: 4,
            style: { fontFamily: 'Arial', fontSizePx: 64, fontWeight: 700, color: '#fff' },
          },
        ],
      },
    ],
  });
}

test('serialized parent chains keep separate offsets and full curves beyond visibility', () => {
  const project = parentClockProject();
  const compiled = parentPositionTracks(project, 'child');
  const tracks: typeof compiled = JSON.parse(JSON.stringify(compiled));
  expect(tracks.map((track: { startOffsetSec: number }) => track.startOffsetSec)).toEqual([1, 2]);
  const at = sampleParentPositionTracks(tracks, 1);
  expect(at.x).toBeCloseTo(0.3, 12);
  expect(at.y).toBeCloseTo(0.3, 12);
  expect(parentPositionDelta(project, 'child', 4)).toEqual(at);
  const before = sampleParentPositionTracks(tracks, -3);
  expect(before.x).toBeCloseTo(0.1, 12);
  expect(before.y).toBe(0);
  const after = sampleParentPositionTracks(tracks, 4);
  expect(after.x).toBeCloseTo(0.4, 12);
  expect(after.y).toBeCloseTo(0.4, 12);
});

type CommandDraft = {
  [Type in EditorCommand['commandType']]: Omit<
    Extract<EditorCommand, { commandType: Type }>,
    'commandId' | 'idempotencyKey' | 'expectedRevision' | 'issuedAt' | 'actor'
  >;
}[EditorCommand['commandType']];

function edit(project: EditorProjectV2, drafts: CommandDraft[]): EditorProjectV2 {
  const actor = { actorId: 'parent-clock-owner', actorType: 'user' as const };
  const issuedAt = '2026-10-02T00:00:00.000Z';
  const metadata = { actor, issuedAt, expectedRevision: project.revision };
  return applyEditorCommandBatch(project, {
    ...metadata,
    batchId: `batch-${project.revision}`,
    idempotencyKey: `batch-key-${project.revision}`,
    projectId: project.projectId,
    sequenceId: project.sequenceId,
    expectedFingerprint: project.fingerprint,
    atomic: true,
    commands: drafts.map((draft, index) => ({
      ...draft,
      ...metadata,
      commandId: `command-${project.revision}-${index}`,
      idempotencyKey: `command-key-${project.revision}-${index}`,
    })),
  });
}

function cutParents(project: EditorProjectV2): EditorProjectV2 {
  return edit(project, [
    {
      commandType: 'split_clip',
      trackId: 'titles',
      clipId: 'parent',
      splitAtSec: 0.5,
      rightClipId: 'parent-right',
    },
    {
      commandType: 'split_clip',
      trackId: 'titles',
      clipId: 'child',
      splitAtSec: 1,
      rightClipId: 'child-right',
    },
    { commandType: 'remove_clip', trackId: 'titles', clipId: 'parent' },
    { commandType: 'remove_clip', trackId: 'titles', clipId: 'grandparent' },
    { commandType: 'remove_clip', trackId: 'titles', clipId: 'child' },
    {
      commandType: 'move_clip',
      clipId: 'parent-right',
      fromTrackId: 'titles',
      toTrackId: 'titles',
      timelineStartSec: 0,
      preserveParentMotion: true,
    },
    {
      commandType: 'move_clip',
      clipId: 'child-right',
      fromTrackId: 'titles',
      toTrackId: 'titles',
      timelineStartSec: 0,
      preserveParentMotion: true,
    },
  ]);
}

test('native cuts retain chained ancestor clocks, removed parents and repeated cuts after reload', () => {
  const before = parentClockProject();
  const cut = editorProjectV2Schema.parse(JSON.parse(JSON.stringify(cutParents(before))));
  for (const localSec of [-4, -2, 0, 0.2, 0.7, 2]) {
    expect(parentPositionDelta(cut, 'child-right', localSec)).toEqual(
      parentPositionDelta(before, 'child', 4 + localSec),
    );
  }
  const child = cut.tracks[0]!.clips.find((clip) => clip.id === 'child-right')!;
  expect(child.parentClipId).toBe('parent-right');
  expect(
    child.parentMotionBinding?.ancestors.map((ancestor) => Boolean(ancestor.fallback)),
  ).toEqual([false, true]);
  const twice = edit(cut, [
    {
      commandType: 'split_clip',
      trackId: 'titles',
      clipId: 'child-right',
      splitAtSec: 0.5,
      rightClipId: 'child-final',
    },
    { commandType: 'remove_clip', trackId: 'titles', clipId: 'child-right' },
    {
      commandType: 'move_clip',
      clipId: 'child-final',
      fromTrackId: 'titles',
      toTrackId: 'titles',
      timelineStartSec: 0,
      preserveParentMotion: true,
    },
  ]);
  expect(parentPositionDelta(twice, 'child-final', 0.2)).toEqual(
    parentPositionDelta(before, 'child', 4.7),
  );
  const withoutParent = edit(twice, [
    { commandType: 'remove_clip', trackId: 'titles', clipId: 'parent-right' },
  ]);
  expect(parentPositionDelta(withoutParent, 'child-final', 0.2)).toEqual(
    parentPositionDelta(before, 'child', 4.7),
  );
});

test('retained inheritance still responds to live ancestor keys, intentional moves and reparenting', () => {
  let project = cutParents(parentClockProject());
  project = edit(project, [
    {
      commandType: 'set_keyframes',
      trackId: 'titles',
      clipId: 'parent-right',
      keyframes: [
        {
          id: 'p0',
          property: 'transform.position',
          timeSec: 0,
          value: { x: 0.5, y: 0.5 },
          interpolation: 'linear',
        },
        {
          id: 'p4',
          property: 'transform.position',
          timeSec: 4,
          value: { x: 1.3, y: 0.5 },
          interpolation: 'linear',
        },
      ],
    },
  ]);
  expect(parentPositionDelta(project, 'child-right', 0.2).x).toBeCloseTo(0.64, 12);
  project = edit(project, [
    {
      commandType: 'move_clip',
      clipId: 'parent-right',
      fromTrackId: 'titles',
      toTrackId: 'titles',
      timelineStartSec: 0.2,
    },
  ]);
  expect(parentPositionDelta(project, 'child-right', 0.2).x).toBeCloseTo(0.6, 12);
  project = edit(project, [
    {
      commandType: 'move_clip',
      clipId: 'child-right',
      fromTrackId: 'titles',
      toTrackId: 'titles',
      timelineStartSec: 0.5,
    },
  ]);
  expect(parentPositionDelta(project, 'child-right', 0.7).x).toBeCloseTo(0.7, 12);
  project = edit(project, [
    {
      commandType: 'set_clip_parent',
      trackId: 'titles',
      clipId: 'parent-right',
      parentClipId: null,
    },
  ]);
  const child = project.tracks[0]!.clips.find((clip) => clip.id === 'child-right')!;
  expect(child.parentMotionBinding).toBeUndefined();
  expect(parentPositionDelta(project, 'child-right', 0.7).x).toBeCloseTo(0.4, 12);
  expect(() =>
    edit(project, [
      {
        commandType: 'set_clip_parent',
        trackId: 'titles',
        clipId: 'parent-right',
        parentClipId: 'child-right',
      },
    ]),
  ).toThrow('cycle');
  project = edit(project, [
    {
      commandType: 'set_clip_parent',
      trackId: 'titles',
      clipId: 'child-right',
      parentClipId: null,
    },
  ]);
  expect(parentPositionTracks(project, 'child-right')).toEqual([]);
});

test('retained inheritance keeps hold, Bezier, spring and expression curves beyond parent visibility', () => {
  for (const interpolation of ['hold', 'linear', 'bezier', 'spring'] as const) {
    const fixture = parentClockProject();
    const before = editorProjectV2Schema.parse({
      ...fixture,
      tracks: fixture.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) =>
          'keyframes' in clip
            ? {
                ...clip,
                keyframes: clip.keyframes.map((key) => ({
                  ...key,
                  interpolation,
                  ...(interpolation === 'bezier'
                    ? { easing: { x1: 0.42, y1: 0, x2: 0.58, y2: 1 } }
                    : {}),
                  ...(interpolation === 'spring' ? { spring: { bounce: 0.3 } } : {}),
                  expression: 'wiggle(0.7,0.02)',
                })),
              }
            : clip,
        ),
      })),
    });
    const cut = cutParents(before);
    for (const localSec of [-4, -2, 0, 0.2, 0.7, 2]) {
      expect(parentPositionDelta(cut, 'child-right', localSec)).toEqual(
        parentPositionDelta(before, 'child', 4 + localSec),
      );
    }
    // A new child must inherit the retained grandparent even after its visible clip was removed.
    const child = cut.tracks[0]!.clips.find((clip) => clip.id === 'child-right')!;
    const newChild = edit(cut, [
      {
        commandType: 'upsert_clip',
        trackId: 'titles',
        clip: {
          ...child,
          id: 'new-child',
          parentMotionBinding: undefined,
        },
      },
    ]);
    expect(parentPositionTracks(newChild, 'new-child')).toHaveLength(2);
  }
});

test('start trims advance inherited age; ordinary moves in a cut batch retain their intentional shift', () => {
  const before = parentClockProject();
  const trimmed = edit(before, [
    {
      commandType: 'trim_clip',
      trackId: 'titles',
      clipId: 'child',
      timelineStartSec: 4,
      durationSec: 3,
    },
  ]);
  expect(parentPositionDelta(trimmed, 'child', 4.2)).toEqual(
    parentPositionDelta(before, 'child', 4.2),
  );
  const moved = edit(before, [
    {
      commandType: 'split_clip',
      trackId: 'titles',
      clipId: 'child',
      splitAtSec: 1,
      rightClipId: 'right',
    },
    {
      commandType: 'move_clip',
      clipId: 'right',
      fromTrackId: 'titles',
      toTrackId: 'titles',
      timelineStartSec: 5,
    },
    {
      commandType: 'move_clip',
      clipId: 'parent',
      fromTrackId: 'titles',
      toTrackId: 'titles',
      timelineStartSec: 2.5,
    },
  ]);
  const delta = parentPositionDelta(moved, 'right', 5.2);
  expect(delta.x).toBeCloseTo(0.37, 12);
  expect(delta.y).toBeCloseTo(0.4, 12);
});
