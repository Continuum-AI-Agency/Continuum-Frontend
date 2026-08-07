import { z } from 'zod';
import { brandBookPieceKindSchema } from './brand-enforcement';

export const HYPERFRAMES_AGENT_NODE_TYPE = 'hyperframesAgent' as const;
export const HYPERFRAMES_AGENT_MODEL = 'gemini-3.5-flash-lite' as const;
export const HYPERFRAMES_AGENT_MEDIA_LIMIT = 20;
/** Creative-direction skills a single turn may carry, matching the other generator nodes. */
export const HYPERFRAMES_AGENT_SKILL_LIMIT = 3;

export const hyperframesAspectRatioSchema = z.enum(['16:9', '9:16', '1:1']);
export const hyperframesResolutionSchema = z.enum(['720p', '1080p']);
export const hyperframesAgentStatusSchema = z.enum([
  'idle',
  'queued',
  'drafting',
  'reviewing',
  'rendering',
  'completed',
  'failed',
  'cancelled',
]);

export const hyperframesStoragePointerSchema = z
  .object({
    bucket: z.string().min(1),
    path: z.string().min(1),
  })
  .strict();
export type HyperframesStoragePointer = z.infer<typeof hyperframesStoragePointerSchema>;

export const hyperframesAgentAssetRefSchema = z
  .object({
    assetId: z.string().min(1),
    kind: z.enum(['image', 'video', 'audio']),
  })
  .strict();
export type HyperframesAgentAssetRef = z.infer<typeof hyperframesAgentAssetRefSchema>;

export const hyperframesAgentNodeDataSchema = z
  .object({
    label: z.string().min(1).default('HyperFrames Agent'),
    model: z.literal(HYPERFRAMES_AGENT_MODEL).default(HYPERFRAMES_AGENT_MODEL),
    prompt: z.string().default(''),
    aspectRatio: hyperframesAspectRatioSchema.default('16:9'),
    durationSeconds: z.number().int().min(5).max(30).default(10),
    fps: z.literal(30).default(30),
    resolution: hyperframesResolutionSchema.default('1080p'),
    // Grounding selection persisted on the node, same as the other generators.
    // Optional rather than defaulted so parsing an existing node does not
    // silently write empty arrays into saved canvases.
    skillIds: z.array(z.string().min(1)).max(HYPERFRAMES_AGENT_SKILL_LIMIT).optional(),
    brandBookPieces: z.array(brandBookPieceKindSchema).max(8).optional(),
    status: hyperframesAgentStatusSchema.default('idle'),
    sessionId: z.string().min(1).optional(),
    activeRunId: z.string().min(1).optional(),
    revisionId: z.string().min(1).optional(),
    revisionNumber: z.number().int().positive().optional(),
    compositionStorage: hyperframesStoragePointerSchema.optional(),
    generatedVideoAssetId: z.string().min(1).optional(),
    generatedVideoStorageBucket: z.string().min(1).optional(),
    generatedVideoStoragePath: z.string().min(1).optional(),
    generatedVideoUrl: z.string().url().optional(),
    progress: z.number().min(0).max(1).optional(),
    error: z.string().optional(),
  })
  .passthrough();
export type HyperframesAgentNodeData = z.infer<typeof hyperframesAgentNodeDataSchema>;

export const hyperframesAgentTurnRequestSchema = z
  .object({
    sessionId: z.string().min(1).optional(),
    canvasId: z.string().min(1),
    nodeId: z.string().min(1),
    prompt: z.string().trim().min(1).max(20_000),
    assets: z.array(hyperframesAgentAssetRefSchema).max(HYPERFRAMES_AGENT_MEDIA_LIMIT).default([]),
    // Grounding selection, same shape the other generator nodes send. Without
    // these the composition agent is the only ungrounded generator in the Studio.
    skillIds: z.array(z.string().min(1)).max(HYPERFRAMES_AGENT_SKILL_LIMIT).default([]),
    // Optional, NOT `.default([])`. `resolveBrandEnforcement` reads absence as
    // DEFAULT_BRAND_BOOK_PIECES ("full") and an empty array as enforcement OFF, so
    // defaulting here would silently strip every brand hex and typeface from the one
    // generator that renders type itself. `skillIds` above may default to [] because
    // `resolveHyperframesSkillIds` reads empty as "use the default skill"; the two
    // fields look alike and mean opposite things when empty.
    brandBookPieces: z.array(brandBookPieceKindSchema).max(8).optional(),
    aspectRatio: hyperframesAspectRatioSchema.default('16:9'),
    durationSeconds: z.number().int().min(5).max(30).default(10),
    resolution: hyperframesResolutionSchema.default('1080p'),
    idempotencyKey: z.string().min(8).max(200).optional(),
  })
  .strict();
export type HyperframesAgentTurnRequest = z.infer<typeof hyperframesAgentTurnRequestSchema>;

export const hyperframesAgentTurnResponseSchema = z
  .object({
    sessionId: z.string().min(1),
    runId: z.string().min(1),
    status: z.enum(['queued', 'running']),
  })
  .strict();
export type HyperframesAgentTurnResponse = z.infer<typeof hyperframesAgentTurnResponseSchema>;

export const hyperframesCompositionRevisionSchema = z
  .object({
    revisionId: z.string().min(1),
    sessionId: z.string().min(1),
    runId: z.string().min(1),
    revisionNumber: z.number().int().positive(),
    parentRevisionId: z.string().min(1).nullable(),
    fingerprint: z.string().length(64),
    compositionStorage: hyperframesStoragePointerSchema,
    // A revision records WHICH model made it — a historical fact, not a validated
    // choice. Pinning it to a literal made every past revision unreadable the day
    // the agent's model changed.
    model: z.string().min(1),
    aspectRatio: hyperframesAspectRatioSchema,
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    durationSeconds: z.number().min(5).max(30),
    fps: z.literal(30),
    sourceAssetIds: z.array(z.string().min(1)).max(HYPERFRAMES_AGENT_MEDIA_LIMIT),
    lintWarnings: z.array(z.string()),
    visualWarnings: z.array(z.string()),
    createdAt: z.string(),
  })
  .strict();
export type HyperframesCompositionRevision = z.infer<typeof hyperframesCompositionRevisionSchema>;

const reviewFrameSchema = z
  .object({
    timestampSeconds: z.number().nonnegative(),
    storage: hyperframesStoragePointerSchema,
  })
  .strict();

export const hyperframesBrowserReviewRequestSchema = z
  .object({
    revisionId: z.string().min(1),
    fingerprint: z.string().length(64),
    frames: z.array(reviewFrameSchema).min(1).max(5),
    capabilities: z
      .object({
        avc: z.boolean(),
        aac: z.boolean(),
      })
      .strict(),
  })
  .strict();
export type HyperframesBrowserReviewRequest = z.infer<typeof hyperframesBrowserReviewRequestSchema>;

export const hyperframesReviewUploadRequestSchema = z
  .object({
    revisionId: z.string().min(1),
    fingerprint: z.string().length(64),
    frameCount: z.number().int().min(1).max(5),
  })
  .strict();
export type HyperframesReviewUploadRequest = z.infer<typeof hyperframesReviewUploadRequestSchema>;

export const hyperframesReviewUploadResponseSchema = z
  .object({
    uploads: z.array(
      z
        .object({
          storage: hyperframesStoragePointerSchema,
          signedUrl: z.string().url(),
        })
        .strict(),
    ),
  })
  .strict();
export type HyperframesReviewUploadResponse = z.infer<typeof hyperframesReviewUploadResponseSchema>;

export const hyperframesRenderCompleteRequestSchema = z
  .object({
    revisionId: z.string().min(1),
    fingerprint: z.string().length(64),
    assetId: z.string().min(1),
    storage: hyperframesStoragePointerSchema,
    durationSeconds: z.number().positive(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict();
export type HyperframesRenderCompleteRequest = z.infer<
  typeof hyperframesRenderCompleteRequestSchema
>;

const revisionEventDataSchema = z.object({
  revisionId: z.string().min(1),
  revisionNumber: z.number().int().positive(),
  fingerprint: z.string().length(64),
  compositionStorage: hyperframesStoragePointerSchema,
});

export const hyperframesAgentEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('hyperframes.agent.step'),
    data: z.object({
      phase: z.enum(['drafting', 'repairing', 'finalizing']),
      message: z.string(),
      pass: z.number().int().min(0).max(2),
    }),
  }),
  z.object({
    type: z.literal('hyperframes.composition.revision'),
    data: revisionEventDataSchema,
  }),
  z.object({
    type: z.literal('hyperframes.lint.result'),
    data: z.object({
      revisionId: z.string().min(1),
      valid: z.boolean(),
      errors: z.array(z.string()),
      warnings: z.array(z.string()),
    }),
  }),
  z.object({
    type: z.literal('hyperframes.visual_review.requested'),
    data: z.object({
      revisionId: z.string().min(1),
      fingerprint: z.string().length(64),
      timestampsSeconds: z.array(z.number().nonnegative()).length(5),
      pass: z.number().int().min(0).max(2),
    }),
  }),
  z.object({
    type: z.literal('hyperframes.visual_review.completed'),
    data: z.object({
      revisionId: z.string().min(1),
      accepted: z.boolean(),
      warnings: z.array(z.string()),
      pass: z.number().int().min(0).max(2),
      // Recorded on every review, not only rejections — otherwise craft is only
      // measurable when it fails, and two runs cannot be compared. Optional so
      // events written before this field stay replayable.
      craftScore: z.number().int().min(1).max(10).optional(),
    }),
  }),
  z.object({
    type: z.literal('hyperframes.render.requested'),
    data: revisionEventDataSchema,
  }),
  z.object({
    type: z.literal('hyperframes.render.progress'),
    data: z.object({
      revisionId: z.string().min(1),
      progress: z.number().min(0).max(1),
    }),
  }),
  z.object({
    type: z.literal('hyperframes.render.completed'),
    data: z.object({
      revisionId: z.string().min(1),
      assetId: z.string().min(1),
      storage: hyperframesStoragePointerSchema,
    }),
  }),
  z.object({
    type: z.literal('response.done'),
    data: z.object({
      runId: z.string().min(1),
      sessionId: z.string().min(1),
      revisionId: z.string().min(1),
      assetId: z.string().min(1),
    }),
  }),
  z.object({
    type: z.literal('response.error'),
    data: z.object({ message: z.string().min(1) }),
  }),
  z.object({
    type: z.literal('response.cancelled'),
    data: z.object({ message: z.string().optional() }),
  }),
]);
export type HyperframesAgentEvent = z.infer<typeof hyperframesAgentEventSchema>;
