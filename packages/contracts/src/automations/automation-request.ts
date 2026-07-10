// Request envelopes for automation CRUD endpoints (Frontend -> Backend).

import { z } from 'zod';
import {
  agentTargetSchema,
  automationRecipientsSchema,
  automationScheduleSchema,
} from './automation';

export const createAutomationRequestSchema = z
  .object({
    brandId: z.string().min(1),
    name: z.string().min(1).max(120),
    agent: agentTargetSchema,
    prompt: z.string().min(1).max(20000),
    schedule: automationScheduleSchema,
    recipients: automationRecipientsSchema,
    enabled: z.boolean().default(true),
  })
  .strict();
export type CreateAutomationRequest = z.infer<typeof createAutomationRequestSchema>;

export const updateAutomationRequestSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    prompt: z.string().min(1).max(20000).optional(),
    schedule: automationScheduleSchema.optional(),
    recipients: automationRecipientsSchema.optional(),
    enabled: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: 'at least one field is required',
  });
export type UpdateAutomationRequest = z.infer<typeof updateAutomationRequestSchema>;
