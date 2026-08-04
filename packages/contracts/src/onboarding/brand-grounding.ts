import { z } from 'zod';
import { brandBookDocumentSchema } from './brand-book';
import { brandGuidelinesSchema } from './brand-guidelines';
import { brandMdTokensSchema } from './brand-md';
import { readinessSummarySchema } from './readiness-summary';

// The single grounding CONTRACT every generator consumes. Onboarding produces
// several grounding artifacts (Firecrawl scrape -> brand report -> readiness ->
// uploaded documents -> brand guidelines) and today each generator re-derives
// grounding from a different raw/legacy source. This module names the clean,
// well-separated PIECES and the shape of a semantic-retrieval hit so the backend
// accessor (App/organic/data/brandGrounding.ts) can expose one typed surface.
//
// The materialized brand_book stays a human/agent-facing read-model; generation
// reads these pieces (composed on-read over the canonical source tables that own
// the HNSW indexes) instead.

// One ranked retrieval result from a within-brand semantic search. `ref` is the
// source-row identifier callers cite (document_id, guideline tag id, or brand
// report embedding id) so a generation can attribute what it grounded on.
export const groundingHitSourceSchema = z.enum(['guideline', 'document', 'brand_report']);
export type GroundingHitSource = z.infer<typeof groundingHitSourceSchema>;

export const groundingHitSchema = z.object({
  source: groundingHitSourceSchema,
  // Short human-readable snippet (tag "label. description", chunk content, or
  // report phase embedding_text) — kept lean so prompt assembly stays bounded.
  snippet: z.string(),
  // Cosine similarity [0, 1] from the match RPC. Nullable for sources that do
  // not carry a score.
  similarity: z.number().nullable().default(null),
  // Source-row id for citation; nullable when the source row has no stable id.
  ref: z.string().nullable().default(null),
  // Optional structural label (guideline section, document category) so callers
  // can group hits without a second lookup.
  label: z.string().nullable().default(null),
});
export type GroundingHit = z.infer<typeof groundingHitSchema>;

// The static grounding pieces for a brand, composed on-read. `readiness` is a
// summary projection (always present — deriveReadinessSummary(null) is a valid
// "not_started" summary), the others are nullable/empty when the brand has not
// produced that artifact yet. `hits` is filled only by retrieveBrandGrounding
// (query-time); getBrandGrounding leaves it [].
export const brandGroundingBundleSchema = z.object({
  tokens: brandMdTokensSchema.nullable().default(null),
  guidelines: brandGuidelinesSchema.nullable().default(null),
  readiness: readinessSummarySchema,
  documents: z.array(brandBookDocumentSchema).default([]),
  hits: z.array(groundingHitSchema).default([]),
});
export type BrandGroundingBundle = z.infer<typeof brandGroundingBundleSchema>;
