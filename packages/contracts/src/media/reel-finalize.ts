import { z } from "zod";

/**
 * Contract for the `link-reel-mp4` edge function.
 *
 * In the frontend-stitch reel flow the backend persists each Veo scene clip to
 * storage and streams the signed clip URLs (see `reel_clips_ready` in
 * `reel-video.ts`). The browser downloads those clips, stitches them into one
 * MP4 with mediabunny, and POSTs the bytes here. The edge function persists the
 * MP4 to the reel bucket and links it back onto the calendar draft, idempotently
 * per draft. That MP4 becomes the durable, publishable reel asset.
 *
 * Mirrors `hyperframe-mp4.ts`; a reel always belongs to a draft, so `draftId` is
 * required (unlike the hyperframe chat path).
 */
export const linkReelMp4RequestSchema = z
  .object({
    brandId: z.string().min(1),
    draftId: z.string().min(1),
    /** The mediabunny-stitched MP4, base64-encoded. */
    mp4Base64: z.string().min(1),
    mimeType: z.literal("video/mp4"),
    durationSec: z.number().positive(),
  })
  .strict();

export const linkReelMp4ResponseSchema = z
  .object({
    ok: z.literal(true),
    /** `ready` = freshly linked; `exists` = an earlier render already linked it. */
    status: z.enum(["ready", "exists"]),
    bucket: z.string(),
    path: z.string(),
    signedUrl: z.string().nullable(),
  })
  .strict();

export const linkReelMp4ErrorSchema = z
  .object({
    ok: z.literal(false),
    /** `pending` = another render is in flight for this draft. */
    status: z.enum(["pending", "error"]),
    message: z.string(),
  })
  .strict();

export type LinkReelMp4Request = z.infer<typeof linkReelMp4RequestSchema>;
export type LinkReelMp4Response = z.infer<typeof linkReelMp4ResponseSchema>;
export type LinkReelMp4Error = z.infer<typeof linkReelMp4ErrorSchema>;
