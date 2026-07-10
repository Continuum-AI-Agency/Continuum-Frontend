// Client-side form schema for the automation builder. The form keeps schedule
// fields flat (RHF-friendly) and maps to the contracts discriminated union on
// submit; the backend re-validates and canonicalizes (dual-validation rule).

import {
  type AutomationRecipients,
  type AutomationSchedule,
  automationTimeSchema,
} from '@continuum/contracts';
import { z } from 'zod';
import { validateCron } from '@/lib/automations/schedule';

export const builderFormSchema = z
  .object({
    name: z.string().min(1, 'Name is required').max(120),
    prompt: z.string().min(1, 'Prompt is required').max(20000),
    scheduleKind: z.enum(['daily', 'weekly', 'monthly', 'cron']),
    time: automationTimeSchema,
    dayOfWeek: z.number().int().min(0).max(6),
    dayOfMonth: z.number().int().min(1).max(28),
    timezone: z.string().min(1, 'Pick a timezone'),
    cronExpr: z.string(),
    memberUserIds: z.array(z.string()),
    externalEmails: z.array(z.string().email()),
    enabled: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (values.scheduleKind === 'cron') {
      const result = validateCron(values.cronExpr);
      if (!result.ok) {
        ctx.addIssue({ code: 'custom', path: ['cronExpr'], message: result.reason });
      }
    }
    if (values.memberUserIds.length + values.externalEmails.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['externalEmails'],
        message: 'Add at least one recipient',
      });
    }
  });

export type AutomationBuilderFormValues = z.infer<typeof builderFormSchema>;

export function toSchedule(values: AutomationBuilderFormValues): AutomationSchedule {
  switch (values.scheduleKind) {
    case 'daily':
      return { kind: 'daily', time: values.time, timezone: values.timezone };
    case 'weekly':
      return {
        kind: 'weekly',
        dayOfWeek: values.dayOfWeek,
        time: values.time,
        timezone: values.timezone,
      };
    case 'monthly':
      return {
        kind: 'monthly',
        dayOfMonth: values.dayOfMonth,
        time: values.time,
        timezone: values.timezone,
      };
    case 'cron':
      return { kind: 'cron', expr: values.cronExpr.trim(), timezone: values.timezone };
  }
}

export function toRecipients(values: AutomationBuilderFormValues): AutomationRecipients {
  return { memberUserIds: values.memberUserIds, externalEmails: values.externalEmails };
}

export function scheduleToFormFields(
  schedule: AutomationSchedule,
): Pick<
  AutomationBuilderFormValues,
  'scheduleKind' | 'time' | 'dayOfWeek' | 'dayOfMonth' | 'timezone' | 'cronExpr'
> {
  const base = {
    scheduleKind: schedule.kind,
    time: '09:00',
    dayOfWeek: 1,
    dayOfMonth: 1,
    timezone: schedule.timezone,
    cronExpr: '',
  };
  switch (schedule.kind) {
    case 'daily':
      return { ...base, time: schedule.time };
    case 'weekly':
      return { ...base, time: schedule.time, dayOfWeek: schedule.dayOfWeek };
    case 'monthly':
      return { ...base, time: schedule.time, dayOfMonth: schedule.dayOfMonth };
    case 'cron':
      return { ...base, cronExpr: schedule.expr };
  }
}
