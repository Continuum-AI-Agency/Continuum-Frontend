import { afterEach, describe, expect, it } from 'bun:test';
import { DEFAULT_AUTOPILOT_SCOPES } from '@continuum/contracts';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { OptimizerRpcError } from '../useOptimizerData';
import { AutopilotScopesField } from './AutopilotScopesField';

afterEach(cleanup);

describe('AutopilotScopesField', () => {
  it('renders the scopes with the defaults and reports a toggle as a partial patch', () => {
    const changes: Array<[string, boolean]> = [];
    const { container, getByRole } = render(
      <AutopilotScopesField
        noActor={false}
        onChange={(scope, enabled) => {
          changes.push([scope, enabled]);
        }}
        portfolioId="p1"
        savingScope={null}
        scopes={null}
      />,
    );
    const text = container.textContent ?? '';
    expect(text).toContain('Budget moves');
    expect(text).toContain('Creative rotation');
    expect(text).toContain('Replace an audience');
    expect(text).toContain('Add an audience');
    expect(text).toContain('Flash creatives');
    expect(text).toContain('created paused');
    const budget = getByRole('switch', { name: 'Budget moves' });
    expect(budget.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(getByRole('switch', { name: 'Flash creatives' }));
    expect(changes).toEqual([['new_creatives', true]]);
  });

  it('shows Move budget between platforms OFF by default, with the recommendation', () => {
    const { container, getByRole, getByTestId } = render(
      <AutopilotScopesField
        noActor={false}
        onChange={() => undefined}
        portfolioId="p1"
        savingScope={null}
        scopes={DEFAULT_AUTOPILOT_SCOPES}
      />,
    );
    const move = getByRole('switch', { name: 'Move budget between platforms' });
    expect(move.getAttribute('aria-checked')).toBe('false');
    expect(getByTestId('budget-move-recommendation').textContent).toBe(
      'We recommend a person approves moves between platforms.',
    );
    expect(container.textContent).not.toContain('not available yet');
  });

  it('reads a stored budget_move: true as ON', () => {
    const { getByRole } = render(
      <AutopilotScopesField
        noActor={false}
        onChange={() => undefined}
        portfolioId="p1"
        savingScope={null}
        scopes={{ ...DEFAULT_AUTOPILOT_SCOPES, budget_move: true }}
      />,
    );
    expect(
      getByRole('switch', { name: 'Move budget between platforms' }).getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('says "not available yet" when the backend rejects the key, and offers it no more', async () => {
    const calls: string[] = [];
    const { getByRole, getByTestId } = render(
      <AutopilotScopesField
        noActor={false}
        onChange={(scope) => {
          calls.push(scope);
          // optimizer.autopilot_scopes' check before 20261005120000: a sixth key is a
          // check_violation, and the RPC rolls the whole patch back.
          return Promise.reject(new OptimizerRpcError('Could not update the portfolio.', '23514'));
        }}
        portfolioId="p1"
        savingScope={null}
        scopes={DEFAULT_AUTOPILOT_SCOPES}
      />,
    );
    const move = getByRole('switch', { name: 'Move budget between platforms' });
    await act(async () => {
      fireEvent.click(move);
    });
    await waitFor(() =>
      expect(getByTestId('budget-move-unavailable').textContent).toContain('not available yet'),
    );
    expect(move.getAttribute('aria-checked')).toBe('false');
    expect(
      move.hasAttribute('data-disabled') || move.getAttribute('aria-disabled') === 'true',
    ).toBe(true);
    expect(calls).toEqual(['budget_move']);
  });

  it('any other failure is not dressed as "not available yet"', async () => {
    const { container, getByRole } = render(
      <AutopilotScopesField
        noActor={false}
        onChange={() => Promise.reject(new OptimizerRpcError('offline', null))}
        portfolioId="p1"
        savingScope={null}
        scopes={DEFAULT_AUTOPILOT_SCOPES}
      />,
    );
    await act(async () => {
      fireEvent.click(getByRole('switch', { name: 'Move budget between platforms' }));
    });
    expect(container.textContent).not.toContain('not available yet');
  });

  it('warns when nobody is recorded as the approver', () => {
    const { container } = render(
      <AutopilotScopesField
        noActor
        onChange={() => undefined}
        portfolioId="p1"
        savingScope={null}
        scopes={null}
      />,
    );
    expect(container.textContent).toContain('needs a person to act as');
  });
});
