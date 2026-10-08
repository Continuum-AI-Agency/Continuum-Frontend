import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { BudgetMoveQueueRow } from './BudgetMoveQueueRow';
import { moveRec } from './moveFixtures';
import { readQueuedMove } from './queuedMoveModel';

afterEach(cleanup);

function renderRow(
  over: { status?: string; busy?: boolean; writesBlocked?: boolean; decreaseOnly?: boolean } = {},
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
        onApproveMove={() => calls.push('move')}
        onDismiss={() => calls.push('dismiss')}
        rec={rec}
        writesBlocked={over.writesBlocked ?? false}
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

  it('says a person should approve it, and offers the three decisions', () => {
    const { calls } = renderRow({ decreaseOnly: true });
    expect(
      screen.getByText('We recommend a person approves moves between platforms.'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Approve the move' }));
    fireEvent.click(screen.getByRole('button', { name: 'Approve the decrease only' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(calls).toEqual(['move', 'decrease', 'dismiss']);
    expect(screen.queryByTestId('decrease-only-unavailable')).toBeNull();
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
  });

  it('an approved move shows no buttons, only that it waits for its write', () => {
    renderRow({ status: 'approved' });
    expect(screen.queryByRole('button', { name: 'Approve the move' })).toBeNull();
    expect(screen.getByTestId('budget-move-approved').textContent).toContain('decreases first');
  });
});
