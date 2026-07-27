// Shared wire shapes for AI Studio canvas media. Signed URLs are the source of
// truth across the FE<->BE boundary; base64 is an emergency-only fallback.
//
// - Request side: a reference image carries a signed `image_url`; `data` (base64)
//   is only sent when the canvas could not upload the source (upload/sign failed)
//   or for legacy un-persisted media. The Backend resolves the URL to base64
//   in-process before calling Vertex/Gemini/FAL.
// - Response side: successful generation emits only `signed_url` + `bucket` +
//   `path` after persistence. Inline bytes are emergency fallback only.

import { z } from 'zod';
import { agentDelegatedFrameSchema } from '../agents/cross-agent';
import { canvasGraphChangeSetSchema } from '../ai-studio/canvas-graph-change';
import { studioEdgeSchema, studioNodeSchema } from '../ai-studio/workflow-graph';
import {
  responseDoneSchema,
  responseErrorSchema,
  toolCallSchema,
  toolResultSchema,
} from './agentFrames';

const REFERENCE_SOURCE_MESSAGE = 'reference image requires base64 data or image_url';

// One reference image input. At least one of { data, image_url, url, or
// storage_bucket+storage_path } must be present. `url` is accepted as an alias
// for `image_url`. `storage_bucket`+`storage_path` let the Backend download the
// bytes via the service-role storage client instead of an unauthenticated fetch
// of a signed URL (which expires and is not always publicly reachable) — this is
// how a generated canvas image round-trips back as a reference.
export const aiStudioReferenceImageSchema = z
  .object({
    data: z.string().min(10, 'reference image data must be base64').optional(),
    image_url: z.string().min(1).optional(),
    url: z.string().min(1).optional(),
    storage_bucket: z.string().min(1).optional(),
    storage_path: z.string().min(1).optional(),
    mime_type: z.string().default('image/png'),
    filename: z.string().optional(),
  })
  .superRefine((image, ctx) => {
    const hasStorageCoords = Boolean(image.storage_bucket && image.storage_path);
    if (!(image.data ?? image.image_url ?? image.url) && !hasStorageCoords) {
      ctx.addIssue({
        code: 'custom',
        path: ['data'],
        message: REFERENCE_SOURCE_MESSAGE,
      });
    }
  });
export type AiStudioReferenceImage = z.infer<typeof aiStudioReferenceImageSchema>;

// Generation result for an image. `signed_url` + `bucket` + `path` are the
// durable, authoritative outputs. Inline bytes are allowed only as a fallback
// when persistence fails.
export const aiStudioImageResultEventSchema = z.object({
  mime_type: z.string(),
  signed_url: z.string().optional(),
  bucket: z.string().optional(),
  path: z.string().optional(),
  resolution: z.string().optional(),
  delivery: z.enum(['durable', 'fallback']).optional(),
  size_bytes: z.number().int().nonnegative().optional(),
  asset_id: z.string().optional(),
  thought: z.boolean().optional(),
  thought_signature: z.string().nullable().optional(),
  base64: z.string().optional(),
  data_url: z.string().optional(),
});
export type AiStudioImageResultEvent = z.infer<typeof aiStudioImageResultEventSchema>;

// Generation result for a video. `signed_url` (+ `download_url`) is the
// authoritative output; `base64` is fallback only.
export const aiStudioVideoResultEventSchema = z.object({
  mime_type: z.string(),
  signed_url: z.string().optional(),
  download_url: z.string().nullable().optional(),
  bucket: z.string().optional(),
  path: z.string().optional(),
  delivery: z.literal('durable').optional(),
  bytes: z.number().optional(),
  base64: z.string().optional(),
});
export type AiStudioVideoResultEvent = z.infer<typeof aiStudioVideoResultEventSchema>;

// ---------------------------------------------------------------------------
// Canvas Composer — the in-app "prompt -> workflow" agent stream
// ---------------------------------------------------------------------------
//
// The agent writes graph state to brand_profiles.canvas_sessions, then emits an
// optimistic `composer.patch` for immediate paint. Realtime remains the durable
// reconciliation path, so a dropped patch never loses the committed graph.

const composerStartedSchema = z.object({
  type: z.literal('composer.started'),
  data: z.object({ roomId: z.string().min(1), runId: z.string().min(1).optional() }).loose(),
});

const composerStatusSchema = z.object({
  type: z.literal('composer.status'),
  data: z.object({ message: z.string() }).loose(),
});

// Emitted after each CAS write lands. `addedNodeIds` are the ids as they exist on
// the canvas (post ref-namespacing), so the Frontend can select/zoom them and the
// bench can assert on `.react-flow__node[data-id=...]`.
const composerGraphSchema = z.object({
  type: z.literal('composer.graph'),
  data: z
    .object({
      nodeCount: z.number().int().nonnegative(),
      edgeCount: z.number().int().nonnegative(),
      addedNodeIds: z.array(z.string()),
    })
    .loose(),
});

// Optimistic graph state emitted immediately after the same CAS write that feeds
// Realtime. The browser can paint this without waiting for the database changefeed;
// Realtime remains the durable reconciliation path.
const composerPatchSchema = z.object({
  type: z.literal('composer.patch'),
  data: z.object({ nodes: z.array(studioNodeSchema), edges: z.array(studioEdgeSchema) }).strict(),
});

const composerProposalSchema = z.object({
  type: z.literal('composer.proposal'),
  data: canvasGraphChangeSetSchema,
});

// A connection the canvas rules refused, or an op that could not apply. The build
// still lands — the agent is told what was dropped and may repair it next step.
const composerWarningSchema = z.object({
  type: z.literal('composer.warning'),
  data: z.object({ message: z.string() }).loose(),
});

export const aiStudioComposerFrameSchema = z.discriminatedUnion('type', [
  composerStartedSchema,
  composerStatusSchema,
  composerGraphSchema,
  composerPatchSchema,
  composerProposalSchema,
  composerWarningSchema,
  agentDelegatedFrameSchema,
  toolCallSchema,
  toolResultSchema,
  responseDoneSchema,
  responseErrorSchema,
]);

export type AiStudioComposerFrame = z.infer<typeof aiStudioComposerFrameSchema>;
export type AiStudioComposerFrameType = AiStudioComposerFrame['type'];
