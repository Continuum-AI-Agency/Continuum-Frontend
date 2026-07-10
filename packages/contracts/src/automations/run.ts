// Automation run shapes: one row per scheduled or manual execution, doubling
// as the email-delivery record. Frontend renders these in the run history;
// Backend worker and the send-automation-report edge function write them.

import { z } from 'zod';
import { automationRunStatusSchema } from './automation';

export const automationRunTriggerSchema = z.enum(['schedule', 'manual']);
export type AutomationRunTrigger = z.infer<typeof automationRunTriggerSchema>;

export const automationEmailStatusSchema = z.enum([
  'pending',
  'sending',
  'sent',
  'failed',
  'skipped',
]);
export type AutomationEmailStatus = z.infer<typeof automationEmailStatusSchema>;

// `text` is the agent's final report as markdown — the canonical render source
// for both the email and the in-app report body. A structured Jaina report
// payload can be added later as an additive optional field.
export const automationRunOutputSchema = z
  .object({
    text: z.string(),
  })
  .strict();
export type AutomationRunOutput = z.infer<typeof automationRunOutputSchema>;

export const automationRunSchema = z
  .object({
    runId: z.string().min(1),
    automationId: z.string().min(1),
    brandId: z.string().min(1),
    trigger: automationRunTriggerSchema,
    requestedBy: z.string().nullable().optional(),
    status: automationRunStatusSchema,
    scheduledFor: z.string(),
    attempts: z.number().int().min(0),
    output: automationRunOutputSchema.nullable().optional(),
    errorMessage: z.string().nullable().optional(),
    emailStatus: automationEmailStatusSchema,
    emailedAt: z.string().nullable().optional(),
    emailError: z.string().nullable().optional(),
    enqueuedAt: z.string(),
    startedAt: z.string().nullable().optional(),
    completedAt: z.string().nullable().optional(),
  })
  .strict();
export type AutomationRun = z.infer<typeof automationRunSchema>;
