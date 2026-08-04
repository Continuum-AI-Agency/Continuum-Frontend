import { z } from 'zod';

import { documentCategorySchema, toDocumentCategory } from '../documents/category';
import { brandDnaSchema } from './brand-dna';
import { brandMdTokensSchema } from './brand-md';
import { brandReportResultSchema } from './brand-report';
import { readinessAnalysisSchema } from './readiness';

// Response envelope for the durable Brand Book read (the `get-brand-book` edge
// function, read by the Settings -> Brand Book viewer and the MCP brand_knowledge
// tool). The Brand Book is now a MATERIALIZED first-party data class: one row per
// brand in brand_profiles.brand_book, assembled by a compose worker from the
// three independently-queryable sources (onboarding, guidelines, documents) plus
// the optional brand-report/readiness layer. Canonical here so the producer (the
// backend assembler + edge function) and the consumer (the Frontend) share one
// shape. Wire DTOs stay loose (`.passthrough()` on parts built from unknown DB
// JSON); the Frontend narrows on read.
//
// `composite` is nullable now: the book no longer depends on a generated brand
// report, so a brand with only onboarding + guidelines still has a valid book.
// The back-compat top-level fields (composite/brand_md/brand_tokens/documents)
// are hydrated from `assembled.report` so older readers keep working.

export const brandBookStatusSchema = z.enum(['assembling', 'ready', 'error']);
export type BrandBookStatus = z.infer<typeof brandBookStatusSchema>;

export const brandBookDocumentSchema = z.object({
  id: z.string(),
  name: z.string(),
  // Tolerant at the boundary: a legacy/unknown stored category coerces to misc
  // rather than rejecting the whole Brand Book envelope.
  category: z.preprocess((v) => toDocumentCategory(v), documentCategorySchema),
  status: z.string(),
  created_at: z.string(),
  // Short text_excerpt lifted from the parent brand_documents row so the book
  // carries document substance, not just the file name.
  excerpt: z.string().nullable().default(null),
});
export type BrandBookDocument = z.infer<typeof brandBookDocumentSchema>;

// Onboarding intake, summarized. `summary` stays unknown — the compose worker
// copies the relevant slice of user_onboarding_states.state verbatim.
export const brandBookOnboardingSchema = z
  .object({
    present: z.boolean().default(false),
    completed: z.boolean().default(false),
    completed_at: z.string().nullable().default(null),
    summary: z.unknown().nullable().default(null),
  })
  .passthrough();
export type BrandBookOnboarding = z.infer<typeof brandBookOnboardingSchema>;

// Latest brand_guidelines row per purpose. Structured sections (colors, logo,
// typography, stationery, style_design, verbal_identity) pass through untyped —
// the backend copies the raw jsonb and the Frontend renders what it recognizes.
export const brandBookGuidelineSchema = z
  .object({
    purpose: z.string().nullable().default(null),
    status: z.string().nullable().default(null),
    version: z.number().nullable().default(null),
    notes: z.string().nullable().default(null),
  })
  .passthrough();
export type BrandBookGuideline = z.infer<typeof brandBookGuidelineSchema>;

// The optional brand-report/readiness analytical layer. Present only when the
// report pipeline has produced a composite; the book renders fine without it.
export const brandBookReportLayerSchema = z
  .object({
    composite: brandReportResultSchema.nullable().default(null),
    readiness: readinessAnalysisSchema.nullable().default(null),
    brand_md: z.string().nullable().default(null),
    brand_tokens: brandMdTokensSchema.nullable().default(null),
    brand_md_is_edited: z.boolean().default(false),
    // Lean DNA (positioning thesis + pillars) the compose worker copies from the
    // report pipeline. Typed here rather than leaking through .passthrough().
    dna: brandDnaSchema.nullable().default(null),
  })
  .passthrough();
export type BrandBookReportLayer = z.infer<typeof brandBookReportLayerSchema>;

// The assembled composite persisted in brand_book.assembled.
export const brandBookAssembledSchema = z
  .object({
    onboarding: brandBookOnboardingSchema.nullable().default(null),
    guidelines: z.array(brandBookGuidelineSchema).default([]),
    documents: z.array(brandBookDocumentSchema).default([]),
    report: brandBookReportLayerSchema.nullable().default(null),
  })
  .passthrough();
export type BrandBookAssembled = z.infer<typeof brandBookAssembledSchema>;

export const brandBookResponseSchema = z.object({
  brand_id: z.string(),
  // Materialization state. `present` is true only when status === 'ready'.
  status: brandBookStatusSchema.default('assembling'),
  present: z.boolean().default(false),
  refreshed_at: z.string().nullable().default(null),
  // True when a source changed after the last successful assemble (last-good
  // still served). Advisory — the viewer may show a "refreshing" hint.
  stale: z.boolean().default(false),
  assembled: brandBookAssembledSchema.nullable().default(null),
  // ---- back-compat (hydrated from assembled.report; all optional now) ----
  composite: brandReportResultSchema.nullable().default(null),
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
