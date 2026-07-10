// Response envelopes for automation endpoints (Backend -> Frontend).

import { z } from 'zod';
import { automationSchema } from './automation';
import { automationRunSchema } from './run';

export const listAutomationsResponseSchema = z
  .object({
    automations: z.array(automationSchema),
  })
  .strict();
export type ListAutomationsResponse = z.infer<typeof listAutomationsResponseSchema>;

export const automationResponseSchema = z
  .object({
    automation: automationSchema,
  })
  .strict();
export type AutomationResponse = z.infer<typeof automationResponseSchema>;

export const listAutomationRunsResponseSchema = z
  .object({
    runs: z.array(automationRunSchema),
  })
  .strict();
export type ListAutomationRunsResponse = z.infer<typeof listAutomationRunsResponseSchema>;

export const automationRunResponseSchema = z
  .object({
    run: automationRunSchema,
  })
  .strict();
export type AutomationRunResponse = z.infer<typeof automationRunResponseSchema>;

// 202 body for POST /api/automations/:id/run-now.
export const runAutomationNowResponseSchema = z
  .object({
    runId: z.string().min(1),
  })
  .strict();
export type RunAutomationNowResponse = z.infer<typeof runAutomationNowResponseSchema>;

// Member picker feed for the recipients field: brand members the caller may
// subscribe to an automation's report.
export const recipientCandidateSchema = z
  .object({
    userId: z.string().min(1),
    email: z.string().min(1),
    role: z.string().min(1),
  })
  .strict();
export type RecipientCandidate = z.infer<typeof recipientCandidateSchema>;

export const listRecipientCandidatesResponseSchema = z
  .object({
    candidates: z.array(recipientCandidateSchema),
  })
  .strict();
export type ListRecipientCandidatesResponse = z.infer<typeof listRecipientCandidatesResponseSchema>;
