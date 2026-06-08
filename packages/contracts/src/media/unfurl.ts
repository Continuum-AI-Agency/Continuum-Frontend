// Link-unfurl request/response envelope for AI Studio. The Backend fetches a
// user-pasted URL server-side, extracts Open Graph / Twitter-card media, and
// returns typed items the Frontend turns into unattached canvas reference nodes.
// Media URLs are returned as-is (remote references), not re-hosted.

import { z } from "zod";

export const unfurlMediaRequestSchema = z
  .object({
    url: z.url().max(2048),
  })
  .strict();
export type UnfurlMediaRequest = z.infer<typeof unfurlMediaRequestSchema>;

export const unfurlMediaKindSchema = z.enum(["image", "video"]);
export type UnfurlMediaKind = z.infer<typeof unfurlMediaKindSchema>;

export const unfurlMediaItemSchema = z
  .object({
    kind: unfurlMediaKindSchema,
    url: z.url(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    alt: z.string().optional(),
  })
  .strict();
export type UnfurlMediaItem = z.infer<typeof unfurlMediaItemSchema>;

export const unfurlSourceSchema = z
  .object({
    requestedUrl: z.string(),
    resolvedUrl: z.string().optional(),
    title: z.string().optional(),
    ogType: z.string().optional(),
    via: z.enum(["direct", "firecrawl"]),
    provider: z.string().optional(),
  })
  .strict();
export type UnfurlSource = z.infer<typeof unfurlSourceSchema>;

export const unfurlMediaResponseSchema = z
  .object({
    source: unfurlSourceSchema,
    items: z.array(unfurlMediaItemSchema),
    // True when the page looks like a multi-image post (e.g. a carousel/document)
    // but only a single image surfaced — the Frontend surfaces `notice` to the user.
    partial: z.boolean(),
    notice: z.string().optional(),
  })
  .strict();
export type UnfurlMediaResponse = z.infer<typeof unfurlMediaResponseSchema>;
