import { z } from 'zod';
import {
  type ApiRenderJob,
  type ApiRenderPreflightRequest,
  type ApiRenderPreflightResponse,
  apiRenderJobSchema,
  apiRenderPreflightRequestSchema,
  apiRenderPreflightResponseSchema,
} from './api-renders';
import { motionAepTrackEditSchema } from './motion-aep-track';

export * from './motion-aep-track';

export const motionDigestSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const motionEvidenceStatusSchema = z.enum(['pass', 'fail', 'unknown', 'not_run']);
export const motionMediaProfileSchema = z.enum([
  'editor-overlay',
  'forge-overlay',
  'transparent-still',
  'opaque-video',
]);
export type MotionExportProfile = z.infer<typeof motionMediaProfileSchema>;
export type MotionMediaProfile = z.infer<typeof motionMediaProfileSchema>;
export const motionMediaSourceBindingSchema = z
  .object({
    revisionId: z.string().min(1),
    candidateDigest: motionDigestSchema,
    dependencyDigest: motionDigestSchema,
  })
  .strict();
export type MotionMediaSourceBinding = z.infer<typeof motionMediaSourceBindingSchema>;
export const motionAlphaEvidenceSchema = z
  .object({
    status: motionEvidenceStatusSchema,
    transparentPixels: z.number().int().nonnegative().optional(),
    partialPixels: z.number().int().nonnegative().optional(),
    opaquePixels: z.number().int().nonnegative().optional(),
    samples: z
      .array(
        z
          .object({
            frameIndex: z.number().int().nonnegative(),
            transparentPixels: z.number().int().nonnegative(),
            partialPixels: z.number().int().nonnegative(),
            opaquePixels: z.number().int().nonnegative(),
            maxAlphaError: z.number().nonnegative(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();
export type MotionAlphaEvidence = z.infer<typeof motionAlphaEvidenceSchema>;
export const motionMediaOutputSchema = z
  .object({
    profile: motionMediaProfileSchema,
    assetId: z.string().min(1),
    versionId: z.string().min(1),
    checksum: motionDigestSchema,
    sourceRevisionId: z.string().min(1),
    candidateDigest: motionDigestSchema,
    dependencyDigest: motionDigestSchema,
    evidenceId: z.string().min(1),
    alpha: motionEvidenceStatusSchema,
    consumer: motionEvidenceStatusSchema,
  })
  .strict();
export type MotionMediaOutput = z.infer<typeof motionMediaOutputSchema>;
export const motionMediaOutputsSchema = z
  .object({
    'editor-overlay': motionMediaOutputSchema.optional(),
    'forge-overlay': motionMediaOutputSchema.optional(),
    'transparent-still': motionMediaOutputSchema.optional(),
    'opaque-video': motionMediaOutputSchema.optional(),
  })
  .strict()
  .superRefine((outputs, ctx) => {
    const bindings = new Set(
      Object.values(outputs)
        .filter((output) => output !== undefined)
        .map(
          (output) =>
            `${output.sourceRevisionId}:${output.candidateDigest}:${output.dependencyDigest}`,
        ),
    );
    if (bindings.size > 1)
      ctx.addIssue({
        code: 'custom',
        message: 'All derivative profiles must share one immutable source binding.',
      });
    for (const [profile, output] of Object.entries(outputs)) {
      if (output && output.profile !== profile)
        ctx.addIssue({
          code: 'custom',
          path: [profile],
          message: 'Derivative profile must match its key.',
        });
    }
  });
export type MotionMediaOutputs = z.infer<typeof motionMediaOutputsSchema>;
export const motionSourceRefSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('aep'),
      revisionId: z.string().min(1),
      assetId: z.string().min(1),
      versionId: z.string().min(1),
      checksum: motionDigestSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('hyperframes'),
      sessionId: z.string().min(1),
      revisionId: z.string().min(1),
      fingerprint: motionDigestSchema,
    })
    .strict(),
]);
export type MotionSourceRef = z.infer<typeof motionSourceRefSchema>;
const target = z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]);
export const motionHyperframesEditSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('setText'), target, value: z.string() }).strict(),
  z
    .object({
      type: z.literal('setStyle'),
      target,
      styles: z.record(z.string(), z.string().nullable()),
    })
    .strict(),
  z
    .object({
      type: z.literal('setAttribute'),
      target,
      name: z.string().min(1),
      value: z.string().nullable(),
    })
    .strict(),
  z
    .object({
      type: z.literal('setTiming'),
      target,
      start: z.number().finite().nonnegative().optional(),
      duration: z.number().finite().positive().optional(),
      trackIndex: z.number().int().nonnegative().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal('moveElement'),
      target,
      x: z.number().finite(),
      y: z.number().finite(),
    })
    .strict(),
  z.object({ type: z.literal('removeElement'), target }).strict(),
  z
    .object({
      type: z.literal('addElement'),
      parent: z.string().min(1).nullable(),
      index: z.number().int().nonnegative(),
      html: z.string().min(1),
    })
    .strict(),
]);
export type MotionHyperframesEdit = z.infer<typeof motionHyperframesEditSchema>;
export const motionOperationsSchema = z.discriminatedUnion('kind', [
  z
    .object({ kind: z.literal('aep'), tracks: z.array(motionAepTrackEditSchema).min(1).max(100) })
    .strict(),
  z
    .object({
      kind: z.literal('hyperframes'),
      edits: z.array(motionHyperframesEditSchema).min(1).max(100),
    })
    .strict(),
]);
export type MotionOperations = z.infer<typeof motionOperationsSchema>;
export const motionDependencySchema = z
  .object({
    kind: z.enum(['media', 'font', 'embedded']),
    assetId: z.string().min(1).optional(),
    versionId: z.string().min(1).optional(),
    checksum: motionDigestSchema,
    path: z.string().min(1).optional(),
  })
  .strict();
export type MotionDependency = z.infer<typeof motionDependencySchema>;
const inspectionValueSchema = z.union([
  z.number().finite(),
  z.tuple([z.number().finite(), z.number().finite()]),
  z.null(),
]);
const inspectionEaseSchema = z
  .object({ speed: z.number().finite(), influence: z.number().min(0).max(100) })
  .strict();
export const motionAepTrackStateSchema = z
  .object({
    baseValue: inspectionValueSchema,
    keys: z
      .array(
        z
          .object({
            timeSeconds: z.number().finite(),
            value: inspectionValueSchema,
            inInterpolation: z.string(),
            outInterpolation: z.string(),
            inTemporalEase: z.array(inspectionEaseSchema),
            outTemporalEase: z.array(inspectionEaseSchema),
            flags: z.record(z.string(), z.boolean()),
          })
          .strict(),
      )
      .max(10000),
    flags: z.record(z.string(), z.boolean()),
    units: z.string(),
    frameRate: z.number().positive(),
    parentId: z.number().int().nullable(),
    layerName: z.string(),
  })
  .strict();
export const motionHyperframesElementStateSchema = z
  .object({
    tag: z.string(),
    text: z.string().nullable(),
    inlineStyles: z.record(z.string(), z.string()),
    attributes: z.record(z.string(), z.string()),
    classNames: z.array(z.string()),
    start: z.number().finite().nullable(),
    duration: z.number().finite().nullable(),
    trackIndex: z.number().int().nullable(),
    animationIds: z.array(z.string()),
  })
  .strict();
export const motionInspectionSnapshotSchema = z
  .object({
    source: motionSourceRefSchema,
    targets: z.array(
      z
        .object({
          id: z.string().min(1),
          kind: z.enum(['aep-track', 'hyperframes-element']),
          fingerprint: motionDigestSchema,
          editable: z.boolean(),
          reason: z.string().nullable(),
          operations: z.array(z.string().min(1)),
          compId: z.number().int().optional(),
          layerId: z.number().int().optional(),
          property: z.string().optional(),
          aepTrackState: motionAepTrackStateSchema.optional(),
          elementState: motionHyperframesElementStateSchema.optional(),
        })
        .strict(),
    ),
    dependencies: z.array(motionDependencySchema),
    dependencyDigest: motionDigestSchema,
    limits: z.array(z.string()),
    comps: z
      .array(
        z
          .object({
            id: z.string().min(1),
            name: z.string(),
            frameRate: z.number().positive(),
            durationSeconds: z.number().finite().nonnegative(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();
export type MotionInspectionSnapshot = z.infer<typeof motionInspectionSnapshotSchema>;
export const motionDraftRefSchema = z
  .object({
    draftId: z.string().min(1),
    base: motionSourceRefSchema,
    candidateDigest: motionDigestSchema,
    baseSpecDigest: motionDigestSchema.optional(),
    candidateSpecDigest: motionDigestSchema.optional(),
    operationDigest: motionDigestSchema,
    dependencyDigest: motionDigestSchema,
  })
  .strict();
export type MotionDraftRef = z.infer<typeof motionDraftRefSchema>;
export const motionValidationReportSchema = z
  .object({
    evidenceId: z.string().min(1),
    validatorVersion: z.literal('internal-motion/v1'),
    artifacts: z.array(
      z.object({ kind: z.string().min(1), checksum: motionDigestSchema }).strict(),
    ),
    draft: motionDraftRefSchema,
    stages: z
      .object({
        parse: motionEvidenceStatusSchema,
        readback: motionEvidenceStatusSchema,
        preservation: motionEvidenceStatusSchema,
        render: motionEvidenceStatusSchema,
        alpha: motionEvidenceStatusSchema,
        consumer: motionEvidenceStatusSchema,
      })
      .strict(),
    warnings: z.array(z.string()),
  })
  .strict();
export type MotionValidationReport = z.infer<typeof motionValidationReportSchema>;
export const motionValidationWorkflowResultSchema = z
  .object({
    report: motionValidationReportSchema,
    workflow: z.discriminatedUnion('status', [
      z
        .object({
          status: z.literal('awaiting_source_build'),
          stagedSource: z
            .object({
              assetId: z.string().min(1),
              versionId: z.string().min(1),
              checksum: motionDigestSchema,
              forgeRunId: z.string().optional(),
            })
            .strict(),
        })
        .strict(),
      z
        .object({
          status: z.literal('awaiting_confirmation'),
          quote: z.lazy(
            (): z.ZodType<ApiRenderPreflightResponse> => apiRenderPreflightResponseSchema,
          ),
        })
        .strict(),
      z
        .object({
          status: z.literal('rendering'),
          job: z.lazy((): z.ZodType<ApiRenderJob> => apiRenderJobSchema),
        })
        .strict(),
    ]),
  })
  .strict();
export const motionValidationResultSchema = z.union([
  motionValidationReportSchema,
  motionValidationWorkflowResultSchema,
]);
export type MotionValidationResult = z.infer<typeof motionValidationResultSchema>;
export const motionPublicationReceiptSchema = z
  .object({
    source: motionSourceRefSchema,
    draft: motionDraftRefSchema,
    evidenceId: z.string().min(1),
    motionMediaOutputs: motionMediaOutputsSchema,
  })
  .strict();
export type MotionPublicationReceipt = z.infer<typeof motionPublicationReceiptSchema>;
export const INTERNAL_MOTION_TOOLS = {
  inspect_motion_source: z.object({ source: motionSourceRefSchema }).strict(),
  draft_motion_edits: z
    .object({
      source: motionSourceRefSchema,
      operations: motionOperationsSchema,
      idempotencyKey: z.string().min(1).max(200),
    })
    .strict(),
  validate_motion_draft: z
    .object({
      draft: motionDraftRefSchema,
      render: z.boolean().default(false),
      aepRender: z
        .object({
          stage: z.object({ workspaceId: z.string().uuid().optional() }).strict().optional(),
          quoteRequest: z
            .lazy((): z.ZodType<ApiRenderPreflightRequest> => apiRenderPreflightRequestSchema)
            .optional(),
          confirmationToken: z.string().min(1).optional(),
          jobId: z.string().uuid().optional(),
          outputId: z.string().min(1).optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
  publish_motion_revision: z
    .object({
      draft: motionDraftRefSchema,
      name: z.string().min(1).max(120),
      idempotencyKey: z.string().min(1).max(200),
    })
    .strict(),
  export_motion_media: z
    .object({
      draft: motionDraftRefSchema,
      profiles: z.array(motionMediaProfileSchema).min(1).max(4),
      consumerJobIds: z.record(z.string(), z.string().uuid()).optional(),
      consumerProbes: z
        .record(
          z.string(),
          z.object({ blackJobId: z.string().uuid(), whiteJobId: z.string().uuid() }).strict(),
        )
        .optional(),
      aepRender: z
        .object({
          stage: z.object({ workspaceId: z.string().uuid().optional() }).strict().optional(),
          quoteRequest: z
            .lazy((): z.ZodType<ApiRenderPreflightRequest> => apiRenderPreflightRequestSchema)
            .optional(),
          confirmationToken: z.string().min(1).optional(),
          jobId: z.string().uuid().optional(),
          outputId: z.string().min(1).optional(),
        })
        .strict()
        .optional(),
      idempotencyKey: z.string().min(1).max(200),
    })
    .strict(),
  attach_motion_media: z
    .object({
      draft: motionDraftRefSchema,
      profile: motionMediaProfileSchema,
      target: z.discriminatedUnion('kind', [
        z
          .object({
            kind: z.literal('video-editor'),
            projectId: z.string().min(1),
            expectedRevision: z.number().int().nonnegative(),
            expectedFingerprint: z.string().min(1).max(200),
            atSec: z.number().nonnegative(),
            trackId: z.string().min(1).optional(),
          })
          .strict(),
        z
          .object({
            kind: z.literal('forge-input'),
            canvasId: z.string().min(1),
            nodeId: z.string().min(1),
            slotKey: z.string().min(1),
            expectedRevision: z.number().int().nonnegative(),
          })
          .strict(),
      ]),
      idempotencyKey: z.string().min(1).max(200),
    })
    .strict(),
} as const;
export type InternalMotionToolName = keyof typeof INTERNAL_MOTION_TOOLS;
