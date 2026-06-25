// Foreplay-style "Swipe File": users save a competitor's ad (paid) or organic
// post into named boards to keep for later. A saved item REFERENCES the cached
// ad_snapshot when paid, and ALSO carries a denormalized point-in-time payload
// (caption, creative URL, CTA, metrics, age) so the save survives even if the
// source ad is later taken down — foreplay's "saved forever" promise.
//
// Wire-DTO discipline: `payload` is built from loosely-typed DB/Graph JSON on the
// Backend and the Frontend narrows on read, so its fields stay optional/nullable.

import { z } from "zod";
import { instagramPostSchema } from "../media/instagram";

export const savedItemKindSchema = z.enum(["paid", "organic"]);
export type SavedItemKind = z.infer<typeof savedItemKindSchema>;

// Denormalized display snapshot captured at save time. Both kinds share these
// fields; the renderer reads whatever is present. Kept loose by design.
export const savedItemPayloadSchema = z.object({
  title: z.string().nullable().optional(),
  caption: z.string().nullable().optional(),
  cta: z.string().nullable().optional(),
  mediaUrl: z.string().nullable().optional(),
  permalink: z.string().nullable().optional(),
  platforms: z.array(z.string()).optional(),
  status: z.string().nullable().optional(),
  observedActiveDays: z.number().nullable().optional(),
  deliveryStart: z.string().nullable().optional(),
  likeCount: z.number().nullable().optional(),
  commentsCount: z.number().nullable().optional(),
  hook: z.string().nullable().optional(),
  themes: z.array(z.string()).optional(),
});
export type SavedItemPayload = z.infer<typeof savedItemPayloadSchema>;

export const savedBoardSchema = z.object({
  id: z.string().uuid(),
  brandId: z.string().uuid(),
  name: z.string().min(1).max(120),
  description: z.string().nullable().optional(),
  coverItemId: z.string().uuid().nullable().optional(),
  itemCount: z.number().int().nonnegative().default(0),
  createdBy: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SavedBoard = z.infer<typeof savedBoardSchema>;

export const savedItemSchema = z.object({
  id: z.string().uuid(),
  boardId: z.string().uuid(),
  brandId: z.string().uuid(),
  competitorId: z.string().uuid().nullable().optional(),
  competitorName: z.string().nullable().optional(),
  kind: savedItemKindSchema,
  // Live link back to the durable snapshot (paid only). Null for organic, or once
  // the source snapshot is deleted — the denormalized `payload` still renders.
  adSnapshotId: z.string().uuid().nullable().optional(),
  sourceRef: z.string(),
  // Paid: the re-hosted creative bucket object exists, so the FE can sign a URL
  // via GET /media/:adSnapshotId/creative. Organic creatives are not re-hosted.
  hasCreativeMedia: z.boolean().default(false),
  payload: savedItemPayloadSchema,
  note: z.string().nullable().optional(),
  position: z.number().int().optional(),
  addedAt: z.string(),
});
export type SavedItem = z.infer<typeof savedItemSchema>;

// --- Request shapes (Fastify body validators, shared with the FE client) -----

export const createBoardRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).optional(),
  })
  .strict();
export type CreateBoardRequest = z.infer<typeof createBoardRequestSchema>;

export const patchBoardRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    coverItemId: z.string().uuid().nullable().optional(),
  })
  .strict();
export type PatchBoardRequest = z.infer<typeof patchBoardRequestSchema>;

export const savePaidItemRequestSchema = z
  .object({
    kind: z.literal("paid"),
    snapshotId: z.string().uuid(),
    note: z.string().trim().max(1000).optional(),
  })
  .strict();

export const saveOrganicItemRequestSchema = z
  .object({
    kind: z.literal("organic"),
    competitorId: z.string().uuid(),
    competitorName: z.string().min(1).max(120).optional(),
    instagramUsername: z.string().min(1).max(64).optional(),
    post: instagramPostSchema,
    note: z.string().trim().max(1000).optional(),
  })
  .strict();

export const saveItemRequestSchema = z.discriminatedUnion("kind", [
  savePaidItemRequestSchema,
  saveOrganicItemRequestSchema,
]);
export type SaveItemRequest = z.infer<typeof saveItemRequestSchema>;

export const savedBoardListSchema = z.object({ boards: z.array(savedBoardSchema) });
export const savedItemListSchema = z.object({ items: z.array(savedItemSchema) });
