import { z } from 'zod'

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
])

export const agentMentionReferenceSourceSchema = z.enum(['organic', 'jaina'])

export const agentMentionReferenceSchema = z.object({
  id: z.string().min(1),
  type: agentMentionReferenceTypeSchema,
  label: z.string().min(1),
  source: agentMentionReferenceSourceSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export const agentMentionMetadataSchema = z.object({
  references: z.array(agentMentionReferenceSchema).default([]),
})

export type AgentMentionReference = z.infer<typeof agentMentionReferenceSchema>
export type AgentMentionMetadata = z.infer<typeof agentMentionMetadataSchema>
