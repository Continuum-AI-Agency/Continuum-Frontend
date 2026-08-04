import { z } from 'zod';
import { databaseUuidSchema } from '../media/client-render';
import {
  editorCommandBatchSchema,
  editorPinnedAssetRefSchema,
  editorProductionStageSchema,
  editorProjectV2Schema,
} from './editor-project-v2';

export const editorProjectBindingSchema = z
  .object({
    bindingType: z.enum(['canvas_node', 'library_asset', 'planner_composition']),
    externalId: z.string().min(1).max(1_000),
  })
  .strict();
export type EditorProjectBinding = z.infer<typeof editorProjectBindingSchema>;

export const createEditorProjectRequestSchema = z
  .object({
    brandId: databaseUuidSchema,
    title: z.string().min(1).max(500),
    width: z.number().int().positive().max(4_096),
    height: z.number().int().positive().max(4_096),
    binding: editorProjectBindingSchema.optional(),
  })
  .strict();

export const editorProjectResponseSchema = z
  .object({
    project: editorProjectV2Schema,
    bindings: z.array(editorProjectBindingSchema),
  })
  .strict();

export const resolveEditorProjectResponseSchema = z
  .object({ projectId: databaseUuidSchema.nullable() })
  .strict();

export const applyEditorCommandsRequestSchema = editorCommandBatchSchema;

export const restoreEditorTimelineRevisionRequestSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    expectedFingerprint: z.string().min(1).max(500),
    restoreRevision: z.number().int().nonnegative(),
    idempotencyKey: z.string().min(8).max(500),
  })
  .strict()
  .refine((request) => request.restoreRevision < request.expectedRevision, {
    path: ['restoreRevision'],
    message: 'restoreRevision must identify an earlier persisted revision',
  });
export type RestoreEditorTimelineRevisionRequest = z.infer<
  typeof restoreEditorTimelineRevisionRequestSchema
>;

const editorTimelineOperationIdSchema = z.string().min(1).max(200);
const editorTimelineSecondsSchema = z.number().finite().nonnegative().max(86_400);

export const editorTimelineOperationSchema = z
  .object({
    action: z.enum([
      'trim_clip',
      'split_clip',
      'move_clip',
      'remove_clip',
      'upsert_text',
      'upsert_audio',
      'upsert_overlay',
      'upsert_transition',
      'remove_transition',
    ]),
    trackId: editorTimelineOperationIdSchema.optional(),
    fromTrackId: editorTimelineOperationIdSchema.optional(),
    toTrackId: editorTimelineOperationIdSchema.optional(),
    clipId: editorTimelineOperationIdSchema.optional(),
    rightClipId: editorTimelineOperationIdSchema.optional(),
    transitionId: editorTimelineOperationIdSchema.optional(),
    fromClipId: editorTimelineOperationIdSchema.optional(),
    toClipId: editorTimelineOperationIdSchema.optional(),
    name: z.string().min(1).max(500).optional(),
    timelineStartSec: editorTimelineSecondsSchema.optional(),
    sourceInSec: editorTimelineSecondsSchema.optional(),
    durationSec: z.number().finite().positive().max(86_400).optional(),
    splitAtSec: z.number().finite().positive().max(86_400).optional(),
    assetId: editorTimelineOperationIdSchema.optional(),
    versionId: editorTimelineOperationIdSchema.optional(),
    text: z.string().min(1).max(20_000).optional(),
    fontFamily: z.string().min(1).max(300).optional(),
    fontSizePx: z.number().finite().positive().max(2_000).optional(),
    color: z.string().min(1).max(100).optional(),
    backgroundColor: z.string().min(1).max(100).optional(),
    mediaKind: z.enum(['video', 'image', 'graphic']).optional(),
    volume: z.number().finite().min(0).max(4).optional(),
    pan: z.number().finite().min(-1).max(1).optional(),
    muted: z.boolean().optional(),
    fadeInSec: editorTimelineSecondsSchema.optional(),
    fadeOutSec: editorTimelineSecondsSchema.optional(),
    opacity: z.number().finite().min(0).max(1).optional(),
    positionX: z.number().finite().min(-8).max(8).optional(),
    positionY: z.number().finite().min(-8).max(8).optional(),
    scale: z.number().finite().min(0.01).max(20).optional(),
    rotationDeg: z.number().finite().min(-36_000).max(36_000).optional(),
    blendMode: z
      .enum(['normal', 'multiply', 'screen', 'overlay', 'lighten', 'darken', 'difference'])
      .optional(),
    transitionType: z
      .enum([
        'cut',
        'crossfade',
        'dip_to_black',
        'dip_to_white',
        'wipe',
        'slide',
        'zoom',
        'blur',
        'custom',
      ])
      .optional(),
    transitionDurationSec: z.number().finite().positive().max(86_400).optional(),
    transitionAlignment: z.enum(['before_cut', 'centered', 'after_cut']).optional(),
  })
  .strict()
  .superRefine((operation, context) => {
    const requiredByAction: Record<typeof operation.action, Array<keyof typeof operation>> = {
      trim_clip: ['trackId', 'clipId', 'durationSec'],
      split_clip: ['trackId', 'clipId', 'splitAtSec', 'rightClipId'],
      move_clip: ['fromTrackId', 'toTrackId', 'clipId', 'timelineStartSec'],
      remove_clip: ['trackId', 'clipId'],
      upsert_text: ['trackId', 'clipId'],
      upsert_audio: ['trackId', 'clipId'],
      upsert_overlay: ['trackId', 'clipId'],
      upsert_transition: [
        'trackId',
        'transitionId',
        'fromClipId',
        'toClipId',
        'transitionType',
        'transitionDurationSec',
      ],
      remove_transition: ['transitionId'],
    };
    for (const field of requiredByAction[operation.action]) {
      if (operation[field] === undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${String(field)} is required for ${operation.action}`,
        });
      }
    }
    if ((operation.assetId === undefined) !== (operation.versionId === undefined)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['versionId'],
        message: 'assetId and versionId must be provided together',
      });
    }
  });
export type EditorTimelineOperation = z.infer<typeof editorTimelineOperationSchema>;

export const editorTimelineOperationsSchema = z.array(editorTimelineOperationSchema).min(1).max(20);

export const editorGenerationKindSchema = z.enum([
  'style_extract',
  'frame',
  'motion_draft',
  'motion_master',
]);
export type EditorGenerationKind = z.infer<typeof editorGenerationKindSchema>;

export const createEditorGenerationBatchRequestSchema = z
  .object({
    kind: editorGenerationKindSchema,
    shotId: z.string().min(1).max(200).optional(),
  })
  .strict()
  .superRefine((request, context) => {
    if (request.kind !== 'style_extract' && request.shotId === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['shotId'],
        message: 'shotId is required for frame and motion generation',
      });
    }
    if (request.kind === 'style_extract' && request.shotId !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['shotId'],
        message: 'style extraction is project-scoped',
      });
    }
  });

export const editorGenerationJobSchema = z
  .object({
    id: databaseUuidSchema,
    batchId: databaseUuidSchema,
    projectId: databaseUuidSchema,
    shotId: z.string().nullable(),
    kind: editorGenerationKindSchema,
    candidateIndex: z.number().int().min(0).max(3),
    provider: z.string().min(1).max(200),
    model: z.string().min(1).max(200),
    state: z.enum(['queued', 'claimed', 'running', 'succeeded', 'failed', 'cancelled', 'stale']),
    attemptCount: z.number().int().min(0).max(3),
    resultAsset: editorPinnedAssetRefSchema.nullable(),
    errorCode: z.string().nullable(),
    errorMessage: z.string().nullable(),
    retryable: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
export type EditorGenerationJob = z.infer<typeof editorGenerationJobSchema>;

export const editorGenerationBatchSchema = z
  .object({
    id: databaseUuidSchema,
    projectId: databaseUuidSchema,
    shotId: z.string().nullable(),
    kind: editorGenerationKindSchema,
    requestedCount: z.number().int().min(1).max(4),
    inputFingerprint: z.string().min(1).max(500),
    state: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']),
    completedCount: z.number().int().nonnegative(),
    failedCount: z.number().int().nonnegative(),
    createdAt: z.string(),
    completedAt: z.string().nullable(),
    jobs: z.array(editorGenerationJobSchema).max(4),
  })
  .strict();
export type EditorGenerationBatch = z.infer<typeof editorGenerationBatchSchema>;

export const editorGenerationBatchResponseSchema = z
  .object({ batch: editorGenerationBatchSchema })
  .strict();

export const listEditorGenerationJobsResponseSchema = z
  .object({ batches: z.array(editorGenerationBatchSchema).max(100) })
  .strict();

export const editorProductionSummarySchema = z
  .object({
    projectId: databaseUuidSchema,
    revision: z.number().int().nonnegative(),
    fingerprint: z.string().min(1),
    stage: editorProductionStageSchema,
    shotCount: z.number().int().nonnegative(),
    approvedFrames: z.number().int().nonnegative(),
    approvedMotionDrafts: z.number().int().nonnegative(),
    approvedMasters: z.number().int().nonnegative(),
    activeJobs: z.number().int().nonnegative(),
    blockers: z.array(z.string().min(1).max(1_000)).max(20),
    nextActions: z.array(z.string().min(1).max(1_000)).max(20),
  })
  .strict();
export type EditorProductionSummary = z.infer<typeof editorProductionSummarySchema>;

export const inspectVideoProjectResponseSchema = z
  .object({
    status: z.enum(['success', 'warning', 'error']),
    summary: z.string().min(1).max(1_000),
    next_actions: z.array(z.string().min(1).max(1_000)).max(20),
    artifacts: z
      .object({
        projectId: databaseUuidSchema,
        stage: editorProductionStageSchema,
        production: editorProductionSummarySchema,
      })
      .strict(),
  })
  .strict();
