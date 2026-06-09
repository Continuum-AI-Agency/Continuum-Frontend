// Instagram "top media by username" request/response for AI Studio. The Backend
// resolves the account via Meta Graph business_discovery using the brand's
// connected Instagram account (or a global agency account) as the viewer, then
// returns the account's recent media as browsable posts. Media URLs are remote
// references (not re-hosted); a selected post's `items` map 1:1 to canvas
// reference nodes (structurally a UnfurlMediaItem).

import { z } from "zod";

export const instagramMediaKindSchema = z.enum(["image", "video"]);
export type InstagramMediaKind = z.infer<typeof instagramMediaKindSchema>;

// A "post" is a single image/video; "reel" is a video reel; "carousel" is a
// multi-slide album. Drives the type badge in the browser grid.
export const instagramPostKindSchema = z.enum(["post", "reel", "carousel"]);
export type InstagramPostKind = z.infer<typeof instagramPostKindSchema>;

export const instagramTopMediaRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    username: z.string().min(1).max(64),
    limit: z.number().int().min(1).max(50).default(50),
  })
  .strict();
export type InstagramTopMediaRequest = z.infer<typeof instagramTopMediaRequestSchema>;

export const instagramMediaItemSchema = z
  .object({
    kind: instagramMediaKindSchema,
    url: z.url(),
  })
  .strict();
export type InstagramMediaItem = z.infer<typeof instagramMediaItemSchema>;

export const instagramPostSchema = z
  .object({
    id: z.string(),
    shortcode: z.string(),
    permalink: z.url(),
    kind: instagramPostKindSchema,
    coverUrl: z.url().nullable(),
    mediaCount: z.number().int().positive(),
    items: z.array(instagramMediaItemSchema),
  })
  .strict();
export type InstagramPost = z.infer<typeof instagramPostSchema>;

export const instagramAccountSchema = z
  .object({
    username: z.string(),
    name: z.string().nullable(),
    followersCount: z.number().int().nonnegative().nullable(),
  })
  .strict();
export type InstagramAccount = z.infer<typeof instagramAccountSchema>;

export const instagramTopMediaResponseSchema = z
  .object({
    account: instagramAccountSchema,
    posts: z.array(instagramPostSchema),
  })
  .strict();
export type InstagramTopMediaResponse = z.infer<typeof instagramTopMediaResponseSchema>;
