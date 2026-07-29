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
  'action.library_save': 'production',
  'action.planner_upsert': 'production',
  'action.organic_publish': 'production',
  'action.ai_studio_generate': 'production',
  'action.paid_optimizer': 'production',
  'action.outbound_webhook': 'production',
};

/** Every `action.*` member of the node union, derived rather than listed. */
export type AutomationActionNodeType = Extract<AutomationWorkflowNodeType, `action.${string}`>;

export const AUTOMATION_ACTION_NODE_TYPES = [
  'action.email',
  'action.library_save',
  'action.planner_upsert',
  'action.organic_publish',
  'action.ai_studio_generate',
  'action.paid_optimizer',
  'action.outbound_webhook',
] as const satisfies readonly AutomationActionNodeType[];

/**
 * Compile-time proof that the literal list above still covers every `action.*`
 * node type. Adding an action to the node union without listing it here makes
 * this assignment a `tsc --noEmit` error.
 */
export const AUTOMATION_ACTION_NODE_TYPES_ARE_EXHAUSTIVE: Exclude<
  AutomationActionNodeType,
  (typeof AUTOMATION_ACTION_NODE_TYPES)[number]
> extends never
  ? true
  : ['unlisted action node types'] = true;

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

export const automationActionCapabilitySchema = z
  .object({
    type: z.enum(AUTOMATION_ACTION_NODE_TYPES),
    lifecycle: automationCapabilityLifecycleSchema,
    availability: automationCapabilityAvailabilitySchema,
    reason: z.string().max(500).nullable(),
  })
  .strict();
export type AutomationActionCapability = z.infer<typeof automationActionCapabilitySchema>;

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
    // Optional for this release only. The response is `.strict()` and the
    // frontend parses it, so a required key breaks whichever side deploys
    // first: frontend-first fails on the missing key, backend-first fails on
    // the unrecognized one. Optional makes both orders safe. Promoting it to
    // required is a later, separate change once both sides carry it.
    actions: z.array(automationActionCapabilitySchema).optional(),
    mcpReadTools: z.array(automationMcpReadToolCapabilitySchema),
    generatedAt: z.string(),
  })
  .strict();
export type AutomationCapabilitiesResponse = z.infer<typeof automationCapabilitiesResponseSchema>;
