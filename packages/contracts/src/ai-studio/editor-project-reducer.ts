import {
  type EditorActorRef,
  type EditorClip,
  type EditorCommand,
  type EditorCommandBatch,
  type EditorProjectV2,
  type EditorShot,
  type EditorTake,
  editorCommandBatchSchema,
  editorProjectV2Schema,
} from './editor-project-v2';

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
      };
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
    default:
      return project;
  }
};

const applyProductionCommand = (
  project: EditorProjectV2,
  command: EditorCommand,
): EditorProjectV2 => {
  switch (command.commandType) {
    case 'set_production_references':
      return {
        ...project,
        production: { ...project.production, references: command.references },
      };
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
