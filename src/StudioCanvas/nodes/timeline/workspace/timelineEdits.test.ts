import { describe, expect, test } from 'bun:test';
import {
  createEditorProjectV2,
  type EditorProjectV2,
  editorProjectV2Schema,
  type VideoEditorPoolAsset,
} from '@continuum/contracts';
import {
  addMarkerEdit,
  clipEnd,
  clipRows,
  deleteClipsEdit,
  duplicateClipsEdit,
  finalizeEdit,
  findClip,
  laneTracks,
  mainEndSec,
  mainVideoTrack,
  moveClipEdit,
  nudgeClipsEdit,
  placeAssetEdit,
  replaceClipEdit,
  setTrackStateEdit,
  simulate,
  splitEdit,
  type TimelineEdit,
  trackStateEdit,
  trimEdit,
  trimToPlayheadEdit,
} from './timelineEdits';

const video = (assetId: string, durationSec: number): VideoEditorPoolAsset => ({
  assetId,
  versionId: `${assetId}-v1`,
  kind: 'video',
  title: assetId,
  durationSec,
  origin: 'project',
});

const commit = (project: EditorProjectV2, edit: TimelineEdit | null): EditorProjectV2 => {
  if (!edit) throw new Error('expected an edit');
  return simulate(project, finalizeEdit(project, edit).forward);
};

const mainClips = (project: EditorProjectV2) =>
  (mainVideoTrack(project)?.clips ?? [])
    .toSorted((left, right) => left.timelineStartSec - right.timelineStartSec)
    .map((clip) => [clip.name, round(clip.timelineStartSec), round(clip.durationSec)]);

const round = (sec: number) => Math.round(sec * 1_000) / 1_000;

const blank = () =>
  createEditorProjectV2({ projectId: 'p1', title: 'Edit', width: 1080, height: 1920 });

test('native edits follow the project frame grid and conserve bounded source intervals', () => {
  for (const frameRate of [
    { numerator: 24, denominator: 1 },
    { numerator: 30, denominator: 1 },
    { numerator: 30000, denominator: 1001 },
  ]) {
    const fps = frameRate.numerator / frameRate.denominator;
    const base = { ...blank(), frameRate };
    let project = commit(base, placeAssetEdit(base, video('a', 120 / fps), { atSec: 0 }));
    const id = project.tracks[0]!.clips[0]!.id;
    project = editorProjectV2Schema.parse({
      ...project,
      tracks: [
        {
          ...project.tracks[0],
          clips: [
            {
              ...project.tracks[0]!.clips[0],
              sourceInSec: 0.2,
              playbackRate: 1.5,
            },
          ],
        },
      ],
    });
    project = commit(project, trimEdit(project, id, 'end', 83.2 / fps));
    const ended = mainVideoTrack(project)!.clips[0]!;
    expect(ended.durationSec * fps).toBeCloseTo(83, 8);
    const sourceEnd = ended.sourceInSec + ended.durationSec * ended.playbackRate;
    project = commit(project, trimEdit(project, id, 'start', 7.2 / fps));
    const trimmed = mainVideoTrack(project)!.clips[0]!;
    expect(trimmed.durationSec * fps).toBeCloseTo(76, 8);
    expect(trimmed.sourceInSec + trimmed.durationSec * trimmed.playbackRate).toBeCloseTo(
      sourceEnd,
      8,
    );
    project = commit(project, splitEdit(project, [id], 31.2 / fps));
    const [left, right] = mainVideoTrack(project)!.clips;
    expect(left!.durationSec * fps).toBeCloseTo(31, 8);
    expect(right!.durationSec * fps).toBeCloseTo(45, 8);
    expect(left!.sourceInSec + left!.durationSec * left!.playbackRate).toBeCloseTo(
      right!.sourceInSec,
      8,
    );
    project = commit(project, addMarkerEdit(project, 10.2 / fps));
    expect(project.markers[0]!.timeSec * fps).toBeCloseTo(10, 8);
    project = editorProjectV2Schema.parse({
      ...project,
      tracks: [
        ...project.tracks,
        {
          ...project.tracks[0],
          id: 'v2',
          order: 1,
          clips: [{ ...left, id: 'free', timelineStartSec: 0 }],
        },
      ],
    });
    project = commit(project, moveClipEdit(project, 'free', 'v2', 7.2 / fps));
    project = commit(project, nudgeClipsEdit(project, ['free'], 2.2 / fps));
    expect(findClip(project, 'free')!.clip.timelineStartSec * fps).toBeCloseTo(9, 8);
    const bounded = commit(project, trimEdit(project, 'free', 'end', 100, sourceEnd));
    const clip = findClip(bounded, 'free')!.clip;
    expect(clipEnd(clip) * fps).toBeCloseTo(Math.round(clipEnd(clip) * fps), 8);
    expect(
      'sourceInSec' in clip &&
        'playbackRate' in clip &&
        clip.sourceInSec + clip.durationSec * clip.playbackRate <= sourceEnd + 1e-9,
    ).toBe(true);
  }
});

test('inspector replacement honors the latest clip and track locks', () => {
  const project = commit(blank(), placeAssetEdit(blank(), video('a', 4), { atSec: 0 }));
  const clip = project.tracks[0].clips[0];
  expect(replaceClipEdit(project, { ...clip, name: 'Changed' })).not.toBeNull();
  const locked = editorProjectV2Schema.parse({
    ...project,
    tracks: [{ ...project.tracks[0], clips: [{ ...clip, locked: true }] }],
  });
  expect(replaceClipEdit(locked, { ...clip, locked: false, name: 'Changed' })).toBeNull();
  const lockedTrack = editorProjectV2Schema.parse({
    ...project,
    tracks: [{ ...project.tracks[0], locked: true }],
  });
  expect(replaceClipEdit(lockedTrack, clip)).toBeNull();
});

test('nested lanes split their source clock and bound trims to the child duration', () => {
  const base = commit(blank(), placeAssetEdit(blank(), video('a', 10), { atSec: 0 }));
  const project = editorProjectV2Schema.parse({
    ...base,
    nestedSequences: [
      { id: 'child', name: 'Child', canvas: base.canvas, durationSec: 4, tracks: [] },
    ],
    tracks: [
      ...base.tracks,
      {
        id: 'groups',
        name: 'Groups',
        kind: 'nested_sequence',
        order: 2,
        clips: [
          {
            id: 'group',
            kind: 'nested_sequence',
            sequenceId: 'child',
            timelineStartSec: 2,
            durationSec: 1,
            sourceInSec: 1,
            playbackRate: 2,
          },
        ],
      },
    ],
  });
  expect(laneTracks(project)[0]?.id).toBe('groups');
  const split = commit(project, splitEdit(project, ['group'], 2.5));
  const pieces = split.tracks.find((track) => track.id === 'groups')?.clips;
  expect(
    pieces?.map((clip) => [
      clip.timelineStartSec,
      clip.durationSec,
      'sourceInSec' in clip ? clip.sourceInSec : -1,
    ]),
  ).toEqual([
    [2, 0.5, 1],
    [2.5, 0.5, 2],
  ]);
  const extendedStart = commit(project, trimEdit(project, 'group', 'start', 0));
  const earlier = findClip(extendedStart, 'group')?.clip;
  expect(earlier?.timelineStartSec).toBe(1.5);
  expect(earlier && 'sourceInSec' in earlier ? earlier.sourceInSec : -1).toBe(0);
  const extendedEnd = commit(project, trimEdit(project, 'group', 'end', 9));
  expect(findClip(extendedEnd, 'group')?.clip.durationSec).toBe(1.5);
});

describe('magnetic main track', () => {
  test('drops pack end to end, and a drop time picks the slot', () => {
    let project = commit(blank(), placeAssetEdit(blank(), video('a', 4), { atSec: 9 }));
    project = commit(project, placeAssetEdit(project, video('b', 2), { atSec: 9 }));
    project = commit(project, placeAssetEdit(project, video('c', 1), { atSec: 0.5 }));
    expect(mainClips(project)).toEqual([
      ['c', 0, 1],
      ['a', 1, 4],
      ['b', 5, 2],
    ]);
    expect(project.durationSec).toBe(7);
  });

  test('split, ripple delete and trim keep it packed from zero', () => {
    let project = commit(blank(), placeAssetEdit(blank(), video('a', 6), { atSec: 0 }));
    project = commit(project, splitEdit(project, [], 2));
    expect(mainClips(project)).toEqual([
      ['a', 0, 2],
      ['a', 2, 4],
    ]);
    const [left] = mainVideoTrack(project)?.clips ?? [];
    project = commit(project, deleteClipsEdit(project, [left.id], true));
    expect(mainClips(project)).toEqual([['a', 0, 4]]);
    const [only] = mainVideoTrack(project)?.clips ?? [];
    project = commit(project, trimEdit(project, only.id, 'start', 1));
    const trimmed = findClip(project, only.id)?.clip;
    expect(trimmed?.timelineStartSec).toBe(0);
    expect(trimmed?.durationSec).toBe(3);
    expect(trimmed && 'sourceInSec' in trimmed ? trimmed.sourceInSec : -1).toBe(3);
  });

  test('an end trim cannot run past the source; with no known length it only shrinks', () => {
    const project = commit(blank(), placeAssetEdit(blank(), video('a', 4), { atSec: 0 }));
    const [clip] = mainVideoTrack(project)?.clips ?? [];
    expect(trimEdit(project, clip.id, 'end', 9)).toBeNull();
    const extended = commit(
      commit(project, trimEdit(project, clip.id, 'end', 2)),
      trimEdit(commit(project, trimEdit(project, clip.id, 'end', 2)), clip.id, 'end', 9, 4),
    );
    expect(findClip(extended, clip.id)?.clip.durationSec).toBe(4);
  });

  test('Q and W trim to the playhead', () => {
    let project = commit(blank(), placeAssetEdit(blank(), video('a', 6), { atSec: 0 }));
    project = commit(project, trimToPlayheadEdit(project, [], 'end', 5));
    expect(mainClips(project)).toEqual([['a', 0, 5]]);
    project = commit(project, trimToPlayheadEdit(project, [], 'start', 1));
    expect(mainClips(project)).toEqual([['a', 0, 4]]);
  });
});

describe('lanes', () => {
  test('a clip crosses from V1 to V2 and back; V1 re-packs each way', () => {
    let project = commit(blank(), placeAssetEdit(blank(), video('a', 3), { atSec: 0 }));
    project = commit(project, placeAssetEdit(project, video('b', 3), { atSec: 9 }));
    project = commit(project, {
      label: 'add V2',
      forward: [
        {
          commandType: 'add_track',
          track: {
            id: 'v2',
            name: 'V2',
            order: 5,
            enabled: true,
            locked: false,
            muted: false,
            solo: false,
            kind: 'video',
            clips: [],
          },
        },
      ],
    });
    const a = mainVideoTrack(project)?.clips.find((clip) => clip.name === 'a');
    if (!a) throw new Error('missing a');
    project = commit(project, moveClipEdit(project, a.id, 'v2', 1));
    expect(mainClips(project)).toEqual([['b', 0, 3]]);
    expect(findClip(project, a.id)?.track.id).toBe('v2');
    // On V2 it hung past V1's 3 s end, so it was fitted to it — export needs that.
    expect(findClip(project, a.id)?.clip.durationSec).toBe(2);
    project = commit(project, moveClipEdit(project, a.id, mainVideoTrack(project)?.id ?? '', 2));
    expect(mainClips(project)).toEqual([
      ['b', 0, 3],
      ['a', 3, 2],
    ]);
    expect(laneTracks(project).map((track) => track.id)).toEqual([
      'v2',
      mainVideoTrack(project)?.id,
    ]);
  });

  test('stills become layers, audio past the main end is trimmed to it', () => {
    let project = commit(blank(), placeAssetEdit(blank(), video('a', 3), { atSec: 0 }));
    project = commit(
      project,
      placeAssetEdit(
        project,
        { ...video('logo', 0), kind: 'image', durationSec: undefined },
        {
          atSec: 1,
        },
      ),
    );
    project = commit(
      project,
      placeAssetEdit(project, { ...video('song', 30), kind: 'audio' }, { atSec: 0 }),
    );
    const kinds = laneTracks(project).map((track) => [track.kind, track.clips[0]?.durationSec]);
    expect(kinds).toEqual([
      ['overlay', 2],
      ['video', 3],
      ['audio', 3],
    ]);
    expect(project.durationSec).toBe(mainEndSec(project));
  });

  test('duplicate lands right after the original', () => {
    let project = commit(blank(), placeAssetEdit(blank(), video('a', 2), { atSec: 0 }));
    const [clip] = mainVideoTrack(project)?.clips ?? [];
    project = commit(project, duplicateClipsEdit(project, [clip.id]));
    expect(mainClips(project)).toEqual([
      ['a', 0, 2],
      ['a', 2, 2],
    ]);
  });
});

describe('other lanes follow the main track', () => {
  const withCaption = (project: EditorProjectV2, startSec: number) =>
    simulate(project, [
      {
        commandType: 'add_track',
        track: {
          id: 'captions',
          name: 'Captions',
          order: 9,
          enabled: true,
          locked: false,
          muted: false,
          solo: false,
          kind: 'caption',
          clips: [],
        },
      },
      {
        commandType: 'upsert_clip',
        trackId: 'captions',
        clip: {
          id: 'cap',
          kind: 'caption',
          text: 'hello there',
          language: 'en',
          timelineStartSec: startSec,
          durationSec: 1,
          enabled: true,
          locked: false,
          tags: [],
          highlightMode: 'word',
          words: [
            { text: 'hello', startSec: 0.1, endSec: 0.4 },
            { text: 'there', startSec: 0.5, endSec: 0.9 },
          ],
          style: { fontFamily: 'Inter', fontSizePx: 64, fontWeight: 700, color: '#ffffff' },
          transform: {
            position: { x: 0.5, y: 0.85, unit: 'normalized' },
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
        },
      },
    ]);
  const threeClips = () => {
    let project = commit(blank(), placeAssetEdit(blank(), video('a', 2), { atSec: 0 }));
    project = commit(project, placeAssetEdit(project, video('b', 2), { atSec: 9 }));
    return commit(project, placeAssetEdit(project, video('c', 2), { atSec: 9 }));
  };

  test('a ripple delete on V1 moves a caption after the cut by the deleted time, words untouched', () => {
    let project = withCaption(threeClips(), 3);
    const [a] = mainVideoTrack(project)?.clips.filter((clip) => clip.name === 'a') ?? [];
    project = commit(project, deleteClipsEdit(project, [a.id], true));
    const caption = findClip(project, 'cap')?.clip;
    expect(caption?.timelineStartSec).toBe(1);
    expect(caption && 'words' in caption ? caption.words.map((word) => word.startSec) : []).toEqual(
      [0.1, 0.5],
    );
  });

  test.each([
    { name: 'matching ranges', start: 2, duration: 2, ripple: true, main: true, expected: 3 },
    {
      name: 'partly overlapping ranges',
      start: 3,
      duration: 2,
      ripple: true,
      main: true,
      expected: 2,
    },
    { name: 'disjoint ranges', start: 0, duration: 1, ripple: true, main: true, expected: 2 },
    {
      name: 'plain delete follows only the main cut',
      start: 0,
      duration: 1,
      ripple: false,
      main: true,
      expected: 3,
    },
    { name: 'lane-only ripple', start: 2, duration: 1, ripple: true, main: false, expected: 4 },
  ])('$name shifts surviving captions by removed time once', ({
    start,
    duration,
    ripple,
    main,
    expected,
  }) => {
    let project = withCaption(threeClips(), 5);
    const caption = findClip(project, 'cap')?.clip;
    if (!caption || caption.kind !== 'caption') throw new Error('no caption');
    project = simulate(project, [
      {
        commandType: 'upsert_clip',
        trackId: 'captions',
        clip: {
          ...caption,
          id: 'gone-caption',
          timelineStartSec: start,
          durationSec: duration,
          words: [],
        },
      },
    ]);
    const middle = mainVideoTrack(project)?.clips.find((clip) => clip.name === 'b');
    if (!middle) throw new Error('no middle clip');
    project = commit(
      project,
      deleteClipsEdit(project, ['gone-caption', ...(main ? [middle.id] : [])], ripple),
    );
    expect(findClip(project, 'cap')?.clip.timelineStartSec).toBe(expected);
    expect(findClip(project, 'gone-caption')).toBeUndefined();
    expect(findClip(project, 'cap')?.clip.durationSec).toBe(1);
  });

  test('overlapping removals on one lane ripple their union, preserving words and clocks', () => {
    let project = withCaption(threeClips(), 5);
    const caption = findClip(project, 'cap')?.clip;
    if (!caption || caption.kind !== 'caption') throw new Error('no caption');
    project = simulate(project, [
      {
        commandType: 'upsert_clip',
        trackId: 'captions',
        clip: { ...caption, keyframeOffsetSec: 2 },
      },
      ...[1, 2].map((start) => ({
        commandType: 'upsert_clip' as const,
        trackId: 'captions',
        clip: {
          ...caption,
          id: `gone-${start}`,
          timelineStartSec: start,
          durationSec: 2,
          words: [],
        },
      })),
    ]);
    project = commit(project, deleteClipsEdit(project, ['gone-1', 'gone-2'], true));
    const retained = findClip(project, 'cap')?.clip;
    expect(retained?.timelineStartSec).toBe(2);
    expect(retained?.keyframeOffsetSec).toBe(2);
    expect(retained?.kind === 'caption' && retained.words).toEqual(caption.words);
  });

  test('two trims built one after the other keep V1 packed, and the caption follows both', () => {
    let project = withCaption(threeClips(), 4.5);
    const byName = (name: string) =>
      mainVideoTrack(project)?.clips.find((clip) => clip.name === name)?.id ?? '';
    const a = byName('a');
    const c = byName('c');
    project = commit(project, trimEdit(project, a, 'end', 1.5));
    const cNow = findClip(project, c)?.clip;
    project = commit(project, trimEdit(project, c, 'end', (cNow ? clipEnd(cNow) : 0) - 0.4));
    expect(mainClips(project)).toEqual([
      ['a', 0, 1.5],
      ['b', 1.5, 2],
      ['c', 3.5, 1.6],
    ]);
    expect(findClip(project, 'cap')?.clip.timelineStartSec).toBe(4);
  });

  test('muting V1 silences its clips and keeps it the main track, in picture', () => {
    let project = threeClips();
    const main = mainVideoTrack(project);
    if (!main) throw new Error('no main');
    project = commit(project, trackStateEdit(project, main.id, { muted: true }));
    const after = mainVideoTrack(project);
    expect(after?.id).toBe(main.id);
    expect(after?.muted).toBe(false);
    expect(after?.clips.every((clip) => !clip.audioEnabled)).toBe(true);
    // A track muted elsewhere (agent, MCP) still stays the main track.
    project = commit(project, setTrackStateEdit(main, { muted: true }));
    expect(mainVideoTrack(project)?.id).toBe(main.id);
  });
});

test('simultaneous clips get distinct reachable rows and adjacent clips reuse them without mutation', () => {
  const project = commit(blank(), placeAssetEdit(blank(), video('a', 4), { atSec: 0 }));
  const source = project.tracks[0].clips[0];
  const clips = [
    { ...source, id: 'late', timelineStartSec: 4, durationSec: 2 },
    { ...source, id: 'a', timelineStartSec: 1, durationSec: 3 },
    { ...source, id: 'b', timelineStartSec: 1, durationSec: 3 },
    { ...source, id: 'c', timelineStartSec: 1, durationSec: 3 },
    { ...source, id: 'd', timelineStartSec: 1, durationSec: 3 },
  ];
  const original = structuredClone(clips),
    layout = clipRows(clips);
  expect(layout.count).toBe(4);
  expect(new Set(['a', 'b', 'c', 'd'].map((id) => layout.rows.get(id))).size).toBe(4);
  expect(layout.rows.get('late')).toBe(0);
  expect(clips).toEqual(original);
  expect(clipRows([]).count).toBe(1);
});
