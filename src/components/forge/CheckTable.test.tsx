/**
 * The check table: the footer counts what is failed, warned, running and left to do (and only
 * says every check passed when none are) and offers to open the first problem, a tick bar names
 * its progress, and a row with a detail opens in place while its action stays a separate button.
 */

import { afterEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { type CheckRow, CheckTable, checkSummary, TickBar } from './CheckTable';

afterEach(cleanup);

const rowOf = (name: string): CheckRow => ({
  name,
  what: `Checks ${name}.`,
  state: 'pass',
  result: `${name} is fine`,
});

describe('CheckTable', () => {
  test('the footer counts each state and says all passed only when nothing is left', () => {
    expect(checkSummary([{ state: 'pass' }, { state: 'skipped' }])).toBe('All checks passed');
    expect(
      checkSummary([
        { state: 'fail' },
        { state: 'warn' },
        { state: 'warn' },
        { state: 'running' },
        { state: 'todo' },
        { state: 'todo' },
        { state: 'pass' },
      ]),
    ).toBe('1 failed · 2 warnings · 1 running · 2 to do');
    expect(checkSummary([{ state: 'warn' }, { state: 'todo' }])).toBe('1 warning · 1 to do');

    render(
      <CheckTable
        rows={[
          rowOf('Parse'),
          { ...rowOf('Fonts'), state: 'fail' },
          { ...rowOf('Build'), state: 'todo' },
        ]}
      />,
    );
    const footer = screen.getByRole('status');
    expect(footer.textContent).toBe('1 failed · 1 to do');
    expect(footer.className).toContain('text-destructive');
    // Every row says what it checks and what it found, and carries a named status mark.
    const items = within(screen.getByRole('list', { name: 'Checks' })).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[1]!.textContent).toContain('Checks Fonts.');
    expect(within(items[1]!).getByRole('img', { name: 'Failed' })).toBeTruthy();
    expect(within(items[2]!).getByRole('img', { name: 'Not done' })).toBeTruthy();
  });

  test('a tick bar names how many of its steps are done', () => {
    render(<TickBar ticks={['pass', 'pass', 'fail', 'todo', 'warn', 'pass', 'pass']} />);
    const bar = screen.getByRole('img', { name: '4 of 7 done' });
    expect(bar.children).toHaveLength(7);
    expect(bar.children[2]!.className).toContain('bg-destructive');
    expect(bar.children[3]!.className).toContain('bg-muted-foreground/30');
  });

  test('a row with a detail opens in place; its action is its own button', async () => {
    const act = mock(() => undefined);
    render(
      <CheckTable
        rows={[
          rowOf('Parse'),
          {
            ...rowOf('Fonts'),
            ticks: ['pass', 'fail'],
            detail: <p>Inter · uploaded</p>,
            action: (
              <button type="button" onClick={act}>
                Install
              </button>
            ),
          },
        ]}
      />,
    );
    // A row without a detail has nothing to open.
    expect(screen.queryByRole('button', { name: 'Parse details' })).toBeNull();
    expect(screen.queryByText('Inter · uploaded')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    expect(act).toHaveBeenCalledTimes(1);
    const toggle = screen.getByRole('button', { name: 'Fonts details' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(toggle);
    await waitFor(() => expect(screen.getByText('Inter · uploaded')).toBeTruthy());
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('img', { name: '1 of 2 done' })).toBeTruthy();
  });

  test("the footer's Investigate opens the first failure that has a detail", async () => {
    const { rerender } = render(
      <CheckTable
        rows={[
          { ...rowOf('Parse'), state: 'fail' },
          { ...rowOf('Fonts'), state: 'warn', detail: <p>Inter · not uploaded</p> },
          { ...rowOf('Build'), state: 'fail', detail: <p>Spec did not validate</p> },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Investigate' }));
    await waitFor(() => expect(screen.getByText('Spec did not validate')).toBeTruthy());
    const build = screen.getByRole('button', { name: 'Build details' });
    expect(build.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(build);
    expect(
      screen.getByRole('button', { name: 'Fonts details' }).getAttribute('aria-expanded'),
    ).toBe('false');

    // Nothing to investigate once every problem is gone; a passed table offers no button.
    rerender(<CheckTable rows={[rowOf('Parse'), { ...rowOf('Build'), detail: <p>ok</p> }]} />);
    expect(screen.queryAllByRole('button', { name: 'Investigate' })).toHaveLength(0);
    expect(screen.getByRole('status').textContent).toBe('All checks passed');
  });
});
