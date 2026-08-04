import type {
  EditorAudioClip,
  EditorClip,
  EditorCommand,
  EditorOverlayClip,
  EditorProjectV2,
  EditorTextClip,
  EditorTrack,
  EditorTransition,
  EditorVideoClip,
  MediaAssetVersion,
} from '@continuum/contracts';
import type { TimelineItem } from '../../types';
import {
  type ClipTransition,
  computeOutputPlacements,
  overlapInSecFor,
} from '../../utils/render/transitions';
import type { ClipPlacement } from './commentMapping';
import { computeLayout, type TimelineLayout } from './useTimelineEditorModel';

export type EditorCommandDraft = EditorCommand extends infer Command
  ? Command extends EditorCommand
    ? Omit<Command, 'commandId' | 'idempotencyKey' | 'expectedRevision' | 'issuedAt' | 'actor'>
    : never
  : never;

export interface EditorAssemblyOperation {
  label: string;
  forward: EditorCommandDraft[];
  inverse: EditorCommandDraft[];
}

export const MIN_ASSEMBLY_CLIP_SEC = 0.1;

function placementStart(project: EditorProjectV2, requested: number): number {
  if (project.durationSec < MIN_ASSEMBLY_CLIP_SEC) {
    throw new Error('The assembly needs at least 0.1 seconds before media can be placed.');
  }
  return Math.max(0, Math.min(requested, project.durationSec - MIN_ASSEMBLY_CLIP_SEC));
}

export function exactVersionPreviewUrl(
  versions: readonly MediaAssetVersion[],
  versionId: string,
): string | undefined {
  const exact = versions.find((version) => version.id === versionId);
  // The canonical version payload is always safe for the clip's declared media kind.
  // A generated preview can instead be a video poster image, which is not playable in
  // the timeline's <video> surface.
  return exact?.signedUrl ?? exact?.preview?.signedUrl ?? undefined;
}

export function primaryVideoTrack(
  project: EditorProjectV2,
): Extract<EditorTrack, { kind: 'video' }> | undefined {
  const tracks = project.tracks.filter(
    (track): track is Extract<EditorTrack, { kind: 'video' }> => track.kind === 'video',
  );
  return tracks.find((track) => track.id === 'production-masters') ?? tracks[0];
}

export function orderedVideoClips(
  track: Extract<EditorTrack, { kind: 'video' }> | undefined,
): EditorVideoClip[] {
  return [...(track?.clips ?? [])].sort(
    (left, right) =>
      left.timelineStartSec - right.timelineStartSec || left.id.localeCompare(right.id),
  );
}

export function videoTimelineItems(project: EditorProjectV2): TimelineItem[] {
  const clips = orderedVideoClips(primaryVideoTrack(project));
  return clips.map((clip, order) => ({
    id: clip.id,
    order,
    sourceNodeId: clip.id,
    kind: 'video',
    trimStartSec: clip.sourceInSec,
    trimEndSec: clip.sourceInSec + clip.durationSec * clip.playbackRate,
    muteAudio: !clip.audioEnabled,
    transition:
      order > 0
        ? clipTransitionForBoundary(project.transitions, clips[order - 1].id, clip.id)
        : undefined,
  }));
}

export function videoLayout(project: EditorProjectV2, pxPerSec: number): TimelineLayout {
  const clips = new Map(
    orderedVideoClips(primaryVideoTrack(project)).map((clip) => [clip.id, clip] as const),
  );
  return computeLayout(
    videoTimelineItems(project),
    (item) => clips.get(item.id)?.durationSec ?? MIN_ASSEMBLY_CLIP_SEC,
    pxPerSec,
  );
}

export function editorProjectV2CommentPlacements(
  project: EditorProjectV2,
  layout: TimelineLayout,
): ClipPlacement[] {
  const videoById = new Map(
    project.tracks
      .filter((track): track is Extract<EditorTrack, { kind: 'video' }> => track.kind === 'video')
      .flatMap((track) => track.clips.map((clip) => [clip.id, clip] as const)),
  );
  const base = layout.clips.flatMap((placement): ClipPlacement[] => {
    const clip = videoById.get(placement.item.id);
    if (!clip || clip.source.sourceType !== 'library_asset') return [];
    return [
      {
        itemId: clip.id,
        assetId: clip.source.assetId,
        trimStartSec: clip.sourceInSec,
        trimEndSec: clip.sourceInSec + placement.durationSec * clip.playbackRate,
        speed: clip.playbackRate,
        outputStartSec: placement.startSec,
        track: 'base',
      },
    ];
  });
  const overlays = project.tracks
    .filter((track): track is Extract<EditorTrack, { kind: 'overlay' }> => track.kind === 'overlay')
    .flatMap((track) => track.clips)
    .flatMap((clip): ClipPlacement[] => {
      if (clip.mediaKind !== 'video' || clip.source.sourceType !== 'library_asset' || !clip.enabled)
        return [];
      const trimStartSec = clip.sourceInSec ?? 0;
      return [
        {
          itemId: clip.id,
          assetId: clip.source.assetId,
          trimStartSec,
          trimEndSec: trimStartSec + clip.durationSec,
          speed: 1,
          outputStartSec: clip.timelineStartSec,
          track: 'overlay',
        },
      ];
    });
  return [...base, ...overlays];
}

function findTrack(project: EditorProjectV2, trackId: string): EditorTrack {
  const track = project.tracks.find((candidate) => candidate.id === trackId);
  if (!track) throw new Error(`Timeline track "${trackId}" was not found.`);
  return track;
}

function findClip(project: EditorProjectV2, trackId: string, clipId: string): EditorClip {
  const clip = findTrack(project, trackId).clips.find((candidate) => candidate.id === clipId);
  if (!clip) throw new Error(`Timeline clip "${clipId}" was not found.`);
  return clip;
}

function clipTransitionForBoundary(
  transitions: readonly EditorTransition[],
  fromClipId: string,
  toClipId: string,
): ClipTransition | undefined {
  const transition = transitions.find(
    (candidate) => candidate.fromClipId === fromClipId && candidate.toClipId === toClipId,
  );
  if (!transition || transition.transitionType === 'cut') return undefined;
  const type: ClipTransition['type'] =
    transition.transitionType === 'crossfade'
      ? 'crossDissolve'
      : transition.transitionType === 'dip_to_black'
        ? 'fade'
        : transition.transitionType === 'dip_to_white'
          ? 'dipWhite'
          : transition.transitionType === 'slide'
            ? transition.parameters.direction === 'right'
              ? 'slideRight'
              : transition.parameters.direction === 'up'
                ? 'slideUp'
                : transition.parameters.direction === 'down'
                  ? 'slideDown'
                  : 'slideLeft'
            : transition.transitionType === 'wipe'
              ? transition.parameters.direction === 'right'
                ? 'wipeRight'
                : 'wipeLeft'
              : transition.transitionType === 'zoom'
                ? 'zoomIn'
                : 'crossDissolve';
  return { type, durationSec: transition.durationSec };
}

function positionedVideoClips(
  clips: readonly EditorVideoClip[],
  transitions: readonly EditorTransition[],
): EditorVideoClip[] {
  const { placements } = computeOutputPlacements(
    clips.map((clip, index) => ({
      outputDurationSec: clip.durationSec,
      crossDissolveInSec:
        index > 0
          ? overlapInSecFor(clipTransitionForBoundary(transitions, clips[index - 1].id, clip.id))
          : 0,
    })),
  );
  return clips.map((clip, index) => ({
    ...clip,
    timelineStartSec: placements[index]?.outputStartSec ?? 0,
  }));
}

function moveCommands(
  trackId: string,
  clips: readonly EditorVideoClip[],
  transitions: readonly EditorTransition[] = [],
): EditorCommandDraft[] {
  return positionedVideoClips(clips, transitions).map((clip) => {
    const command: EditorCommandDraft = {
      commandType: 'move_clip',
      clipId: clip.id,
      fromTrackId: trackId,
      toTrackId: trackId,
      timelineStartSec: clip.timelineStartSec,
    };
    return command;
  });
}

function projectEndWithTrack(
  project: EditorProjectV2,
  trackId: string,
  replacementClips: readonly EditorClip[],
): number {
  return Math.max(
    0,
    ...project.tracks.flatMap((track) =>
      (track.id === trackId ? replacementClips : track.clips).map(
        (clip) => clip.timelineStartSec + clip.durationSec,
      ),
    ),
  );
}

export function reorderVideoOperation(
  project: EditorProjectV2,
  trackId: string,
  fromClipId: string,
  toClipId: string,
): EditorAssemblyOperation | null {
  const track = findTrack(project, trackId);
  if (track.kind !== 'video') throw new Error('Only a video track can be reordered.');
  const current = orderedVideoClips(track);
  const from = current.findIndex((clip) => clip.id === fromClipId);
  const to = current.findIndex((clip) => clip.id === toClipId);
  if (from < 0 || to < 0 || from === to) return null;
  const next = [...current];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return {
    label: 'Reorder clips',
    forward: moveCommands(trackId, next, project.transitions),
    inverse: moveCommands(trackId, current, project.transitions),
  };
}

export function trimClipOperation(
  project: EditorProjectV2,
  trackId: string,
  clipId: string,
  input: { sourceInSec?: number; durationSec: number },
): EditorAssemblyOperation {
  const clip = findClip(project, trackId, clipId);
  if (!('sourceInSec' in clip)) throw new Error('This clip does not have trimmable media.');
  const durationSec = Math.max(
    MIN_ASSEMBLY_CLIP_SEC,
    Math.min(input.durationSec, clip.durationSec),
  );
  const sourceInSec = Math.max(0, input.sourceInSec ?? clip.sourceInSec ?? 0);
  const track = findTrack(project, trackId);
  const timelineReflow =
    track.kind === 'video'
      ? moveCommands(
          trackId,
          orderedVideoClips(track).map((candidate) =>
            candidate.id === clipId ? { ...candidate, durationSec } : candidate,
          ),
          project.transitions,
        )
      : [];
  const inverseReflow =
    track.kind === 'video'
      ? moveCommands(trackId, orderedVideoClips(track), project.transitions)
      : [];
  const replacementClips = track.clips.map((candidate) =>
    candidate.id === clipId ? { ...candidate, durationSec } : candidate,
  );
  const positionedReplacement =
    track.kind === 'video'
      ? positionedVideoClips(replacementClips as EditorVideoClip[], project.transitions)
      : replacementClips;
  const nextDurationSec = projectEndWithTrack(project, trackId, positionedReplacement);
  return {
    label: 'Trim clip',
    forward: [
      {
        commandType: 'trim_clip',
        trackId,
        clipId,
        sourceInSec,
        timelineStartSec: clip.timelineStartSec,
        durationSec,
      },
      ...timelineReflow,
      { commandType: 'set_project_metadata', durationSec: nextDurationSec },
    ],
    inverse: [
      {
        commandType: 'trim_clip',
        trackId,
        clipId,
        sourceInSec: clip.sourceInSec,
        timelineStartSec: clip.timelineStartSec,
        durationSec: clip.durationSec,
      },
      ...inverseReflow,
      { commandType: 'set_project_metadata', durationSec: project.durationSec },
    ],
  };
}

export function splitClipOperation(
  project: EditorProjectV2,
  trackId: string,
  clipId: string,
  splitAtSec: number,
  rightClipId: string,
): EditorAssemblyOperation | null {
  const clip = findClip(project, trackId, clipId);
  if (
    splitAtSec <= MIN_ASSEMBLY_CLIP_SEC ||
    splitAtSec >= clip.durationSec - MIN_ASSEMBLY_CLIP_SEC
  ) {
    return null;
  }
  return {
    label: 'Split clip',
    forward: [{ commandType: 'split_clip', trackId, clipId, splitAtSec, rightClipId }],
    inverse: [
      { commandType: 'remove_clip', trackId, clipId: rightClipId },
      {
        commandType: 'trim_clip',
        trackId,
        clipId,
        ...('sourceInSec' in clip ? { sourceInSec: clip.sourceInSec } : {}),
        timelineStartSec: clip.timelineStartSec,
        durationSec: clip.durationSec,
      },
    ],
  };
}

export function removeClipOperation(
  project: EditorProjectV2,
  trackId: string,
  clipId: string,
): EditorAssemblyOperation {
  const clip = findClip(project, trackId, clipId);
  const track = findTrack(project, trackId);
  const currentVideo = track.kind === 'video' ? orderedVideoClips(track) : [];
  const remainingVideo = currentVideo.filter((candidate) => candidate.id !== clipId);
  let remainingStart = 0;
  const positionedRemaining = remainingVideo.map((candidate) => {
    const positioned = { ...candidate, timelineStartSec: remainingStart };
    remainingStart += candidate.durationSec;
    return positioned;
  });
  const remainingClips =
    track.kind === 'video'
      ? positionedRemaining
      : track.clips.filter((candidate) => candidate.id !== clipId);
  const nextDurationSec = projectEndWithTrack(project, trackId, remainingClips);
  return {
    label: 'Delete clip',
    forward: [
      { commandType: 'remove_clip', trackId, clipId },
      ...(track.kind === 'video' ? moveCommands(trackId, remainingVideo, project.transitions) : []),
      { commandType: 'set_project_metadata', durationSec: nextDurationSec },
    ],
    inverse: [
      { commandType: 'upsert_clip', trackId, clip },
      ...(track.kind === 'video' ? moveCommands(trackId, currentVideo, project.transitions) : []),
      { commandType: 'set_project_metadata', durationSec: project.durationSec },
    ],
  };
}

function nextTrackOrder(project: EditorProjectV2): number {
  return Math.max(-1, ...project.tracks.map((track) => track.order)) + 1;
}

export function upsertTextOperation(
  project: EditorProjectV2,
  input: {
    clipId?: string;
    text: string;
    timelineStartSec: number;
    durationSec: number;
    fontSizePx?: number;
    color?: string;
    x?: number;
    y?: number;
  },
): EditorAssemblyOperation {
  const text = input.text.trim();
  if (!text) throw new Error('Text overlays cannot be empty.');
  const existingTrack = project.tracks.find(
    (track): track is Extract<EditorTrack, { kind: 'text' }> => track.kind === 'text',
  );
  const existing = input.clipId
    ? existingTrack?.clips.find((clip) => clip.id === input.clipId)
    : undefined;
  const trackId = existingTrack?.id ?? `${project.sequenceId}:text`;
  const clipId = input.clipId ?? crypto.randomUUID();
  const timelineStartSec = placementStart(project, input.timelineStartSec);
  const maxDuration = project.durationSec - timelineStartSec;
  const clip: EditorTextClip = {
    id: clipId,
    name: existing?.name ?? 'Text overlay',
    timelineStartSec,
    durationSec: Math.max(MIN_ASSEMBLY_CLIP_SEC, Math.min(input.durationSec, maxDuration)),
    enabled: true,
    locked: false,
    tags: existing?.tags ?? [],
    kind: 'text',
    text,
    style: {
      fontFamily: existing?.style.fontFamily ?? 'Inter',
      fontSizePx: input.fontSizePx ?? existing?.style.fontSizePx ?? 64,
      fontWeight: existing?.style.fontWeight ?? 700,
      italic: existing?.style.italic ?? false,
      underline: existing?.style.underline ?? false,
      alignment: existing?.style.alignment ?? 'center',
      color: input.color ?? existing?.style.color ?? '#ffffff',
      backgroundColor: existing?.style.backgroundColor,
      outlineColor: existing?.style.outlineColor,
      outlineWidthPx: existing?.style.outlineWidthPx ?? 0,
      shadowColor: existing?.style.shadowColor,
      shadowBlurPx: existing?.style.shadowBlurPx ?? 0,
      lineHeight: existing?.style.lineHeight ?? 1.2,
      trackingEm: existing?.style.trackingEm ?? 0,
    },
    transform: {
      ...(existing?.transform ?? {
        position: { x: 0.5, y: 0.18, unit: 'normalized' as const },
        scaleX: 1,
        scaleY: 1,
        rotationDeg: 0,
        anchorX: 0.5,
        anchorY: 0.5,
        opacity: 1,
      }),
      position: {
        x: input.x ?? existing?.transform.position.x ?? 0.5,
        y: input.y ?? existing?.transform.position.y ?? 0.18,
        unit: 'normalized',
      },
    },
    animationIn: existing?.animationIn,
    animationOut: existing?.animationOut,
    effects: existing?.effects ?? [],
    keyframes: existing?.keyframes ?? [],
  };
  const forward: EditorCommandDraft[] = [];
  if (!existingTrack) {
    forward.push({
      commandType: 'add_track',
      track: {
        id: trackId,
        name: 'Text overlays',
        order: nextTrackOrder(project),
        enabled: true,
        locked: false,
        muted: false,
        solo: false,
        kind: 'text',
        clips: [],
      },
    });
  }
  forward.push({ commandType: 'upsert_clip', trackId, clip });
  return {
    label: existing ? 'Edit text overlay' : 'Add text overlay',
    forward,
    inverse: existing
      ? [{ commandType: 'upsert_clip', trackId, clip: existing }]
      : [
          { commandType: 'remove_clip', trackId, clipId },
          ...(!existingTrack
            ? ([
                { commandType: 'remove_track', trackId, deleteClips: true },
              ] as EditorCommandDraft[])
            : []),
        ],
  };
}

export function upsertOverlayOperation(
  project: EditorProjectV2,
  input: {
    clipId?: string;
    assetId: string;
    versionId: string;
    label: string;
    mediaKind: 'video' | 'image';
    timelineStartSec: number;
    durationSec: number;
    x?: number;
    y?: number;
    scale?: number;
    opacity?: number;
  },
): EditorAssemblyOperation {
  const existingTrack = project.tracks.find(
    (track): track is Extract<EditorTrack, { kind: 'overlay' }> => track.kind === 'overlay',
  );
  const existing = input.clipId
    ? existingTrack?.clips.find((clip) => clip.id === input.clipId)
    : undefined;
  const trackId = existingTrack?.id ?? `${project.sequenceId}:overlays`;
  const clipId = input.clipId ?? crypto.randomUUID();
  const timelineStartSec = placementStart(project, input.timelineStartSec);
  const maxDuration = project.durationSec - timelineStartSec;
  const scale = Math.max(0.05, Math.min(4, input.scale ?? existing?.transform.scaleX ?? 0.4));
  const clip: EditorOverlayClip = {
    id: clipId,
    name: input.label.trim() || existing?.name || 'Overlay',
    timelineStartSec,
    durationSec: Math.max(MIN_ASSEMBLY_CLIP_SEC, Math.min(input.durationSec, maxDuration)),
    enabled: true,
    locked: false,
    tags: existing?.tags ?? [],
    kind: 'overlay',
    source: {
      sourceType: 'library_asset',
      assetId: input.assetId,
      renditionId: input.versionId,
    },
    mediaKind: input.mediaKind,
    sourceInSec: existing?.sourceInSec ?? 0,
    transform: {
      ...(existing?.transform ?? {
        position: { x: 0.5, y: 0.5, unit: 'normalized' as const },
        rotationDeg: 0,
        anchorX: 0.5,
        anchorY: 0.5,
      }),
      position: {
        x: Math.max(0, Math.min(1, input.x ?? existing?.transform.position.x ?? 0.5)),
        y: Math.max(0, Math.min(1, input.y ?? existing?.transform.position.y ?? 0.5)),
        unit: 'normalized',
      },
      scaleX: scale,
      scaleY: scale,
      opacity: Math.max(0, Math.min(1, input.opacity ?? existing?.transform.opacity ?? 1)),
    },
    crop: existing?.crop ?? { left: 0, top: 0, right: 0, bottom: 0 },
    blendMode: existing?.blendMode ?? 'normal',
    effects: existing?.effects ?? [],
    keyframes: existing?.keyframes ?? [],
  };
  const forward: EditorCommandDraft[] = [];
  if (!existingTrack) {
    forward.push({
      commandType: 'add_track',
      track: {
        id: trackId,
        name: 'Media overlays',
        order: nextTrackOrder(project),
        enabled: true,
        locked: false,
        muted: false,
        solo: false,
        kind: 'overlay',
        clips: [],
      },
    });
  }
  forward.push({ commandType: 'upsert_clip', trackId, clip });
  return {
    label: existing ? 'Edit media overlay' : 'Add media overlay',
    forward,
    inverse: existing
      ? [{ commandType: 'upsert_clip', trackId, clip: existing }]
      : [
          { commandType: 'remove_clip', trackId, clipId },
          ...(!existingTrack
            ? ([
                { commandType: 'remove_track', trackId, deleteClips: true },
              ] as EditorCommandDraft[])
            : []),
        ],
  };
}

export function upsertTransitionOperation(
  project: EditorProjectV2,
  input: {
    transitionId?: string;
    trackId: string;
    fromClipId: string;
    toClipId: string;
    transitionType: EditorTransition['transitionType'];
    durationSec: number;
  },
): EditorAssemblyOperation {
  const existing = input.transitionId
    ? project.transitions.find((transition) => transition.id === input.transitionId)
    : project.transitions.find(
        (transition) =>
          transition.trackId === input.trackId &&
          transition.fromClipId === input.fromClipId &&
          transition.toClipId === input.toClipId,
      );
  const track = findTrack(project, input.trackId);
  if (track.kind !== 'video') throw new Error('Transitions require a video track.');
  const from = track.clips.find((clip) => clip.id === input.fromClipId);
  const to = track.clips.find((clip) => clip.id === input.toClipId);
  if (!from || !to) throw new Error('Both transition clips must exist on the video track.');
  const transition: EditorTransition = {
    id: existing?.id ?? input.transitionId ?? crypto.randomUUID(),
    trackId: input.trackId,
    fromClipId: input.fromClipId,
    toClipId: input.toClipId,
    transitionType: input.transitionType,
    durationSec: Math.max(
      MIN_ASSEMBLY_CLIP_SEC,
      Math.min(input.durationSec, from.durationSec, to.durationSec),
    ),
    alignment: existing?.alignment ?? 'centered',
    parameters: existing?.parameters ?? {},
    transitionId: existing?.transitionId,
  };
  const nextTransitions = existing
    ? project.transitions.map((candidate) =>
        candidate.id === transition.id ? transition : candidate,
      )
    : [...project.transitions, transition];
  const ordered = orderedVideoClips(track);
  const positioned = positionedVideoClips(ordered, nextTransitions);
  const nextDurationSec = projectEndWithTrack(project, input.trackId, positioned);
  return {
    label: existing ? 'Edit transition' : 'Add transition',
    forward: [
      { commandType: 'upsert_transition', transition },
      ...moveCommands(input.trackId, ordered, nextTransitions),
      { commandType: 'set_project_metadata', durationSec: nextDurationSec },
    ],
    inverse: existing
      ? [
          { commandType: 'upsert_transition', transition: existing },
          ...moveCommands(input.trackId, ordered, project.transitions),
          { commandType: 'set_project_metadata', durationSec: project.durationSec },
        ]
      : [
          { commandType: 'remove_transition', transitionId: transition.id },
          ...moveCommands(input.trackId, ordered, project.transitions),
          { commandType: 'set_project_metadata', durationSec: project.durationSec },
        ],
  };
}

export function removeTransitionOperation(
  project: EditorProjectV2,
  transitionId: string,
): EditorAssemblyOperation {
  const transition = project.transitions.find((candidate) => candidate.id === transitionId);
  if (!transition) throw new Error('Timeline transition was not found.');
  const track = findTrack(project, transition.trackId);
  if (track.kind !== 'video') throw new Error('Transitions require a video track.');
  const ordered = orderedVideoClips(track);
  const nextTransitions = project.transitions.filter((candidate) => candidate.id !== transitionId);
  const positioned = positionedVideoClips(ordered, nextTransitions);
  const nextDurationSec = projectEndWithTrack(project, transition.trackId, positioned);
  return {
    label: 'Delete transition',
    forward: [
      { commandType: 'remove_transition', transitionId },
      ...moveCommands(transition.trackId, ordered, nextTransitions),
      { commandType: 'set_project_metadata', durationSec: nextDurationSec },
    ],
    inverse: [
      { commandType: 'upsert_transition', transition },
      ...moveCommands(transition.trackId, ordered, project.transitions),
      { commandType: 'set_project_metadata', durationSec: project.durationSec },
    ],
  };
}

export function placeAudioOperation(
  project: EditorProjectV2,
  input: {
    assetId: string;
    versionId: string;
    label: string;
    timelineStartSec: number;
    sourceDurationSec?: number;
  },
): EditorAssemblyOperation {
  const existingTrack = project.tracks.find(
    (track): track is Extract<EditorTrack, { kind: 'audio' }> =>
      track.kind === 'audio' && track.id !== `${project.sequenceId}:audio`,
  );
  const trackId = existingTrack?.id ?? `${project.sequenceId}:soundtrack`;
  const clipId = crypto.randomUUID();
  const start = placementStart(project, input.timelineStartSec);
  const available = project.durationSec - start;
  const durationSec = Math.max(
    MIN_ASSEMBLY_CLIP_SEC,
    Math.min(input.sourceDurationSec ?? available, available),
  );
  const clip: EditorAudioClip = {
    id: clipId,
    name: input.label,
    timelineStartSec: start,
    durationSec,
    enabled: true,
    locked: false,
    tags: [],
    kind: 'audio',
    source: {
      sourceType: 'library_asset',
      assetId: input.assetId,
      renditionId: input.versionId,
    },
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
  };
  const forward: EditorCommandDraft[] = [];
  if (!existingTrack) {
    forward.push({
      commandType: 'add_track',
      track: {
        id: trackId,
        name: 'Soundtrack',
        order: nextTrackOrder(project),
        enabled: true,
        locked: false,
        muted: false,
        solo: false,
        kind: 'audio',
        clips: [],
      },
    });
  }
  forward.push({ commandType: 'upsert_clip', trackId, clip });
  return {
    label: 'Add audio',
    forward,
    inverse: [
      { commandType: 'remove_clip', trackId, clipId },
      ...(!existingTrack
        ? ([{ commandType: 'remove_track', trackId, deleteClips: true }] as EditorCommandDraft[])
        : []),
    ],
  };
}

export function patchAudioOperation(
  project: EditorProjectV2,
  trackId: string,
  clipId: string,
  patch: Partial<
    Pick<
      EditorAudioClip,
      'timelineStartSec' | 'sourceInSec' | 'durationSec' | 'volume' | 'fadeInSec' | 'fadeOutSec'
    >
  >,
): EditorAssemblyOperation {
  const current = findClip(project, trackId, clipId);
  if (current.kind !== 'audio') throw new Error('Only audio clips accept audio placement edits.');
  const start = placementStart(project, patch.timelineStartSec ?? current.timelineStartSec);
  const available = project.durationSec - start;
  const durationSec = Math.max(
    MIN_ASSEMBLY_CLIP_SEC,
    Math.min(patch.durationSec ?? current.durationSec, available),
  );
  const clip: EditorAudioClip = {
    ...current,
    timelineStartSec: start,
    sourceInSec: Math.max(0, patch.sourceInSec ?? current.sourceInSec),
    durationSec,
    volume: Math.max(0, Math.min(4, patch.volume ?? current.volume)),
    fadeInSec: Math.min(durationSec, Math.max(0, patch.fadeInSec ?? current.fadeInSec)),
    fadeOutSec: Math.min(durationSec, Math.max(0, patch.fadeOutSec ?? current.fadeOutSec)),
  };
  return {
    label: 'Edit audio placement',
    forward: [{ commandType: 'upsert_clip', trackId, clip }],
    inverse: [{ commandType: 'upsert_clip', trackId, clip: current }],
  };
}
