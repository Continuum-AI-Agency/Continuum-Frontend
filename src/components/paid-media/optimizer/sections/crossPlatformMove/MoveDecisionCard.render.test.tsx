import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

// Spread the real module: mock.module replaces it for the whole process.
const realOptimizerData = await import('../../useOptimizerData');
type UndoSent = { portfolio_id: string; audit_id: string; dryRun?: boolean };
let undoSent: UndoSent[] = [];
// optimizer-apply-action-revert's envelope (contracts action-revert.ts), as the service answers.
const undoEnvelope = (request: UndoSent) => {
  const status = request.dryRun ? 'would_revert' : 'reverted';
  return {
    ok: true,
    dryRun: request.dryRun ?? true,
    runId: '0c0c0c0c-0000-4000-8000-000000000001',
    result: {
      status,
      audit_id: request.audit_id,
      revert_audit_id: null,
      kind: 'set_budget',
      ref: null,
      restores: { minor: 70_000, currency: 'MXN' },
    },
  };
};
mock.module('../../useOptimizerData', () => ({
  ...realOptimizerData,
  useRevertOptimizerAction: () => ({
    mutateAsync: async (request: UndoSent) => {
      undoSent.push(request);
      return undoEnvelope(request);
    },
  }),
}));

const { MoveDecisionCard } = await import('./MoveDecisionCard');
const { groupActionFeed, readMoveDecision } = await import('./moveDecisionModel');
const { feedRow, MOVE_ID } = await import('./moveFixtures');

beforeEach(() => {
  undoSent = [];
});
afterEach(cleanup);

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

function renderMove(rows: ReturnType<typeof feedRow>[]) {
  const move = readMoveDecision(rows);
  if (!move) throw new Error('rows must make a move');
  render(
    <ul>
      <MoveDecisionCard currency="MXN" move={move} />
    </ul>,
  );
  return screen.getByTestId('move-decision');
}

describe('MoveDecisionCard', () => {
  it('one Decision, its legs as sub-rows with each platform’s receipt', () => {
    const card = renderMove([googleUp(), tiktokDown()]);
    expect(card.textContent).toContain('Decision');
    expect(card.textContent).toContain('Move $100.00 MXN/day from TikTok to Google');
    expect(card.textContent).toContain('Leads // All platforms');
    expect(within(card).getByTestId('move-state').textContent).toBe('applied');
    const legs = within(card).getAllByTestId('move-decision-leg');
    expect(legs.map((leg) => leg.getAttribute('data-platform'))).toEqual([
      'tiktok_ads',
      'google_ads',
    ]);
    expect(legs[0]?.textContent).toContain('1,000.00 MXN');
    expect(legs[0]?.textContent).toContain('900.00 MXN');
    expect(within(legs[0] as HTMLElement).getByTestId('receipt-token').textContent).toContain(
      'tt-req-1',
    );
    expect(within(legs[1] as HTMLElement).getByTestId('receipt-token').textContent).toContain(
      'g-req-1',
    );
  });

  it('Meta → Google from the feed: ONE card, both legs, the increase undone before the decrease', async () => {
    const metaDown = (over: Record<string, unknown> = {}) =>
      feedRow({
        id: 'leg-1',
        move_id: MOVE_ID,
        leg: 1,
        platform: 'meta',
        entity_id: '120252366877000236',
        before: { minor: 50_000 },
        after: { minor: 40_000 },
        outcome: 'applied',
        ...over,
      });
    const googleIncrease = (over: Record<string, unknown> = {}) =>
      feedRow({
        id: 'leg-2',
        move_id: MOVE_ID,
        leg: 2,
        platform: 'google_ads',
        entity_id: '24274603133',
        before: { minor: 70_000 },
        after: { minor: 80_000 },
        outcome: 'applied',
        ...over,
      });
    const cardFor = (rows: ReturnType<typeof feedRow>[]) => {
      const items = groupActionFeed(rows);
      expect(items).toHaveLength(1);
      const [item] = items;
      if (item?.kind !== 'move') throw new Error('the legs must fold into one move');
      return (
        <ul>
          <MoveDecisionCard currency="MXN" move={item.move} />
        </ul>
      );
    };
    const legsNow = () =>
      within(screen.getByTestId('move-decision')).getAllByTestId('move-decision-leg');

    const { rerender } = render(cardFor([googleIncrease(), metaDown()]));
    expect(screen.getAllByTestId('move-decision')).toHaveLength(1);
    const [meta, google] = legsNow() as [HTMLElement, HTMLElement];
    expect(meta.getAttribute('data-platform')).toBe('meta');
    expect(meta.textContent).toContain('120252366877000236');
    expect(meta.textContent).toContain('$500.00 MXN');
    expect(meta.textContent).toContain('$400.00 MXN');
    expect(google.getAttribute('data-platform')).toBe('google_ads');
    expect(google.textContent).toContain('24274603133');
    expect(google.textContent).toContain('$700.00 MXN');
    expect(google.textContent).toContain('$800.00 MXN');
    // The decrease waits; only the increase can be undone.
    expect(within(meta).queryByTestId('activity-platform-undo')).toBeNull();
    expect(within(meta).getByTestId('move-leg-undo-waiting').textContent).toBe(
      'Undo after the increase',
    );

    fireEvent.click(within(google).getByTestId('activity-platform-undo'));
    const dialog = await screen.findByTestId('activity-platform-undo-dialog');
    const confirm = within(dialog).getByTestId(
      'activity-platform-undo-confirm',
    ) as HTMLButtonElement;
    await waitFor(() => expect(confirm.disabled).toBe(false));
    await act(async () => {
      fireEvent.click(confirm);
    });
    await within(dialog).findByTestId('platform-card-undo-result');
    // optimizer-apply-action-revert for the increase's own audit: checked first, then written.
    expect(undoSent).toEqual([
      { portfolio_id: 'p-1', audit_id: 'leg-2', dryRun: true },
      { portfolio_id: 'p-1', audit_id: 'leg-2', dryRun: false },
    ]);

    // The feed re-reads the increase as undone. Its dialog stays up with the result (G4), and
    // only now is the decrease offered.
    rerender(cardFor([googleIncrease({ reverted_by: 'undo-2' }), metaDown()]));
    expect(screen.getByTestId('platform-card-undo-result')).toBeTruthy();
    const [metaAfter] = legsNow() as [HTMLElement];
    expect(within(metaAfter).getByTestId('activity-platform-undo')).toBeTruthy();
    expect(within(metaAfter).queryByTestId('move-leg-undo-waiting')).toBeNull();
  });

  it('compensated: reverted automatically, with the reason, and no undo', () => {
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
    const card = renderMove([
      revert,
      googleUp({ outcome: 'failed', error: 'BUDGET_BELOW_PER_DAY_MINIMUM', receipt: null }),
      tiktokDown({ reverted_by: 'leg-0-revert' }),
    ]);
    expect(within(card).getByTestId('move-state').textContent).toBe('reverted automatically');
    expect(within(card).getByTestId('move-explainer').textContent).toContain(
      'Google refused: BUDGET_BELOW_PER_DAY_MINIMUM',
    );
    const states = within(card)
      .getAllByTestId('move-leg-state')
      .map((el) => el.textContent);
    expect(states).toEqual([
      'applied, then $900.00 MXN → $1,000.00 MXN reverted',
      'refused: BUDGET_BELOW_PER_DAY_MINIMUM',
    ]);
    expect(within(card).queryByRole('button', { name: /Undo/ })).toBeNull();
    expect(within(card).queryByTestId('move-leg-undo-waiting')).toBeNull();
  });

  it('stranded: stuck — autopilot paused, both refusals named, no undo', () => {
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
      entity_id: '120252366877000236',
      before: { minor: 4_273 },
      after: { minor: 5_341 },
      outcome: 'failed',
      error: 'OAuthException 190',
    });
    const card = renderMove([revert, meta, tiktokDown({ after: { minor: 98_932 } })]);
    expect(card.getAttribute('data-move-state')).toBe('stranded');
    expect(within(card).getByTestId('move-state').textContent).toBe('stuck — autopilot paused');
    const explainer = within(card).getByTestId('move-explainer').textContent ?? '';
    expect(explainer).toContain('Meta refused: OAuthException 190');
    expect(explainer).toContain('TikTok is up to $10.68 MXN/day lower and Meta did not go up');
    expect(explainer).toContain('Autopilot is paused on this portfolio until someone checks it.');
    const states = within(card)
      .getAllByTestId('move-leg-state')
      .map((el) => el.textContent);
    expect(states).toEqual([
      'applied; the revert was refused: 40001 No permission',
      'refused: OAuthException 190',
    ]);
    expect(within(card).queryByRole('button', { name: /Undo/ })).toBeNull();
  });

  it('a scheduled leg reads as scheduled and the move as in progress', () => {
    const card = renderMove([tiktokDown({ scheduled: true })]);
    expect(within(card).getByTestId('move-state').textContent).toBe('in progress');
    expect(within(card).getByTestId('move-leg-state').textContent).toContain('scheduled');
  });

  it('a move already undone says so and offers nothing', () => {
    const card = renderMove([tiktokDown({ reverted_by: 'u-0' }), googleUp({ reverted_by: 'u-1' })]);
    expect(within(card).getByTestId('move-state').textContent).toBe('undone');
    expect(
      within(card)
        .getAllByTestId('move-leg-state')
        .map((el) => el.textContent),
    ).toEqual(['applied, then undone', 'applied, then undone']);
    expect(within(card).queryByRole('button', { name: /Undo/ })).toBeNull();
  });
});
