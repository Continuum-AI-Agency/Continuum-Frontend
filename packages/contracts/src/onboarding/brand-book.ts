import { z } from "zod";

import { documentCategorySchema, toDocumentCategory } from "../documents/category";
import { brandReportResultSchema } from "./brand-report";
import { brandMdTokensSchema } from "./brand-md";

// Response envelope for the durable Brand Book read (the `get-brand-book` edge
// function, read by the Settings → Brand Book viewer). One DB-adjacent pull:
// the canonical composite (with readiness reconstructed from its side table),
// the rendered markdown, and the brand's tagged documents. Canonical here so the
// edge function (produce) and the Frontend (consume) share one shape.

export const brandBookDocumentSchema = z.object({
  id: z.string(),
  name: z.string(),
  // Tolerant at the boundary: a legacy/unknown stored category coerces to misc
  // rather than rejecting the whole Brand Book envelope.
  category: z.preprocess((v) => toDocumentCategory(v), documentCategorySchema),
  status: z.string(),
  created_at: z.string(),
});
export type BrandBookDocument = z.infer<typeof brandBookDocumentSchema>;

export const brandBookResponseSchema = z.object({
  brand_id: z.string(),
  composite: brandReportResultSchema,
  summary_markdown: z.string().nullable().default(null),
  // The EFFECTIVE brand.md (brand_md_edited ?? brand_md): YAML token front matter
  // + tiered body. `brand_tokens` is its parsed primitive (what grounding reads);
  // `brand_md_is_edited` lets the viewer show an "Edited" badge / revert affordance.
  brand_md: z.string().nullable().default(null),
  brand_tokens: brandMdTokensSchema.nullable().default(null),
  brand_md_is_edited: z.boolean().default(false),
  documents: z.array(brandBookDocumentSchema).default([]),
});
export type BrandBookResponse = z.infer<typeof brandBookResponseSchema>;

// Result of a brand.md save/reset (the sticky-edit write path). Returns the new
// effective doc + parsed tokens so the editor can update without a full refetch.
export const brandMdSaveResultSchema = z.object({
  brand_md: z.string().nullable().default(null),
  brand_md_is_edited: z.boolean().default(false),
  brand_tokens: brandMdTokensSchema.nullable().default(null),
});
export type BrandMdSaveResult = z.infer<typeof brandMdSaveResultSchema>;
