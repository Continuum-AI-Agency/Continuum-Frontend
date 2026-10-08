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
  completed: 'Completado',
  in_progress: 'En curso',
  partial: 'Parcial',
  deferred: 'Para la próxima',
  blocked: 'Bloqueado',
  failed: 'Falló',
  cancelled: 'Cancelado',
  pending: 'Pendiente',
};

/** Tool families a `required_tool_not_run` detail can name, in words. */
const READ_LABELS: ReadonlyArray<readonly [RegExp, string]> = [
  [/get_breakdown_insights|get_audience_demographics/, 'el desglose por segmento'],
  [/get_trend_metrics/, 'la tendencia en el tiempo'],
  [/get_key_metrics|get_ad_account_insights|get_meta_overview/, 'las métricas de la cuenta'],
  [/get_action_insights/, 'las conversiones'],
  [/get_campaign/, 'los datos de las campañas'],
  [/get_ad_sets|get_audience/, 'los conjuntos de anuncios'],
  [/creative/, 'los creativos'],
];

const readLabelOf = (details: string | null | undefined): string => {
  const text = details ?? '';
  return READ_LABELS.find(([pattern]) => pattern.test(text))?.[1] ?? 'un dato que necesitaba';
};

const REASON_TEXT: Readonly<Record<string, (details: string | null | undefined) => string>> = {
  required_tool_not_run: (details) => `No se pudo leer ${readLabelOf(details)}`,
  core_deferred: () => 'Quedó para la próxima',
  turn_ended_in_progress: () => 'Se cortó antes de terminar',
  worker_exception: () => 'Falló al consultar los datos',
  hard_dependency_terminal: () => 'Dependía de un paso que no se completó',
  blocked: () => 'Está esperando otro paso',
  tool_budget_exhausted: () => 'Se agotó el tiempo de consulta',
  tool_execution_failed: () => 'Falló al consultar los datos',
  tool_approval_denied: () => 'No se aprobó la acción',
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
