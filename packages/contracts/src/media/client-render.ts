import { z } from 'zod';
import { pinnedLibraryAssetRefSchema } from './library-reference';

// PostgreSQL's uuid type accepts legacy/non-versioned UUID values used by some
// of our seeded fixtures. Zod's `uuid()` validator only accepts RFC variant and
// version bits, which made otherwise valid database rows fail at the API edge.
export const databaseUuidSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/);

export const clientRenderJobKindSchema = z.enum([
  'hyperframes_agent',
  'organic_hyperframe',
  'planner_reel',
  'mcp_clip_batch',
]);
export type ClientRenderJobKind = z.infer<typeof clientRenderJobKindSchema>;

export const clientRenderJobStateSchema = z.enum([
  'ready',
  'claimed',
  'rendering',
  'saving',
  'completed',
  'failed',
  'cancelled',
  'superseded',
]);
export type ClientRenderJobState = z.infer<typeof clientRenderJobStateSchema>;

export const clientRenderJobInputSchema = z
  .object({
    position: z.number().int().nonnegative(),
    kind: z.enum(['composition', 'video', 'audio', 'image', 'source_asset', 'reference']),
    sourceId: z.string().min(1).max(1_000),
    label: z.string().min(1).max(120),
    sourceRevision: z.string().min(1).max(500).optional(),
    sourceAssetId: databaseUuidSchema.optional(),
    storage: z
      .object({
        bucket: z.string().min(1).max(200),
        path: z.string().min(1).max(2_000),
      })
      .strict()
      .optional(),
    role: z.string().min(1).max(80).optional(),
    durationSeconds: z.number().positive().optional(),
    mimeType: z.string().min(1).max(200).optional(),
  })
  .strict();
export type ClientRenderJobInput = z.infer<typeof clientRenderJobInputSchema>;

export const clientRenderJobInputManifestSchema = z
  .array(clientRenderJobInputSchema)
  .min(1)
  .max(100)
  .superRefine((inputs, context) => {
    const positions = new Set<number>();
    for (const [index, input] of inputs.entries()) {
      if (positions.has(input.position)) {
        context.addIssue({
          code: 'custom',
          path: [index, 'position'],
          message: 'Render input positions must be unique.',
        });
      }
      positions.add(input.position);
    }
  });
export type ClientRenderJobInputManifest = z.infer<typeof clientRenderJobInputManifestSchema>;

const renderOriginSchema = z
  .object({
    label: z.string().min(1).max(120),
    viewHref: z.string().startsWith('/'),
  })
  .strict();

export const hyperframesClientRenderSpecSchema = z
  .object({
    kind: z.literal('hyperframes_agent'),
    runId: databaseUuidSchema,
    canvasId: z.string().min(1),
    nodeId: z.string().min(1),
    origin: renderOriginSchema,
  })
  .strict();

export const organicHyperframeClientRenderSpecSchema = z
  .object({
    kind: z.literal('organic_hyperframe'),
    draftId: databaseUuidSchema,
    compositionId: z.string().min(1),
    htmlPath: z.string().min(1),
    durationSeconds: z.number().positive(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    // Library assets the composition embeds as hf-asset://<id>. Carried as ids,
    // not URLs, because the browser re-signs them at render time — a signature
    // minted when the draft was written is long dead by then. Absent on
    // compositions that embed no media.
    assets: z
      .array(
        z
          .object({
            assetId: databaseUuidSchema,
            kind: z.enum(['image', 'video', 'audio']),
          })
          .strict(),
      )
      .max(20)
      .optional(),
    origin: renderOriginSchema,
  })
  .strict();

export const plannerReelClientRenderSpecSchema = z
  .object({
    kind: z.literal('planner_reel'),
    draftId: databaseUuidSchema,
    durationSeconds: z.number().positive(),
    captions: z
      .object({
        enabled: z.boolean(),
        source: z.literal('google_stt_v2'),
      })
      .strict()
      .optional(),
    ugc: z
      .object({
        referenceAssetIds: z.array(databaseUuidSchema).min(1).max(3),
        characterAssetIds: z.array(databaseUuidSchema).min(1).max(2),
      })
      .strict()
      .optional(),
    origin: renderOriginSchema,
  })
  .strict();

export const mcpClipBatchClientRenderSpecSchema = z
  .object({
    kind: z.literal('mcp_clip_batch'),
    sourceAssetId: databaseUuidSchema,
    origin: renderOriginSchema,
  })
  .strict();

export const clientRenderExecutionSpecSchema = z.discriminatedUnion('kind', [
  hyperframesClientRenderSpecSchema,
  organicHyperframeClientRenderSpecSchema,
  plannerReelClientRenderSpecSchema,
  mcpClipBatchClientRenderSpecSchema,
]);
export type ClientRenderExecutionSpec = z.infer<typeof clientRenderExecutionSpecSchema>;

export const clientRenderCapabilitiesSchema = z
  .object({
    avc: z.boolean(),
    aac: z.boolean(),
    webCodecs: z.boolean(),
  })
  .strict();
export type ClientRenderCapabilities = z.infer<typeof clientRenderCapabilitiesSchema>;

export const clientRenderJobSchema = z
  .object({
    id: databaseUuidSchema,
    brandId: databaseUuidSchema,
    kind: clientRenderJobKindSchema,
    sourceId: z.string().min(1),
    sourceRevision: z.string().min(1),
    title: z.string().min(1).max(180),
    createdBy: databaseUuidSchema.nullable(),
    state: clientRenderJobStateSchema,
    progress: z.number().min(0).max(1),
    phase: z.string().max(120).nullable(),
    executionSpec: clientRenderExecutionSpecSchema,
    inputs: clientRenderJobInputManifestSchema,
    claimedBy: databaseUuidSchema.nullable(),
    claimedClientId: z.string().nullable(),
    leaseToken: databaseUuidSchema.nullable(),
    leaseExpiresAt: z.string().nullable(),
    attemptCount: z.number().int().nonnegative(),
    resultAssetIds: z.array(databaseUuidSchema),
    resultAssetRefs: z.array(pinnedLibraryAssetRefSchema),
    errorCode: z.string().nullable(),
    errorMessage: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    completedAt: z.string().nullable(),
  })
  .strict()
  .superRefine((job, context) => {
    if (job.kind !== job.executionSpec.kind) {
      context.addIssue({
        code: 'custom',
        path: ['executionSpec', 'kind'],
        message: 'Execution spec kind must match the render job kind.',
      });
    }
  });
export type ClientRenderJob = z.infer<typeof clientRenderJobSchema>;

export const listClientRenderJobsResponseSchema = z
  .object({ jobs: z.array(clientRenderJobSchema) })
  .strict();

export const createClientRenderJobRequestSchema = z
  .object({
    brandId: databaseUuidSchema,
    sourceId: z.string().min(1),
    sourceRevision: z.string().min(1),
    title: z.string().min(1).max(180),
    executionSpec: clientRenderExecutionSpecSchema,
    inputs: clientRenderJobInputManifestSchema,
  })
  .strict();

export const claimClientRenderJobRequestSchema = z
  .object({
    clientId: z.string().min(8).max(200),
    capabilities: clientRenderCapabilitiesSchema,
  })
  .strict();

export const claimedClientRenderJobResponseSchema = z
  .object({
    job: clientRenderJobSchema,
    leaseToken: databaseUuidSchema,
  })
  .strict();

export const updateClientRenderJobRequestSchema = z
  .object({
    leaseToken: databaseUuidSchema,
    state: z.enum(['claimed', 'rendering', 'saving']).optional(),
    progress: z.number().min(0).max(1).optional(),
    phase: z.string().min(1).max(120).optional(),
  })
  .strict();

export const finishClientRenderJobRequestSchema = z
  .object({
    leaseToken: databaseUuidSchema,
    resultAssetIds: z.array(databaseUuidSchema).max(100).default([]),
  })
  .strict();

export const failClientRenderJobRequestSchema = z
  .object({
    leaseToken: databaseUuidSchema,
    errorCode: z.string().min(1).max(80).default('render_failed'),
    errorMessage: z.string().min(1).max(2_000),
  })
  .strict();

export const releaseClientRenderJobRequestSchema = z
  .object({ leaseToken: databaseUuidSchema })
  .strict();

export const clientRenderMutationResponseSchema = z.object({ job: clientRenderJobSchema }).strict();

export const hyperframesClientRenderWorkSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('review'),
      revisionId: databaseUuidSchema,
      fingerprint: z.string().length(64),
      timestampsSeconds: z.array(z.number().nonnegative()).min(1).max(5),
      pass: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('render'),
      revisionId: databaseUuidSchema,
      fingerprint: z.string().length(64),
    })
    .strict(),
  z.object({ kind: z.literal('waiting') }).strict(),
  z
    .object({
      kind: z.literal('completed'),
      resultAssetIds: z.array(databaseUuidSchema),
    })
    .strict(),
  z
    .object({
      kind: z.literal('failed'),
      message: z.string().min(1),
    })
    .strict(),
]);
export type HyperframesClientRenderWork = z.infer<typeof hyperframesClientRenderWorkSchema>;
