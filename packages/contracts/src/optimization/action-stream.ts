// One normalized row of `public.continuum_action_stream` — what Continuum actually did
// for a brand in a window — plus the fold that makes a change and its undo read as ONE
// entry rather than two.
//
// The weekly report email (`supabase/functions/send-first-value-report/report-format.ts`)
// carries a MIRROR of this, deliberately: edge functions run on Deno and mirror contracts
// rather than importing across the runtime boundary. This copy is the one Node consumers
// (the optimizer chat ping) import; the two must agree in BEHAVIOUR, not by import.

/** The optimizer's own arm of the stream. Only these rows carry a justification, an
 *  amount, and an undo edge — the other arms emit nulls there rather than fabricating. */
export const OPTIMIZER_ACTION_SOURCE = 'optimizer.apply_audits';

export type ActionStreamEntry = {
  /** The `optimizer.apply_audits` row id: what a revert points AT, and the only way a
   *  reader can pair an undo with the write it reversed. Null on arms that have none. */
  id: string | null;
  occurredAt: string;
  /** `human` when a person authorized this write, `autopilot` when nobody did. This is
   *  the single most load-bearing field in a proactive ping. */
  actorKind: string;
  action: string;
  targetKind: string;
  targetId: string | null;
  outcome: string;
  /** WHY, in the words of whatever decided it. Optimizer writes only. */
  justification: string | null;
  /** MINOR units of `currency`. Null for actions that moved no money. */
  beforeMinor: number | null;
  afterMinor: number | null;
  /** Set instead of the amounts when the write flipped a status rather than a budget. */
  beforeStatus: string | null;
  afterStatus: string | null;
  /** The code the amounts are denominated in. A null code MUST suppress the amount —
   *  see `formatMinorAmount`, which returns null rather than guessing a scale. */
  currency: string | null;
  /** Set when this action UNDOES another: the id it reversed. */
  revertsActionId: string | null;
  source: string | null;
};

/** One action, plus the undo that reversed it (folded in by {@link foldReverts}). */
export type FoldedAction = ActionStreamEntry & {
  revertedAt: string | null;
  revertedToMinor: number | null;
  revertedToStatus: string | null;
};

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const str = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Raw `continuum_action_stream` rows -> typed entries. A row with no timestamp or no verb
 *  cannot be rendered as an action at all and is dropped rather than half-rendered. */
export function toActionStreamEntries(rows: unknown): ActionStreamEntry[] {
  return asArray(rows).flatMap((item) => {
    const row = asRecord(item);
    const occurredAt = str(row.occurred_at);
    const action = str(row.action);
    if (!occurredAt || !action) return [];
    const before = asRecord(row.before);
    const after = asRecord(row.after);
    return [
      {
        id: str(row.action_id),
        occurredAt,
        actorKind: str(row.actor_kind) ?? 'system',
        action,
        targetKind: str(row.target_kind) ?? 'account',
        targetId: str(row.target_id),
        outcome: str(row.outcome) ?? 'applied',
        justification: str(row.justification),
        beforeMinor: num(before.minor),
        afterMinor: num(after.minor),
        beforeStatus: str(before.status),
        afterStatus: str(after.status),
        currency: str(row.currency),
        revertsActionId: str(row.reverts_action_id),
        source: str(row.source),
      },
    ];
  });
}

/** Fold each revert into the action it undid, so a change-and-undo is ONE entry.
 *
 *  A revert is an ordinary write that points back at its target, which means the raw
 *  stream reports it as a second, independent action: two identical "adset budget ·
 *  applied" rows. A reader counts two budget changes where the account saw one and then
 *  its reversal.
 *
 *  A revert whose target is outside this window keeps its own row — it IS the only action
 *  the reader can see, and silently dropping it would under-report. */
export function foldReverts(actions: ActionStreamEntry[]): FoldedAction[] {
  const present = new Set(actions.map((action) => action.id).filter((id): id is string => !!id));
  const undoneBy = new Map<string, ActionStreamEntry>();
  for (const action of actions) {
    if (action.revertsActionId) undoneBy.set(action.revertsActionId, action);
  }
  const folded: FoldedAction[] = [];
  for (const action of actions) {
    // The revert itself is not rendered when its target is also in this window.
    if (action.revertsActionId && present.has(action.revertsActionId)) continue;
    const undo = action.id ? undoneBy.get(action.id) : undefined;
    folded.push({
      ...action,
      revertedAt: undo?.occurredAt ?? null,
      revertedToMinor: undo?.afterMinor ?? null,
      revertedToStatus: undo?.afterStatus ?? null,
    });
  }
  return folded;
}
