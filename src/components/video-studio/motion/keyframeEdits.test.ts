import { describe, expect, test } from 'bun:test';
import { createEditorProjectV2, EASE_OUT, type EditorProjectV2 } from '@continuum/contracts';
import {
  findClip,
  placeAssetEdit,
  simulate,
  type TimelineEdit,
} from '@/StudioCanvas/nodes/timeline/workspace/timelineEdits';
import {
  addKeyEdit,
  channelKeys,
  easeKeyEdit,
  isKeyedClip,
  type KeyedClip,
  moveKeyEdit,
  removeKeyEdit,
  valueAt,
  valueKeyEdit,
} from './keyframeEdits';

const blank = () =>
  createEditorProjectV2({ projectId: 'p1', title: 'Edit', width: 1080, height: 1920 });

/** One 4 s video clip on V1 — the reducer, not a hand-built object, makes it. */
function withClip(): { project: EditorProjectV2; clipId: string } {
  const project = blank();
  const placed = placeAssetEdit(
    project,
    { assetId: 'a', kind: 'video', title: 'a', durationSec: 4, origin: 'project' },
    { atSec: 0 },
  );
  const next = simulate(project, placed.forward);
  const clipId = next.tracks[0]?.clips[0]?.id ?? '';
  return { project: next, clipId };
}

const commit = (project: EditorProjectV2, edit: TimelineEdit | null): EditorProjectV2 => {
  if (!edit) throw new Error('expected an edit');
  return simulate(project, edit.forward);
};
const clipOf = (project: EditorProjectV2, clipId: string): KeyedClip => {
  const clip = findClip(project, clipId)?.clip;
  if (!clip || !isKeyedClip(clip)) throw new Error('no keyed clip');
  return clip;
};

describe('keyframe lane edits', () => {
  test('audio volume keys sample absolute gain, move, ease and delete without visual channels', () => {
    const placed = placeAssetEdit(
      blank(),
      { assetId: 'bed', kind: 'audio', title: 'Bed', durationSec: 4, origin: 'project' },
      { atSec: 1 },
    );
    let project = simulate(blank(), placed.forward);
    const clipId = project.tracks.flatMap((track) => track.clips)[0]!.id;
    project = commit(project, addKeyEdit(project, clipId, 'volume', 0));
    project = commit(project, valueKeyEdit(project, clipId, 'volume', 0, 0.2));
    project = commit(project, addKeyEdit(project, clipId, 'volume', 2));
    project = commit(project, valueKeyEdit(project, clipId, 'volume', 2, 0.8));
    project = commit(project, addKeyEdit(project, clipId, 'volume', 1));
    expect(valueAt(clipOf(project, clipId), 'audio.volume', 1)).toBe(0.5);
    project = commit(
      project,
      easeKeyEdit(project, clipId, 'volume', 1, { interpolation: 'bezier', easing: EASE_OUT }),
    );
    project = commit(project, moveKeyEdit(project, clipId, 'volume', 1, 1.5));
    expect(channelKeys(clipOf(project, clipId), 'volume')[1]?.keyframes[0]).toMatchObject({
      timeSec: 1.5,
      value: 0.5,
      interpolation: 'bezier',
      easing: EASE_OUT,
    });
    project = commit(project, removeKeyEdit(project, clipId, 'volume', 1.5));
    expect(channelKeys(clipOf(project, clipId), 'volume').map((key) => key.timeSec)).toEqual([
      0, 2,
    ]);
    expect(addKeyEdit(project, clipId, 'position', 1)).toBeNull();
    const visual = withClip();
    expect(addKeyEdit(visual.project, visual.clipId, 'volume', 1)).toBeNull();
  });
  test('add keys the resting value at the playhead; scale keys X and Y together', () => {
    const { project, clipId } = withClip();
    let next = commit(project, addKeyEdit(project, clipId, 'position', 1.25));
    next = commit(next, addKeyEdit(next, clipId, 'scale', 2));
    const clip = clipOf(next, clipId);
    expect(channelKeys(clip, 'position')).toHaveLength(1);
    expect(clip.keyframes.find((key) => key.property === 'transform.position')).toMatchObject({
      timeSec: 1.25,
      value: { x: 0.5, y: 0.5 },
      interpolation: 'linear',
    });
    const [scale] = channelKeys(clip, 'scale');
    expect(scale?.keyframes.map((key) => key.property).sort()).toEqual([
      'transform.scaleX',
      'transform.scaleY',
    ]);
  });

  test('a key added between two keys holds the sampled value there', () => {
    const { project, clipId } = withClip();
    let next = commit(project, addKeyEdit(project, clipId, 'opacity', 0));
    next = commit(next, valueKeyEdit(next, clipId, 'opacity', 0, 0));
    next = commit(next, addKeyEdit(next, clipId, 'opacity', 2));
    next = commit(next, valueKeyEdit(next, clipId, 'opacity', 2, 1));
    next = commit(next, addKeyEdit(next, clipId, 'opacity', 1));
    expect(valueAt(clipOf(next, clipId), 'transform.opacity', 1)).toBe(0.5);
    expect(channelKeys(clipOf(next, clipId), 'opacity').map((key) => key.timeSec)).toEqual([
      0, 1, 2,
    ]);
  });

  test('move slides every stop of the key, and a key already there gives way', () => {
    const { project, clipId } = withClip();
    let next = commit(project, addKeyEdit(project, clipId, 'scale', 0.5));
    next = commit(next, addKeyEdit(next, clipId, 'scale', 3));
    next = commit(next, moveKeyEdit(next, clipId, 'scale', 0.5, 3));
    const keys = channelKeys(clipOf(next, clipId), 'scale');
    expect(keys.map((key) => [key.timeSec, key.keyframes.length])).toEqual([[3, 2]]);
    expect(moveKeyEdit(next, clipId, 'scale', 3, 3)).toBeNull();
    // Past the clip's end clamps to its last frame.
    next = commit(next, moveKeyEdit(next, clipId, 'scale', 3, 9));
    expect(channelKeys(clipOf(next, clipId), 'scale')[0]?.timeSec).toBe(4);
  });

  test('easing writes a valid bezier, then a spring drops the curve', () => {
    const { project, clipId } = withClip();
    let next = commit(project, addKeyEdit(project, clipId, 'rotation', 1));
    next = commit(
      next,
      easeKeyEdit(next, clipId, 'rotation', 1, { interpolation: 'bezier', easing: EASE_OUT }),
    );
    expect(clipOf(next, clipId).keyframes[0]).toMatchObject({
      interpolation: 'bezier',
      easing: EASE_OUT,
    });
    next = commit(
      next,
      easeKeyEdit(next, clipId, 'rotation', 1, {
        interpolation: 'spring',
        spring: { bounce: 0.4 },
        easing: undefined,
      }),
    );
    const [key] = clipOf(next, clipId).keyframes;
    expect(key?.interpolation).toBe('spring');
    expect(key && 'easing' in key).toBe(false);
  });

  test('delete removes the whole key; edits on a missing key are no-ops', () => {
    const { project, clipId } = withClip();
    let next = commit(project, addKeyEdit(project, clipId, 'scale', 1));
    next = commit(next, removeKeyEdit(next, clipId, 'scale', 1));
    expect(clipOf(next, clipId).keyframes).toEqual([]);
    expect(removeKeyEdit(next, clipId, 'scale', 1)).toBeNull();
    expect(valueKeyEdit(next, clipId, 'scale', 1, 2)).toBeNull();
    expect(addKeyEdit(next, 'missing', 'scale', 1)).toBeNull();
  });
});
