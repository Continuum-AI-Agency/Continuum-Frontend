// Recurring "Continuum Report" schedule — the cross-boundary shape shared by the
// Frontend dialog (create/read/cancel a brand's schedule) and the edge function
// (send-first-value-report `schedule` / `get_schedule` / `cancel_schedule`).
// DB rows are snake_case (brand_profiles.report_schedules); this boundary shape is
// camelCase and the edge maps between them.
//
// The Deno edge runtime cannot import this workspace package, so the edge mirrors
// this shape in supabase/functions/send-first-value-report/report-schedule.ts and a
// parity test there asserts the mirror maps onto reportScheduleSchema.

import { z } from 'zod';
import { automationRecipientsSchema } from '../automations/automation';

export const reportCadenceSchema = z.enum(['weekly', 'monthly']);
export type ReportCadence = z.infer<typeof reportCadenceSchema>;

const dayOfWeekSchema = z.number().int().min(0).max(6).nullable();
const dayOfMonthSchema = z.number().int().min(1).max(28).nullable();
const hourSchema = z.number().int().min(0).max(23);
const timezoneSchema = z.string().min(1).max(64);

// weekly needs its weekday; monthly needs its day-of-month. Enforced on both the
// full schedule and the upsert request so an ambiguous schedule can never persist.
type CadenceDayInput = {
  cadence: ReportCadence;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
};
function cadenceHasItsDay(value: CadenceDayInput): boolean {
  return value.cadence === 'weekly' ? value.dayOfWeek !== null : value.dayOfMonth !== null;
}
const cadenceDayRefinement = {
  message: 'weekly schedules need dayOfWeek; monthly schedules need dayOfMonth',
  path: ['cadence'],
};

const reportScheduleObject = z
  .object({
    brandId: z.string().min(1),
    presentation: z.literal('continuum_report'),
    cadence: reportCadenceSchema,
    dayOfWeek: dayOfWeekSchema,
    dayOfMonth: dayOfMonthSchema,
    hour: hourSchema,
    timezone: timezoneSchema,
    recipients: automationRecipientsSchema,
    enabled: z.boolean(),
    nextRunAt: z.string(),
    lastRunAt: z.string().nullable(),
    updatedAt: z.string(),
  })
  .strict();

export const reportScheduleSchema = reportScheduleObject.refine(
  cadenceHasItsDay,
  cadenceDayRefinement,
);
export type ReportSchedule = z.infer<typeof reportScheduleSchema>;

// Canonical field list (sorted) — the edge parity test compares its mirror's mapped
// keys against this so a renamed/added field is caught at test time.
export const reportScheduleFieldNames: readonly string[] = Object.keys(
  reportScheduleObject.shape,
).sort();

// What the client sends to create/replace a brand's schedule. next_run_at,
// enabled, and audit stamps are server-managed, so they are not in the request.
const upsertReportScheduleObject = z
  .object({
    brandId: z.string().min(1),
    cadence: reportCadenceSchema,
    dayOfWeek: dayOfWeekSchema,
    dayOfMonth: dayOfMonthSchema,
    hour: hourSchema,
    timezone: timezoneSchema,
    recipients: automationRecipientsSchema,
  })
  .strict();

export const upsertReportScheduleRequestSchema = upsertReportScheduleObject.refine(
  cadenceHasItsDay,
  cadenceDayRefinement,
);
export type UpsertReportScheduleRequest = z.infer<typeof upsertReportScheduleRequestSchema>;

export const getReportScheduleResponseSchema = z.object({
  schedule: reportScheduleSchema.nullable(),
});
export type GetReportScheduleResponse = z.infer<typeof getReportScheduleResponseSchema>;
