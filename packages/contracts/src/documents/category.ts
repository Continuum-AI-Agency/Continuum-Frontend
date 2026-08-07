// Semantic category for an uploaded brand document. Distinct from a document's
// file format (pdf/docx — that lives on `kind`): this is the document's PURPOSE,
// which drives how agents weight it (brand_guidelines = authoritative brand rules)
// and how the UI groups/filters the brand-docs library. Persisted on
// `brand_profiles.brand_documents.category` (default "misc").

import { z } from 'zod';

export const documentCategorySchema = z.enum([
  'brand_guidelines',
  // A design system is not just "authoritative brand rules" (brand_guidelines): it is
  // machine-readable, it round-trips, and it outranks the site scrape. Its own category
  // is what lets the documents surface route it to the deterministic parser instead of
  // the generic chunk-and-embed path, and what lets agents weight it above prose.
  'design_system',
  'creative_strategy',
  'audience_persona',
  'product_info',
  'campaign_deliverable',
  'misc',
]);
export type DocumentCategory = z.infer<typeof documentCategorySchema>;

export const DOCUMENT_CATEGORY_DEFAULT: DocumentCategory = 'misc';

export const DOCUMENT_CATEGORY_VALUES = documentCategorySchema.options;

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  brand_guidelines: 'Brand guidelines',
  design_system: 'Design system',
  creative_strategy: 'Creative strategy',
  audience_persona: 'Audience persona',
  product_info: 'Product info',
  campaign_deliverable: 'Campaign deliverable',
  misc: 'Misc',
};

// Coerces an unknown/legacy value to a valid category, falling back to the
// default. Use at boundaries where the stored value may predate this enum.
export function toDocumentCategory(value: unknown): DocumentCategory {
  const parsed = documentCategorySchema.safeParse(value);
  return parsed.success ? parsed.data : DOCUMENT_CATEGORY_DEFAULT;
}
