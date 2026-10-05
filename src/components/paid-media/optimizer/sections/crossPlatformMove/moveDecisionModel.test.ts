import { describe, expect, test } from 'bun:test';
import { groupActionFeed, type MoveDecision, readMoveDecision } from './moveDecisionModel';
import { feedRow, MOVE_ID } from './moveFixtures';

const tiktokDown = (over: Record<string, unknown> = {}) =>
  feedRow({
    id: 'leg-0',
    move_id: MOVE_ID,
    leg: 0,
    platform: 'tiktok_ads',
    entity_id: '202',
    before: { minor: 100_000 },
    after: { minor: 90_000 },
    receipt: { request_id: 'tt-req-1' },
    outcome: 'applied',
    ...over,
  });
const googleUp = (over: Record<string, unknown> = {}) =>
  feedRow({
    id: 'leg-1',
    move_id: MOVE_ID,
    leg: 1,
    platform: 'google_ads',
    entity_id: '24274603133',
    before: { minor: 70_000 },
    after: { minor: 80_000 },
    receipt: { requestId: 'g-req-1' },
    outcome: 'applied',
    ...over,
  });

function decisionOf(rows: ReturnType<typeof feedRow>[]): MoveDecision {
  const items = groupActionFeed(rows);
  const move = items.find((item) => item.kind === 'move');
  if (!move || move.kind !== 'move') throw new Error('no move item');
  return move.move;
}

describe('groupActionFeed', () => {
  test('a move becomes ONE item where its first leg stood; single writes stay single', () => {
    const single = feedRow({ id: 'single', ts: '2026-10-05T20:00:00Z' });
    const items = groupActionFeed([single, googleUp(), tiktokDown()]);
    expect(items.map((item) => item.kind)).toEqual(['single', 'move']);
    const move = items[1];
    expect(move?.kind === 'move' ? move.move.legs.map((l) => l.leg) : null).toEqual([0, 1]);
  });

  test('rows without a move_id never group, even with the same portfolio and time', () => {
    const items = groupActionFeed([feedRow({ id: 'x' }), feedRow({ id: 'y' })]);
    expect(items.map((item) => item.kind)).toEqual(['single', 'single']);
  });
});

describe('readMoveDecision', () => {
  test('applied: legs in order with their platform receipts, and Undo both', () => {
    const move = decisionOf([googleUp(), tiktokDown()]);
    expect(move.state).toBe('applied');
    expect(move.from).toEqual(['tiktok_ads']);
    expect(move.to).toEqual(['google_ads']);
    expect(move.amountMinor).toBe(10_000);
    expect(move.legs.map((l) => [l.platform, l.receipt, l.state])).toEqual([
      ['tiktok_ads', 'tt-req-1', 'applied'],
      ['google_ads', 'g-req-1', 'applied'],
    ]);
    expect(move.undo).toEqual({
      kind: 'available',
      label: 'Undo both',
      // The increase comes off first, so an undo that stops halfway leaves the client
      // spending less, never more.
      steps: [
        { auditId: 'leg-1', portfolioId: 'p-1' },
        { auditId: 'leg-0', portfolioId: 'p-1' },
      ],
    });
  });

  test('more than two legs undo as "Undo all N"', () => {
    const third = googleUp({ id: 'leg-2', leg: 2, entity_id: 'other' });
    const move = decisionOf([tiktokDown(), googleUp(), third]);
    expect(move.undo.kind === 'available' ? move.undo.label : null).toBe('Undo all 3');
  });

  test('no undo when any applied leg is not reversible on the server', () => {
    const move = decisionOf([tiktokDown({ reversible: false }), googleUp()]);
    expect(move.undo.kind).toBe('none');
  });

  test('compensated: the failed leg says why, the first leg reads applied then reverted', () => {
    const revert = feedRow({
      id: 'leg-0-revert',
      move_id: MOVE_ID,
      leg: 0,
      platform: 'tiktok_ads',
      entity_id: '202',
      before: { minor: 90_000 },
      after: { minor: 100_000 },
      revert_of: 'leg-0',
      actor_kind: 'system',
      outcome: 'applied',
    });
    const move = decisionOf([
      revert,
      googleUp({ outcome: 'failed', error: 'BUDGET_BELOW_PER_DAY_MINIMUM', receipt: null }),
      tiktokDown({ reverted_by: 'leg-0-revert' }),
    ]);
    expect(move.state).toBe('compensated');
    expect(move.reason).toBe('Google refused: BUDGET_BELOW_PER_DAY_MINIMUM');
    expect(move.legs.map((l) => l.state)).toEqual(['reverted', 'refused']);
    expect(move.legs[0]?.revert).toEqual({ beforeMinor: 90_000, afterMinor: 100_000, ok: true });
    expect(move.legs[1]?.error).toBe('BUDGET_BELOW_PER_DAY_MINIMUM');
    expect(move.undo.kind).toBe('none');
  });

  test('stranded: the second leg and its compensation both failed', () => {
    const revert = feedRow({
      id: 'leg-0-revert',
      move_id: MOVE_ID,
      leg: 0,
      platform: 'tiktok_ads',
      before: { minor: 98_932 },
      after: { minor: 100_000 },
      revert_of: 'leg-0',
      outcome: 'failed',
      error: '40001 No permission',
    });
    const meta = feedRow({
      id: 'leg-1',
      move_id: MOVE_ID,
      leg: 1,
      platform: 'meta',
      before: { minor: 4_273 },
      after: { minor: 5_341 },
      outcome: 'failed',
      error: 'OAuthException 190',
    });
    const move = decisionOf([revert, meta, tiktokDown({ after: { minor: 98_932 } })]);
    expect(move.state).toBe('stranded');
    expect(move.legs.map((l) => l.state)).toEqual(['revert_refused', 'refused']);
    expect(move.legs[0]?.revert?.error).toBe('40001 No permission');
    expect(move.undo.kind).toBe('none');
  });

  test('the server’s own move_status wins over what the rows imply', () => {
    const move = decisionOf([tiktokDown({ move_status: 'stranded' }), googleUp()]);
    expect(move.state).toBe('stranded');
  });

  test('a scheduled leg keeps the move in progress', () => {
    const move = decisionOf([tiktokDown({ scheduled: true })]);
    expect(move.state).toBe('in_progress');
    expect(move.legs[0]?.state).toBe('scheduled');
  });

  test('every applied leg already undone reads as undone', () => {
    const move = decisionOf([tiktokDown({ reverted_by: 'u-0' }), googleUp({ reverted_by: 'u-1' })]);
    expect(move.state).toBe('undone');
    expect(move.undo.kind).toBe('reverted');
  });

  test('readMoveDecision is null for rows without a move', () => {
    expect(readMoveDecision([])).toBeNull();
  });
});
