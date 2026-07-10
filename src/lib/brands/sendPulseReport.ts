// On-demand Continuum Report send. Same edge path as the dashboard control
// (send-first-value-report → send_now). Recipients are brand members the caller
// selected (validated server-side against permissions). When recipientUserIds is
// omitted, the edge falls back to the brand's scheduled Pulse subscription list.

import { createSupabaseBrowserClient } from '@/lib/supabase/client';

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
    // FunctionsHttpError keeps the body on `context`; 429 (rate limited) and 409
    // (no performance data yet) messages are the useful ones for the toast.
    const bodyJson = await (error as { context?: Response }).context
      ?.json()
      .catch(() => null as { error?: string } | null);
    throw new Error(bodyJson?.error ?? error.message);
  }

  const recipients = (data as { recipients?: string[] } | null)?.recipients ?? [];
  return { recipients };
}

/** @deprecated Prefer sendContinuumReport */
export async function sendPulseReport(brandId: string): Promise<SendContinuumReportResult> {
  return sendContinuumReport({ brandId });
}
