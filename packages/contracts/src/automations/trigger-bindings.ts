import { z } from 'zod';
import { automationScheduleSchema } from './automation';

export const automationNativeEventTypeSchema = z.enum([
  'library.asset.created',
  'library.asset.updated',
  'library.asset.approved',
  'planner.draft.created',
  'planner.draft.published',
  'trends.signal.created',
  'competitor.change.detected',
]);
export type AutomationNativeEventType = z.infer<typeof automationNativeEventTypeSchema>;

export const automationMetricOperatorSchema = z.enum([
  'gt',
  'gte',
  'lt',
  'lte',
  'eq',
  'changed_by',
]);
export const automationMetricWindowSchema = z.enum(['1h', '24h', '7d', '30d']);

const bindingBase = {
  id: z.string().min(1).max(180),
  automationId: z.string().min(1),
  workflowVersionId: z.string().min(1),
  nodeId: z.string().min(1).max(120),
  enabled: z.boolean(),
};

export const automationTriggerBindingSchema = z.discriminatedUnion('type', [
  z
    .object({
      ...bindingBase,
      type: z.literal('manual'),
      config: z
        .object({
          inputSchema: z.record(z.string(), z.unknown()).default({}),
        })
        .strict()
        .default({ inputSchema: {} }),
    })
    .strict(),
  z
    .object({
      ...bindingBase,
      type: z.literal('schedule'),
      config: z.object({ schedule: automationScheduleSchema }).strict(),
    })
    .strict(),
  z
    .object({
      ...bindingBase,
      type: z.literal('webhook'),
      config: z.object({ endpointId: z.string().min(1).max(180) }).strict(),
    })
    .strict(),
  z
    .object({
      ...bindingBase,
      type: z.literal('event'),
      config: z
        .object({
          eventType: automationNativeEventTypeSchema,
          filters: z.record(z.string(), z.unknown()).default({}),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...bindingBase,
      type: z.literal('metric'),
      config: z
        .object({
          metric: z.string().min(1).max(120),
          operator: automationMetricOperatorSchema,
          value: z.number().finite(),
          window: automationMetricWindowSchema,
          cooldownMinutes: z.number().int().min(15).max(43_200),
        })
        .strict(),
    })
    .strict(),
]);
export type AutomationTriggerBinding = z.infer<typeof automationTriggerBindingSchema>;
