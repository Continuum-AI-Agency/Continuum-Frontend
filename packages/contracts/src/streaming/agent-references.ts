import { z } from 'zod';

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

export const agentMentionMetadataSchema = z.object({
  references: z.array(agentMentionReferenceSchema).default([]),
  // Persisted on the user turn so a resumed transcript still renders what was attached to it.
  attachments: z.array(agentAttachmentSchema).optional(),
});

export type AgentAttachment = z.infer<typeof agentAttachmentSchema>;
export type AgentMentionReference = z.infer<typeof agentMentionReferenceSchema>;
export type AgentMentionMetadata = z.infer<typeof agentMentionMetadataSchema>;
