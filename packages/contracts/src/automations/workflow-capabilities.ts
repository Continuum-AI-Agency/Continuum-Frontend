import { z } from 'zod';
import type { AutomationSourceKind, AutomationWorkflowNodeType } from './workflow';
import { automationSourceKindSchema } from './workflow';

export const automationCapabilityLifecycleSchema = z.enum(['production', 'preview']);
export type AutomationCapabilityLifecycle = z.infer<typeof automationCapabilityLifecycleSchema>;

export const automationCapabilityAvailabilitySchema = z.enum([
  'ready',
  'needs_connection',
  'unavailable',
]);
export type AutomationCapabilityAvailability = z.infer<
  typeof automationCapabilityAvailabilitySchema
>;

export const AUTOMATION_NODE_LIFECYCLE: Readonly<
  Record<AutomationWorkflowNodeType, AutomationCapabilityLifecycle>
> = {
  'trigger.manual': 'production',
  'trigger.schedule': 'production',
  'trigger.event': 'preview',
  'trigger.metric': 'preview',
  'trigger.webhook': 'preview',
  source: 'production',
  'integration.query': 'preview',
  'mcp.read': 'production',
  instruction: 'production',
  agent: 'production',
  'output.formatter': 'production',
  report: 'production',
  'logic.if': 'production',
  'logic.switch': 'production',
  'logic.parallel': 'preview',
  'logic.join': 'production',
  'logic.repeat_until': 'production',
  'action.email': 'production',
  'action.library_save': 'preview',
  'action.planner_upsert': 'preview',
  'action.organic_publish': 'preview',
  'action.ai_studio_generate': 'preview',
  'action.paid_optimizer': 'preview',
  'action.outbound_webhook': 'preview',
};

export const AUTOMATION_SOURCE_LIFECYCLE: Readonly<
  Record<AutomationSourceKind, AutomationCapabilityLifecycle>
> = {
  brand_knowledge: 'production',
  library: 'production',
  saved_prompt: 'production',
  saved_skill: 'production',
  paid_analytics: 'production',
  organic_analytics: 'production',
  planner: 'production',
  trends: 'production',
  previous_run: 'production',
  competitors: 'preview',
  connected_platform: 'preview',
  live_web: 'preview',
};

export const automationSourceCapabilitySchema = z
  .object({
    source: automationSourceKindSchema,
    lifecycle: automationCapabilityLifecycleSchema,
    availability: automationCapabilityAvailabilitySchema,
    reason: z.string().max(500).nullable(),
  })
  .strict();
export type AutomationSourceCapability = z.infer<typeof automationSourceCapabilitySchema>;

export const automationMcpReadToolCapabilitySchema = z
  .object({
    name: z.string().min(1).max(160),
    description: z.string().min(1).max(2_000),
    schemaHash: z.string().length(64),
  })
  .strict();

export const automationCapabilitiesResponseSchema = z
  .object({
    sources: z.array(automationSourceCapabilitySchema),
    mcpReadTools: z.array(automationMcpReadToolCapabilitySchema),
    generatedAt: z.string(),
  })
  .strict();
export type AutomationCapabilitiesResponse = z.infer<typeof automationCapabilitiesResponseSchema>;
