// A cross-platform move as Activity shows it: ONE decision whose legs are sub-rows, each with
// its own platform receipt (prototipo.html Activity; escenarios 01, 09, 18, 19).
//
// The action feed carries one row per audit write. A move's legs are tied by `move_id` + `leg`
// (optimizer.apply_audits, 20261001120300), and a compensation is its own audit row whose
// `revert_of` names the leg it undid. The feed row schema is loose, so these columns are read
// the day optimizer_list_actions starts returning them — exactly as `platform` already is —
// and a feed without them renders every write as a single row, as it does today.
//
// The move's state is the server's `move_status` when sent (the ledger's compensated /
// stranded), otherwise derived from the rows: a failed leg whose earlier leg was reverted is
// compensated; a failed leg whose revert also failed is stranded.

import type { OptimizerActionFeedRow } from '../../useOptimizerData';
import { actionPlatform, readReceiptTrace } from '../actionRows';
import { type AdPlatform, PLATFORM_NAMES } from '../platforms/platformTabsModel';

export type MoveLegState = 'applied' | 'scheduled' | 'refused' | 'reverted' | 'revert_refused';

export type MoveLegRevert = {
  beforeMinor: number | null;
  afterMinor: number | null;
  ok: boolean;
  error?: string;
};

export type MoveDecisionLeg = {
  leg: number;
  row: OptimizerActionFeedRow;
  platform: AdPlatform;
  entityId: string | null;
  beforeMinor: number | null;
  afterMinor: number | null;
  state: MoveLegState;
  receipt: string | null;
  error: string | null;
  revert: MoveLegRevert | null;
};

export type MoveState =
  | 'applied'
  | 'in_progress'
  | 'compensated'
  | 'stranded'
  | 'refused'
  | 'undone';

export type MoveUndo =
  | {
      kind: 'available';
      label: string;
      /** Reverse leg order: the increases come off first. */
      steps: { auditId: string; portfolioId: string }[];
    }
  | { kind: 'reverted' | 'none' };

export type MoveDecision = {
  moveId: string;
  /** The newest write of the move: when the decision last changed. */
  ts: string;
  portfolioName: string | null;
  actorRow: OptimizerActionFeedRow;
  from: AdPlatform[];
  to: AdPlatform[];
  amountMinor: number;
  state: MoveState;
  /** Why it did not land, for compensated, stranded and refused. */
  reason: string | null;
  legs: MoveDecisionLeg[];
  undo: MoveUndo;
};

export type ActionFeedItem =
  | { kind: 'single'; row: OptimizerActionFeedRow }
  | { kind: 'move'; key: string; move: MoveDecision };

function readString(row: OptimizerActionFeedRow, key: string): string | null {
  const value = (row as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function readMinor(value: Record<string, unknown> | null | undefined): number | null {
  const minor = value?.minor;
  if (typeof minor === 'number' && Number.isFinite(minor)) return minor;
  if (typeof minor === 'string' && minor.trim() !== '') {
    const parsed = Number(minor);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function readMoveId(row: OptimizerActionFeedRow): string | null {
  return readString(row, 'move_id');
}

function readLegIndex(row: OptimizerActionFeedRow): number {
  const value = (row as Record<string, unknown>).leg;
  return typeof value === 'number' && Number.isInteger(value) ? value : 0;
}

function isFailed(row: OptimizerActionFeedRow): boolean {
  return readString(row, 'outcome') === 'failed';
}

function isScheduled(row: OptimizerActionFeedRow): boolean {
  const record = row as Record<string, unknown>;
  return record.scheduled === true || row.receipt?.scheduled === true;
}

function errorOf(row: OptimizerActionFeedRow): string | null {
  return readString(row, 'error') ?? readString(row, 'refusal');
}

function buildLeg(
  forward: OptimizerActionFeedRow,
  revertRow: OptimizerActionFeedRow | undefined,
): MoveDecisionLeg {
  const revert: MoveLegRevert | null = revertRow
    ? {
        beforeMinor: readMinor(revertRow.before),
        afterMinor: readMinor(revertRow.after),
        ok: !isFailed(revertRow),
        ...(errorOf(revertRow) ? { error: errorOf(revertRow) ?? undefined } : {}),
      }
    : null;
  const state: MoveLegState = isFailed(forward)
    ? 'refused'
    : revert
      ? revert.ok
        ? 'reverted'
        : 'revert_refused'
      : isScheduled(forward)
        ? 'scheduled'
        : 'applied';
  return {
    leg: readLegIndex(forward),
    row: forward,
    platform: actionPlatform(forward),
    entityId: forward.entity_id ?? null,
    beforeMinor: readMinor(forward.before),
    afterMinor: readMinor(forward.after),
    state,
    receipt: readReceiptTrace(forward),
    error: errorOf(forward),
    revert,
  };
}

function distinct<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function moveState(rows: OptimizerActionFeedRow[], legs: MoveDecisionLeg[]): MoveState {
  const declared = rows.map((row) => readString(row, 'move_status')).find(Boolean);
  if (declared === 'stranded' || declared === 'compensated') return declared;
  if (legs.some((leg) => leg.state === 'revert_refused')) return 'stranded';
  const refused = legs.some((leg) => leg.state === 'refused');
  if (refused && legs.some((leg) => leg.state === 'reverted')) return 'compensated';
  if (refused) return 'refused';
  if (legs.some((leg) => leg.state === 'scheduled')) return 'in_progress';
  const applied = legs.filter((leg) => leg.state === 'applied');
  if (applied.length > 0 && applied.every((leg) => leg.row.reverted_by)) return 'undone';
  return 'applied';
}

function moveReason(state: MoveState, legs: MoveDecisionLeg[]): string | null {
  if (state === 'applied' || state === 'in_progress' || state === 'undone') return null;
  const failed = legs.find((leg) => leg.state === 'refused');
  if (!failed) return null;
  const platform = PLATFORM_NAMES[failed.platform];
  return failed.error ? `${platform} refused: ${failed.error}` : `${platform} refused the write`;
}

function moveUndo(state: MoveState, legs: MoveDecisionLeg[]): MoveUndo {
  if (state === 'undone') return { kind: 'reverted' };
  if (state !== 'applied') return { kind: 'none' };
  const steps: { auditId: string; portfolioId: string }[] = [];
  for (const leg of [...legs].reverse()) {
    const { row } = leg;
    if (row.reverted_by || row.reversible !== true || !row.portfolio_id) return { kind: 'none' };
    steps.push({ auditId: row.id, portfolioId: row.portfolio_id });
  }
  return {
    kind: 'available',
    label: steps.length === 2 ? 'Undo both' : `Undo all ${steps.length}`,
    steps,
  };
}

/** One move's rows, any order → the decision. Null when there is nothing to read. */
export function readMoveDecision(rows: OptimizerActionFeedRow[]): MoveDecision | null {
  const moveId = rows.map(readMoveId).find(Boolean);
  if (!moveId) return null;
  const forward = rows.filter((row) => !row.revert_of);
  const revertsOf = new Map(
    rows.filter((row) => row.revert_of).map((row) => [row.revert_of as string, row]),
  );
  const legs = forward
    .map((row) => buildLeg(row, revertsOf.get(row.id)))
    .sort((a, b) => a.leg - b.leg);
  if (legs.length === 0) return null;
  const decreases = legs.filter(
    (leg) => leg.beforeMinor != null && leg.afterMinor != null && leg.afterMinor < leg.beforeMinor,
  );
  const increases = legs.filter(
    (leg) => leg.beforeMinor != null && leg.afterMinor != null && leg.afterMinor > leg.beforeMinor,
  );
  const state = moveState(rows, legs);
  const newest = rows.reduce((a, b) => (new Date(b.ts) > new Date(a.ts) ? b : a));
  return {
    moveId,
    ts: newest.ts,
    portfolioName: legs[0]?.row.portfolio_name ?? null,
    actorRow: legs[0]?.row ?? newest,
    from: distinct(decreases.map((leg) => leg.platform)),
    to: distinct(increases.map((leg) => leg.platform)),
    amountMinor: decreases.reduce(
      (sum, leg) => sum + ((leg.beforeMinor ?? 0) - (leg.afterMinor ?? 0)),
      0,
    ),
    state,
    reason: moveReason(state, legs),
    legs,
    undo: moveUndo(state, legs),
  };
}

/** The feed with each move folded into ONE item where its first row stood (newest first, as
 *  the RPC orders). Rows with no move_id pass through untouched. */
export function groupActionFeed(rows: OptimizerActionFeedRow[]): ActionFeedItem[] {
  const byMove = new Map<string, OptimizerActionFeedRow[]>();
  for (const row of rows) {
    const moveId = readMoveId(row);
    if (!moveId) continue;
    byMove.set(moveId, [...(byMove.get(moveId) ?? []), row]);
  }
  const items: ActionFeedItem[] = [];
  const placed = new Set<string>();
  for (const row of rows) {
    const moveId = readMoveId(row);
    if (!moveId) {
      items.push({ kind: 'single', row });
      continue;
    }
    if (placed.has(moveId)) continue;
    placed.add(moveId);
    const move = readMoveDecision(byMove.get(moveId) ?? []);
    if (move) items.push({ kind: 'move', key: `move:${moveId}`, move });
  }
  return items;
}
