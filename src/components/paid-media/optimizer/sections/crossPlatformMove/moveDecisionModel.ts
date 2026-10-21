// A cross-platform move as Activity shows it: ONE decision whose legs are sub-rows, each with
// its own platform receipt (prototipo.html Activity; escenarios 01, 09, 18, 19).
//
// The action feed carries one row per audit write. A move's legs are tied by `move_id` + `leg`
// (optimizer.apply_audits, 20261001120300; optimizer_list_actions returns both, with the leg's
// `platform`, at the end of its row), and a compensation is its own audit row whose `revert_of`
// names the leg it undid. A feed without them renders every write as a single row.
//
// The move's state is the server's `move_status` when sent (the ledger's compensated /
// stranded), otherwise derived from the rows: a failed leg whose earlier leg was reverted is
// compensated; a failed leg whose revert also failed is stranded.
//
// Each leg of an applied move is undone on its own, through the same audited per-write undo
// as any platform write, in reverse leg order: every increase first, and a decrease only once
// every increase of its move is undone — so an undo that stops halfway leaves the client
// spending less, never more. The service refuses a decrease out of that order; the UI does not
// offer one.

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

/** 'after_increases': applied and reversible, but an increase of the move is still live. */
export type MoveLegUndo = 'available' | 'after_increases' | 'none';

export type MoveDecisionLeg = {
  leg: number;
  row: OptimizerActionFeedRow;
  platform: AdPlatform;
  /** From before → after; null when the row carries no minor to compare. */
  direction: 'decrease' | 'increase' | null;
  entityId: string | null;
  beforeMinor: number | null;
  afterMinor: number | null;
  state: MoveLegState;
  receipt: string | null;
  error: string | null;
  revert: MoveLegRevert | null;
  undo: MoveLegUndo;
};

export type MoveState =
  | 'applied'
  | 'in_progress'
  | 'compensated'
  | 'stranded'
  | 'refused'
  | 'undone';

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
  return row.move_id?.trim() || null;
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

function directionOf(before: number | null, after: number | null): MoveDecisionLeg['direction'] {
  if (before == null || after == null || before === after) return null;
  return after < before ? 'decrease' : 'increase';
}

function buildLeg(
  forward: OptimizerActionFeedRow,
  revertRow: OptimizerActionFeedRow | undefined,
): Omit<MoveDecisionLeg, 'undo'> {
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
  const beforeMinor = readMinor(forward.before);
  const afterMinor = readMinor(forward.after);
  return {
    leg: forward.leg ?? 0,
    row: forward,
    platform: actionPlatform(forward),
    direction: directionOf(beforeMinor, afterMinor),
    entityId: forward.entity_id ?? null,
    beforeMinor,
    afterMinor,
    state,
    receipt: readReceiptTrace(forward),
    error: errorOf(forward),
    revert,
  };
}

function distinct<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

type LegFacts = Omit<MoveDecisionLeg, 'undo'>;

/** Undone by a person (reverted_by) or put back by a revert row of the move itself. */
function isUndone(leg: LegFacts): boolean {
  return leg.state === 'reverted' || Boolean(leg.row.reverted_by);
}

function moveState(rows: OptimizerActionFeedRow[], legs: LegFacts[]): MoveState {
  const declared = rows.map((row) => readString(row, 'move_status')).find(Boolean);
  if (declared === 'stranded' || declared === 'compensated') return declared;
  if (legs.some((leg) => leg.state === 'revert_refused')) return 'stranded';
  const refused = legs.some((leg) => leg.state === 'refused');
  if (refused && legs.some((leg) => leg.state === 'reverted')) return 'compensated';
  if (refused) return 'refused';
  if (legs.some((leg) => leg.state === 'scheduled')) return 'in_progress';
  if (legs.every(isUndone)) return 'undone';
  return 'applied';
}

/** A leg with no direction waits like a decrease and holds back the legs before it like an
 *  increase: the contract puts every decrease first, so the order still holds. */
function legUndo(leg: LegFacts, legs: LegFacts[], state: MoveState): MoveLegUndo {
  if (state !== 'applied' || leg.state !== 'applied' || isUndone(leg)) return 'none';
  if (leg.row.reversible !== true || !leg.row.portfolio_id) return 'none';
  if (leg.direction === 'increase') return 'available';
  const increaseLive = legs.some(
    (other) => other.leg > leg.leg && other.direction !== 'decrease' && !isUndone(other),
  );
  return increaseLive ? 'after_increases' : 'available';
}

function moveReason(state: MoveState, legs: LegFacts[]): string | null {
  if (state === 'applied' || state === 'in_progress' || state === 'undone') return null;
  const failed = legs.find((leg) => leg.state === 'refused');
  if (!failed) return null;
  const platform = PLATFORM_NAMES[failed.platform];
  return failed.error ? `${platform} refused: ${failed.error}` : `${platform} refused the write`;
}

/** One move's rows, any order → the decision. Null when there is nothing to read. */
export function readMoveDecision(rows: OptimizerActionFeedRow[]): MoveDecision | null {
  const moveId = rows.map(readMoveId).find(Boolean);
  if (!moveId) return null;
  const forward = rows.filter((row) => !row.revert_of);
  const revertsOf = new Map(
    rows.filter((row) => row.revert_of).map((row) => [row.revert_of as string, row]),
  );
  const facts = forward
    .map((row) => buildLeg(row, revertsOf.get(row.id)))
    .sort((a, b) => a.leg - b.leg);
  if (facts.length === 0) return null;
  const decreases = facts.filter((leg) => leg.direction === 'decrease');
  const increases = facts.filter((leg) => leg.direction === 'increase');
  const state = moveState(rows, facts);
  const legs = facts.map((leg) => ({ ...leg, undo: legUndo(leg, facts, state) }));
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
