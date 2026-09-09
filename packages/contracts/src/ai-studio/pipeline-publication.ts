import { z } from 'zod';
import { pipelineAgentGuideSchema, pipelineCapabilityV2Schema } from './pipeline-manifest';
import { canvasPipelineMetadataSchema } from './workflow-fragment';
import { studioEdgeSchema, studioNodeSchema } from './workflow-graph';

/** The public facts an author sends for both guide drafting and final publication. */
export const pipelinePublicationCandidateSchema = z
  .object({
    brand_profile_id: z.string().uuid(),
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(1_000).optional(),
    nodes: z.array(studioNodeSchema),
    edges: z.array(studioEdgeSchema),
    source_room_id: z.string().min(1).max(200).optional(),
    pipeline: canvasPipelineMetadataSchema,
  })
  .strict();
export type PipelinePublicationCandidate = z.infer<typeof pipelinePublicationCandidateSchema>;

export const pipelineAgentGuideDraftResponseSchema = z
  .object({
    description: z.string().min(1).max(1_000),
    agent_guide: pipelineAgentGuideSchema,
  })
  .strict();
export type PipelineAgentGuideDraftResponse = z.infer<
  typeof pipelineAgentGuideDraftResponseSchema
>;

export const pipelinePublicationRequestSchema = pipelinePublicationCandidateSchema.extend({
  description: z.string().trim().min(1).max(1_000),
  agent_guide: pipelineAgentGuideSchema,
});
export type PipelinePublicationRequest = z.infer<typeof pipelinePublicationRequestSchema>;

export const pipelinePublicationResponseSchema = z
  .object({ capability: pipelineCapabilityV2Schema })
  .strict();
export type PipelinePublicationResponse = z.infer<typeof pipelinePublicationResponseSchema>;

export const PIPELINE_GUIDE_DRAFT_ROUTE = '/api/ai-studio/pipeline-publications/guide';
export const PIPELINE_PUBLICATIONS_ROUTE = '/api/ai-studio/pipeline-publications';
