import { z } from 'zod';

import { brandBookPieceKindSchema } from './brand-enforcement';

// The request a Studio Canvas text box sends when the user hits "Enrich Prompt".
// Enrichment is grounded by the SAME data piece a generation node carries:
// `skillIds` (creative-direction skills) + `brandBookPieces` (authoritative brand
// rules). The text box inherits these from the generation node it feeds, so the
// enriched prompt reflects exactly what will actually generate. Both the Frontend
// (buildEnrichPayload) and the Backend (promptEnrichmentSchema) speak this shape.

const enrichImageContextSchema = z.object({
  type: z.enum(['base64', 'url']),
  data: z.string().optional(),
  imageUrl: z.string().optional(),
  mimeType: z.string(),
  sourcePath: z.string().optional(),
  sourceUrl: z.string().optional(),
});

const enrichAudioContextSchema = z.object({
  type: z.literal('base64'),
  data: z.string(),
  mimeType: z.string(),
});

const enrichVideoContextSchema = z.object({
  type: z.enum(['base64', 'url']),
  data: z.string().optional(),
  imageUrl: z.string().optional(),
  mimeType: z.string(),
  sourcePath: z.string().optional(),
  sourceUrl: z.string().optional(),
});

const enrichDocumentContextSchema = z.object({
  name: z.string(),
  type: z.enum(['pdf', 'txt']).default('txt'),
  extractedText: z.string().optional(),
  sourceUrl: z.string().optional(),
  sourceDocumentId: z.string().optional(),
  content: z.string().optional(),
});

export const enrichPromptContextSchema = z.object({
  images: z.array(enrichImageContextSchema).optional(),
  audio: enrichAudioContextSchema.optional(),
  video: enrichVideoContextSchema.optional(),
  documents: z.array(enrichDocumentContextSchema).optional(),
});
export type EnrichPromptContext = z.infer<typeof enrichPromptContextSchema>;

export const enrichPromptRequestSchema = z.object({
  prompt: z.string().default(''),
  brandId: z.string().min(1, 'brandId is required'),
  context: enrichPromptContextSchema.optional(),
  // Grounding data piece — inherited from the downstream generation node.
  skillIds: z.array(z.string().min(1)).max(20).optional(),
  brandBookPieces: z.array(brandBookPieceKindSchema).max(8).optional(),
});
export type EnrichPromptRequest = z.infer<typeof enrichPromptRequestSchema>;
