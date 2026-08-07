import { z } from 'zod';
import { documentRetentionSchema } from '../documents/retention';

export const agentMentionReferenceTypeSchema = z.enum([
  'trend',
  'event',
  'question',
  'draft',
  'campaign',
  'adset',
  'media_asset',
  'canvas_node',
  'link',
  'skill',
  'document',
  // Dashboard performance grabs (organic metrics / What's Working / insight digests).
  // User-selected so the agent is grounded on a specific measured insight, not only
  // the auto static digests.
  'creative_insight',
  'organic_insight',
  'kpi',
]);

export const agentMentionReferenceSourceSchema = z.enum(['organic', 'jaina', 'canvas']);

export const agentMentionReferenceSchema = z.object({
  id: z.string().min(1),
  type: agentMentionReferenceTypeSchema,
  label: z.string().min(1),
  source: agentMentionReferenceSourceSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// A file the user attached to the composer. Already uploaded and signed by the Frontend before the
// turn is sent; `storagePath` outlives the signed URL so an expired link can be re-minted.
export const agentAttachmentSchema = z.object({
  // Present for every new in-app upload. Optional keeps historical URL-only
  // transcript rows readable while callers migrate to durable Library identity.
  assetId: z.string().min(1).optional(),
  versionId: z.string().min(1).optional(),
  url: z.string().min(1),
  name: z.string().optional(),
  mediaType: z.string().optional(),
  storagePath: z.string().optional(),
});

// A DOCUMENT attached to the composer. Deliberately NOT folded into
// agentAttachmentSchema: that shape requires `url` and means "pixels the model can
// see", and widening it is exactly what produced the silent-drop bug where a PDF
// reached the model as nothing (organic mediaContext drops non-image/*) or as a bare
// warning (Jaina agentMediaContext).
//
// A document instead travels as an identity the Backend resolves server-side, pulling
// its chunks through getDocumentChunks — the same path an @-mention already uses. That
// keeps the text out of every request body and makes the document reachable on later
// turns too, not just the one it was attached to.
export const agentDocumentAttachmentSchema = z.object({
  documentId: z.string().min(1),
  name: z.string().optional(),
  mediaType: z.string().optional(),
  storagePath: z.string().optional(),
  // Present when the upload is a one-off scoped to this conversation. The Frontend
  // shows the countdown from it; the Backend never trusts it for access decisions,
  // which are made against the stored row.
  retention: documentRetentionSchema.optional(),
  expiresAt: z.string().optional(),
});

export const agentMentionMetadataSchema = z.object({
  references: z.array(agentMentionReferenceSchema).default([]),
  // Persisted on the user turn so a resumed transcript still renders what was attached to it.
  attachments: z.array(agentAttachmentSchema).optional(),
  documents: z.array(agentDocumentAttachmentSchema).optional(),
});

export type AgentAttachment = z.infer<typeof agentAttachmentSchema>;
export type AgentDocumentAttachment = z.infer<typeof agentDocumentAttachmentSchema>;
export type AgentMentionReference = z.infer<typeof agentMentionReferenceSchema>;
export type AgentMentionMetadata = z.infer<typeof agentMentionMetadataSchema>;
