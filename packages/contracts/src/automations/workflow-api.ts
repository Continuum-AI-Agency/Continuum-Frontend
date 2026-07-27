import { z } from 'zod';
import { automationRunSchema } from './run';
import {
  automationActionReceiptSchema,
  automationDeterministicCheckSchema,
  automationEvidenceEventSchema,
  automationNodeRunSchema,
  automationWorkflowDefinitionSchema,
  automationWorkflowValidationSchema,
  automationWorkflowVersionSchema,
} from './workflow';

export const createWorkflowAutomationRequestSchema = z
  .object({
    brandId: z.string().min(1),
    name: z.string().min(1).max(120),
    definition: automationWorkflowDefinitionSchema,
  })
  .strict();
export type CreateWorkflowAutomationRequest = z.infer<typeof createWorkflowAutomationRequestSchema>;

export const saveAutomationDraftRequestSchema = z
  .object({
    definition: automationWorkflowDefinitionSchema,
    expectedRevision: z.number().int().min(0),
  })
  .strict();
export type SaveAutomationDraftRequest = z.infer<typeof saveAutomationDraftRequestSchema>;

export const validateAutomationWorkflowRequestSchema = z
  .object({
    definition: automationWorkflowDefinitionSchema,
  })
  .strict();
export type ValidateAutomationWorkflowRequest = z.infer<
  typeof validateAutomationWorkflowRequestSchema
>;

export const automationWorkflowResponseSchema = z
  .object({
    version: automationWorkflowVersionSchema,
    validation: automationWorkflowValidationSchema,
  })
  .strict();
export type AutomationWorkflowResponse = z.infer<typeof automationWorkflowResponseSchema>;

export const publishAutomationWorkflowResponseSchema = z
  .object({
    version: automationWorkflowVersionSchema,
    validation: automationWorkflowValidationSchema,
    actionNodeIds: z.array(z.string()),
  })
  .strict();
export type PublishAutomationWorkflowResponse = z.infer<
  typeof publishAutomationWorkflowResponseSchema
>;

export const listAutomationTemplatesResponseSchema = z
  .object({
    templates: z.array(
      z
        .object({
          id: z.string(),
          name: z.string(),
          description: z.string(),
          definition: automationWorkflowDefinitionSchema,
        })
        .strict(),
    ),
  })
  .strict();
export type ListAutomationTemplatesResponse = z.infer<typeof listAutomationTemplatesResponseSchema>;

export const automationRunDetailResponseSchema = z
  .object({
    run: automationRunSchema,
    nodeRuns: z.array(automationNodeRunSchema),
  })
  .strict();
export type AutomationRunDetailResponse = z.infer<typeof automationRunDetailResponseSchema>;

export const testAutomationWorkflowRequestSchema = z
  .object({
    definition: automationWorkflowDefinitionSchema.optional(),
    triggerPayload: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type TestAutomationWorkflowRequest = z.infer<typeof testAutomationWorkflowRequestSchema>;

export const testAutomationWorkflowResponseSchema = z
  .object({
    runId: z.string().min(1).nullable(),
    validation: automationWorkflowValidationSchema,
    nodeExecutions: z.array(
      z
        .object({
          nodeId: z.string(),
          nodeType: z.string(),
          iteration: z.number().int().min(1).optional(),
          status: z.enum(['completed', 'skipped', 'failed']),
          selectedHandle: z.string(),
          errorMessage: z.string().nullable(),
          durationMs: z.number().int().min(0),
        })
        .strict(),
    ),
    evidence: z.array(automationEvidenceEventSchema),
    checks: z.array(automationDeterministicCheckSchema),
    actionReceipts: z.array(automationActionReceiptSchema),
  })
  .strict();
export type TestAutomationWorkflowResponse = z.infer<typeof testAutomationWorkflowResponseSchema>;

export const automationWebhookEndpointSchema = z
  .object({
    id: z.string().uuid(),
    publicId: z.string().min(16),
    brandId: z.string().uuid(),
    automationId: z.string().uuid(),
    workflowVersionId: z.string().uuid(),
    nodeId: z.string().min(1),
    name: z.string().min(1).max(120),
    enabled: z.boolean(),
    lastReceivedAt: z.string().nullable(),
    createdAt: z.string(),
  })
  .strict();
export type AutomationWebhookEndpoint = z.infer<typeof automationWebhookEndpointSchema>;

export const createAutomationWebhookEndpointRequestSchema = z
  .object({
    workflowVersionId: z.string().uuid(),
    nodeId: z.string().min(1).max(120),
    name: z.string().min(1).max(120),
    payloadSchema: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export const createAutomationWebhookEndpointResponseSchema = z
  .object({
    endpoint: automationWebhookEndpointSchema,
    signingSecret: z.string().min(32),
  })
  .strict();

export const automationWebhookDestinationSchema = z
  .object({
    id: z.string().uuid(),
    brandId: z.string().uuid(),
    name: z.string().min(1).max(120),
    url: z.string().url(),
    method: z.enum(['POST', 'PUT', 'PATCH']),
    enabled: z.boolean(),
    createdAt: z.string(),
  })
  .strict();
export type AutomationWebhookDestination = z.infer<typeof automationWebhookDestinationSchema>;

export const createAutomationWebhookDestinationRequestSchema = z
  .object({
    brandId: z.string().uuid(),
    name: z.string().min(1).max(120),
    url: z.string().url().startsWith('https://'),
    method: z.enum(['POST', 'PUT', 'PATCH']).default('POST'),
  })
  .strict();

export const createAutomationWebhookDestinationResponseSchema = z
  .object({
    destination: automationWebhookDestinationSchema,
    signingSecret: z.string().min(32),
  })
  .strict();

export const listAutomationWebhookResourcesResponseSchema = z
  .object({
    endpoints: z.array(automationWebhookEndpointSchema),
    destinations: z.array(automationWebhookDestinationSchema),
  })
  .strict();
