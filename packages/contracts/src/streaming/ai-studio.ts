// Shared wire shapes for AI Studio canvas media. Signed URLs are the source of
// truth across the FE<->BE boundary; base64 is an emergency-only fallback.
//
// - Request side: a reference image carries a signed `image_url`; `data` (base64)
//   is only sent when the canvas could not upload the source (upload/sign failed)
//   or for legacy un-persisted media. The Backend resolves the URL to base64
//   in-process before calling Vertex/Gemini/FAL.
// - Response side: a generation result carries `signed_url` + `bucket` + `path`;
//   `base64`/`data_url` are present only when the Backend's upload/sign failed and
//   it fell back to inlining the bytes so the generation is not lost.

import { z } from "zod";
import {
  responseDoneSchema,
  responseErrorSchema,
  toolCallSchema,
  toolResultSchema,
} from './agentFrames';

const REFERENCE_SOURCE_MESSAGE = "reference image requires base64 data or image_url";

// One reference image input. At least one of { data, image_url, url, or
// storage_bucket+storage_path } must be present. `url` is accepted as an alias
// for `image_url`. `storage_bucket`+`storage_path` let the Backend download the
// bytes via the service-role storage client instead of an unauthenticated fetch
// of a signed URL (which expires and is not always publicly reachable) — this is
// how a generated canvas image round-trips back as a reference.
export const aiStudioReferenceImageSchema = z
  .object({
    data: z.string().min(10, "reference image data must be base64").optional(),
    image_url: z.string().min(1).optional(),
    url: z.string().min(1).optional(),
    storage_bucket: z.string().min(1).optional(),
    storage_path: z.string().min(1).optional(),
    mime_type: z.string().default("image/png"),
    filename: z.string().optional(),
  })
  .superRefine((image, ctx) => {
    const hasStorageCoords = Boolean(image.storage_bucket && image.storage_path);
    if (!(image.data ?? image.image_url ?? image.url) && !hasStorageCoords) {
      ctx.addIssue({
        code: "custom",
        path: ["data"],
        message: REFERENCE_SOURCE_MESSAGE,
      });
    }
  });
export type AiStudioReferenceImage = z.infer<typeof aiStudioReferenceImageSchema>;

// Generation result for an image. `signed_url` + `bucket` + `path` are the
// durable, authoritative outputs; `base64`/`data_url` are fallback only.
export const aiStudioImageResultEventSchema = z.object({
  mime_type: z.string(),
  signed_url: z.string().optional(),
  bucket: z.string().optional(),
  path: z.string().optional(),
  resolution: z.string().optional(),
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
  bytes: z.number().optional(),
  base64: z.string().optional(),
});
export type AiStudioVideoResultEvent = z.infer<typeof aiStudioVideoResultEventSchema>;

const composerStartedSchema = z.object({
  type: z.literal('composer.started'),
  data: z.object({ roomId: z.string().min(1) }).loose(),
});

const composerStatusSchema = z.object({
  type: z.literal('composer.status'),
  data: z.object({ message: z.string() }).loose(),
});

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

const composerWarningSchema = z.object({
  type: z.literal('composer.warning'),
  data: z.object({ message: z.string() }).loose(),
});

export const aiStudioComposerFrameSchema = z.discriminatedUnion('type', [
  composerStartedSchema,
  composerStatusSchema,
  composerGraphSchema,
  composerWarningSchema,
  toolCallSchema,
  toolResultSchema,
  responseDoneSchema,
  responseErrorSchema,
]);

export type AiStudioComposerFrame = z.infer<typeof aiStudioComposerFrameSchema>;
export type AiStudioComposerFrameType = AiStudioComposerFrame['type'];
