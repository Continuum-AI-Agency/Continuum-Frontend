// On-demand Continuum Report send. Same edge path as the dashboard control
// (send-first-value-report → send_now). Recipients are brand members the caller
// selected (validated server-side against permissions). When recipientUserIds is
// omitted, the edge falls back to the brand's scheduled Pulse subscription list.

import {
  getReportScheduleResponseSchema,
  type ReportCadence,
  type ReportSchedule,
} from '@continuum/contracts';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

// FunctionsHttpError keeps the JSON body on `context`; its `error` field carries
// the human message (429 rate limit, 409 no-data-yet, 400 validation). Falls back
// to the SDK error message when the body can't be read.
async function edgeErrorMessage(error: unknown): Promise<string> {
  const context = (error as { context?: Response }).context;
  const bodyJson = context
    ? await context.json().catch(() => null as { error?: string } | null)
    : null;
  return bodyJson?.error ?? (error instanceof Error ? error.message : 'Unknown error.');
}

export type SendContinuumReportInput = {
  brandId: string;
  /** Brand member user ids to email. Must be non-empty when provided. */
  recipientUserIds?: string[];
};

export type SendContinuumReportResult = {
  recipients: string[];
};

export function summarizeReportRecipients(recipients: string[]): string {
  if (recipients.length === 0) return 'No recipients were emailed.';
  if (recipients.length === 1) return `Sent to ${recipients[0]}.`;
  return `Sent to ${recipients[0]} and ${recipients.length - 1} other recipient${
    recipients.length > 2 ? 's' : ''
  }.`;
}

/** @deprecated Prefer summarizeReportRecipients */
export const summarizePulseRecipients = summarizeReportRecipients;

export async function sendContinuumReport(
  input: SendContinuumReportInput,
): Promise<SendContinuumReportResult> {
  const supabase = createSupabaseBrowserClient();
  const body: Record<string, unknown> = {
    action: 'send_now',
    brandId: input.brandId,
  };
  if (input.recipientUserIds) {
    body.recipientUserIds = input.recipientUserIds;
  }

  const { data, error } = await supabase.functions.invoke('send-first-value-report', {
    body,
  });

  if (error) {
    throw new Error(await edgeErrorMessage(error));
  }

  const recipients = (data as { recipients?: string[] } | null)?.recipients ?? [];
  return { recipients };
}

/** @deprecated Prefer sendContinuumReport */
export async function sendPulseReport(brandId: string): Promise<SendContinuumReportResult> {
  return sendContinuumReport({ brandId });
}

// --- Recurring schedule (send-first-value-report schedule / get_schedule /
// cancel_schedule). One schedule per brand; recipients mix brand members and
// external stakeholder emails. Responses are validated against the contracts
// schema at this boundary.

export type ReportScheduleInput = {
  brandId: string;
  cadence: ReportCadence;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  hour: number;
  timezone: string;
  memberUserIds: string[];
  externalEmails: string[];
};

export async function upsertReportSchedule(input: ReportScheduleInput): Promise<ReportSchedule> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.functions.invoke('send-first-value-report', {
    body: {
      action: 'schedule',
      brandId: input.brandId,
      cadence: input.cadence,
      dayOfWeek: input.dayOfWeek,
      dayOfMonth: input.dayOfMonth,
      hour: input.hour,
      timezone: input.timezone,
      recipients: {
        memberUserIds: input.memberUserIds,
        externalEmails: input.externalEmails,
      },
    },
  });

  if (error) {
    throw new Error(await edgeErrorMessage(error));
  }

  const parsed = getReportScheduleResponseSchema.safeParse(data);
  if (!parsed.success || !parsed.data.schedule) {
    throw new Error('The saved schedule response was malformed.');
  }
  return parsed.data.schedule;
}

export async function getReportSchedule(brandId: string): Promise<ReportSchedule | null> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.functions.invoke('send-first-value-report', {
    body: { action: 'get_schedule', brandId },
  });

  if (error) {
    throw new Error(await edgeErrorMessage(error));
  }

  const parsed = getReportScheduleResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error('The schedule response was malformed.');
  }
  return parsed.data.schedule;
}

export async function cancelReportSchedule(brandId: string): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.functions.invoke('send-first-value-report', {
    body: { action: 'cancel_schedule', brandId },
  });

  if (error) {
    throw new Error(await edgeErrorMessage(error));
  }
}
