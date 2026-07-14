// Response envelopes for brand-prompt endpoints (Backend -> Frontend).

import { z } from 'zod';
import { promptSchema } from './prompt';

export const listPromptsResponseSchema = z
  .object({
    prompts: z.array(promptSchema),
  })
  .strict();
export type ListPromptsResponse = z.infer<typeof listPromptsResponseSchema>;

export const promptResponseSchema = z
  .object({
    prompt: promptSchema,
  })
  .strict();
export type PromptResponse = z.infer<typeof promptResponseSchema>;
