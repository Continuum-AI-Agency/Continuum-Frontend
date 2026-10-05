import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

// Spread the real module: mock.module replaces it for the whole process.
const realOptimizerData = await import('../../useOptimizerData');
let reverts: Array<{ audit_id: string; dryRun?: boolean }> = [];
let revertAnswer: (auditId: string) => { ok: boolean; reason?: string } = () => ({ ok: true });
mock.module('../../useOptimizerData', () => ({
  ...realOptimizerData,
  useRevertApply: () => ({
    mutateAsync: async (request: { audit_id: string; dryRun?: boolean }) => {
      reverts.push(request);
      return revertAnswer(request.audit_id);
    },
  }),
}));

const { MoveDecisionCard } = await import('./MoveDecisionCard');
const { readMoveDecision } = await import('./moveDecisionModel');
const { feedRow, MOVE_ID } = await import('./moveFixtures');

beforeEach(() => {
  reverts = [];
  revertAnswer = () => ({ ok: true });
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
      <MoveDecisionCard brandId="brand-1" currency="MXN" move={move} />
    </ul>,
  );
  return screen.getByTestId('move-decision');
}

describe('MoveDecisionCard', () => {
  it('one Decision, its legs as sub-rows with each platform’s receipt, and Undo both', () => {
    const card = renderMove([googleUp(), tiktokDown()]);
    expect(card.textContent).toContain('Decision');
    expect(card.textContent).toContain('Move 100.00 MXN/day from TikTok to Google');
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
    expect(within(card).getByRole('button', { name: /Undo both/ })).toBeTruthy();
  });

  it('Undo both reverts the increase first, then the decrease, for real', async () => {
    renderMove([googleUp(), tiktokDown()]);
    fireEvent.click(screen.getByRole('button', { name: /Undo both/ }));
    const confirm = await screen.findAllByRole('button', { name: /Undo both/ });
    await act(async () => {
      fireEvent.click(confirm[confirm.length - 1] as HTMLElement);
    });
    await waitFor(() => expect(screen.getByText('Reverted 2 of 2.')).toBeTruthy());
    expect(reverts.map((r) => [r.audit_id, r.dryRun])).toEqual([
      ['leg-1', false],
      ['leg-0', false],
    ]);
  });

  it('Undo stops at the first refusal and says where', async () => {
    revertAnswer = (auditId) =>
      auditId === 'leg-1' ? { ok: false, reason: 'unsupported_scope' } : { ok: true };
    renderMove([googleUp(), tiktokDown()]);
    fireEvent.click(screen.getByRole('button', { name: /Undo both/ }));
    const confirm = await screen.findAllByRole('button', { name: /Undo both/ });
    await act(async () => {
      fireEvent.click(confirm[confirm.length - 1] as HTMLElement);
    });
    await waitFor(() =>
      expect(screen.getByText('Stopped after 0 of 2: unsupported_scope.')).toBeTruthy(),
    );
    expect(reverts.map((r) => r.audit_id)).toEqual(['leg-1']);
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
      'applied, then 900.00 MXN → 1,000.00 MXN reverted',
      'refused: BUDGET_BELOW_PER_DAY_MINIMUM',
    ]);
    expect(within(card).queryByRole('button', { name: /Undo/ })).toBeNull();
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
    expect(explainer).toContain('TikTok is up to 10.68 MXN/day lower and Meta did not go up');
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
    expect(within(card).queryByRole('button', { name: /Undo/ })).toBeNull();
  });
});
