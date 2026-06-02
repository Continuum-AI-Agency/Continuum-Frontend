import { z } from "zod";

/**
 * Contract for the `link-hyperframe-mp4` edge function.
 *
 * A HyperFrames composition is authored as HTML; the Frontend renders it to an
 * MP4 client-side (mediabunny) on first view and POSTs the bytes here. The edge
 * function persists the MP4 to the `hyperframes-mp4` bucket and links it back to
 * the composition + draft, idempotently (one render per `compositionId`). That
 * MP4 becomes the durable, publishable video asset.
 */
export const linkHyperframeMp4RequestSchema = z
  .object({
    compositionId: z.string().min(1),
    brandId: z.string().min(1),
    /** Calendar draft to patch with the mp4 linkage; null for the chat/single path. */
    draftId: z.string().nullable(),
    /** The mediabunny-rendered MP4, base64-encoded. */
    mp4Base64: z.string().min(1),
    mimeType: z.literal("video/mp4"),
    durationSec: z.number().positive(),
  })
  .strict();

export const linkHyperframeMp4ResponseSchema = z
  .object({
    ok: z.literal(true),
    /** `ready` = freshly linked; `exists` = an earlier render already linked it. */
    status: z.enum(["ready", "exists"]),
    mp4Bucket: z.string(),
    mp4Path: z.string(),
    mp4Url: z.string().nullable(),
  })
  .strict();

export const linkHyperframeMp4ErrorSchema = z
  .object({
    ok: z.literal(false),
    /** `pending` = another render is in flight for this composition. */
    status: z.enum(["pending", "error"]),
    message: z.string(),
  })
  .strict();

export type LinkHyperframeMp4Request = z.infer<typeof linkHyperframeMp4RequestSchema>;
export type LinkHyperframeMp4Response = z.infer<typeof linkHyperframeMp4ResponseSchema>;
export type LinkHyperframeMp4Error = z.infer<typeof linkHyperframeMp4ErrorSchema>;
