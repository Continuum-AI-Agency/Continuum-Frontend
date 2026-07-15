// Request envelopes for brand-skill CRUD endpoints (Frontend -> Backend).

import { z } from 'zod';
import { skillKindSchema, skillStatusSchema, skillSurfaceSchema } from './skill';

export const createSkillRequestSchema = z
  .object({
    brandId: z.string().min(1),
    name: z.string().min(1).max(120),
    kind: skillKindSchema.default('creative_direction'),
    surface: skillSurfaceSchema.default('both'),
    description: z.string().max(500).nullable().optional(),
    directives: z.string().min(1).max(20000),
    tags: z.array(z.string().min(1)).max(20).optional(),
  })
  .strict();
export type CreateSkillRequest = z.infer<typeof createSkillRequestSchema>;

export const updateSkillRequestSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    kind: skillKindSchema.optional(),
    surface: skillSurfaceSchema.optional(),
    description: z.string().max(500).nullable().optional(),
    directives: z.string().min(1).max(20000).optional(),
    tags: z.array(z.string().min(1)).max(20).optional(),
    status: skillStatusSchema.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'at least one field is required',
  });
export type UpdateSkillRequest = z.infer<typeof updateSkillRequestSchema>;
