import { describe, expect, test } from 'bun:test';
import {
  applyEditorCommandBatch,
  createEditorProjectV2,
  type EditorCommand,
  type EditorProjectV2,
  editorProjectV2Schema,
  type MediaAssetVersion,
} from '@continuum/contracts';
import type { TimelineInputSource } from '../../types';
import {
  type EditorAssemblyOperation,
  editorProjectV2CommentPlacements,
  exactVersionPreviewUrl,
  orderedVideoClips,
  patchAudioOperation,
  placeAudioOperation,
  placeVideoOperation,
  primaryVideoTrack,
  removeClipOperation,
  removeTransitionOperation,
  reorderVideoOperation,
  splitClipOperation,
  trimClipOperation,
  upsertOverlayOperation,
  upsertTextOperation,
  upsertTransitionOperation,
  videoLayout,
} from './editorProjectV2AssemblyModel';
import {
  buildEditorProjectV2AudioPreviewPlan,
  editorProjectV2AudioClipIds,
} from './useEditorProjectV2AudioPreview';

const binSource = (source: TimelineInputSource): TimelineInputSource => source;

function videoClip(id: string, timelineStartSec: number) {
  return {
    id,
    name: id,
    timelineStartSec,
    durationSec: 8,
    enabled: true,
    locked: false,
    tags: [],
    kind: 'video' as const,
    source: {
      sourceType: 'library_asset' as const,
      assetId: `asset-${id}`,
      renditionId: `version-${id}`,
    },
    sourceInSec: 0,
    playbackRate: 1,
    reverse: false,
    transform: {
      position: { x: 0.5, y: 0.5, unit: 'normalized' as const },
      scaleX: 1,
      scaleY: 1,
      rotationDeg: 0,
      anchorX: 0.5,
      anchorY: 0.5,
      opacity: 1,
    },
    crop: { left: 0, top: 0, right: 0, bottom: 0 },
    blendMode: 'normal' as const,
    audioEnabled: true,
    effects: [],
    keyframes: [],
  };
}

function projectFixture(): EditorProjectV2 {
  const base = createEditorProjectV2({
    projectId: 'project-1',
    title: 'Canonical assembly',
    width: 1080,
    height: 1920,
    now: '2026-08-02T00:00:00.000Z',
  });
  return editorProjectV2Schema.parse({
    ...base,
    durationSec: 16,
    tracks: [
      {
        id: 'production-masters',
        name: 'Approved masters',
        order: 0,
        enabled: true,
        locked: false,
        muted: false,
        solo: false,
        kind: 'video',
        clips: [videoClip('clip-a', 0), videoClip('clip-b', 8)],
      },
    ],
  });
}

function applyDrafts(
  project: EditorProjectV2,
  drafts: EditorAssemblyOperation['forward'],
): EditorProjectV2 {
  const issuedAt = '2026-08-02T00:00:00.000Z';
  const actor = { actorId: 'user-1', actorType: 'user' as const };
  const commands = drafts.map(
    (draft, index) =>
      ({
        ...draft,
        commandId: `command-${project.revision}-${index}`,
        idempotencyKey: `command-key-${project.revision}-${index}`,
        expectedRevision: project.revision,
        issuedAt,
        actor,
      }) as EditorCommand,
  );
  return applyEditorCommandBatch(project, {
    batchId: `batch-${project.revision}`,
    projectId: project.projectId,
    sequenceId: project.sequenceId,
    idempotencyKey: `batch-key-${project.revision}`,
    expectedRevision: project.revision,
    expectedFingerprint: project.fingerprint,
    atomic: true,
    issuedAt,
    actor,
    commands,
  });
}

function videoIds(project: EditorProjectV2): string[] {
  return orderedVideoClips(primaryVideoTrack(project)).map((clip) => clip.id);
}

describe('canonical EditorProjectV2 assembly operations', () => {
  test('reorders the durable video track and inverse commands restore it', () => {
    const initial = projectFixture();
    const operation = reorderVideoOperation(initial, 'production-masters', 'clip-a', 'clip-b');
    expect(operation).not.toBeNull();
    const reordered = applyDrafts(initial, operation?.forward ?? []);
    expect(videoIds(reordered)).toEqual(['clip-b', 'clip-a']);
    expect(
      orderedVideoClips(primaryVideoTrack(reordered)).map((clip) => clip.timelineStartSec),
    ).toEqual([0, 8]);
    expect(videoIds(applyDrafts(reordered, operation?.inverse ?? []))).toEqual([
      'clip-a',
      'clip-b',
    ]);
  });

  test('places a connected media bin source on an empty timeline, and takes it back off', () => {
    // #294: the source has no Library pin — a clip wired into the Canvas node and
    // nothing more. It must still land on the timeline, as the canvas node it is.
    const empty = createEditorProjectV2({
      projectId: 'project-2',
      title: 'Fresh production',
      width: 1080,
      height: 1920,
      now: '2026-08-02T00:00:00.000Z',
    });
    const wired = binSource({ nodeId: 'clip-node', kind: 'video', label: 'bench-clip.mp4' });
    const place = placeVideoOperation(empty, { source: wired, durationSec: 6 });
    const placed = applyDrafts(empty, place.forward);
    const track = primaryVideoTrack(placed);
    expect(track?.id).toBe('production-masters');
    expect(orderedVideoClips(track)).toHaveLength(1);
    expect(orderedVideoClips(track)[0]?.source).toMatchObject({
      sourceType: 'canvas_node',
      nodeId: 'clip-node',
    });
    expect(placed.durationSec).toBe(6);

    // A second source appends flush against the first, which is what the reducer's
    // canonical-geometry rule requires of the primary video track.
    const pinned = binSource({
      nodeId: 'pinned-node',
      kind: 'video',
      label: 'Pinned take',
      sourceAssetId: 'take-asset',
      sourceVersionId: 'take-version-1',
    });
    const appended = applyDrafts(
      placed,
      placeVideoOperation(placed, { source: pinned, durationSec: 4 }).forward,
    );
    expect(
      orderedVideoClips(primaryVideoTrack(appended)).map((clip) => clip.timelineStartSec),
    ).toEqual([0, 6]);
    expect(orderedVideoClips(primaryVideoTrack(appended))[1]?.source).toMatchObject({
      sourceType: 'library_asset',
      assetId: 'take-asset',
      renditionId: 'take-version-1',
    });

    const undone = applyDrafts(placed, place.inverse);
    expect(primaryVideoTrack(undone)).toBeUndefined();
    expect(undone.durationSec).toBe(0);
  });

  test('trims, splits, and deletes through atomic, reversible command sets', () => {
    const initial = projectFixture();
    const trim = trimClipOperation(initial, 'production-masters', 'clip-a', {
      sourceInSec: 1,
      durationSec: 5,
    });
    const trimmed = applyDrafts(initial, trim.forward);
    expect(trimmed.durationSec).toBe(13);
    expect(
      orderedVideoClips(primaryVideoTrack(trimmed)).map((clip) => clip.timelineStartSec),
    ).toEqual([0, 5]);
    const restored = applyDrafts(trimmed, trim.inverse);
    expect(restored.durationSec).toBe(16);

    const split = splitClipOperation(restored, 'production-masters', 'clip-a', 3, 'clip-a-right');
    expect(split).not.toBeNull();
    const splitProject = applyDrafts(restored, split?.forward ?? []);
    expect(videoIds(splitProject)).toEqual(['clip-a', 'clip-a-right', 'clip-b']);
    expect(videoIds(applyDrafts(splitProject, split?.inverse ?? []))).toEqual(['clip-a', 'clip-b']);

    const remove = removeClipOperation(restored, 'production-masters', 'clip-a');
    const removed = applyDrafts(restored, remove.forward);
    expect(videoIds(removed)).toEqual(['clip-b']);
    expect(removed.durationSec).toBe(8);
    expect(videoIds(applyDrafts(removed, remove.inverse))).toEqual(['clip-a', 'clip-b']);
  });

  test('adds styled text, exact-version overlays, and audio to the canonical project', () => {
    const initial = projectFixture();
    const withText = applyDrafts(
      initial,
      upsertTextOperation(initial, {
        text: 'Taste in, film out',
        timelineStartSec: 2,
        durationSec: 3,
        fontSizePx: 72,
        color: '#ffcc00',
        x: 0.4,
        y: 0.2,
      }).forward,
    );
    const textTrack = withText.tracks.find((track) => track.kind === 'text');
    expect(textTrack?.clips[0]?.text).toBe('Taste in, film out');
    expect(textTrack?.clips[0]?.style.color).toBe('#ffcc00');
    expect(textTrack?.clips[0]?.transform.position).toMatchObject({ x: 0.4, y: 0.2 });

    const withOverlay = applyDrafts(
      withText,
      upsertOverlayOperation(withText, {
        assetId: 'logo-asset',
        versionId: 'logo-version-3',
        label: 'Logo',
        mediaKind: 'image',
        timelineStartSec: 1,
        durationSec: 4,
        x: 0.8,
        y: 0.2,
        scale: 0.25,
        opacity: 0.8,
      }).forward,
    );
    const overlay = withOverlay.tracks.find((track) => track.kind === 'overlay')?.clips[0];
    expect(overlay?.source).toMatchObject({
      sourceType: 'library_asset',
      assetId: 'logo-asset',
      renditionId: 'logo-version-3',
    });
    expect(overlay?.transform).toMatchObject({
      position: { x: 0.8, y: 0.2 },
      scaleX: 0.25,
      opacity: 0.8,
    });

    const withAudio = applyDrafts(
      withOverlay,
      placeAudioOperation(withOverlay, {
        source: binSource({
          nodeId: 'score-node',
          kind: 'audio',
          label: 'Score',
          sourceAssetId: 'score-asset',
          sourceVersionId: 'score-version-7',
        }),
        timelineStartSec: 4,
        sourceDurationSec: 20,
      }).forward,
    );
    const audioTrack = withAudio.tracks.find((track) => track.kind === 'audio');
    const audio = audioTrack?.clips[0];
    expect(audio?.source).toMatchObject({
      sourceType: 'library_asset',
      assetId: 'score-asset',
      renditionId: 'score-version-7',
    });
    expect(audio?.durationSec).toBe(12);
    if (!audioTrack || !audio) throw new Error('Expected placed audio.');
    const patched = applyDrafts(
      withAudio,
      patchAudioOperation(withAudio, audioTrack.id, audio.id, {
        volume: 0.6,
        fadeInSec: 1,
      }).forward,
    );
    const patchedAudio = patched.tracks.find((track) => track.id === audioTrack.id)?.clips[0];
    expect(patchedAudio).toMatchObject({ volume: 0.6, fadeInSec: 1 });
  });

  test('crossfades use shared overlap geometry for commands, preview, and project duration', () => {
    const initial = projectFixture();
    const add = upsertTransitionOperation(initial, {
      trackId: 'production-masters',
      fromClipId: 'clip-a',
      toClipId: 'clip-b',
      transitionType: 'crossfade',
      durationSec: 1,
    });
    const transitioned = applyDrafts(initial, add.forward);
    expect(transitioned.transitions).toHaveLength(1);
    expect(
      orderedVideoClips(primaryVideoTrack(transitioned)).map((clip) => clip.timelineStartSec),
    ).toEqual([0, 7]);
    expect(transitioned.durationSec).toBe(15);
    expect(videoLayout(transitioned, 80).totalSec).toBe(15);

    const remove = removeTransitionOperation(transitioned, transitioned.transitions[0].id);
    const restored = applyDrafts(transitioned, remove.forward);
    expect(restored.transitions).toHaveLength(0);
    expect(
      orderedVideoClips(primaryVideoTrack(restored)).map((clip) => clip.timelineStartSec),
    ).toEqual([0, 8]);
    expect(restored.durationSec).toBe(16);
  });

  test('builds one synchronized exact-version mix for base video and enabled audio lanes', () => {
    const initial = projectFixture();
    const withAudio = applyDrafts(
      initial,
      placeAudioOperation(initial, {
        source: binSource({
          nodeId: 'score-node',
          kind: 'audio',
          label: 'Score',
          sourceAssetId: 'score-asset',
          sourceVersionId: 'score-version-7',
        }),
        timelineStartSec: 4,
        sourceDurationSec: 6,
      }).forward,
    );
    const audio = withAudio.tracks.find((track) => track.kind === 'audio')?.clips[0];
    if (!audio) throw new Error('Expected audio clip.');
    const blobsByClipId = new Map([
      ['clip-a', new Blob(['a'], { type: 'video/mp4' })],
      ['clip-b', new Blob(['b'], { type: 'video/mp4' })],
      [audio.id, new Blob(['score'], { type: 'audio/mp4' })],
    ]);
    const plan = buildEditorProjectV2AudioPreviewPlan({
      project: withAudio,
      layout: videoLayout(withAudio, 80),
      blobsByClipId,
    });
    expect(editorProjectV2AudioClipIds(withAudio)).toEqual(['clip-a', 'clip-b', audio.id]);
    expect(plan.events.map((event) => event.kind)).toEqual(['base', 'audio', 'base']);
    expect(plan.events.map((event) => event.sourceKey)).toEqual([
      'asset-clip-a:version-clip-a',
      'score-asset:score-version-7',
      'asset-clip-b:version-clip-b',
    ]);
    expect(plan.events[1]).toMatchObject({
      outputStartSec: 4,
      outputEndSec: 10,
      gain: 1,
    });

    const muted = editorProjectV2Schema.parse({
      ...withAudio,
      tracks: withAudio.tracks.map((track) =>
        track.kind === 'audio' ? { ...track, muted: true } : track,
      ),
    });
    expect(editorProjectV2AudioClipIds(muted)).toEqual(['clip-a', 'clip-b']);

    const soloScore = editorProjectV2Schema.parse({
      ...withAudio,
      tracks: withAudio.tracks.map((track) =>
        track.kind === 'audio' ? { ...track, solo: true } : track,
      ),
    });
    expect(editorProjectV2AudioClipIds(soloScore)).toEqual([audio.id]);
  });

  test('projects canonical exact-pinned clips into the durable source-time review surface', () => {
    const initial = projectFixture();
    const transitioned = applyDrafts(
      initial,
      upsertTransitionOperation(initial, {
        trackId: 'production-masters',
        fromClipId: 'clip-a',
        toClipId: 'clip-b',
        transitionType: 'crossfade',
        durationSec: 1,
      }).forward,
    );
    const withOverlay = applyDrafts(
      transitioned,
      upsertOverlayOperation(transitioned, {
        assetId: 'overlay-video',
        versionId: 'overlay-version-2',
        label: 'B-roll',
        mediaKind: 'video',
        timelineStartSec: 2,
        durationSec: 3,
      }).forward,
    );
    const placements = editorProjectV2CommentPlacements(withOverlay, videoLayout(withOverlay, 80));
    expect(placements).toMatchObject([
      { itemId: 'clip-a', assetId: 'asset-clip-a', outputStartSec: 0, track: 'base' },
      { itemId: 'clip-b', assetId: 'asset-clip-b', outputStartSec: 7, track: 'base' },
      { assetId: 'overlay-video', outputStartSec: 2, track: 'overlay' },
    ]);
  });

  test('resolves the pinned rendition instead of silently previewing the head version', () => {
    const versions = [
      { id: 'head', signedUrl: 'https://media.example/head.mp4' },
      {
        id: 'pinned',
        signedUrl: 'https://media.example/pinned.mp4',
        preview: { signedUrl: 'https://media.example/pinned-poster.jpg' },
      },
    ] as MediaAssetVersion[];
    expect(exactVersionPreviewUrl(versions, 'pinned')).toBe('https://media.example/pinned.mp4');
    expect(exactVersionPreviewUrl(versions, 'missing')).toBeUndefined();
  });
});
