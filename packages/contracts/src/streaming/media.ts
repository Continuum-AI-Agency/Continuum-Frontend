// Media-library stream frame + Organic agent tool I/O. The agent surfaces library
// matches to the user via the media.search_results frame; the Frontend organic
// stream parser renders them as an inline picker. Tool I/O schemas are imported
// by the Backend FunctionTool definitions and the Frontend picker.

import { z } from "zod";
import { mediaSearchResultItemSchema, mediaSearchModeSchema } from "../media/search";

export const mediaSearchResultsFrameSchema = z.object({
  type: z.literal("media.search_results"),
  data: z
    .object({
      query: z.string().nullable().optional(),
      mode: mediaSearchModeSchema,
      items: z.array(mediaSearchResultItemSchema),
    })
    .loose(),
});
export type MediaSearchResultsFrame = z.infer<typeof mediaSearchResultsFrameSchema>;

export const searchMediaLibraryInputSchema = z
  .object({
    query: z.string().min(1).describe("Natural-language description of the media to find"),
    tags: z.array(z.string().min(1)).optional().describe("Optional tags to narrow results"),
    kind: z.enum(["image", "video"]).optional(),
    limit: z.number().int().min(1).max(20).default(8),
  })
  .strict();
export type SearchMediaLibraryInput = z.infer<typeof searchMediaLibraryInputSchema>;

export const searchMediaLibraryResultItemSchema = z
  .object({
    assetId: z.string().min(1),
    title: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    tags: z.array(z.string()).default([]),
    signedUrl: z.string().nullable().optional(),
    similarity: z.number().min(0).max(1),
  })
  .strict();
export type SearchMediaLibraryResultItem = z.infer<typeof searchMediaLibraryResultItemSchema>;

export const searchMediaLibraryOutputSchema = z
  .object({
    items: z.array(searchMediaLibraryResultItemSchema),
  })
  .strict();
export type SearchMediaLibraryOutput = z.infer<typeof searchMediaLibraryOutputSchema>;

export const ingestMediaRoleSchema = z.enum(["image_bg", "image_overlay", "video", "reference"]);
export type IngestMediaRole = z.infer<typeof ingestMediaRoleSchema>;

export const ingestMediaInputSchema = z
  .object({
    assetId: z.string().min(1).describe("ID of the library asset to attach"),
    draftId: z.string().min(1).optional().describe("Draft to attach the asset to"),
    role: ingestMediaRoleSchema.default("reference"),
  })
  .strict();
export type IngestMediaInput = z.infer<typeof ingestMediaInputSchema>;

export const ingestMediaOutputSchema = z
  .object({
    ok: z.boolean(),
    assetId: z.string().min(1),
    role: ingestMediaRoleSchema,
    signedUrl: z.string().nullable().optional(),
  })
  .strict();
export type IngestMediaOutput = z.infer<typeof ingestMediaOutputSchema>;
