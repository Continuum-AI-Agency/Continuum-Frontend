// One copy of the run-row vocabulary. The legacy `AutomationDetailSheet` and the
// workspace's Runs tab render the same rows; the labels, pill variants and
// duration arithmetic live here so the two surfaces cannot drift apart.

import type { AutomationRun, AutomationRunTrigger } from '@continuum/contracts';

export type AutomationRunStatusPill = {
  label: string;
  variant: 'success' | 'error' | 'warning' | 'info';
  pulse?: boolean;
};

export const AUTOMATION_RUN_STATUS_PILL: Record<AutomationRun['status'], AutomationRunStatusPill> =
  {
    completed: { label: 'Completed', variant: 'success' },
    failed: { label: 'Failed', variant: 'error' },
    running: { label: 'Running', variant: 'info', pulse: true },
    queued: { label: 'Queued', variant: 'warning' },
  };

export const AUTOMATION_EMAIL_STATUS_LABEL: Record<AutomationRun['emailStatus'], string> = {
  sent: 'Emailed',
  sending: 'Emailing…',
  pending: 'Email pending',
  failed: 'Email failed',
  skipped: 'Email skipped',
};

export const AUTOMATION_RUN_TRIGGER_LABEL: Record<AutomationRunTrigger, string> = {
  schedule: 'Scheduled',
  manual: 'Manual',
  test: 'Test',
  event: 'Event',
  metric: 'Metric',
  webhook: 'Webhook',
};

/** Wall-clock time the run took, or null while it has not finished. */
export function formatAutomationRunDuration(run: AutomationRun): string | null {
  if (!run.startedAt || !run.completedAt) return null;
  const seconds = Math.round((Date.parse(run.completedAt) - Date.parse(run.startedAt)) / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/** The one-line summary under a run's status pill. */
export function describeAutomationRun(run: AutomationRun): string {
  const duration = formatAutomationRunDuration(run);
  return [
    new Date(run.enqueuedAt).toLocaleString(),
    duration,
    AUTOMATION_RUN_TRIGGER_LABEL[run.trigger],
  ]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
}

/**
 * Newest first by enqueue time. The list endpoint already orders this way, but
 * the panel is the surface a person reads top-down, so it does not inherit an
 * ordering it never stated.
 */
export function sortAutomationRunsNewestFirst(runs: readonly AutomationRun[]): AutomationRun[] {
  return [...runs].sort(
    (left, right) => Date.parse(right.enqueuedAt) - Date.parse(left.enqueuedAt),
  );
}
