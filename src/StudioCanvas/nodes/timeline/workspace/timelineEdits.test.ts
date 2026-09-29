import { describe, expect, test } from 'bun:test';
import {
  createEditorProjectV2,
  type EditorProjectV2,
  type VideoEditorPoolAsset,
} from '@continuum/contracts';
import {
  clipEnd,
  deleteClipsEdit,
  duplicateClipsEdit,
  finalizeEdit,
  findClip,
  laneTracks,
  mainEndSec,
  mainVideoTrack,
  moveClipEdit,
  placeAssetEdit,
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
