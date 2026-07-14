import { afterEach, describe, expect, it } from 'bun:test';
import { cleanup, render, screen } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

import type { RunCycleOutcome } from '../useOptimizerData';
import { RunOutcomeNotice } from './RunOutcomeNotice';

afterEach(cleanup);

const RUN = {
  portfolioId: '11111111-1111-4111-8111-111111111111',
  runId: '22222222-2222-4222-8222-222222222222',
  snapshotCount: 12,
  recommendations: 3,
  applied: 0,
  failed: 0,
  deduped: 0,
  stubbed: 0,
  held: 0,
};

function renderOutcome(outcome: RunCycleOutcome | undefined, isPending = false) {
  return render(<RunOutcomeNotice outcome={outcome} isPending={isPending} />);
}

describe('RunOutcomeNotice', () => {
  it('renders nothing before a run has been attempted', () => {
    const { container } = renderOutcome(undefined);
    expect(container.innerHTML).toBe('');
  });

  it('reports a real cycle with its counts', () => {
    renderOutcome({ status: 'ran', run: RUN });
    expect(screen.getByRole('status').textContent).toContain(
      'Cycle complete — scored 12 ad sets, 3 recommendations.',
    );
  });

  it('surfaces applied and held changes when there are any', () => {
    renderOutcome({ status: 'ran', run: { ...RUN, applied: 2, held: 1 } });
    const text = screen.getByRole('status').textContent ?? '';
    expect(text).toContain('2 budget changes applied.');
    expect(text).toContain('1 held for your approval.');
  });

  // The regression. Every one of these used to render "Optimizer service not live yet" —
  // a sentence that was false in all three cases, and most damagingly on a cycle that ran.
  it.each([
    ['no_adsets', 'no ad sets are enrolled'],
    ['no_snapshots', 'no live Meta data'],
  ] as const)('explains a %s skip as actionable, not as an outage', (reason, expected) => {
    renderOutcome({ status: 'skipped', reason, run: { ...RUN, runId: null, skipped: reason } });
    const text = screen.getByRole('status').textContent ?? '';
    expect(text).toContain(expected);
    expect(text).not.toContain('not live yet');
  });

  it('never claims the service is offline for a cycle that actually ran', () => {
    renderOutcome({ status: 'ran', run: RUN });
    expect(screen.getByRole('status').textContent).not.toContain('not live yet');
  });

  it('distinguishes an unconfigured service from a skip', () => {
    renderOutcome({ status: 'unavailable', kind: 'not_configured' });
    expect(screen.getByRole('status').textContent).toContain("isn't wired up for this environment");
  });

  it('names contract drift as a bug rather than an outage', () => {
    renderOutcome({ status: 'unavailable', kind: 'malformed' });
    expect(screen.getByRole('status').textContent).toContain('this is a bug and has been logged');
  });

  it('shows a busy state while the cycle is running', () => {
    renderOutcome(undefined, true);
    expect(screen.getByRole('status').textContent).toContain('Running a cycle');
  });
});
