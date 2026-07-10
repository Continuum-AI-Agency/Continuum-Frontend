// Canonical automation shapes shared by Frontend (in-chat Automations panel,
// builder Sheet) and Backend (automations CRUD repo, scheduler worker).
// DB rows are snake_case; these boundary shapes are camelCase and the API
// layer maps between them.

import { z } from 'zod';

// The two agents an automation can drive. The chat surface an automation is
// created from fixes its target: Jaina (paid media) or the Organic agent.
export const agentTargetSchema = z.enum(['jaina', 'organic']);
export type AgentTarget = z.infer<typeof agentTargetSchema>;

// 24h wall-clock time in the automation's timezone, e.g. "09:30".
export const automationTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:MM (24h)');

// IANA timezone name. Shape-validated here; existence is enforced server-side
// against Intl.supportedValuesOf('timeZone').
const timezoneSchema = z.string().min(1).max(64);

// User-facing schedule. Presets cover the common cases; `cron` is the advanced
// escape hatch. `dayOfWeek` follows cron convention (0 = Sunday .. 6 = Saturday).
// `dayOfMonth` is capped at 28 so monthly schedules never skip short months.
// The backend canonicalizes every variant to a cron expression + timezone and
// owns next-run computation; this object round-trips for the builder UI.
export const automationScheduleSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('daily'),
      time: automationTimeSchema,
      timezone: timezoneSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('weekly'),
      dayOfWeek: z.number().int().min(0).max(6),
      time: automationTimeSchema,
      timezone: timezoneSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('monthly'),
      dayOfMonth: z.number().int().min(1).max(28),
      time: automationTimeSchema,
      timezone: timezoneSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('cron'),
      expr: z.string().min(1).max(120),
      timezone: timezoneSchema,
    })
    .strict(),
]);
export type AutomationSchedule = z.infer<typeof automationScheduleSchema>;

// Who receives the emailed report. Members are referenced by user id and
// resolved to their current email at send time (removed members stop
// receiving); external stakeholders are stored as raw addresses.
export const automationRecipientsSchema = z
  .object({
    memberUserIds: z.array(z.string().min(1)).max(50).default([]),
    externalEmails: z.array(z.string().email().max(254)).max(20).default([]),
  })
  .strict();
export type AutomationRecipients = z.infer<typeof automationRecipientsSchema>;

export const automationRunStatusSchema = z.enum(['queued', 'running', 'completed', 'failed']);
export type AutomationRunStatus = z.infer<typeof automationRunStatusSchema>;

export const automationSchema = z
  .object({
    id: z.string().min(1),
    brandId: z.string().min(1),
    createdBy: z.string().nullable().optional(),
    name: z.string().min(1),
    agent: agentTargetSchema,
    prompt: z.string().min(1),
    schedule: automationScheduleSchema,
    recipients: automationRecipientsSchema,
    enabled: z.boolean(),
    nextRunAt: z.string(),
    lastRunId: z.string().nullable().optional(),
    lastRunAt: z.string().nullable().optional(),
    lastRunStatus: automationRunStatusSchema.nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();
export type Automation = z.infer<typeof automationSchema>;
