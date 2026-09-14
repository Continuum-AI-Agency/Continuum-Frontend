import {
  type EditorActorRef,
  type EditorClip,
  type EditorCommand,
  type EditorCommandBatch,
  type EditorKeyframe,
  type EditorProjectV2,
  type EditorShot,
  type EditorSourceBinding,
  type EditorTake,
  editorCommandBatchSchema,
  editorProjectV2Schema,
} from './editor-project-v2';
import { compileMotionStyle, trimStyleInstance } from './motion-styles';

export class EditorProjectConflictError extends Error {
  constructor(
    message: string,
    readonly reason: 'stale_revision' | 'stale_fingerprint' | 'invalid_command',
  ) {
    super(message);
    this.name = 'EditorProjectConflictError';
  }
}

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => key !== 'fingerprint')
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
};

export const fingerprintEditorProject = (project: EditorProjectV2): string => {
  const serialized = JSON.stringify(stableValue(project));
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `editor-v2-${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

/** Replace only declared media slots; every edit, placement and effect stays untouched. */
export function bindEditorProjectSources(
  project: EditorProjectV2,
  bindings: readonly EditorSourceBinding[],
): EditorProjectV2 {
  const bySlot = new Map<string, EditorSourceBinding>();
  for (const binding of bindings) {
    if (bySlot.has(binding.slotId))
      throw new Error(`Editor source slot "${binding.slotId}" was bound twice.`);
    bySlot.set(binding.slotId, binding);
  }
  const matched = new Set<string>();
  const draft = editorProjectV2Schema.parse({
    ...project,
    tracks: project.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => {
        if (!('source' in clip)) return clip;
        const slotId = clip.source.slotId ?? clip.id;
        const binding = bySlot.get(slotId);
        if (!binding) return clip;
        matched.add(slotId);
        return {
          ...clip,
          source: {
            sourceType: 'library_asset',
            assetId: binding.assetId,
            renditionId: binding.versionId,
            slotId,
            ...(clip.source.sourceRole ? { sourceRole: clip.source.sourceRole } : {}),
          },
        };
      }),
    })),
  });
  const missing = bindings.filter((binding) => !matched.has(binding.slotId));
  if (missing.length > 0) {
    throw new Error(
      `Unknown editor source slot(s): ${missing.map((binding) => binding.slotId).join(', ')}.`,
    );
  }
  return editorProjectV2Schema.parse({ ...draft, fingerprint: fingerprintEditorProject(draft) });
}

export interface EditorProjectSourceSlot {
  slotId: string;
  label: string;
  mediaKind: 'image' | 'video' | 'audio';
}

/** Public replacement points derived from the exact clips a person positioned in the editor. */
export function editorProjectSourceSlots(project: EditorProjectV2): EditorProjectSourceSlot[] {
  return project.tracks.flatMap((track) =>
    track.clips.flatMap((clip) => {
      if (!('source' in clip)) return [];
      const mediaKind =
        clip.kind === 'audio'
          ? ('audio' as const)
          : clip.kind === 'overlay'
            ? clip.mediaKind === 'graphic'
              ? 'image'
              : clip.mediaKind
            : clip.kind === 'video'
              ? ('video' as const)
              : null;
      return mediaKind
        ? [{ slotId: clip.source.slotId ?? clip.id, label: clip.name ?? clip.id, mediaKind }]
        : [];
    }),
  );
}

export function createEditorProjectV2(input: {
  projectId: string;
  title: string;
  width: number;
  height: number;
  now?: string;
}): EditorProjectV2 {
  const now = input.now ?? new Date().toISOString();
  const draft = editorProjectV2Schema.parse({
    schemaVersion: 2,
    projectId: input.projectId,
    sequenceId: 'sequence-main',
    revision: 0,
    fingerprint: 'pending',
    title: input.title,
    durationSec: 0,
    canvas: { width: input.width, height: input.height },
    frameRate: { numerator: 30, denominator: 1 },
    sampleRateHz: 48_000,
    tracks: [],
    transitions: [],
    production: {
      workflowStage: 'style_draft',
      references: [],
      styleContract: null,
      shots: [],
    },
    exportSettings: {
      width: input.width,
      height: input.height,
      frameRate: { numerator: 30, denominator: 1 },
      format: 'mp4',
      videoCodec: 'h264',
      videoBitrateKbps: 12_000,
      audioCodec: 'aac',
      audioBitrateKbps: 320,
      sampleRateHz: 48_000,
      colorSpace: 'rec709',
      quality: 'master',
    },
    createdAt: now,
    updatedAt: now,
  });
  return { ...draft, fingerprint: fingerprintEditorProject(draft) };
}

const requireUser = (actor: EditorActorRef): void => {
  if (actor.actorType !== 'user') {
    throw new EditorProjectConflictError(
      'Approval and rejection commands require a user actor.',
      'invalid_command',
    );
  }
};

const findShot = (project: EditorProjectV2, shotId: string): EditorShot => {
  const shot = project.production.shots.find((candidate) => candidate.id === shotId);
  if (!shot) {
    throw new EditorProjectConflictError(`Shot "${shotId}" was not found.`, 'invalid_command');
  }
  return shot;
};

const selectionFieldFor = (
  kind: EditorTake['kind'],
): 'frameTakeId' | 'motionDraftTakeId' | 'motionMasterTakeId' => {
  if (kind === 'frame') return 'frameTakeId';
  if (kind === 'motion_draft') return 'motionDraftTakeId';
  return 'motionMasterTakeId';
};

const stageAfterApproval = (project: EditorProjectV2, kind: EditorTake['kind']) => {
  const selectionField = selectionFieldFor(kind);
  const allSelected =
    project.production.shots.length > 0 &&
    project.production.shots.every((shot) => Boolean(shot.selection[selectionField]));
  if (kind === 'frame') return allSelected ? 'motion_generation' : 'frame_approval';
  if (kind === 'motion_draft') return allSelected ? 'master_generation' : 'motion_approval';
  return allSelected ? 'assembly' : 'master_approval';
};

const syncApprovedMasterTrack = (project: EditorProjectV2): EditorProjectV2 => {
  const existingTrack = project.tracks.find((candidate) => candidate.id === 'production-masters');
  if (existingTrack && existingTrack.kind !== 'video') {
    throw new EditorProjectConflictError(
      'The production masters track must be a video track.',
      'invalid_command',
    );
  }
  let clips = existingTrack?.clips ?? [];
  let appendAtSec = clips.reduce(
    (end, clip) => Math.max(end, clip.timelineStartSec + clip.durationSec),
    0,
  );
  for (const shot of [...project.production.shots].sort(
    (left, right) => left.order - right.order,
  )) {
    const take = shot.takes.find((candidate) => candidate.id === shot.selection.motionMasterTakeId);
    const asset = take?.asset;
    if (!asset) continue;
    const shotTag = `shot:${shot.id}`;
    const matching = clips.filter(
      (clip) => clip.id === `master:${shot.id}` || clip.tags.includes(shotTag),
    );
    if (matching.length > 0) {
      clips = clips.map((clip) =>
        matching.some((candidate) => candidate.id === clip.id)
          ? {
              ...clip,
              name: clip.id === `master:${shot.id}` ? shot.title : clip.name,
              tags: [...new Set([...clip.tags, 'approved-master', shotTag])],
              source: {
                sourceType: 'library_asset' as const,
                assetId: asset.assetId,
                renditionId: asset.versionId,
              },
            }
          : clip,
      );
      continue;
    }
    clips = [
      ...clips,
      {
        id: `master:${shot.id}`,
        name: shot.title,
        timelineStartSec: appendAtSec,
        durationSec: 8,
        enabled: true,
        locked: false,
        tags: ['approved-master', shotTag],
        kind: 'video' as const,
        source: {
          sourceType: 'library_asset' as const,
          assetId: asset.assetId,
          renditionId: asset.versionId,
        },
        sourceInSec: 0,
        playbackRate: 1,
        reverse: false,
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
        crop: { left: 0, top: 0, right: 0, bottom: 0 },
        blendMode: 'normal' as const,
        audioEnabled: true,
        effects: [],
        keyframes: [],
      },
    ];
    appendAtSec += 8;
  }
  const track = existingTrack
    ? { ...existingTrack, clips }
    : {
        id: 'production-masters',
        name: 'Approved masters',
        order: 0,
        enabled: true,
        locked: false,
        muted: false,
        solo: false,
        kind: 'video' as const,
        clips,
      };
  const existing = project.tracks.findIndex((candidate) => candidate.id === track.id);
  const tracks =
    existing < 0
      ? [track, ...project.tracks.map((candidate, order) => ({ ...candidate, order: order + 1 }))]
      : project.tracks.map((candidate, order) =>
          candidate.id === track.id ? { ...track, order } : { ...candidate, order },
        );
  return { ...project, tracks, durationSec: deriveTimelineDuration(tracks) };
};

const replaceShot = (
  project: EditorProjectV2,
  shotId: string,
  update: (shot: EditorShot) => EditorShot,
): EditorProjectV2 => ({
  ...project,
  production: {
    ...project.production,
    shots: project.production.shots.map((shot) => (shot.id === shotId ? update(shot) : shot)),
  },
});

const applyTakeReview = (
  project: EditorProjectV2,
  command: Extract<EditorCommand, { commandType: 'approve_take' | 'reject_take' }>,
): EditorProjectV2 => {
  requireUser(command.actor);
  const shot = findShot(project, command.shotId);
  const reviewed = shot.takes.find((take) => take.id === command.takeId);
  if (!reviewed || reviewed.status !== 'ready') {
    throw new EditorProjectConflictError('Only a ready take can be reviewed.', 'invalid_command');
  }
  const verdict = command.commandType === 'approve_take' ? 'approved' : 'rejected';
  const selectionField = selectionFieldFor(reviewed.kind);
  const next = replaceShot(project, shot.id, (current) => ({
    ...current,
    takes: current.takes.map((take) => {
      if (take.id === reviewed.id) {
        return {
          ...take,
          verdict,
          reviewedAt: command.issuedAt,
          reviewedBy: command.actor,
          reviewNote: command.reviewNote,
        };
      }
      if (verdict === 'approved' && take.kind === reviewed.kind && take.verdict === 'approved') {
        return {
          ...take,
          verdict: 'rejected' as const,
          reviewedAt: command.issuedAt,
          reviewedBy: command.actor,
          reviewNote: 'Superseded by another approved take.',
        };
      }
      return take;
    }),
    selection: {
      ...current.selection,
      [selectionField]: verdict === 'approved' ? reviewed.id : undefined,
    },
  }));
  if (verdict === 'rejected') return next;
  const staged: EditorProjectV2 = {
    ...next,
    production: {
      ...next.production,
      workflowStage: stageAfterApproval(next, reviewed.kind),
    },
  };
  return reviewed.kind === 'motion_master' ? syncApprovedMasterTrack(staged) : staged;
};

const updateTrack = (
  project: EditorProjectV2,
  trackId: string,
  update: (track: EditorProjectV2['tracks'][number]) => EditorProjectV2['tracks'][number],
): EditorProjectV2 => {
  if (!project.tracks.some((track) => track.id === trackId)) {
    throw new EditorProjectConflictError(`Track "${trackId}" was not found.`, 'invalid_command');
  }
  return {
    ...project,
    tracks: project.tracks.map((track) => (track.id === trackId ? update(track) : track)),
  };
};

const findTrack = (
  project: EditorProjectV2,
  trackId: string,
): EditorProjectV2['tracks'][number] => {
  const track = project.tracks.find((candidate) => candidate.id === trackId);
  if (!track) {
    throw new EditorProjectConflictError(`Track "${trackId}" was not found.`, 'invalid_command');
  }
  return track;
};

const requireEditableTrack = (
  project: EditorProjectV2,
  trackId: string,
): EditorProjectV2['tracks'][number] => {
  const track = findTrack(project, trackId);
  if (track.locked) {
    throw new EditorProjectConflictError(`Track "${trackId}" is locked.`, 'invalid_command');
  }
  return track;
};

const findClip = (track: EditorProjectV2['tracks'][number], clipId: string): EditorClip => {
  const clip = track.clips.find((candidate) => candidate.id === clipId);
  if (!clip) {
    throw new EditorProjectConflictError(`Clip "${clipId}" was not found.`, 'invalid_command');
  }
  return clip;
};

const requireEditableClip = (
  project: EditorProjectV2,
  trackId: string,
  clipId: string,
): { track: EditorProjectV2['tracks'][number]; clip: EditorClip } => {
  const track = requireEditableTrack(project, trackId);
  const clip = findClip(track, clipId);
  if (clip.locked) {
    throw new EditorProjectConflictError(`Clip "${clipId}" is locked.`, 'invalid_command');
  }
  return { track, clip };
};

const deriveTimelineDuration = (tracks: EditorProjectV2['tracks']): number =>
  tracks.reduce(
    (projectEnd, track) =>
      track.clips.reduce(
        (trackEnd, clip) => Math.max(trackEnd, clip.timelineStartSec + clip.durationSec),
        projectEnd,
      ),
    0,
  );

const withDerivedTimelineDuration = (project: EditorProjectV2): EditorProjectV2 => ({
  ...project,
  durationSec: deriveTimelineDuration(project.tracks),
});

const KEYFRAME_TIME_MATCH_SEC = 0.001;
const MAX_CLIP_KEYFRAMES = 500;

const upsertKeyframe = (
  keyframes: readonly EditorKeyframe[],
  incoming: EditorKeyframe,
): EditorKeyframe[] => {
  const byId = keyframes.findIndex((keyframe) => keyframe.id === incoming.id);
  if (byId >= 0) {
    return keyframes
      .map((keyframe, index) => (index === byId ? incoming : keyframe))
      .toSorted((left, right) => left.timeSec - right.timeSec);
  }
  const byTime = keyframes.findIndex(
    (keyframe) =>
      keyframe.property === incoming.property &&
      Math.abs(keyframe.timeSec - incoming.timeSec) <= KEYFRAME_TIME_MATCH_SEC,
  );
  if (byTime >= 0) {
    const existing = keyframes[byTime];
    if (!existing) return [...keyframes, incoming];
    return keyframes
      .map((keyframe, index) => (index === byTime ? { ...incoming, id: existing.id } : keyframe))
      .toSorted((left, right) => left.timeSec - right.timeSec);
  }
  if (keyframes.length >= MAX_CLIP_KEYFRAMES) {
    throw new EditorProjectConflictError(
      `Clip already has ${MAX_CLIP_KEYFRAMES} keyframes.`,
      'invalid_command',
    );
  }
  return [...keyframes, incoming].toSorted((left, right) => left.timeSec - right.timeSec);
};

const trimClipInternals = (clip: EditorClip, durationSec: number): EditorClip => {
  const keyframed =
    'keyframes' in clip
      ? { ...clip, keyframes: clip.keyframes.filter((keyframe) => keyframe.timeSec <= durationSec) }
      : clip;
  if (keyframed.kind === 'audio') {
    return {
      ...keyframed,
      fadeInSec: Math.min(keyframed.fadeInSec, durationSec),
      fadeOutSec: Math.min(keyframed.fadeOutSec, durationSec),
    };
  }
  if (keyframed.kind === 'caption') {
    return {
      ...keyframed,
      words: keyframed.words
        .filter((word) => word.startSec < durationSec)
        .map((word) => ({ ...word, endSec: Math.min(word.endSec, durationSec) })),
    };
  }
  return keyframed;
};

const splitClip = (
  clip: EditorClip,
  splitAtSec: number,
  rightClipId: string,
): [EditorClip, EditorClip] => {
  const rightDurationSec = clip.durationSec - splitAtSec;
  const sourceOffset = splitAtSec * ('playbackRate' in clip ? clip.playbackRate : 1);
  const leftKeyframes =
    'keyframes' in clip
      ? clip.keyframes.filter((keyframe) => keyframe.timeSec <= splitAtSec)
      : undefined;
  const rightKeyframes =
    'keyframes' in clip
      ? clip.keyframes
          .filter((keyframe) => keyframe.timeSec >= splitAtSec)
          .map((keyframe) => ({ ...keyframe, timeSec: keyframe.timeSec - splitAtSec }))
      : undefined;
  const left = trimClipInternals(
    {
      ...clip,
      durationSec: splitAtSec,
      ...('keyframes' in clip ? { keyframes: leftKeyframes ?? [] } : {}),
    } as EditorClip,
    splitAtSec,
  );
  let right = {
    ...clip,
    id: rightClipId,
    timelineStartSec: clip.timelineStartSec + splitAtSec,
    durationSec: rightDurationSec,
    ...('sourceInSec' in clip ? { sourceInSec: (clip.sourceInSec ?? 0) + sourceOffset } : {}),
    ...('keyframes' in clip ? { keyframes: rightKeyframes ?? [] } : {}),
  } as EditorClip;
  if (right.kind === 'caption') {
    right = {
      ...right,
      words:
        clip.kind === 'caption'
          ? clip.words
              .filter((word) => word.endSec > splitAtSec)
              .map((word) => ({
                ...word,
                startSec: Math.max(0, word.startSec - splitAtSec),
                endSec: word.endSec - splitAtSec,
              }))
          : [],
    };
  }
  return [left, trimClipInternals(right, rightDurationSec)];
};

const GEOMETRY_COMMANDS = new Set<EditorCommand['commandType']>([
  'add_track',
  'remove_track',
  'upsert_clip',
  'remove_clip',
  'move_clip',
  'trim_clip',
  'split_clip',
  'precompose_clips',
]);

const OVERLAP_TRANSITION_TYPES = new Set(['crossfade', 'slide', 'wipe', 'zoom', 'custom']);

const assertCanonicalTransitionGeometry = (project: EditorProjectV2): void => {
  const primary = project.tracks
    .filter((track) => track.kind === 'video' && track.enabled && !track.muted)
    .sort((left, right) => left.order - right.order)[0];
  if (!primary) {
    throw new EditorProjectConflictError(
      'Transitions require an enabled primary video track.',
      'invalid_command',
    );
  }
  const clips = [...primary.clips]
    .filter((clip) => clip.enabled)
    .sort(
      (left, right) =>
        left.timelineStartSec - right.timelineStartSec || left.id.localeCompare(right.id),
    );
  const incoming = new Map<string, EditorProjectV2['transitions'][number]>();
  for (const transition of project.transitions) {
    if (transition.trackId !== primary.id) {
      throw new EditorProjectConflictError(
        'Transitions are supported only on the primary video track.',
        'invalid_command',
      );
    }
    if (transition.alignment !== 'centered') {
      throw new EditorProjectConflictError(
        'Only centered transition alignment is currently renderable.',
        'invalid_command',
      );
    }
    if (incoming.has(transition.toClipId)) {
      throw new EditorProjectConflictError(
        `Clip "${transition.toClipId}" has more than one incoming transition.`,
        'invalid_command',
      );
    }
    incoming.set(transition.toClipId, transition);
  }
  for (let index = 1; index < clips.length; index += 1) {
    const previous = clips[index - 1];
    const clip = clips[index];
    const transition = incoming.get(clip.id);
    if (transition && transition.fromClipId !== previous.id) {
      throw new EditorProjectConflictError(
        'Transition endpoints must be adjacent in timeline order.',
        'invalid_command',
      );
    }
    const overlap =
      transition && OVERLAP_TRANSITION_TYPES.has(transition.transitionType)
        ? transition.durationSec
        : 0;
    const expectedStart = previous.timelineStartSec + previous.durationSec - overlap;
    if (Math.abs(clip.timelineStartSec - expectedStart) > 0.001) {
      throw new EditorProjectConflictError(
        `Clip "${clip.id}" must start at ${expectedStart}s for canonical transition geometry.`,
        'invalid_command',
      );
    }
  }
  for (const transition of project.transitions) {
    if (!clips.some((clip) => clip.id === transition.toClipId)) {
      throw new EditorProjectConflictError(
        'Transitions cannot reference disabled or missing clips.',
        'invalid_command',
      );
    }
  }
  const timelineEnd = clips.at(-1)
    ? (clips.at(-1)?.timelineStartSec ?? 0) + (clips.at(-1)?.durationSec ?? 0)
    : 0;
  if (Math.abs(project.durationSec - timelineEnd) > 0.001) {
    throw new EditorProjectConflictError(
      `Project duration must match the canonical primary sequence duration ${timelineEnd}s.`,
      'invalid_command',
    );
  }
};

const applyTimelineCommand = (
  project: EditorProjectV2,
  command: EditorCommand,
): EditorProjectV2 => {
  switch (command.commandType) {
    case 'add_track': {
      if (project.tracks.some((track) => track.id === command.track.id)) {
        throw new EditorProjectConflictError(
          `Track "${command.track.id}" already exists.`,
          'invalid_command',
        );
      }
      return { ...project, tracks: [...project.tracks, command.track] };
    }
    case 'remove_track': {
      const track = requireEditableTrack(project, command.trackId);
      if (track.clips.length > 0 && !command.deleteClips) {
        throw new EditorProjectConflictError(
          'Set deleteClips=true to remove a populated track.',
          'invalid_command',
        );
      }
      return {
        ...project,
        tracks: project.tracks.filter((track) => track.id !== command.trackId),
        transitions: project.transitions.filter(
          (transition) => transition.trackId !== command.trackId,
        ),
      };
    }
    case 'reorder_track': {
      const selected = requireEditableTrack(project, command.trackId);
      if (command.beforeTrackId) findTrack(project, command.beforeTrackId);
      const tracks = project.tracks.filter((track) => track.id !== command.trackId);
      const index = command.beforeTrackId
        ? tracks.findIndex((track) => track.id === command.beforeTrackId)
        : tracks.length;
      tracks.splice(index < 0 ? tracks.length : index, 0, selected);
      return { ...project, tracks: tracks.map((track, order) => ({ ...track, order })) };
    }
    case 'set_track_state':
      return updateTrack(project, command.trackId, (track) => ({
        ...track,
        ...(command.enabled === undefined ? {} : { enabled: command.enabled }),
        ...(command.locked === undefined ? {} : { locked: command.locked }),
        ...(command.muted === undefined ? {} : { muted: command.muted }),
        ...(command.solo === undefined ? {} : { solo: command.solo }),
        ...(command.order === undefined ? {} : { order: command.order }),
      }));
    case 'upsert_clip': {
      const track = requireEditableTrack(project, command.trackId);
      const existing = track.clips.find((clip) => clip.id === command.clip.id);
      if (existing?.locked) {
        throw new EditorProjectConflictError(
          `Clip "${command.clip.id}" is locked.`,
          'invalid_command',
        );
      }
      return updateTrack(
        project,
        command.trackId,
        (track) =>
          ({
            ...track,
            clips: track.clips.some((clip) => clip.id === command.clip.id)
              ? track.clips.map((clip) => (clip.id === command.clip.id ? command.clip : clip))
              : [...track.clips, command.clip],
          }) as typeof track,
      );
    }
    case 'remove_clip': {
      requireEditableClip(project, command.trackId, command.clipId);
      const updated = updateTrack(
        project,
        command.trackId,
        (track) =>
          ({
            ...track,
            clips: track.clips.filter((clip) => clip.id !== command.clipId),
          }) as typeof track,
      );
      return {
        ...updated,
        transitions: updated.transitions.filter(
          (transition) =>
            transition.fromClipId !== command.clipId && transition.toClipId !== command.clipId,
        ),
      };
    }
    case 'move_clip': {
      const { clip } = requireEditableClip(project, command.fromTrackId, command.clipId);
      const targetTrack = requireEditableTrack(project, command.toTrackId);
      if (targetTrack.kind !== clip.kind) {
        throw new EditorProjectConflictError(
          `A ${clip.kind} clip cannot move to a ${targetTrack.kind} track.`,
          'invalid_command',
        );
      }
      if (command.fromTrackId === command.toTrackId) {
        return updateTrack(
          project,
          command.fromTrackId,
          (track) =>
            ({
              ...track,
              clips: track.clips.map((candidate) =>
                candidate.id === clip.id
                  ? { ...candidate, timelineStartSec: command.timelineStartSec }
                  : candidate,
              ),
            }) as typeof track,
        );
      }
      const withoutSource = updateTrack(
        project,
        command.fromTrackId,
        (track) =>
          ({
            ...track,
            clips: track.clips.filter((candidate) => candidate.id !== clip.id),
          }) as typeof track,
      );
      const moved = updateTrack(
        withoutSource,
        command.toTrackId,
        (track) =>
          ({
            ...track,
            clips: [...track.clips, { ...clip, timelineStartSec: command.timelineStartSec }],
          }) as typeof track,
      );
      return {
        ...moved,
        transitions: moved.transitions.filter(
          (transition) => transition.fromClipId !== clip.id && transition.toClipId !== clip.id,
        ),
      };
    }
    case 'trim_clip': {
      requireEditableClip(project, command.trackId, command.clipId);
      return updateTrack(
        project,
        command.trackId,
        (track) =>
          ({
            ...track,
            clips: track.clips.map((clip) =>
              clip.id === command.clipId
                ? trimClipInternals(
                    {
                      ...clip,
                      durationSec: command.durationSec,
                      timelineStartSec: command.timelineStartSec ?? clip.timelineStartSec,
                      ...('sourceInSec' in clip && command.sourceInSec !== undefined
                        ? { sourceInSec: command.sourceInSec }
                        : {}),
                    } as EditorClip,
                    command.durationSec,
                  )
                : clip,
            ),
          }) as typeof track,
      );
    }
    case 'split_clip': {
      requireEditableClip(project, command.trackId, command.clipId);
      if (
        project.tracks.some((track) => track.clips.some((clip) => clip.id === command.rightClipId))
      ) {
        throw new EditorProjectConflictError(
          `Clip "${command.rightClipId}" already exists.`,
          'invalid_command',
        );
      }
      const updated = updateTrack(
        project,
        command.trackId,
        (track) =>
          ({
            ...track,
            clips: track.clips.flatMap((clip) => {
              if (clip.id !== command.clipId) return [clip];
              if (command.splitAtSec >= clip.durationSec) {
                throw new EditorProjectConflictError(
                  'Split point must be inside the clip.',
                  'invalid_command',
                );
              }
              return splitClip(clip, command.splitAtSec, command.rightClipId);
            }),
          }) as typeof track,
      );
      return {
        ...updated,
        transitions: updated.transitions.map((transition) =>
          transition.fromClipId === command.clipId
            ? { ...transition, fromClipId: command.rightClipId }
            : transition,
        ),
      };
    }
    case 'set_keyframes': {
      const { clip } = requireEditableClip(project, command.trackId, command.clipId);
      if (!('keyframes' in clip)) {
        throw new EditorProjectConflictError(
          `Clip "${command.clipId}" does not support keyframes.`,
          'invalid_command',
        );
      }
      return updateTrack(
        project,
        command.trackId,
        (track) =>
          ({
            ...track,
            clips: track.clips.map((clip) =>
              clip.id === command.clipId && 'keyframes' in clip
                ? { ...clip, keyframes: command.keyframes }
                : clip,
            ),
          }) as typeof track,
      );
    }
    case 'upsert_keyframe': {
      const { clip } = requireEditableClip(project, command.trackId, command.clipId);
      if (!('keyframes' in clip)) {
        throw new EditorProjectConflictError(
          `Clip "${command.clipId}" does not support keyframes.`,
          'invalid_command',
        );
      }
      return updateTrack(
        project,
        command.trackId,
        (track) =>
          ({
            ...track,
            clips: track.clips.map((candidate) =>
              candidate.id === command.clipId && 'keyframes' in candidate
                ? { ...candidate, keyframes: upsertKeyframe(candidate.keyframes, command.keyframe) }
                : candidate,
            ),
          }) as typeof track,
      );
    }
    case 'apply_animation_style': {
      const { clip } = requireEditableClip(project, command.trackId, command.clipId);
      if (!('keyframes' in clip) || !('transform' in clip)) {
        throw new EditorProjectConflictError(
          `Clip "${command.clipId}" cannot take an animation style.`,
          'invalid_command',
        );
      }
      const compiled = compileMotionStyle({
        styleId: command.styleId,
        instanceId: command.instanceId,
        timelineOffsetSec: command.timelineOffsetSec,
        durationSec: command.durationSec,
        base: clip.transform,
      });
      return updateTrack(
        project,
        command.trackId,
        (track) =>
          ({
            ...track,
            clips: track.clips.map((candidate) => {
              if (candidate.id !== command.clipId || !('keyframes' in candidate)) return candidate;
              let next = candidate.keyframes;
              for (const keyframe of compiled) next = upsertKeyframe(next, keyframe);
              return { ...candidate, keyframes: next };
            }),
          }) as typeof track,
      );
    }
    case 'trim_animation_style': {
      const { clip } = requireEditableClip(project, command.trackId, command.clipId);
      if (!('keyframes' in clip)) {
        throw new EditorProjectConflictError(
          `Clip "${command.clipId}" does not support keyframes.`,
          'invalid_command',
        );
      }
      if (command.endSec <= command.startSec) {
        throw new EditorProjectConflictError(
          'Style span must be longer than zero.',
          'invalid_command',
        );
      }
      return updateTrack(
        project,
        command.trackId,
        (track) =>
          ({
            ...track,
            clips: track.clips.map((candidate) =>
              candidate.id === command.clipId && 'keyframes' in candidate
                ? {
                    ...candidate,
                    keyframes: trimStyleInstance(
                      candidate.keyframes,
                      command.instanceId,
                      command.startSec,
                      command.endSec,
                    ),
                  }
                : candidate,
            ),
          }) as typeof track,
      );
    }
    case 'set_clip_parent': {
      requireEditableClip(project, command.trackId, command.clipId);
      if (command.parentClipId === command.clipId) {
        throw new EditorProjectConflictError('A clip cannot parent itself.', 'invalid_command');
      }
      const ids = new Set(project.tracks.flatMap((track) => track.clips.map((clip) => clip.id)));
      if (command.parentClipId && !ids.has(command.parentClipId)) {
        throw new EditorProjectConflictError(
          `Parent clip "${command.parentClipId}" was not found.`,
          'invalid_command',
        );
      }
      return updateTrack(
        project,
        command.trackId,
        (track) =>
          ({
            ...track,
            clips: track.clips.map((candidate) =>
              candidate.id === command.clipId
                ? {
                    ...candidate,
                    parentClipId: command.parentClipId ?? undefined,
                  }
                : candidate,
            ),
          }) as typeof track,
      );
    }
    case 'remove_keyframes': {
      const { clip } = requireEditableClip(project, command.trackId, command.clipId);
      if (!('keyframes' in clip)) {
        throw new EditorProjectConflictError(
          `Clip "${command.clipId}" does not support keyframes.`,
          'invalid_command',
        );
      }
      const removing = new Set(command.keyframeIds);
      return updateTrack(
        project,
        command.trackId,
        (track) =>
          ({
            ...track,
            clips: track.clips.map((candidate) =>
              candidate.id === command.clipId && 'keyframes' in candidate
                ? {
                    ...candidate,
                    keyframes: candidate.keyframes.filter((keyframe) => !removing.has(keyframe.id)),
                  }
                : candidate,
            ),
          }) as typeof track,
      );
    }
    case 'upsert_transition': {
      const track = requireEditableTrack(project, command.transition.trackId);
      const from = findClip(track, command.transition.fromClipId);
      const to = findClip(track, command.transition.toClipId);
      if (command.transition.durationSec > Math.min(from.durationSec, to.durationSec)) {
        throw new EditorProjectConflictError(
          'Transition duration cannot exceed either adjacent clip.',
          'invalid_command',
        );
      }
      return {
        ...project,
        transitions: project.transitions.some((value) => value.id === command.transition.id)
          ? project.transitions.map((value) =>
              value.id === command.transition.id ? command.transition : value,
            )
          : [...project.transitions, command.transition],
      };
    }
    case 'remove_transition': {
      const transition = project.transitions.find((value) => value.id === command.transitionId);
      if (!transition) {
        throw new EditorProjectConflictError(
          `Transition "${command.transitionId}" was not found.`,
          'invalid_command',
        );
      }
      requireEditableTrack(project, transition.trackId);
      return {
        ...project,
        transitions: project.transitions.filter((value) => value.id !== command.transitionId),
      };
    }
    case 'restore_timeline_snapshot':
      requireUser(command.actor);
      return {
        ...project,
        durationSec: command.snapshot.durationSec,
        tracks: command.snapshot.tracks,
        transitions: command.snapshot.transitions,
        nestedSequences: command.snapshot.nestedSequences,
      };
    case 'set_nested_sequence': {
      if (command.sequence.tracks.some((track) => track.kind === 'nested_sequence')) {
        throw new EditorProjectConflictError(
          'A nested sequence cannot contain another nested sequence.',
          'invalid_command',
        );
      }
      const existing = project.nestedSequences.some(
        (sequence) => sequence.id === command.sequence.id,
      );
      return {
        ...project,
        nestedSequences: existing
          ? project.nestedSequences.map((sequence) =>
              sequence.id === command.sequence.id ? command.sequence : sequence,
            )
          : [...project.nestedSequences, command.sequence],
      };
    }
    case 'precompose_clips': {
      const selected: Array<{
        trackId: string;
        clip: Extract<EditorClip, { kind: 'overlay' | 'text' }>;
      }> = [];
      for (const track of project.tracks) {
        if (track.kind !== 'overlay' && track.kind !== 'text') continue;
        for (const clip of track.clips) {
          if (!command.clipIds.includes(clip.id)) continue;
          if (clip.kind !== 'overlay' && clip.kind !== 'text') {
            throw new EditorProjectConflictError(
              'Only overlay and text clips can be precomposed.',
              'invalid_command',
            );
          }
          if (clip.locked) {
            throw new EditorProjectConflictError(`Clip "${clip.id}" is locked.`, 'invalid_command');
          }
          selected.push({ trackId: track.id, clip });
        }
      }
      if (selected.length !== command.clipIds.length) {
        throw new EditorProjectConflictError(
          'Every precomposed clip must be an unlocked overlay or text clip.',
          'invalid_command',
        );
      }
      if (project.nestedSequences.some((sequence) => sequence.id === command.nestedSequenceId)) {
        throw new EditorProjectConflictError(
          `Nested sequence "${command.nestedSequenceId}" already exists.`,
          'invalid_command',
        );
      }
      if (
        project.tracks
          .flatMap((track): EditorClip[] => track.clips)
          .some((clip) => clip.id === command.instanceClipId)
      ) {
        throw new EditorProjectConflictError(
          `Clip "${command.instanceClipId}" already exists.`,
          'invalid_command',
        );
      }
      const startSec = Math.min(...selected.map((entry) => entry.clip.timelineStartSec));
      const endSec = Math.max(
        ...selected.map((entry) => entry.clip.timelineStartSec + entry.clip.durationSec),
      );
      const durationSec = Math.max(0.1, endSec - startSec);
      const overlayClips = selected.flatMap(({ clip }) =>
        clip.kind === 'overlay'
          ? [{ ...clip, timelineStartSec: clip.timelineStartSec - startSec }]
          : [],
      );
      const textClips = selected.flatMap(({ clip }) =>
        clip.kind === 'text'
          ? [{ ...clip, timelineStartSec: clip.timelineStartSec - startSec }]
          : [],
      );
      const nestedTracks: EditorProjectV2['nestedSequences'][number]['tracks'] = [];
      if (overlayClips.length) {
        nestedTracks.push({
          id: `${command.nestedSequenceId}:overlays`,
          name: 'Overlays',
          order: 0,
          enabled: true,
          locked: false,
          muted: false,
          solo: false,
          kind: 'overlay',
          clips: overlayClips,
        });
      }
      if (textClips.length) {
        nestedTracks.push({
          id: `${command.nestedSequenceId}:text`,
          name: 'Text',
          order: nestedTracks.length,
          enabled: true,
          locked: false,
          muted: false,
          solo: false,
          kind: 'text',
          clips: textClips,
        });
      }
      const removing = new Set(command.clipIds);
      let tracks = project.tracks.map((track) =>
        track.kind === 'overlay' || track.kind === 'text'
          ? ({
              ...track,
              clips: track.clips.filter((clip) => !removing.has(clip.id)),
            } as typeof track)
          : track,
      );
      const instanceTrack = tracks.find((track) => track.id === command.instanceTrackId);
      const instanceClip = {
        id: command.instanceClipId,
        name: command.name,
        kind: 'nested_sequence' as const,
        sequenceId: command.nestedSequenceId,
        timelineStartSec: startSec,
        durationSec,
        enabled: true,
        locked: false,
        tags: [] as string[],
        sourceInSec: 0,
        playbackRate: 1,
        audioEnabled: true,
        keyframes: [],
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
      };
      if (instanceTrack) {
        if (instanceTrack.kind !== 'nested_sequence') {
          throw new EditorProjectConflictError(
            'Precompose instances must land on a nested_sequence track.',
            'invalid_command',
          );
        }
        if (instanceTrack.locked) {
          throw new EditorProjectConflictError(
            `Track "${instanceTrack.id}" is locked.`,
            'invalid_command',
          );
        }
        tracks = tracks.map((track) =>
          track.id === command.instanceTrackId && track.kind === 'nested_sequence'
            ? { ...track, clips: [...track.clips, instanceClip] }
            : track,
        );
      } else {
        tracks = [
          ...tracks,
          {
            id: command.instanceTrackId,
            name: 'Precomps',
            order: tracks.reduce((max, track) => Math.max(max, track.order), -1) + 1,
            enabled: true,
            locked: false,
            muted: false,
            solo: false,
            kind: 'nested_sequence',
            clips: [instanceClip],
          },
        ];
      }
      return {
        ...project,
        tracks,
        nestedSequences: [
          ...project.nestedSequences,
          {
            id: command.nestedSequenceId,
            name: command.name,
            durationSec,
            canvas: project.canvas,
            tracks: nestedTracks,
            transitions: [],
          },
        ],
      };
    }
    case 'set_export_settings':
      return { ...project, exportSettings: command.exportSettings };
    case 'set_project_metadata':
      return {
        ...project,
        title: command.title ?? project.title,
        durationSec: command.durationSec ?? project.durationSec,
        canvas: command.canvas ?? project.canvas,
        frameRate: command.frameRate ?? project.frameRate,
      };
    case 'upsert_marker':
      return {
        ...project,
        markers: project.markers.some((marker) => marker.id === command.marker.id)
          ? project.markers.map((marker) =>
              marker.id === command.marker.id ? command.marker : marker,
            )
          : [...project.markers, command.marker].sort(
              (left, right) => left.timeSec - right.timeSec,
            ),
      };
    case 'remove_marker':
      return {
        ...project,
        markers: project.markers.filter((marker) => marker.id !== command.markerId),
      };
    default:
      return project;
  }
};

const applyProductionCommand = (
  project: EditorProjectV2,
  command: EditorCommand,
): EditorProjectV2 => {
  switch (command.commandType) {
    case 'set_production_script':
      return {
        ...project,
        production: { ...project.production, sourceScript: command.sourceScript },
      };
    case 'set_production_references':
      return {
        ...project,
        production: { ...project.production, references: command.references },
      };
    case 'set_sound_plan': {
      if (command.soundPlan.status === 'approved') requireUser(command.actor);
      return {
        ...project,
        production: {
          ...project.production,
          soundPlan:
            command.soundPlan.status === 'approved'
              ? {
                  ...command.soundPlan,
                  approvedBy: command.actor,
                  approvedAt: command.issuedAt,
                  approvedRevision: project.revision + 1,
                }
              : {
                  ...command.soundPlan,
                  approvedBy: undefined,
                  approvedAt: undefined,
                  approvedRevision: undefined,
                },
        },
      };
    }
    case 'set_style_contract':
      if (command.styleContract.status !== 'draft') {
        throw new EditorProjectConflictError(
          'Style edits must return to draft.',
          'invalid_command',
        );
      }
      return {
        ...project,
        production: {
          ...project.production,
          workflowStage: 'style_approval',
          styleContract: command.styleContract,
        },
      };
    case 'approve_style_contract': {
      requireUser(command.actor);
      const styleContract = project.production.styleContract;
      if (!styleContract || styleContract.status !== 'draft') {
        throw new EditorProjectConflictError(
          'A draft style contract is required.',
          'invalid_command',
        );
      }
      return {
        ...project,
        production: {
          ...project.production,
          workflowStage: 'frame_generation',
          styleContract: {
            ...styleContract,
            status: 'approved',
            approvedBy: command.actor,
            approvedAt: command.issuedAt,
            approvedRevision: project.revision + 1,
          },
        },
      };
    }
    case 'upsert_shot': {
      const shots = project.production.shots.some((shot) => shot.id === command.shot.id)
        ? project.production.shots.map((shot) =>
            shot.id === command.shot.id ? command.shot : shot,
          )
        : [...project.production.shots, command.shot];
      return {
        ...project,
        production: {
          ...project.production,
          shots: shots.sort((left, right) => left.order - right.order),
        },
      };
    }
    case 'remove_shot':
      return {
        ...project,
        production: {
          ...project.production,
          shots: project.production.shots.filter((shot) => shot.id !== command.shotId),
        },
      };
    case 'record_take': {
      findShot(project, command.shotId);
      const next = replaceShot(project, command.shotId, (shot) => ({
        ...shot,
        takes: shot.takes.some((take) => take.id === command.take.id)
          ? shot.takes.map((take) => (take.id === command.take.id ? command.take : take))
          : [...shot.takes, command.take],
      }));
      if (command.take.status !== 'ready') return next;
      const workflowStage =
        command.take.kind === 'frame'
          ? 'frame_approval'
          : command.take.kind === 'motion_draft'
            ? 'motion_approval'
            : 'master_approval';
      return { ...next, production: { ...next.production, workflowStage } };
    }
    case 'approve_take':
    case 'reject_take':
      return applyTakeReview(project, command);
    case 'set_production_stage':
      if (command.actor.actorType === 'agent') {
        throw new EditorProjectConflictError(
          'Agents cannot force production stages.',
          'invalid_command',
        );
      }
      return {
        ...project,
        production: {
          ...project.production,
          workflowStage: command.workflowStage,
          failureReason: command.failureReason,
        },
      };
    default:
      return GEOMETRY_COMMANDS.has(command.commandType)
        ? withDerivedTimelineDuration(applyTimelineCommand(project, command))
        : applyTimelineCommand(project, command);
  }
};

export function applyEditorCommandBatch(
  projectInput: EditorProjectV2,
  batchInput: EditorCommandBatch,
): EditorProjectV2 {
  const project = editorProjectV2Schema.parse(projectInput);
  const batch = editorCommandBatchSchema.parse(batchInput);
  if (batch.projectId !== project.projectId || batch.sequenceId !== project.sequenceId) {
    throw new EditorProjectConflictError(
      'Command batch targets another project.',
      'invalid_command',
    );
  }
  if (batch.expectedRevision !== project.revision) {
    throw new EditorProjectConflictError(
      `Expected revision ${batch.expectedRevision}; current revision is ${project.revision}.`,
      'stale_revision',
    );
  }
  if (batch.expectedFingerprint !== project.fingerprint) {
    throw new EditorProjectConflictError(
      'Command batch fingerprint does not match the current project fingerprint.',
      'stale_fingerprint',
    );
  }
  let next = project;
  for (const command of batch.commands) next = applyProductionCommand(next, command);
  if (
    next.transitions.length > 0 ||
    batch.commands.some(
      (command) =>
        command.commandType === 'upsert_transition' || command.commandType === 'remove_transition',
    )
  ) {
    assertCanonicalTransitionGeometry(next);
  }
  const versioned = editorProjectV2Schema.parse({
    ...next,
    revision: project.revision + 1,
    fingerprint: 'pending',
    updatedAt: batch.issuedAt,
  });
  return editorProjectV2Schema.parse({
    ...versioned,
    fingerprint: fingerprintEditorProject(versioned),
  });
}
