import { z } from 'zod';
import { shaderStackV1Schema } from '../ai-studio/shader-stack';
import { templateAuthoringArtifactSchema } from '../media/template-authoring';
import { hyperframesAepMapSchema } from './scene';

/** Stage a source revision privately against the existing template/version lineage. */
export const hyperframesAepAuthoringRequestSchema = z.object({
  brandId: z.uuid(),
  assetId: z.uuid(),
  baseVersionId: z.uuid(),
  expectedDraftRevision: z.number().int().positive(),
  shaderStack: shaderStackV1Schema.nullable().optional(),
}).strict();
export type HyperframesAepAuthoringRequest = z.infer<typeof hyperframesAepAuthoringRequestSchema>;
export const hyperframesAepAuthoringResponseSchema = z.object({
  artifact: templateAuthoringArtifactSchema,
  map: hyperframesAepMapSchema,
}).strict();
export type HyperframesAepAuthoringResponse = z.infer<typeof hyperframesAepAuthoringResponseSchema>;
