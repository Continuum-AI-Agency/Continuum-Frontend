// Request envelopes for brand-prompt CRUD endpoints (Frontend -> Backend).

import { z } from 'zod';
import { promptStatusSchema } from './prompt';

export const createPromptRequestSchema = z
  .object({
    brandId: z.string().min(1),
    name: z.string().min(1).max(120),
    description: z.string().max(500).nullable().optional(),
    body: z.string().min(1).max(20000),
    category: z.string().min(1).max(80).optional(),
    tags: z.array(z.string().min(1)).max(20).optional(),
  })
  .strict();
export type CreatePromptRequest = z.infer<typeof createPromptRequestSchema>;

export const updatePromptRequestSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(500).nullable().optional(),
    body: z.string().min(1).max(20000).optional(),
    category: z.string().min(1).max(80).optional(),
    tags: z.array(z.string().min(1)).max(20).optional(),
    status: promptStatusSchema.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'at least one field is required',
  });
export type UpdatePromptRequest = z.infer<typeof updatePromptRequestSchema>;
