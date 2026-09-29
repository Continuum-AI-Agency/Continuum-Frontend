import { z } from 'zod';
import { apiRenderInputValueSchema } from './api-renders';

export const API_RENDER_MOTION_PROOFS_ROUTE = '/api/ai-studio/renders/motion-proofs';
export const API_RENDER_MOTION_PROOF_FORMATS_ROUTE = `${API_RENDER_MOTION_PROOFS_ROUTE}/formats`;

export const forgeMotionProofFormatsSchema = z.array(z.object({
  id: z.string().min(1), label: z.string().min(1), ratio: z.string().nullable(),
  comp: z.object({ name: z.string(), width: z.number().positive(), height: z.number().positive() }).strict(),
  mediaType: z.literal('video/mp4'),
}).strict());
export type ForgeMotionProofFormat = z.infer<typeof forgeMotionProofFormatsSchema>[number];

export const forgeMotionProofRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    bindingId: z.string().uuid().nullable(),
    templateKey: z.string().min(1),
    contractHash: z.string().min(1),
    templateRef: z.string().min(1).optional(),
    outputId: z.string().min(1),
    comp: z.string().min(1),
    values: z.record(z.string(), apiRenderInputValueSchema),
  })
  .strict();
export type ForgeMotionProofRequest = z.infer<typeof forgeMotionProofRequestSchema>;

export const forgeMotionProofSchema = z
  .object({
    id: z.string().uuid(),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    templateSourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
    templateCommitSha: z.string().nullable(),
    outputId: z.string(),
    comp: z.string(),
    state: z.enum(['queued', 'rendering', 'encoding', 'uploading', 'ready', 'failed']),
    progressPct: z.number().int().min(0).max(100).nullable(),
    signedUrl: z.string().url().nullable(),
    durationSec: z.number().positive().nullable(),
    frameRate: z.number().positive().nullable(),
    hasAudio: z.boolean().nullable(),
    error: z.string().nullable(),
  })
  .strict();
export type ForgeMotionProof = z.infer<typeof forgeMotionProofSchema>;
