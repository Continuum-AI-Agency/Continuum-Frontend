// Pure readers for the optimizer ACTION feed (public.optimizer_list_actions).
//
// One normalized row shape carries three families and four unit systems, because before/after
// are jsonb: budget {"minor": 5000}, status {"status": "ACTIVE"}, setting {"value": "autopilot"},
// decision {"status": "pending"}. These readers are the single place that knows which key to
// look in for which op — the renderers just print what comes back.
//
// Kept pure (no React) so the mapping is unit-tested directly, and deliberately tolerant:
// this is a DB-derived read model, so an op the contract has not caught up with (today,
// 'convert') must still render as something honest rather than crash the page.

import type { OptimizerActionFeedRow } from '../useOptimizerData';

/** How one action's before/after should be printed. `unit` decides the formatter:
 *  'money' values are MINOR units and the caller applies its currency; 'text' is printed
 *  verbatim. */
export type ActionChange = {
  label: string;
  unit: 'money' | 'text';
  before: string | number | null;
  after: string | number | null;
};

function readMinor(value: Record<string, unknown> | null | undefined): number | null {
  const minor = value?.minor;
  if (typeof minor === 'number') return Number.isFinite(minor) ? minor : null;
  if (typeof minor === 'string' && minor.trim() !== '') {
    const parsed = Number(minor);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readKey(value: Record<string, unknown> | null | undefined, key: string): string | null {
  const raw = value?.[key];
  if (typeof raw === 'string') return raw.trim() === '' ? null : raw;
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
  if (typeof raw === 'boolean') return raw ? 'on' : 'off';
  return null;
}

/** What this row changed, before → after. Never null: a row with no readable before/after
 *  still says WHICH field moved, because "something changed and we won't say what" is the
 *  failure mode this whole feed exists to end. */
export function readActionChange(row: OptimizerActionFeedRow): ActionChange {
  switch (row.op) {
    case 'budget':
      return {
        label: 'Daily budget',
        unit: 'money',
        before: readMinor(row.before),
        after: readMinor(row.after),
      };
    case 'status':
      return {
        label: 'Status',
        unit: 'text',
        before: readKey(row.before, 'status'),
        after: readKey(row.after, 'status'),
      };
    case 'setting':
      return {
        label: row.entity_id ?? 'Setting',
        unit: 'text',
        before: readKey(row.before, 'value'),
        after: readKey(row.after, 'value'),
      };
    case 'decision':
      return {
        label: 'Recommendation',
        unit: 'text',
        before: readKey(row.before, 'status'),
        after: readKey(row.after, 'status'),
      };
    default:
      // 'convert' today (CBO → ABO), and whatever public.optimizer_list_actions emits next.
      return {
        label: row.op.replace(/_/g, ' '),
        unit: 'text',
        before: readKey(row.before, 'status') ?? readKey(row.before, 'value'),
        after: readKey(row.after, 'status') ?? readKey(row.after, 'value'),
      };
  }
}

/** Who authorized it. `actor_kind` comes straight from the RPC — 'autopilot' when the
 *  scheduler wrote it, 'human' when a person did, 'system' when nothing was recorded. */
export function actorLabel(row: OptimizerActionFeedRow): string {
  switch (row.actor_kind) {
    case 'autopilot':
      return 'Autopilot';
    case 'human':
      return 'Human';
    case 'system':
      return 'System';
    default:
      return 'Unknown';
  }
}

/** The Meta trace id, when the write carried one. The receipt jsonb is the raw
 *  `apply_audits.meta_receipt`, so the key is whatever the applier stored. */
export function readReceiptTrace(row: OptimizerActionFeedRow): string | null {
  const receipt = row.receipt;
  if (!receipt) return null;
  for (const key of ['fbtrace_id', 'fbtraceId', 'trace_id', 'id']) {
    const value = receipt[key];
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return null;
}

/** Whether this row's revert dialog scope is a status restore ('adset_status', which reads
 *  as "Unpause") rather than a budget restore. */
export function revertScopeOf(row: OptimizerActionFeedRow): string | null {
  return row.op === 'status' ? 'adset_status' : null;
}

/** Can this row be undone in one click, right now?
 *
 *  `reversible` is the SERVER's answer — TRUE only for an ad-account write that recorded a
 *  real prior value to restore. It is never guessed from the row's shape here: a client-side
 *  guess is how a button starts lying about what it can do. A row already undone
 *  (`reverted_by`) is reported as such instead of offering the button a second time, and a
 *  row with no portfolio has nothing for the revert edge to scope against. */
export function revertState(
  row: OptimizerActionFeedRow,
): { kind: 'available'; auditId: string; portfolioId: string } | { kind: 'reverted' | 'none' } {
  if (row.reverted_by) return { kind: 'reverted' };
  if (row.reversible !== true || !row.portfolio_id) return { kind: 'none' };
  return { kind: 'available', auditId: row.id, portfolioId: row.portfolio_id };
}
