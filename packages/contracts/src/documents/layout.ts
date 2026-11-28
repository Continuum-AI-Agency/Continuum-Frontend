// A document's layout: the regions a parse found on its pages, each with where it sits, what
// kind of thing it is, and the fields read out of it. Produced on demand by the Backend
// (`POST /brand-knowledge/documents/layout`) and drawn by the Frontend's DocumentInspector,
// in Knowledge and in Jaina. Boxes are fractions of the page (0–1, origin top-left), so they
// hold at any zoom and for any renderer.

import { z } from 'zod';

export const DOCUMENT_REGION_CATEGORIES = [
  'party',
  'identifiers',
  'table',
  'amount',
  'annotation',
  'heading',
  'text',
  'figure',
  'other',
] as const;
export const documentRegionCategorySchema = z.enum(DOCUMENT_REGION_CATEGORIES);
export type DocumentRegionCategory = z.infer<typeof documentRegionCategorySchema>;

const fraction = z.number().min(0).max(1);

export const documentBoxSchema = z
  .object({ page: z.number().int().min(1), x: fraction, y: fraction, w: fraction, h: fraction })
  .strict();
export type DocumentBox = z.infer<typeof documentBoxSchema>;

export const documentFieldSchema = z
  .object({
    name: z.string().min(1),
    value: z.string(),
    /** The value appears word for word in the region's text: checked, not claimed. */
    verified: z.boolean(),
  })
  .strict();
export type DocumentField = z.infer<typeof documentFieldSchema>;

export const documentTableSchema = z
  .object({ columns: z.array(z.string()), rows: z.array(z.array(z.string())) })
  .strict();
export type DocumentTable = z.infer<typeof documentTableSchema>;

export const documentRegionSchema = z
  .object({
    id: z.string().min(1),
    category: documentRegionCategorySchema,
    /** snake_case label, e.g. `invoice_details`. */
    name: z.string().min(1),
    /** One line for the collapsed row. */
    preview: z.string(),
    box: documentBoxSchema,
    /** The model's own 0–1 estimate. Shown as such, never as a measured accuracy. */
    confidence: fraction,
    /** The region's text as read, which is what citations match against. */
    text: z.string(),
    fields: z.array(documentFieldSchema),
    table: documentTableSchema.nullable(),
  })
  .strict();
export type DocumentRegion = z.infer<typeof documentRegionSchema>;

export const documentLayoutSchema = z
  .object({
    documentId: z.string().min(1),
    pageCount: z.number().int().min(1),
    regions: z.array(documentRegionSchema),
    model: z.string(),
    parsedAt: z.string(),
    durationMs: z.number().int().min(0),
  })
  .strict();
export type DocumentLayout = z.infer<typeof documentLayoutSchema>;

/** Only what the parser can see as pages: a PDF or an image. */
export const DOCUMENT_LAYOUT_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;

export const isDocumentLayoutMimeType = (mimeType: string | null | undefined): boolean =>
  (DOCUMENT_LAYOUT_MIME_TYPES as readonly string[]).includes(mimeType ?? '');

export const documentLayoutRequestSchema = z
  .object({
    brand_id: z.string().min(1),
    document_id: z.string().min(1),
    /** Parse again even when a layout is stored. */
    refresh: z.boolean().optional(),
    /** The chat session that owns a one-off upload; required to inspect an ephemeral document. */
    scope_key: z.string().min(1).optional(),
  })
  .strict();
export type DocumentLayoutRequest = z.infer<typeof documentLayoutRequestSchema>;

export const documentLayoutResponseSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('parsed'),
      layout: documentLayoutSchema,
      /** Short-lived URL of the original file, for drawing its pages. */
      fileUrl: z.string(),
      mimeType: z.string(),
      cached: z.boolean(),
    })
    .strict(),
  z.object({ status: z.literal('unsupported'), mimeType: z.string() }).strict(),
]);
export type DocumentLayoutResponse = z.infer<typeof documentLayoutResponseSchema>;

const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * The region a quoted passage came from: the one whose text shares the most words with it.
 * A citation carries text, not coordinates, because chunks are cut from the flattened text;
 * this puts it back on the page. null when nothing shares enough to be honest about it.
 */
export function regionForPassage(
  regions: readonly DocumentRegion[],
  passage: string,
): DocumentRegion | null {
  const words = new Set(
    normalize(passage)
      .split(' ')
      .filter((word) => word.length > 2),
  );
  if (words.size === 0) return null;
  let best: { region: DocumentRegion; score: number } | null = null;
  for (const region of regions) {
    const regionWords = new Set(normalize(region.text).split(' '));
    let shared = 0;
    for (const word of words) if (regionWords.has(word)) shared += 1;
    const score = shared / Math.min(words.size, Math.max(regionWords.size, 1));
    if (!best || score > best.score) best = { region, score };
  }
  return best && best.score >= 0.4 ? best.region : null;
}
