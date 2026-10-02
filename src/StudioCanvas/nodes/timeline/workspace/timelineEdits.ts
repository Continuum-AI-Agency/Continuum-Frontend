// The Edit-mode timeline's edits as pure functions: project in, command drafts out.
//
// The main video track is MAGNETIC. The compositor (executors/timelineEditor.ts, the
// same code Render runs as timeline-editor.js) renders the lowest-order enabled video
// track as a canonical sequence — clips packed end to end from zero — and every other
// video track as a free layer above it; it also requires the project to end where that
// sequence ends. So every edit that touches the main track re-packs it (a delete there
// is always a ripple), and `finalizeEdit` trims whatever would hang past its end.
// Anything else would commit a revision that cannot export.

import {
  applyEditorCommandBatch,
  type EditorAudioClip,
  type EditorClip,
  type EditorOverlayClip,
  type EditorProjectV2,
  type EditorTrack,
  type EditorVideoClip,
  mergeSpeech,
  type VideoEditorPoolAsset,
} from '@continuum/contracts';
import {
  type EditorCommandDraft,
  MIN_ASSEMBLY_CLIP_SEC,
  moveCommands,
  orderedVideoClips,
} from '../editorProjectV2AssemblyModel';

export type TimelineEdit = { label: string; forward: EditorCommandDraft[] };
/**
 * An edit, or how to build one. Builders run when the edit is applied, against the project
 * the previous edit left — an edit computed from what the page showed a moment ago would
 * silently undo whatever landed in between.
 */
export type EditBuild = TimelineEdit | null | ((current: EditorProjectV2) => TimelineEdit | null);
export type ClipRef = { track: EditorTrack; clip: EditorClip };
type VideoTrack = Extract<EditorTrack, { kind: 'video' }>;
export type LaneKind = 'video' | 'overlay' | 'text' | 'caption' | 'audio';

const EPSILON = 0.001;
const DEFAULT_STILL_SEC = 3;
const LANE_ORDER: Record<LaneKind, number> = {
  overlay: 0,
  video: 1,
  text: 2,
  caption: 3,
  audio: 4,
};

export const isLaneKind = (kind: EditorTrack['kind']): kind is LaneKind => kind in LANE_ORDER;
export const clipEnd = (clip: EditorClip): number => clip.timelineStartSec + clip.durationSec;
const rateOf = (clip: EditorClip): number =>
  'playbackRate' in clip && clip.playbackRate > 0 ? clip.playbackRate : 1;
const newId = (): string => crypto.randomUUID();

/**
 * The track the compositor packs as the canonical sequence: the lowest enabled video track.
 * Muting a video track silences it and never changes which track this is.
 */
export function mainVideoTrack(project: EditorProjectV2): VideoTrack | undefined {
  const videos = project.tracks
    .filter((track): track is VideoTrack => track.kind === 'video')
    .sort((left, right) => left.order - right.order);
  return videos.find((track) => track.enabled) ?? videos[0];
}

export const mainEndSec = (project: EditorProjectV2): number =>
  orderedVideoClips(mainVideoTrack(project)).reduce((end, clip) => Math.max(end, clipEnd(clip)), 0);

/** Lanes top to bottom: overlays, video (V2 above V1), text, captions, audio. */
export function laneTracks(project: EditorProjectV2): EditorTrack[] {
  return project.tracks
    .filter((track) => isLaneKind(track.kind))
    .sort((left, right) => {
      const byKind = LANE_ORDER[left.kind as LaneKind] - LANE_ORDER[right.kind as LaneKind];
      return (
        byKind || (left.kind === 'video' ? right.order - left.order : left.order - right.order)
      );
    });
}

export function findClip(project: EditorProjectV2, clipId: string): ClipRef | undefined {
  for (const track of project.tracks) {
    const clip = track.clips.find((candidate) => candidate.id === clipId);
    if (clip) return { track, clip };
  }
  return undefined;
}

/** Runs drafts through the real reducer — what the server will do with them. */
export function simulate(
  project: EditorProjectV2,
  drafts: readonly EditorCommandDraft[],
): EditorProjectV2 {
  if (drafts.length === 0) return project;
  const issuedAt = new Date().toISOString();
  const actor = { actorId: 'workspace-preview', actorType: 'user' as const };
  return applyEditorCommandBatch(project, {
    batchId: 'workspace-preview',
    projectId: project.projectId,
    sequenceId: project.sequenceId,
    idempotencyKey: 'workspace-preview',
    expectedRevision: project.revision,
    expectedFingerprint: project.fingerprint,
    atomic: true,
    issuedAt,
    actor,
    commands: drafts.map((draft, index) => ({
      ...draft,
      commandId: `preview-${index}`,
      idempotencyKey: `workspace-preview-${index}`,
      expectedRevision: project.revision,
      issuedAt,
      actor,
    })),
  } as Parameters<typeof applyEditorCommandBatch>[1]);
}

/**
 * Re-pack the main track in `order`. Transitions whose clips stop being neighbours are
 * dropped first — the reducer refuses a transition between clips that are not adjacent.
 */
function repackMain(
  transitions: EditorProjectV2['transitions'],
  trackId: string,
  order: EditorVideoClip[],
) {
  const position = new Map(order.map((clip, index) => [clip.id, index] as const));
  const [stale, kept] = transitions.reduce<
    [EditorProjectV2['transitions'], EditorProjectV2['transitions']]
  >(
    ([drop, keep], transition) => {
      const from = position.get(transition.fromClipId);
      const to = position.get(transition.toClipId);
      const adjacent =
        transition.trackId === trackId && from !== undefined && to !== undefined && to === from + 1;
      return adjacent || transition.trackId !== trackId
        ? [drop, [...keep, transition]]
        : [[...drop, transition], keep];
    },
    [[], []],
  );
  return [
    ...stale.map((transition) => ({
      commandType: 'remove_transition' as const,
      transitionId: transition.id,
    })),
    ...moveCommands(trackId, order, kept),
  ] satisfies EditorCommandDraft[];
}

/** Clips on the non-main lanes may not hang past the main sequence: export refuses it. */
export function finalizeEdit(project: EditorProjectV2, edit: TimelineEdit): TimelineEdit {
  const next = simulate(project, edit.forward);
  const main = mainVideoTrack(next);
  const end = mainEndSec(next);
  if (!main || end <= 0) return edit;
  const fit: EditorCommandDraft[] = next.tracks
    .filter((track) => track.id !== main.id && isLaneKind(track.kind))
    .flatMap((track) =>
      track.clips.flatMap((clip): EditorCommandDraft[] => {
        if (clipEnd(clip) <= end + EPSILON) return [];
        if (clip.timelineStartSec >= end - MIN_ASSEMBLY_CLIP_SEC) {
          return [{ commandType: 'remove_clip', trackId: track.id, clipId: clip.id }];
        }
        return [
          {
            commandType: 'trim_clip',
            trackId: track.id,
            clipId: clip.id,
            durationSec: end - clip.timelineStartSec,
          },
        ];
      }),
    );
  if (fit.length === 0) return edit;
  const forward = [...edit.forward, ...fit];
  simulate(project, forward);
  return { ...edit, forward };
}

type Span = { startSec: number; endSec: number };

const measureBefore = (spans: readonly Span[], sec: number): number =>
  spans.reduce((sum, span) => sum + Math.max(0, Math.min(span.endSec, sec) - span.startSec), 0);

/**
 * The main track lost `removed` time and gained `inserted` time (both in the old
 * timeline's seconds), so every clip on every other lane after it follows — captions,
 * text, overlays and music stay on the picture they were cut to. Caption words are
 * clip-relative, so moving the clip is the whole job.
 */
function followMainTrack(
  project: EditorProjectV2,
  change: { removed?: readonly Span[]; inserted?: readonly { atSec: number; sec: number }[] },
  skip: ReadonlySet<string> = new Set(),
): EditorCommandDraft[] {
  const main = mainVideoTrack(project);
  const removed = change.removed ?? [];
  const inserted = change.inserted ?? [];
  return project.tracks.flatMap((track) =>
    track.id === main?.id || track.locked || !isLaneKind(track.kind)
      ? []
      : track.clips.flatMap((clip): EditorCommandDraft[] => {
          if (skip.has(clip.id)) return [];
          const at = clip.timelineStartSec;
          const shifted =
            at -
            measureBefore(removed, at) +
            inserted.reduce((sum, gap) => sum + (gap.atSec <= at + EPSILON ? gap.sec : 0), 0);
          const next = Math.max(0, shifted);
          return Math.abs(next - at) > EPSILON
            ? [
                {
                  commandType: 'move_clip',
                  clipId: clip.id,
                  fromTrackId: track.id,
                  toTrackId: track.id,
                  timelineStartSec: next,
                },
              ]
            : [];
        }),
  );
}

// ── Tracks ────────────────────────────────────────────────────────────────────────────

const TRACK_NAMES: Record<LaneKind, string> = {
  video: 'V',
  overlay: 'Overlay',
  text: 'Text',
  caption: 'Captions',
  audio: 'Audio',
};

export function addTrackDraft(
  project: EditorProjectV2,
  kind: LaneKind,
  trackId: string = `${kind}-${newId().slice(0, 8)}`,
): EditorCommandDraft {
  const count = project.tracks.filter((track) => track.kind === kind).length + 1;
  return {
    commandType: 'add_track',
    track: {
      id: trackId,
      name: kind === 'video' ? `V${count}` : `${TRACK_NAMES[kind]} ${count}`,
      order: Math.max(-1, ...project.tracks.map((track) => track.order)) + 1,
      enabled: true,
      locked: false,
      muted: false,
      solo: false,
      kind,
      clips: [],
    } as EditorTrack,
  };
}

export const addTrackEdit = (project: EditorProjectV2, kind: LaneKind): TimelineEdit => ({
  label: `Add ${TRACK_NAMES[kind]} track`,
  forward: [addTrackDraft(project, kind)],
});

// ── Placing media ─────────────────────────────────────────────────────────────────────

const IDENTITY_TRANSFORM = {
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
};
const NO_CROP = { left: 0, top: 0, right: 0, bottom: 0 };

const libraryRef = (asset: VideoEditorPoolAsset) => ({
  sourceType: 'library_asset' as const,
  assetId: asset.assetId,
  ...(asset.versionId ? { renditionId: asset.versionId } : {}),
});

/** The lane kind an asset lands on: stills can only be layers, never the main sequence. */
export const laneKindForAsset = (asset: VideoEditorPoolAsset): LaneKind =>
  asset.kind === 'audio' ? 'audio' : asset.kind === 'image' ? 'overlay' : 'video';

function clipForAsset(
  asset: VideoEditorPoolAsset,
  startSec: number,
  durationSec: number,
): EditorClip {
  const base = {
    id: newId(),
    name: asset.title,
    timelineStartSec: startSec,
    durationSec,
    enabled: true,
    locked: false,
    tags: [],
  };
  if (asset.kind === 'audio') {
    return {
      ...base,
      kind: 'audio',
      source: libraryRef(asset),
      sourceInSec: 0,
      playbackRate: 1,
      reverse: false,
      volume: 1,
      pan: 0,
      muted: false,
      fadeInSec: 0,
      fadeOutSec: 0,
      effects: [],
      keyframes: [],
    } satisfies EditorAudioClip;
  }
  if (asset.kind === 'image') {
    return {
      ...base,
      kind: 'overlay',
      source: libraryRef(asset),
      mediaKind: 'image',
      sourceInSec: 0,
      transform: IDENTITY_TRANSFORM,
      crop: NO_CROP,
      blendMode: 'normal',
      effects: [],
      keyframes: [],
    } satisfies EditorOverlayClip;
  }
  return {
    ...base,
    kind: 'video',
    source: libraryRef(asset),
    sourceInSec: 0,
    playbackRate: 1,
    reverse: false,
    transform: IDENTITY_TRANSFORM,
    crop: NO_CROP,
    blendMode: 'normal',
    audioEnabled: true,
    effects: [],
    keyframes: [],
  } satisfies EditorVideoClip;
}

/** Where a clip dropped at `atSec` goes in the packed main sequence. */
function mainInsertIndex(clips: readonly EditorVideoClip[], atSec: number): number {
  const index = clips.findIndex((clip) => atSec < clip.timelineStartSec + clip.durationSec / 2);
  return index < 0 ? clips.length : index;
}

/**
 * Place an asset at a time. `trackId` is the lane it was dropped on; a lane of the wrong
 * kind (a still dropped on V1) falls back to the first lane that can hold it.
 */
export function placeAssetEdit(
  project: EditorProjectV2,
  asset: VideoEditorPoolAsset,
  input: { atSec: number; trackId?: string; durationSec?: number },
): TimelineEdit {
  const kind = laneKindForAsset(asset);
  const durationSec = Math.max(
    MIN_ASSEMBLY_CLIP_SEC,
    input.durationSec ?? asset.durationSec ?? DEFAULT_STILL_SEC,
  );
  const atSec = Math.max(0, input.atSec);
  const dropped = project.tracks.find((track) => track.id === input.trackId);
  const main = mainVideoTrack(project);
  const target =
    dropped?.kind === kind
      ? dropped
      : kind === 'video'
        ? main
        : laneTracks(project).find((track) => track.kind === kind);
  const forward: EditorCommandDraft[] = [];
  let trackId = target?.id;
  if (!trackId) {
    const add = addTrackDraft(project, kind);
    forward.push(add);
    trackId = (add as Extract<EditorCommandDraft, { commandType: 'add_track' }>).track.id;
  }
  const clip = clipForAsset(asset, atSec, durationSec);
  const label = `Add ${asset.title}`;
  if (kind === 'video' && (!target || target.id === main?.id)) {
    const current = orderedVideoClips(main);
    const order = [...current];
    order.splice(mainInsertIndex(current, atSec), 0, clip as EditorVideoClip);
    forward.push({ commandType: 'upsert_clip', trackId, clip });
    return { label, forward: [...forward, ...repackMain(project.transitions, trackId, order)] };
  }
  forward.push({ commandType: 'upsert_clip', trackId, clip });
  return { label, forward };
}

// ── Moving ────────────────────────────────────────────────────────────────────────────

/**
 * Move one clip to `startSec` on `toTrackId` — the lane-crossing drag. Onto or within the
 * main track the drop time picks a slot and the sequence re-packs; elsewhere it is free.
 */
export function moveClipEdit(
  project: EditorProjectV2,
  clipId: string,
  toTrackId: string,
  startSec: number,
): TimelineEdit | null {
  const found = findClip(project, clipId);
  const target = project.tracks.find((track) => track.id === toTrackId);
  if (!found || !target || target.kind !== found.clip.kind || target.locked || found.track.locked) {
    return null;
  }
  const main = mainVideoTrack(project);
  const at = Math.max(0, startSec);
  const forward: EditorCommandDraft[] = [];
  const fromMain = found.track.id === main?.id;
  const toMain = target.id === main?.id;
  if (!fromMain && !toMain) {
    return {
      label: 'Move clip',
      forward: [
        {
          commandType: 'move_clip',
          clipId,
          fromTrackId: found.track.id,
          toTrackId,
          timelineStartSec: at,
        },
      ],
    };
  }
  if (found.track.id !== toTrackId) {
    forward.push({
      commandType: 'move_clip',
      clipId,
      fromTrackId: found.track.id,
      toTrackId,
      timelineStartSec: at,
    });
  }
  // A clip that changes lanes loses its transitions; the rest of the main track keeps its own.
  const transitions = project.transitions.filter(
    (transition) =>
      found.track.id === toTrackId ||
      (transition.fromClipId !== clipId && transition.toClipId !== clipId),
  );
  const mainTrack = main as VideoTrack;
  const others = orderedVideoClips(mainTrack).filter((clip) => clip.id !== clipId);
  const order = toMain
    ? (() => {
        const next = [...others];
        next.splice(mainInsertIndex(others, at), 0, found.clip as EditorVideoClip);
        return next;
      })()
    : others;
  return {
    label: 'Move clip',
    forward: [...forward, ...repackMain(transitions, mainTrack.id, order)],
  };
}

/** Shift several clips by the same time on their own lanes (a multi-select drag). */
export function nudgeClipsEdit(
  project: EditorProjectV2,
  clipIds: readonly string[],
  deltaSec: number,
): TimelineEdit | null {
  const main = mainVideoTrack(project);
  const refs = clipIds
    .map((id) => findClip(project, id))
    .filter((ref): ref is ClipRef =>
      Boolean(ref && !ref.track.locked && ref.track.id !== main?.id),
    );
  if (refs.length === 0 || Math.abs(deltaSec) < EPSILON) return null;
  const shift = Math.max(deltaSec, -Math.min(...refs.map((ref) => ref.clip.timelineStartSec)));
  return {
    label: `Move ${refs.length} clips`,
    forward: refs.map((ref) => ({
      commandType: 'move_clip' as const,
      clipId: ref.clip.id,
      fromTrackId: ref.track.id,
      toTrackId: ref.track.id,
      timelineStartSec: ref.clip.timelineStartSec + shift,
    })),
  };
}

// ── Trimming, splitting, deleting ─────────────────────────────────────────────────────

/**
 * Drag a clip edge to `toSec`. A media clip cannot start before its source or (when the
 * source length is known) run past it; with no known length the end only shrinks.
 */
export function trimEdit(
  project: EditorProjectV2,
  clipId: string,
  edge: 'start' | 'end',
  toSec: number,
  sourceDurationSec?: number,
): TimelineEdit | null {
  const found = findClip(project, clipId);
  if (!found || found.track.locked || found.clip.locked) return null;
  const { clip, track } = found;
  const rate = rateOf(clip);
  const sourceIn = 'sourceInSec' in clip ? (clip.sourceInSec ?? 0) : 0;
  const hasMedia = 'source' in clip && !(clip.kind === 'overlay' && clip.mediaKind === 'image');
  const start = clip.timelineStartSec;
  const end = clipEnd(clip);
  let draft: EditorCommandDraft;
  if (edge === 'start') {
    const earliest = hasMedia ? start - sourceIn / rate : 0;
    const nextStart = Math.max(Math.max(0, earliest), Math.min(toSec, end - MIN_ASSEMBLY_CLIP_SEC));
    if (Math.abs(nextStart - start) < EPSILON) return null;
    draft = {
      commandType: 'trim_clip',
      trackId: track.id,
      clipId,
      durationSec: end - nextStart,
      timelineStartSec: nextStart,
      ...('sourceInSec' in clip
        ? { sourceInSec: Math.max(0, sourceIn + (nextStart - start) * rate) }
        : {}),
    };
  } else {
    const latest = !hasMedia
      ? Number.POSITIVE_INFINITY
      : sourceDurationSec
        ? start + (sourceDurationSec - sourceIn) / rate
        : end;
    const nextEnd = Math.min(latest, Math.max(toSec, start + MIN_ASSEMBLY_CLIP_SEC));
    if (Math.abs(nextEnd - end) < EPSILON) return null;
    draft = {
      commandType: 'trim_clip',
      trackId: track.id,
      clipId,
      durationSec: nextEnd - start,
      timelineStartSec: start,
      ...('sourceInSec' in clip ? { sourceInSec: sourceIn } : {}),
    };
  }
  const forward: EditorCommandDraft[] = [draft];
  const main = mainVideoTrack(project);
  if (main && track.id === main.id) {
    const trim = draft as Extract<EditorCommandDraft, { commandType: 'trim_clip' }>;
    const order = orderedVideoClips(main).map((candidate) =>
      candidate.id === clipId ? { ...candidate, durationSec: trim.durationSec } : candidate,
    );
    forward.push(...repackMain(project.transitions, main.id, order));
    // The main clip keeps its start; what changed is how much picture it holds.
    const lost = clip.durationSec - trim.durationSec;
    const edgeSec = edge === 'start' ? start : end;
    forward.push(
      ...followMainTrack(
        project,
        lost > 0
          ? {
              removed: [
                {
                  startSec: edge === 'start' ? start : end - lost,
                  endSec: edge === 'start' ? start + lost : end,
                },
              ],
            }
          : { inserted: [{ atSec: edgeSec, sec: -lost }] },
      ),
    );
  }
  return { label: 'Trim clip', forward };
}

const clipsUnder = (project: EditorProjectV2, atSec: number, clipIds: readonly string[]) => {
  const all = laneTracks(project).flatMap((track) =>
    track.locked ? [] : track.clips.map((clip) => ({ track, clip })),
  );
  const inside = all.filter(
    ({ clip }) =>
      atSec > clip.timelineStartSec + MIN_ASSEMBLY_CLIP_SEC &&
      atSec < clipEnd(clip) - MIN_ASSEMBLY_CLIP_SEC,
  );
  const selected = inside.filter(({ clip }) => clipIds.includes(clip.id));
  return clipIds.length > 0 ? selected : inside;
};

/** Split at the playhead: the selected clips under it, or every clip under it. */
export function splitEdit(
  project: EditorProjectV2,
  clipIds: readonly string[],
  atSec: number,
): TimelineEdit | null {
  const targets = clipsUnder(project, atSec, clipIds);
  if (targets.length === 0) return null;
  return {
    label: targets.length === 1 ? 'Split clip' : `Split ${targets.length} clips`,
    forward: targets.map(({ track, clip }) => ({
      commandType: 'split_clip' as const,
      trackId: track.id,
      clipId: clip.id,
      splitAtSec: atSec - clip.timelineStartSec,
      rightClipId: newId(),
    })),
  };
}

/** Q / W: cut the part of each clip before (start) or after (end) the playhead. */
export function trimToPlayheadEdit(
  project: EditorProjectV2,
  clipIds: readonly string[],
  edge: 'start' | 'end',
  atSec: number,
): TimelineEdit | null {
  const targets = clipsUnder(project, atSec, clipIds);
  if (targets.length === 0) return null;
  // Main-track trims re-pack, which moves later targets — apply them one at a time.
  let current = project;
  const forward: EditorCommandDraft[] = [];
  for (const { clip } of targets) {
    const step = trimEdit(current, clip.id, edge, atSec);
    if (!step) continue;
    forward.push(...step.forward);
    current = simulate(current, step.forward);
  }
  return forward.length > 0
    ? { label: edge === 'start' ? 'Trim start to playhead' : 'Trim end to playhead', forward }
    : null;
}

/**
 * Delete clips. The main track always closes the gap; with `ripple` every other lane
 * does too — each later clip slides left by what was removed before it on its lane.
 */
export function deleteClipsEdit(
  project: EditorProjectV2,
  clipIds: readonly string[],
  ripple: boolean,
): TimelineEdit | null {
  const refs = clipIds
    .map((id) => findClip(project, id))
    .filter((ref): ref is ClipRef => Boolean(ref && !ref.track.locked && !ref.clip.locked));
  if (refs.length === 0) return null;
  const removing = new Set(refs.map((ref) => ref.clip.id));
  const forward: EditorCommandDraft[] = refs.map((ref) => ({
    commandType: 'remove_clip' as const,
    trackId: ref.track.id,
    clipId: ref.clip.id,
  }));
  const main = mainVideoTrack(project);
  const removedMain = main
    ? orderedVideoClips(main)
        .filter((clip) => removing.has(clip.id))
        .map((clip) => ({ startSec: clip.timelineStartSec, endSec: clipEnd(clip) }))
    : [];
  if (main && removedMain.length > 0) {
    const transitions = project.transitions.filter(
      (transition) => !removing.has(transition.fromClipId) && !removing.has(transition.toClipId),
    );
    const order = orderedVideoClips(main).filter((clip) => !removing.has(clip.id));
    forward.push(...repackMain(transitions, main.id, order));
  }
  for (const track of project.tracks) {
    if (track.id === main?.id || track.locked || !isLaneKind(track.kind)) continue;
    // Matching cuts on picture and another lane remove the same time only once.
    const removed = mergeSpeech(
      [
        ...removedMain,
        ...(ripple
          ? track.clips
              .filter((clip) => removing.has(clip.id))
              .map((clip) => ({ startSec: clip.timelineStartSec, endSec: clipEnd(clip) }))
          : []),
      ],
      0,
    );
    for (const clip of track.clips) {
      if (removing.has(clip.id)) continue;
      const shift = measureBefore(removed, clip.timelineStartSec);
      if (shift > EPSILON) {
        forward.push({
          commandType: 'move_clip',
          clipId: clip.id,
          fromTrackId: track.id,
          toTrackId: track.id,
          timelineStartSec: Math.max(0, clip.timelineStartSec - shift),
        });
      }
    }
  }
  return {
    label: `${ripple ? 'Ripple delete' : 'Delete'} ${refs.length === 1 ? 'clip' : `${refs.length} clips`}`,
    forward,
  };
}

// ── Copy, paste, duplicate ────────────────────────────────────────────────────────────

/** Paste copied clips with their relative timing kept, the earliest landing at `atSec`. */
export function pasteClipsEdit(
  project: EditorProjectV2,
  copied: readonly ClipRef[],
  atSec: number,
  label = 'Paste',
): TimelineEdit | null {
  if (copied.length === 0) return null;
  const earliest = Math.min(...copied.map((ref) => ref.clip.timelineStartSec));
  let current = project;
  const forward: EditorCommandDraft[] = [];
  for (const ref of [...copied].sort(
    (left, right) => left.clip.timelineStartSec - right.clip.timelineStartSec,
  )) {
    const lane =
      current.tracks.find((track) => track.id === ref.track.id && !track.locked) ??
      laneTracks(current).find((track) => track.kind === ref.clip.kind && !track.locked);
    const startSec = Math.max(0, atSec + ref.clip.timelineStartSec - earliest);
    const clip = { ...ref.clip, id: newId(), timelineStartSec: startSec } as EditorClip;
    const main = mainVideoTrack(current);
    const step: EditorCommandDraft[] = [];
    let trackId = lane?.id;
    if (!trackId) {
      const add = addTrackDraft(current, ref.clip.kind as LaneKind);
      step.push(add);
      trackId = (add as Extract<EditorCommandDraft, { commandType: 'add_track' }>).track.id;
    }
    step.push({ commandType: 'upsert_clip', trackId, clip });
    if (main && trackId === main.id) {
      const others = orderedVideoClips(main);
      const order = [...others];
      order.splice(mainInsertIndex(others, startSec), 0, clip as EditorVideoClip);
      step.push(...repackMain(current.transitions, trackId, order));
    }
    forward.push(...step);
    current = simulate(current, step);
  }
  return { label, forward };
}

/** ⌘D: each clip's copy lands right after it on its own lane. */
export function duplicateClipsEdit(
  project: EditorProjectV2,
  clipIds: readonly string[],
): TimelineEdit | null {
  const refs = clipIds
    .map((id) => findClip(project, id))
    .filter((ref): ref is ClipRef => Boolean(ref));
  if (refs.length === 0) return null;
  const end = Math.max(...refs.map((ref) => clipEnd(ref.clip)));
  return pasteClipsEdit(project, refs, end, 'Duplicate');
}

// ── Snapping and markers ──────────────────────────────────────────────────────────────

/** Snap targets: the playhead, every clip edge not being dragged, and the beat grid. */
export function snapTimes(
  project: EditorProjectV2,
  playheadSec: number,
  excludeClipIds: readonly string[] = [],
): number[] {
  const times = new Set<number>([0, playheadSec]);
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (excludeClipIds.includes(clip.id)) continue;
      times.add(clip.timelineStartSec);
      times.add(clipEnd(clip));
    }
  }
  for (const marker of project.markers) times.add(marker.timeSec);
  return [...times];
}

export const beatTimes = (project: EditorProjectV2): number[] =>
  project.markers.filter((marker) => marker.kind === 'beat').map((marker) => marker.timeSec);

export const addMarkerEdit = (atSec: number): TimelineEdit => ({
  label: 'Add marker',
  forward: [
    {
      commandType: 'upsert_marker',
      marker: { id: newId(), kind: 'timeline', timeSec: atSec, label: 'Marker' },
    },
  ],
});

export const setTrackStateEdit = (
  track: EditorTrack,
  state: { muted?: boolean; locked?: boolean; enabled?: boolean },
): TimelineEdit => ({
  label: `Update ${track.name}`,
  forward: [{ commandType: 'set_track_state', trackId: track.id, ...state }],
});

/**
 * Track header toggles. Muting a video track silences its clips' own sound — it never
 * takes the picture away or hands the main-track role to another track (the compositor,
 * the render gate and the reducer all read `muted` on a video track as "not in picture").
 * Hiding picture is `enabled`.
 */
export function trackStateEdit(
  project: EditorProjectV2,
  trackId: string,
  state: { muted?: boolean; locked?: boolean; enabled?: boolean },
): TimelineEdit | null {
  const track = project.tracks.find((candidate) => candidate.id === trackId);
  if (!track) return null;
  const { muted, ...rest } = state;
  const forward: EditorCommandDraft[] = [];
  if (muted !== undefined && track.kind === 'video') {
    forward.push(
      ...track.clips
        .filter((clip) => clip.audioEnabled === muted)
        .map((clip) => ({
          commandType: 'upsert_clip' as const,
          trackId,
          clip: { ...clip, audioEnabled: !muted },
        })),
    );
    if (track.muted) forward.push({ commandType: 'set_track_state', trackId, muted: false });
  } else if (muted !== undefined) {
    forward.push({ commandType: 'set_track_state', trackId, muted });
  }
  if (Object.keys(rest).length > 0) {
    forward.push({ commandType: 'set_track_state', trackId, ...rest });
  }
  return forward.length > 0 ? { label: `Update ${track.name}`, forward } : null;
}

export const removeTrackEdit = (track: EditorTrack): TimelineEdit => ({
  label: `Delete ${track.name}`,
  forward: [{ commandType: 'remove_track', trackId: track.id, deleteClips: true }],
});

/**
 * Replace a clip with an edited copy (inspector changes). A main-track clip whose
 * duration changed — a new constant speed — re-packs the sequence behind it.
 */
export function replaceClipEdit(
  project: EditorProjectV2,
  clip: EditorClip,
  label = 'Edit clip',
): TimelineEdit | null {
  const found = findClip(project, clip.id);
  if (!found || found.track.locked) return null;
  const forward: EditorCommandDraft[] = [
    { commandType: 'upsert_clip', trackId: found.track.id, clip },
  ];
  const main = mainVideoTrack(project);
  if (
    main &&
    found.track.id === main.id &&
    Math.abs(clip.durationSec - found.clip.durationSec) > EPSILON
  ) {
    const order = orderedVideoClips(main).map((candidate) =>
      candidate.id === clip.id ? (clip as EditorVideoClip) : candidate,
    );
    forward.push(...repackMain(project.transitions, main.id, order));
  }
  return { label, forward };
}
