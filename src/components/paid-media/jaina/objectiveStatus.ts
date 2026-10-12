import type { JainaObjectiveStatus } from '@/lib/jaina/schemas';

/**
 * The objectives checklist's vocabulary: what each status the backend settles on is called,
 * and what each `reason_code` means to a person. The codes are runtime-authored (Jaina
 * orchestrator + agent-runtime), never shown raw — an unknown code shows no reason rather
 * than an identifier.
 */

const CANONICAL_STATUSES: ReadonlySet<string> = new Set<JainaObjectiveStatus>([
  'pending',
  'in_progress',
  'completed',
  'partial',
  'deferred',
  'blocked',
  'failed',
  'cancelled',
]);

const STATUS_ALIASES: Readonly<Record<string, JainaObjectiveStatus>> = {
  'in-progress': 'in_progress',
  running: 'in_progress',
  active: 'in_progress',
  complete: 'completed',
  done: 'completed',
  success: 'completed',
  error: 'failed',
  errored: 'failed',
  canceled: 'cancelled',
};

/**
 * A persisted objective keeps the status the turn ended on. Folding `partial`, `deferred`
 * and `blocked` back to `pending` made a reloaded conversation read as though nothing had
 * been attempted.
 */
export function normalizePersistedObjectiveStatus(value: unknown): JainaObjectiveStatus {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (CANONICAL_STATUSES.has(normalized)) return normalized as JainaObjectiveStatus;
  return STATUS_ALIASES[normalized] ?? 'pending';
}

export const OBJECTIVE_STATUS_LABEL: Readonly<Record<JainaObjectiveStatus, string>> = {
  completed: 'Done',
  in_progress: 'In progress',
  partial: 'Partial',
  deferred: 'Deferred',
  blocked: 'Blocked',
  failed: 'Failed',
  cancelled: 'Cancelled',
  pending: 'Pending',
};

/** Tool families a `required_tool_not_run` detail can name, in words. */
const READ_LABELS: ReadonlyArray<readonly [RegExp, string]> = [
  [/get_breakdown_insights|get_audience_demographics/, 'the breakdown by segment'],
  [/get_trend_metrics/, 'the trend over time'],
  [/get_key_metrics|get_ad_account_insights|get_meta_overview/, 'the account metrics'],
  [/get_action_insights/, 'the conversions'],
  [/get_campaign/, 'the campaign data'],
  [/get_ad_sets|get_audience/, 'the ad sets'],
  [/creative/, 'the creatives'],
];

const readLabelOf = (details: string | null | undefined): string => {
  const text = details ?? '';
  return READ_LABELS.find(([pattern]) => pattern.test(text))?.[1] ?? 'data it needed';
};

const REASON_TEXT: Readonly<Record<string, (details: string | null | undefined) => string>> = {
  required_tool_not_run: (details) => `Could not read ${readLabelOf(details)}`,
  core_deferred: () => 'Left for the next turn',
  turn_ended_in_progress: () => 'Stopped before it finished',
  worker_exception: () => 'The data read failed',
  hard_dependency_terminal: () => 'It depended on a step that did not finish',
  blocked: () => 'Waiting on another step',
  tool_budget_exhausted: () => 'The read ran out of time',
  tool_execution_failed: () => 'The data read failed',
  tool_approval_denied: () => 'The action was not approved',
};

export function objectiveReasonText(
  reasonCode: string | null | undefined,
  details: string | null | undefined,
): string | null {
  if (!reasonCode) return null;
  return REASON_TEXT[reasonCode]?.(details) ?? null;
}

export function summarizeObjectiveProgress(objectives: ReadonlyArray<{ status: string }>): {
  completed: number;
  partial: number;
  total: number;
} {
  return {
    completed: objectives.filter((objective) => objective.status === 'completed').length,
    partial: objectives.filter((objective) => objective.status === 'partial').length,
    total: objectives.length,
  };
}
