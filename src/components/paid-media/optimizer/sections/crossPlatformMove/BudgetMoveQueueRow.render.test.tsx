import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

// Spread the real module: mock.module replaces it for the whole process.
const realOptimizerData = await import('../../useOptimizerData');
type Sent = {
  portfolio_id: string;
  actions: unknown[];
  dryRun: boolean;
  recommendation_id?: string;
};
let sent: Sent[] = [];
let answerFor: (request: Sent) => unknown = () => null;
mock.module('../../useOptimizerData', () => ({
  ...realOptimizerData,
  useApplyOptimizerActions: () => ({
    mutateAsync: async (request: Sent) => {
      sent.push(request);
      return answerFor(request);
    },
  }),
}));

const { BudgetMoveQueueRow } = await import('./BudgetMoveQueueRow');
const { moveRec, TIKTOK_TO_META } = await import('./moveFixtures');
const { readQueuedMove } = await import('./queuedMoveModel');

const PORTFOLIO_ID = '11111111-1111-4111-8111-111111111111';
const REC_ID = '11111111-2222-4333-8444-555555555555';

const envelope = (status: string, dryRun: boolean, extra: Record<string, unknown> = {}) => ({
  ok: status !== 'refused',
  dryRun,
  results: [{ status, kind: 'budget_move', ...extra }],
});

beforeEach(() => {
  sent = [];
  answerFor = (request) => envelope(request.dryRun ? 'would_apply' : 'applied', request.dryRun);
});
afterEach(cleanup);

function renderRow(
  over: {
    status?: string;
    busy?: boolean;
    writesBlocked?: boolean;
    writesOffNote?: string | null;
    decreaseOnly?: boolean;
  } = {},
) {
  const rec = moveRec({ status: over.status ?? 'pending' });
  const move = readQueuedMove(rec);
  if (!move) throw new Error('fixture must parse');
  const calls: string[] = [];
  render(
    <ul>
      <BudgetMoveQueueRow
        busy={over.busy ?? false}
        move={move}
        onApproveDecreaseOnly={over.decreaseOnly ? () => calls.push('decrease') : undefined}
        onApplied={() => calls.push('applied')}
        onDismiss={() => calls.push('dismiss')}
        portfolioId={PORTFOLIO_ID}
        rec={rec}
        writesBlocked={over.writesBlocked ?? false}
        writesOffNote={over.writesOffNote ?? null}
      />
    </ul>,
  );
  return { calls };
}

describe('BudgetMoveQueueRow', () => {
  it('is ONE row with every leg: chip, entity, before → after, the side percentage, decreases first', () => {
    renderRow();
    const row = screen.getByTestId('budget-move-row');
    expect(row.textContent).toContain('Move 59.25 MXN/day from TikTok to Meta');
    const legs = within(row).getAllByTestId('budget-move-leg');
    expect(legs).toHaveLength(4);
    expect(legs.map((leg) => leg.getAttribute('data-direction'))).toEqual([
      'decrease',
      'decrease',
      'increase',
      'increase',
    ]);
    expect(legs.map((leg) => within(leg).getByTestId('platform-chip').textContent)).toEqual([
      'TikTok',
      'TikTok',
      'Meta',
      'Meta',
    ]);
    expect(legs[0]?.textContent).toContain('EF | Leads | Broad MX');
    expect(legs[0]?.textContent).toContain('400.00 MXN');
    expect(legs[0]?.textContent).toContain('383.07 MXN');
    expect(legs[1]?.textContent).toContain('1,000.00 MXN');
    expect(legs[1]?.textContent).toContain('957.68 MXN');
    // An entity the ref does not name prints its id.
    expect(legs[3]?.textContent).toContain('120252366877000999');
    const pcts = legs.map((leg) => within(leg).getByTestId('move-leg-pct').textContent);
    expect(pcts).toEqual(['−4.23%', '−4.23%', '+25.00%', '+25.00%']);
    expect(screen.getByTestId('budget-move-sides').textContent).toContain(
      'Every TikTok entity here goes down −4.23% (2); every Meta entity goes up +25.00% (2)',
    );
  });

  it('says a person should approve it; the decrease-only path and Dismiss call back', () => {
    const { calls } = renderRow({ decreaseOnly: true });
    expect(
      screen.getByText('We recommend a person approves moves between platforms.'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Approve the decrease only' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(calls).toEqual(['decrease', 'dismiss']);
    expect(screen.queryByTestId('decrease-only-unavailable')).toBeNull();
  });

  it('Approve asks the platforms first (dry run), and only Confirm writes the move', async () => {
    renderRow();
    fireEvent.click(screen.getByRole('button', { name: 'Approve the move' }));
    const dialog = await screen.findByTestId('budget-move-action-dialog');
    expect(within(dialog).getByRole('heading').textContent).toBe(
      'Move $59.25 MXN/day from TikTok to Meta',
    );
    const preview = await within(dialog).findByTestId('budget-move-action-preview');
    expect(preview.getAttribute('data-tone')).toBe('ok');
    expect(sent).toEqual([
      {
        portfolio_id: PORTFOLIO_ID,
        actions: [TIKTOK_TO_META],
        dryRun: true,
        recommendation_id: REC_ID,
      },
    ]);

    const confirm = within(dialog).getByTestId('budget-move-action-confirm') as HTMLButtonElement;
    await waitFor(() => expect(confirm.disabled).toBe(false));
    fireEvent.click(confirm);
    const done = await within(dialog).findByTestId('budget-move-action-result');
    expect(done.textContent).toBe('Done. The change is live and recorded in Activity.');
    expect(sent).toEqual([
      {
        portfolio_id: PORTFOLIO_ID,
        actions: [TIKTOK_TO_META],
        dryRun: true,
        recommendation_id: REC_ID,
      },
      {
        portfolio_id: PORTFOLIO_ID,
        actions: [TIKTOK_TO_META],
        dryRun: false,
        recommendation_id: REC_ID,
      },
    ]);
    expect(within(dialog).queryByTestId('budget-move-action-confirm')).toBeNull();
  });

  it('a move that landed reports it once, so the queue records the decision and stops offering it', async () => {
    const { calls } = renderRow();
    fireEvent.click(screen.getByRole('button', { name: 'Approve the move' }));
    const dialog = await screen.findByTestId('budget-move-action-dialog');
    const confirm = within(dialog).getByTestId('budget-move-action-confirm') as HTMLButtonElement;
    await waitFor(() => expect(confirm.disabled).toBe(false));
    fireEvent.click(confirm);
    await within(dialog).findByTestId('budget-move-action-result');
    expect(calls).toEqual(['applied']);
  });

  it('a live confirm that did not land records nothing: the move stays offered', async () => {
    answerFor = (request) =>
      request.dryRun
        ? envelope('would_apply', true)
        : envelope('compensated', false, { reason: 'write_failed', detail: 'leg 2' });
    const { calls } = renderRow();
    fireEvent.click(screen.getByRole('button', { name: 'Approve the move' }));
    const dialog = await screen.findByTestId('budget-move-action-dialog');
    const confirm = within(dialog).getByTestId('budget-move-action-confirm') as HTMLButtonElement;
    await waitFor(() => expect(confirm.disabled).toBe(false));
    fireEvent.click(confirm);
    await within(dialog).findByTestId('budget-move-action-result');
    expect(calls).toEqual([]);
  });

  it('a refused dry run says why and never offers to confirm', async () => {
    answerFor = (request) =>
      envelope('refused', request.dryRun, { reason: 'apply_disabled', detail: 'google_ads' });
    renderRow();
    fireEvent.click(screen.getByRole('button', { name: 'Approve the move' }));
    const dialog = await screen.findByTestId('budget-move-action-dialog');
    const preview = await within(dialog).findByTestId('budget-move-action-preview');
    expect(preview.getAttribute('data-tone')).toBe('refused');
    expect(preview.textContent).toContain('Nothing was written');
    const confirm = within(dialog).getByTestId('budget-move-action-confirm') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(sent.map((request) => request.dryRun)).toEqual([true]);
  });

  it('with writes switched off for a platform among its legs, there is no Approve, only why', () => {
    const note =
      'This move is a proposal only — writes to Google Ads are switched off for this portfolio.';
    renderRow({ writesOffNote: note, decreaseOnly: true });
    expect(screen.queryByRole('button', { name: /^Approve/ })).toBeNull();
    expect(screen.getByTestId('budget-move-writes-off').textContent).toBe(note);
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeTruthy();
  });

  it('without a decrease-only path the button is there but says it is not available yet', () => {
    const { calls } = renderRow();
    const button = screen.getByRole('button', { name: 'Approve the decrease only' });
    expect(button.hasAttribute('disabled')).toBe(true);
    fireEvent.click(button);
    expect(calls).toEqual([]);
    expect(screen.getByTestId('decrease-only-unavailable').textContent).toContain(
      'not available yet',
    );
  });

  it('observe mode blocks every decision', () => {
    renderRow({ writesBlocked: true, decreaseOnly: true });
    for (const name of ['Approve the move', 'Approve the decrease only', 'Dismiss']) {
      expect(screen.getByRole('button', { name }).hasAttribute('disabled')).toBe(true);
    }
    fireEvent.click(screen.getByRole('button', { name: 'Approve the move' }));
    expect(sent).toEqual([]);
  });

  it('an approved move shows no buttons, only that it waits for its write', () => {
    renderRow({ status: 'approved' });
    expect(screen.queryByRole('button', { name: 'Approve the move' })).toBeNull();
    expect(screen.getByTestId('budget-move-approved').textContent).toContain('decreases first');
  });
});
