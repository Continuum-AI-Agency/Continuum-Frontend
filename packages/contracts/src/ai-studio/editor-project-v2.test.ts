import { describe, expect, test } from 'bun:test';
import {
  applyEditorCommandBatch,
  editorAnalysisManifestSchema,
  editorCommandBatchSchema,
  editorCommentDtoSchema,
  editorConflictDtoSchema,
  editorProjectV2Schema,
  editorRenderProgressSchema,
  editorRenderRequestSchema,
  editorRenderResultSchema,
  timelineAuthoringDocumentSchema,
} from './index';

const now = '2026-07-26T12:00:00.000Z';
const actor = {
  actorId: 'canvas-agent',
  actorType: 'agent' as const,
  displayName: 'Canvas',
};
const source = {
  sourceType: 'canvas_node' as const,
  nodeId: 'source-node-1',
  assetId: 'asset-1',
};
const transform = {
  position: { x: 0.5, y: 0.5, unit: 'normalized' as const },
  scaleX: 1,
  scaleY: 1,
  rotationDeg: 0,
  anchorX: 0.5,
  anchorY: 0.5,
  opacity: 1,
};
const textStyle = {
  fontFamily: 'Inter',
  fontSizePx: 64,
  fontWeight: 700,
  color: '#ffffff',
};
const exportSettings = {
  width: 1080,
  height: 1920,
  frameRate: { numerator: 30, denominator: 1 },
  format: 'mp4' as const,
  videoCodec: 'h264' as const,
  videoBitrateKbps: 12_000,
  audioCodec: 'aac' as const,
  audioBitrateKbps: 320,
  sampleRateHz: 48_000,
  colorSpace: 'rec709' as const,
};

function clipBase(id: string, timelineStartSec = 0, durationSec = 5) {
  return { id, timelineStartSec, durationSec };
}

function projectFixture() {
  return {
    schemaVersion: 2 as const,
    projectId: 'project-1',
    sequenceId: 'sequence-main',
    revision: 7,
    fingerprint: 'fingerprint-7',
    title: 'AI UGC launch',
    durationSec: 10,
    canvas: { width: 1080, height: 1920 },
    frameRate: { numerator: 30, denominator: 1 },
    sampleRateHz: 48_000,
    tracks: [
      {
        id: 'video-track',
        name: 'Primary video',
        order: 0,
        kind: 'video' as const,
        clips: [
          {
            ...clipBase('video-1'),
            kind: 'video' as const,
            source,
            transform,
            crop: {},
            keyframes: [
              {
                id: 'kf-1',
                property: 'transform.position' as const,
                timeSec: 0,
                value: { x: 0.5, y: 0.5 },
                interpolation: 'linear' as const,
              },
            ],
          },
          {
            ...clipBase('video-2', 5, 5),
            kind: 'video' as const,
            source: { ...source, nodeId: 'source-node-2' },
            transform,
            crop: {},
          },
        ],
      },
      {
        id: 'audio-track',
        name: 'Dialogue',
        order: 1,
        kind: 'audio' as const,
        clips: [{ ...clipBase('audio-1'), kind: 'audio' as const, source }],
      },
      {
        id: 'overlay-track',
        name: 'Product',
        order: 2,
        kind: 'overlay' as const,
        clips: [
          {
            ...clipBase('overlay-1'),
            kind: 'overlay' as const,
            source,
            mediaKind: 'image' as const,
            transform,
            crop: {},
          },
        ],
      },
      {
        id: 'caption-track',
        name: 'English captions',
        order: 3,
        kind: 'caption' as const,
        clips: [
          {
            ...clipBase('caption-1', 0, 2),
            kind: 'caption' as const,
            text: 'The product solves this.',
            language: 'en-US',
            style: textStyle,
            transform,
            words: [
              { text: 'The', startSec: 0, endSec: 0.2 },
              { text: 'product', startSec: 0.2, endSec: 0.7 },
            ],
          },
        ],
      },
      {
        id: 'text-track',
        name: 'Call to action',
        order: 4,
        kind: 'text' as const,
        clips: [
          {
            ...clipBase('text-1'),
            kind: 'text' as const,
            text: 'Shop now',
            style: textStyle,
            transform,
          },
        ],
      },
      {
        id: 'effect-track',
        name: 'Look',
        order: 5,
        kind: 'effect' as const,
        clips: [
          {
            ...clipBase('effect-1'),
            kind: 'effect' as const,
            effect: {
              id: 'effect-instance-1',
              effectType: 'color_adjustment' as const,
              effectId: 'warm-product',
              parameters: { temperature: 0.1 },
            },
            targetTrackIds: ['video-track'],
          },
        ],
      },
      {
        id: 'nested-track',
        name: 'Reusable end card',
        order: 6,
        kind: 'nested_sequence' as const,
        clips: [
          {
            ...clipBase('nested-1'),
            kind: 'nested_sequence' as const,
            projectId: 'end-card-project',
            sequenceId: 'end-card-main',
            sourceRevision: 3,
            transform,
          },
        ],
      },
    ],
    transitions: [
      {
        id: 'transition-1',
        trackId: 'video-track',
        fromClipId: 'video-1',
        toClipId: 'video-2',
        transitionType: 'crossfade' as const,
        durationSec: 0.25,
      },
    ],
    exportSettings,
    legacyTimelineFingerprint: 'legacy-fingerprint',
    createdAt: now,
    updatedAt: now,
  };
}

describe('EditorProjectV2', () => {
  test('parses every typed track and materializes deterministic defaults', () => {
    const parsed = editorProjectV2Schema.parse(projectFixture());

    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.tracks.map((track) => track.kind)).toEqual([
      'video',
      'audio',
      'overlay',
      'caption',
      'text',
      'effect',
      'nested_sequence',
    ]);
    expect(parsed.tracks[0]?.enabled).toBe(true);
    expect(parsed.exportSettings.quality).toBe('high');
    expect(parsed.transitions[0]?.alignment).toBe('centered');
    expect(parsed.production.workflowStage).toBe('assembly');
    expect(parsed.production.shots).toEqual([]);
  });

  test('models a gated style, frame, motion, and master production', () => {
    const parsed = editorProjectV2Schema.parse({
      ...projectFixture(),
      production: {
        workflowStage: 'style_approval',
        references: [
          {
            id: 'reference-1',
            role: 'style',
            asset: { assetId: 'asset-1', versionId: 'version-1' },
          },
        ],
        styleContract: {
          status: 'draft',
          lockedText: 'Motivated warm light, restrained grain, lifted blacks.',
          facets: {
            lens: '35mm documentary proximity',
            lighting: 'motivated warm practicals',
            palette: 'warm amber and muted navy',
            texture: 'fine grain',
            contrast: 'lifted blacks',
            blocking: 'intimate foreground action',
            atmosphere: 'quiet urgency',
          },
          sourceReferenceIds: ['reference-1'],
        },
        shots: [
          {
            id: 'shot-1',
            order: 0,
            title: 'Hook',
            brief: 'Creator reveals the product.',
            subjectAction: 'The creator raises the product.',
            cameraMove: 'Slow dolly in.',
            inSceneEvent: 'The package catches the key light.',
            targetDurationSec: 4,
            takes: [],
          },
        ],
      },
    });

    expect(parsed.production.references[0]?.asset.versionId).toBe('version-1');
    expect(parsed.production.shots[0]?.selection).toEqual({});
  });

  test('rejects approvals from agents and enforces revision fingerprints', () => {
    const project = editorProjectV2Schema.parse(projectFixture());
    const commandBase = {
      commandId: 'approve-style',
      idempotencyKey: 'approve-style-1',
      expectedRevision: project.revision,
      issuedAt: now,
      actor,
    };
    const batch = {
      batchId: 'batch-approval',
      projectId: project.projectId,
      sequenceId: project.sequenceId,
      idempotencyKey: 'batch-approval-1',
      expectedRevision: project.revision,
      expectedFingerprint: project.fingerprint,
      atomic: true,
      issuedAt: now,
      actor,
      commands: [{ ...commandBase, commandType: 'approve_style_contract' as const }],
    };

    expect(editorCommandBatchSchema.safeParse(batch).success).toBe(false);
    expect(() =>
      applyEditorCommandBatch(project, {
        ...batch,
        expectedFingerprint: 'stale-fingerprint',
        actor: { actorId: 'user-1', actorType: 'user' },
        commands: [
          {
            ...commandBase,
            actor: { actorId: 'user-1', actorType: 'user' },
            commandType: 'approve_style_contract' as const,
          },
        ],
      }),
    ).toThrow('fingerprint');
  });

  test('rejects unknown fields, duplicate clip ids, and references outside the project', () => {
    const withUnknown = { ...projectFixture(), unsupportedRendererState: true };
    expect(editorProjectV2Schema.safeParse(withUnknown).success).toBe(false);

    const duplicate = projectFixture();
    duplicate.tracks[1]!.clips[0]!.id = 'video-1';
    expect(editorProjectV2Schema.safeParse(duplicate).success).toBe(false);

    const missingTransitionTarget = projectFixture();
    missingTransitionTarget.transitions[0]!.toClipId = 'missing';
    expect(editorProjectV2Schema.safeParse(missingTransitionTarget).success).toBe(false);
  });

  test('is additive and does not change the legacy timeline-authoring parser', () => {
    const legacy = {
      items: [
        {
          id: 'legacy-item',
          order: 0,
          sourceNodeId: 'source-node-1',
          kind: 'video' as const,
        },
      ],
    };

    expect(timelineAuthoringDocumentSchema.safeParse(legacy).success).toBe(true);
    expect(editorProjectV2Schema.safeParse(legacy).success).toBe(false);
  });
});

describe('Editor commands', () => {
  test('accepts an atomic, revision-bound, idempotent command batch', () => {
    const parsed = editorCommandBatchSchema.parse({
      batchId: 'batch-1',
      projectId: 'project-1',
      sequenceId: 'sequence-main',
      idempotencyKey: 'batch-key-0001',
      expectedRevision: 7,
      expectedFingerprint: 'fingerprint-7',
      issuedAt: now,
      actor,
      commands: [
        {
          commandId: 'command-1',
          idempotencyKey: 'command-key-0001',
          expectedRevision: 7,
          issuedAt: now,
          actor,
          commandType: 'trim_clip',
          trackId: 'video-track',
          clipId: 'video-1',
          sourceInSec: 1,
          durationSec: 4,
        },
        {
          commandId: 'command-2',
          idempotencyKey: 'command-key-0002',
          expectedRevision: 7,
          issuedAt: now,
          actor,
          commandType: 'set_export_settings',
          exportSettings,
        },
      ],
    });

    expect(parsed.atomic).toBe(true);
    expect(parsed.commands).toHaveLength(2);
  });

  test('rejects mixed revisions and duplicate command idempotency keys', () => {
    const base = {
      batchId: 'batch-1',
      projectId: 'project-1',
      sequenceId: 'sequence-main',
      idempotencyKey: 'batch-key-0001',
      expectedRevision: 7,
      expectedFingerprint: 'fingerprint-7',
      issuedAt: now,
      actor,
      commands: [
        {
          commandId: 'command-1',
          idempotencyKey: 'command-key-0001',
          expectedRevision: 6,
          issuedAt: now,
          actor,
          commandType: 'remove_clip' as const,
          trackId: 'video-track',
          clipId: 'video-1',
        },
        {
          commandId: 'command-2',
          idempotencyKey: 'command-key-0001',
          expectedRevision: 7,
          issuedAt: now,
          actor,
          commandType: 'remove_transition' as const,
          transitionId: 'transition-1',
        },
      ],
    };

    const result = editorCommandBatchSchema.safeParse(base);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain(
        'command expectedRevision must match batch expectedRevision',
      );
      expect(result.error.issues.some((issue) => issue.message.includes('duplicate command'))).toBe(
        true,
      );
    }
  });
});

describe('Editor analysis, rendering, revisions, and review', () => {
  test('validates analysis artifacts and their state-dependent fields', () => {
    const manifest = {
      manifestId: 'manifest-1',
      projectId: 'project-1',
      sequenceId: 'sequence-main',
      projectRevision: 7,
      projectFingerprint: 'fingerprint-7',
      analyzerVersion: 'mediabunny-browser-v1',
      generatedAt: now,
      sources: [
        {
          source,
          mediaKind: 'video' as const,
          durationSec: 10,
          width: 1080,
          height: 1920,
          frameRate: { numerator: 30, denominator: 1 },
          hasAudio: true,
          analyzedAt: now,
        },
      ],
      artifacts: [
        {
          artifactId: 'first-frame-1',
          sourceRef: source,
          artifactType: 'first_frame' as const,
          status: 'ready' as const,
          uri: 'https://cdn.example.com/first.webp',
          mimeType: 'image/webp',
          generatedAt: now,
        },
      ],
    };

    expect(editorAnalysisManifestSchema.safeParse(manifest).success).toBe(true);
    expect(
      editorAnalysisManifestSchema.safeParse({
        ...manifest,
        artifacts: [{ ...manifest.artifacts[0], uri: undefined }],
      }).success,
    ).toBe(false);
  });

  test('validates render requests, ordered progress, and terminal result variants', () => {
    const request = {
      requestId: 'render-1',
      idempotencyKey: 'render-key-0001',
      projectId: 'project-1',
      sequenceId: 'sequence-main',
      projectRevision: 7,
      projectFingerprint: 'fingerprint-7',
      requestedAt: now,
      requestedBy: actor,
      settings: exportSettings,
      range: { startSec: 0, endSec: 10 },
    };
    expect(editorRenderRequestSchema.safeParse(request).success).toBe(true);
    expect(
      editorRenderProgressSchema.safeParse({
        requestId: 'render-1',
        projectId: 'project-1',
        projectRevision: 7,
        sequence: 4,
        status: 'rendering',
        progress: 0.5,
        renderedFrames: 150,
        totalFrames: 300,
        updatedAt: now,
      }).success,
    ).toBe(true);
    expect(
      editorRenderResultSchema.safeParse({
        requestId: 'render-1',
        projectId: 'project-1',
        projectRevision: 7,
        projectFingerprint: 'fingerprint-7',
        completedAt: now,
        status: 'succeeded',
        output: {
          url: 'https://cdn.example.com/final.mp4',
          mimeType: 'video/mp4',
          durationSec: 10,
          width: 1080,
          height: 1920,
          frameRate: { numerator: 30, denominator: 1 },
          sizeBytes: 1_000_000,
          checksum: 'sha256:abc',
          createdAt: now,
        },
      }).success,
    ).toBe(true);
    expect(
      editorRenderResultSchema.safeParse({
        requestId: 'render-1',
        projectId: 'project-1',
        projectRevision: 7,
        projectFingerprint: 'fingerprint-7',
        completedAt: now,
        status: 'succeeded',
        errorMessage: 'not allowed on a successful result',
      }).success,
    ).toBe(false);
  });

  test('validates conflict and resolved-comment DTOs', () => {
    expect(
      editorConflictDtoSchema.safeParse({
        conflictId: 'conflict-1',
        projectId: 'project-1',
        sequenceId: 'sequence-main',
        conflictType: 'stale_revision',
        expectedRevision: 6,
        currentRevision: 7,
        entityType: 'project',
        message: 'The editor changed after inspection.',
        retryable: true,
        detectedAt: now,
      }).success,
    ).toBe(true);

    const resolvedComment = {
      commentId: 'comment-1',
      projectId: 'project-1',
      sequenceId: 'sequence-main',
      revision: 7,
      anchor: { anchorType: 'clip' as const, trackId: 'video-track', clipId: 'video-1' },
      body: 'Keep the product visible for one more second.',
      status: 'resolved' as const,
      author: actor,
      createdAt: now,
      updatedAt: now,
      resolvedAt: now,
      resolvedBy: actor,
    };
    expect(editorCommentDtoSchema.safeParse(resolvedComment).success).toBe(true);
    expect(
      editorCommentDtoSchema.safeParse({ ...resolvedComment, resolvedBy: undefined }).success,
    ).toBe(false);
  });
});
