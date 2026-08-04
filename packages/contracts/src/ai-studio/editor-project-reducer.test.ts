import { describe, expect, test } from 'bun:test';
import { applyEditorCommandBatch, createEditorProjectV2, type EditorCommandBatch } from './index';

const user = { actorId: 'user-1', actorType: 'user' as const };
const system = { actorId: 'generation-worker', actorType: 'system' as const };

const command = (
  project: ReturnType<typeof createEditorProjectV2>,
  value: Omit<
    EditorCommandBatch['commands'][number],
    'commandId' | 'idempotencyKey' | 'expectedRevision' | 'issuedAt' | 'actor'
  >,
  actor = user,
): EditorCommandBatch => ({
  batchId: `batch-${project.revision}-${value.commandType}`,
  projectId: project.projectId,
  sequenceId: project.sequenceId,
  idempotencyKey: `batch-${project.revision}-${value.commandType}`,
  expectedRevision: project.revision,
  expectedFingerprint: project.fingerprint,
  atomic: true,
  issuedAt: '2026-08-01T12:00:00.000Z',
  actor,
  commands: [
    {
      ...value,
      commandId: `command-${project.revision}-${value.commandType}`,
      idempotencyKey: `command-${project.revision}-${value.commandType}`,
      expectedRevision: project.revision,
      issuedAt: '2026-08-01T12:00:00.000Z',
      actor,
    } as EditorCommandBatch['commands'][number],
  ],
});

const commandBatch = (
  project: ReturnType<typeof createEditorProjectV2>,
  values: Array<
    Omit<
      EditorCommandBatch['commands'][number],
      'commandId' | 'idempotencyKey' | 'expectedRevision' | 'issuedAt' | 'actor'
    >
  >,
  actor = user,
): EditorCommandBatch => ({
  batchId: `batch-${project.revision}-timeline`,
  projectId: project.projectId,
  sequenceId: project.sequenceId,
  idempotencyKey: `batch-${project.revision}-timeline`,
  expectedRevision: project.revision,
  expectedFingerprint: project.fingerprint,
  atomic: true,
  issuedAt: '2026-08-01T12:00:00.000Z',
  actor,
  commands: values.map(
    (value, index) =>
      ({
        ...value,
        commandId: `command-${project.revision}-${index}`,
        idempotencyKey: `command-${project.revision}-${index}`,
        expectedRevision: project.revision,
        issuedAt: '2026-08-01T12:00:00.000Z',
        actor,
      }) as EditorCommandBatch['commands'][number],
  ),
});

const videoClip = (input: {
  id: string;
  timelineStartSec: number;
  durationSec: number;
  sourceInSec?: number;
  playbackRate?: number;
  locked?: boolean;
}) => ({
  id: input.id,
  timelineStartSec: input.timelineStartSec,
  durationSec: input.durationSec,
  enabled: true,
  locked: input.locked ?? false,
  tags: [],
  kind: 'video' as const,
  source: {
    sourceType: 'library_asset' as const,
    assetId: `asset-${input.id}`,
    renditionId: `version-${input.id}`,
  },
  sourceInSec: input.sourceInSec ?? 0,
  playbackRate: input.playbackRate ?? 1,
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
});

const projectWithTimeline = (
  options: { trackLocked?: boolean; clipLocked?: boolean; playbackRate?: number } = {},
) => {
  const hasTransition = !options.trackLocked;
  const project = createEditorProjectV2({
    projectId: 'project-timeline',
    title: 'Editable assembly',
    width: 1920,
    height: 1080,
    now: '2026-08-01T12:00:00.000Z',
  });
  const setupCommands: Parameters<typeof commandBatch>[1] = [
    {
      commandType: 'set_project_metadata',
      durationSec: hasTransition ? 7.5 : 8,
    },
    {
      commandType: 'add_track',
      track: {
        id: 'video-main',
        name: 'Main video',
        order: 0,
        enabled: true,
        locked: options.trackLocked ?? false,
        muted: false,
        solo: false,
        kind: 'video',
        clips: [
          videoClip({
            id: 'clip-left',
            timelineStartSec: 0,
            durationSec: 4,
            sourceInSec: options.playbackRate ? 1 : 0,
            playbackRate: options.playbackRate,
            locked: options.clipLocked,
          }),
          videoClip({
            id: 'clip-right',
            timelineStartSec: hasTransition ? 3.5 : 4,
            durationSec: 4,
          }),
        ],
      },
    },
  ];
  if (!options.trackLocked) {
    setupCommands.push({
      commandType: 'upsert_transition',
      transition: {
        id: 'transition-1',
        trackId: 'video-main',
        fromClipId: 'clip-left',
        toClipId: 'clip-right',
        transitionType: 'crossfade',
        durationSec: 0.5,
        alignment: 'centered',
        parameters: {},
      },
    });
  }
  return applyEditorCommandBatch(project, commandBatch(project, setupCommands));
};

describe('editor project reducer', () => {
  test('requires each human gate before advancing generation stages', () => {
    let project = createEditorProjectV2({
      projectId: 'project-1',
      title: 'UGC launch',
      width: 1080,
      height: 1920,
      now: '2026-08-01T12:00:00.000Z',
    });
    project = applyEditorCommandBatch(
      project,
      command(project, {
        commandType: 'set_style_contract',
        styleContract: {
          status: 'draft',
          lockedText: 'Warm motivated light, 35mm grain, stable composition.',
          facets: {
            lens: '35mm',
            lighting: 'warm practicals',
            palette: 'amber and navy',
            texture: 'fine grain',
            contrast: 'lifted blacks',
            blocking: 'centered creator',
            atmosphere: 'confident',
          },
          sourceReferenceIds: [],
        },
      }),
    );
    project = applyEditorCommandBatch(
      project,
      command(project, { commandType: 'approve_style_contract' }),
    );
    expect(project.production.workflowStage).toBe('frame_generation');
    expect(project.production.styleContract?.approvedBy?.actorId).toBe('user-1');

    project = applyEditorCommandBatch(
      project,
      command(project, {
        commandType: 'upsert_shot',
        shot: {
          id: 'shot-1',
          order: 0,
          title: 'Hook',
          brief: 'Reveal the product.',
          subjectAction: 'The creator raises the product.',
          cameraMove: 'Slow dolly in.',
          inSceneEvent: 'The package catches the key light.',
          targetDurationSec: 4,
          takes: [],
        },
      }),
    );
    project = applyEditorCommandBatch(
      project,
      command(
        project,
        {
          commandType: 'record_take',
          shotId: 'shot-1',
          take: {
            id: 'frame-1',
            kind: 'frame',
            status: 'ready',
            verdict: 'undecided',
            prompt: 'Creator holding the product.',
            model: 'nano-banana-2',
            settings: { imageSize: '1K' },
            asset: { assetId: 'asset-frame', versionId: 'version-frame' },
            createdAt: '2026-08-01T12:01:00.000Z',
            createdBy: system,
          },
        },
        system,
      ),
    );
    project = applyEditorCommandBatch(
      project,
      command(project, { commandType: 'approve_take', shotId: 'shot-1', takeId: 'frame-1' }),
    );
    expect(project.production.shots[0]?.selection.frameTakeId).toBe('frame-1');
    expect(project.production.workflowStage).toBe('motion_generation');

    for (const [id, kind, assetId, versionId] of [
      ['motion-1', 'motion_draft', 'asset-draft', 'version-draft'],
      ['master-1', 'motion_master', 'asset-master', 'version-master'],
    ] as const) {
      project = applyEditorCommandBatch(
        project,
        command(
          project,
          {
            commandType: 'record_take',
            shotId: 'shot-1',
            take: {
              id,
              kind,
              status: 'ready',
              verdict: 'undecided',
              prompt: 'Slow dolly in as the package catches the light.',
              model: 'veo-3.1-fast-generate-preview',
              settings: { resolution: kind === 'motion_master' ? '1080p' : '720p' },
              asset: { assetId, versionId },
              createdAt: '2026-08-01T12:02:00.000Z',
              createdBy: system,
            },
          },
          system,
        ),
      );
      project = applyEditorCommandBatch(
        project,
        command(project, { commandType: 'approve_take', shotId: 'shot-1', takeId: id }),
      );
    }
    expect(project.production.workflowStage).toBe('assembly');
    expect(project.durationSec).toBe(8);
    expect(project.tracks[0]).toMatchObject({
      id: 'production-masters',
      kind: 'video',
      clips: [
        {
          id: 'master:shot-1',
          durationSec: 8,
          source: {
            sourceType: 'library_asset',
            assetId: 'asset-master',
            renditionId: 'version-master',
          },
        },
      ],
    });

    project = applyEditorCommandBatch(
      project,
      command(project, {
        commandType: 'trim_clip',
        trackId: 'production-masters',
        clipId: 'master:shot-1',
        timelineStartSec: 1,
        sourceInSec: 2,
        durationSec: 5,
      }),
    );
    project = applyEditorCommandBatch(
      project,
      command(project, {
        commandType: 'split_clip',
        trackId: 'production-masters',
        clipId: 'master:shot-1',
        splitAtSec: 2,
        rightClipId: 'master:shot-1:outro',
      }),
    );
    project = applyEditorCommandBatch(
      project,
      command(
        project,
        {
          commandType: 'record_take',
          shotId: 'shot-1',
          take: {
            id: 'master-2',
            kind: 'motion_master',
            status: 'ready',
            verdict: 'undecided',
            prompt: 'Replacement approved master.',
            model: 'veo-3.1-fast-generate-preview',
            settings: { resolution: '1080p' },
            asset: { assetId: 'asset-master-2', versionId: 'version-master-2' },
            createdAt: '2026-08-01T12:03:00.000Z',
            createdBy: system,
          },
        },
        system,
      ),
    );
    project = applyEditorCommandBatch(
      project,
      command(project, {
        commandType: 'approve_take',
        shotId: 'shot-1',
        takeId: 'master-2',
      }),
    );
    expect(project.tracks[0]?.clips[0]).toMatchObject({
      id: 'master:shot-1',
      timelineStartSec: 1,
      sourceInSec: 2,
      durationSec: 2,
      source: {
        sourceType: 'library_asset',
        assetId: 'asset-master-2',
        renditionId: 'version-master-2',
      },
    });
    expect(project.tracks[0]?.clips[1]).toMatchObject({
      id: 'master:shot-1:outro',
      timelineStartSec: 3,
      sourceInSec: 4,
      durationSec: 3,
      source: {
        sourceType: 'library_asset',
        assetId: 'asset-master-2',
        renditionId: 'version-master-2',
      },
    });
  });

  test('does not let an agent approve a take', () => {
    const project = createEditorProjectV2({
      projectId: 'project-1',
      title: 'UGC launch',
      width: 1080,
      height: 1920,
      now: '2026-08-01T12:00:00.000Z',
    });
    expect(() =>
      command(
        project,
        { commandType: 'approve_take', shotId: 'shot-1', takeId: 'frame-1' },
        { actorId: 'canvas-agent', actorType: 'agent' },
      ),
    ).not.toThrow();
    expect(() =>
      applyEditorCommandBatch(
        project,
        command(
          project,
          { commandType: 'approve_take', shotId: 'shot-1', takeId: 'frame-1' },
          { actorId: 'canvas-agent', actorType: 'agent' },
        ),
      ),
    ).toThrow('user');
  });

  test('deleting a clip removes dependent transitions and derives the remaining duration', () => {
    const project = projectWithTimeline();

    const next = applyEditorCommandBatch(
      project,
      command(project, {
        commandType: 'remove_clip',
        trackId: 'video-main',
        clipId: 'clip-right',
      }),
    );

    expect(next.tracks[0]?.clips.map((clip) => clip.id)).toEqual(['clip-left']);
    expect(next.transitions).toEqual([]);
    expect(next.durationSec).toBe(4);
  });

  test('fails closed when a trim, split, or deletion targets a missing clip', () => {
    const project = projectWithTimeline();
    const operations = [
      {
        commandType: 'trim_clip' as const,
        trackId: 'video-main',
        clipId: 'missing',
        durationSec: 2,
      },
      {
        commandType: 'split_clip' as const,
        trackId: 'video-main',
        clipId: 'missing',
        splitAtSec: 1,
        rightClipId: 'new-right',
      },
      {
        commandType: 'remove_clip' as const,
        trackId: 'video-main',
        clipId: 'missing',
      },
    ];

    for (const operation of operations) {
      expect(() => applyEditorCommandBatch(project, command(project, operation))).toThrow(
        'was not found',
      );
    }
  });

  test('requires deleteClips before removing a populated track', () => {
    const project = projectWithTimeline();

    expect(() =>
      applyEditorCommandBatch(
        project,
        command(project, {
          commandType: 'remove_track',
          trackId: 'video-main',
          deleteClips: false,
        }),
      ),
    ).toThrow('deleteClips');

    const removed = applyEditorCommandBatch(
      project,
      command(project, {
        commandType: 'remove_track',
        trackId: 'video-main',
        deleteClips: true,
      }),
    );
    expect(removed.tracks).toEqual([]);
    expect(removed.transitions).toEqual([]);
    expect(removed.durationSec).toBe(0);
  });

  test('splits source time and keyframes while keeping the outgoing transition at the real cut', () => {
    let project = projectWithTimeline();
    project = applyEditorCommandBatch(
      project,
      command(project, {
        commandType: 'set_keyframes',
        trackId: 'video-main',
        clipId: 'clip-left',
        keyframes: [
          {
            id: 'key-left',
            property: 'transform.opacity',
            timeSec: 1,
            value: 0.5,
            interpolation: 'linear',
          },
          {
            id: 'key-right',
            property: 'transform.opacity',
            timeSec: 3,
            value: 1,
            interpolation: 'linear',
          },
        ],
      }),
    );

    const split = applyEditorCommandBatch(
      project,
      command(project, {
        commandType: 'split_clip',
        trackId: 'video-main',
        clipId: 'clip-left',
        splitAtSec: 2,
        rightClipId: 'clip-middle',
      }),
    );
    const clips = split.tracks[0]?.clips ?? [];

    expect(clips[0]).toMatchObject({ id: 'clip-left', durationSec: 2, sourceInSec: 0 });
    expect(clips[0]?.keyframes).toEqual([expect.objectContaining({ id: 'key-left', timeSec: 1 })]);
    expect(clips[1]).toMatchObject({
      id: 'clip-middle',
      timelineStartSec: 2,
      durationSec: 2,
      sourceInSec: 2,
    });
    expect(clips[1]?.keyframes).toEqual([expect.objectContaining({ id: 'key-right', timeSec: 1 })]);
    expect(split.transitions[0]).toMatchObject({
      fromClipId: 'clip-middle',
      toClipId: 'clip-right',
    });
  });

  test('accounts for playback rate when splitting source media', () => {
    const project = projectWithTimeline({ playbackRate: 2 });

    const split = applyEditorCommandBatch(
      project,
      command(project, {
        commandType: 'split_clip',
        trackId: 'video-main',
        clipId: 'clip-left',
        splitAtSec: 2,
        rightClipId: 'clip-middle',
      }),
    );

    expect(split.tracks[0]?.clips[1]).toMatchObject({
      id: 'clip-middle',
      sourceInSec: 5,
      playbackRate: 2,
    });
  });

  test('rejects changes to locked tracks and clips', () => {
    const lockedTrack = projectWithTimeline({ trackLocked: true });
    const lockedClip = projectWithTimeline({ clipLocked: true });
    const trim = {
      commandType: 'trim_clip' as const,
      trackId: 'video-main',
      clipId: 'clip-left',
      durationSec: 2,
    };

    expect(() => applyEditorCommandBatch(lockedTrack, command(lockedTrack, trim))).toThrow(
      'Track "video-main" is locked',
    );
    expect(() => applyEditorCommandBatch(lockedClip, command(lockedClip, trim))).toThrow(
      'Clip "clip-left" is locked',
    );
  });

  test('records undo as a new revision that restores a prior canonical timeline snapshot', () => {
    const original = projectWithTimeline();
    const edited = applyEditorCommandBatch(
      original,
      command(original, {
        commandType: 'remove_clip',
        trackId: 'video-main',
        clipId: 'clip-right',
      }),
    );

    const restored = applyEditorCommandBatch(
      edited,
      command(edited, {
        commandType: 'restore_timeline_snapshot',
        snapshot: {
          sourceRevision: original.revision,
          sourceFingerprint: original.fingerprint,
          durationSec: original.durationSec,
          tracks: original.tracks,
          transitions: original.transitions,
        },
      } as never),
    );

    expect(restored.revision).toBe(edited.revision + 1);
    expect(restored.tracks).toEqual(original.tracks);
    expect(restored.transitions).toEqual(original.transitions);
    expect(restored.durationSec).toBe(7.5);
    expect(restored.production).toEqual(edited.production);

    expect(() =>
      applyEditorCommandBatch(
        edited,
        command(
          edited,
          {
            commandType: 'restore_timeline_snapshot',
            snapshot: {
              sourceRevision: original.revision,
              sourceFingerprint: original.fingerprint,
              durationSec: original.durationSec,
              tracks: original.tracks,
              transitions: original.transitions,
            },
          },
          { actorId: 'canvas-agent', actorType: 'agent' },
        ),
      ),
    ).toThrow('user');
  });

  test('requires transition geometry to commit atomically with the transition', () => {
    const empty = createEditorProjectV2({
      projectId: 'project-transition-geometry',
      title: 'Transition geometry',
      width: 1920,
      height: 1080,
      now: '2026-08-01T12:00:00.000Z',
    });
    const project = applyEditorCommandBatch(
      empty,
      commandBatch(empty, [
        { commandType: 'set_project_metadata', durationSec: 8 },
        {
          commandType: 'add_track',
          track: {
            id: 'video-main',
            name: 'Main video',
            order: 0,
            enabled: true,
            locked: false,
            muted: false,
            solo: false,
            kind: 'video',
            clips: [
              videoClip({ id: 'left', timelineStartSec: 0, durationSec: 4 }),
              videoClip({ id: 'right', timelineStartSec: 4, durationSec: 4 }),
            ],
          },
        },
      ]),
    );
    const transition = {
      id: 'transition',
      trackId: 'video-main',
      fromClipId: 'left',
      toClipId: 'right',
      transitionType: 'crossfade' as const,
      durationSec: 0.5,
      alignment: 'centered' as const,
      parameters: {},
    };

    expect(() =>
      applyEditorCommandBatch(
        project,
        command(project, { commandType: 'upsert_transition', transition }),
      ),
    ).toThrow('must start at 3.5s');

    const transitioned = applyEditorCommandBatch(
      project,
      commandBatch(project, [
        {
          commandType: 'move_clip',
          clipId: 'right',
          fromTrackId: 'video-main',
          toTrackId: 'video-main',
          timelineStartSec: 3.5,
        },
        { commandType: 'set_project_metadata', durationSec: 7.5 },
        { commandType: 'upsert_transition', transition },
      ]),
    );
    expect(transitioned.durationSec).toBe(7.5);

    expect(() =>
      applyEditorCommandBatch(
        transitioned,
        command(transitioned, { commandType: 'remove_transition', transitionId: 'transition' }),
      ),
    ).toThrow('must start at 4s');

    const removed = applyEditorCommandBatch(
      transitioned,
      commandBatch(transitioned, [
        { commandType: 'remove_transition', transitionId: 'transition' },
        {
          commandType: 'move_clip',
          clipId: 'right',
          fromTrackId: 'video-main',
          toTrackId: 'video-main',
          timelineStartSec: 4,
        },
        { commandType: 'set_project_metadata', durationSec: 8 },
      ]),
    );
    expect(removed.durationSec).toBe(8);
  });
});
