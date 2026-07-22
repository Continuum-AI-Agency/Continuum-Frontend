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

  it('distinguishes an unconfigured service from a skip, and absolves the user', () => {
    renderOutcome({ status: 'unavailable', kind: 'not_configured' });
    const text = screen.getByRole('status').textContent ?? '';
    expect(text).toContain("isn't running for this account yet");
    expect(text).toContain('Nothing is wrong with your setup');
  });

  it('names contract drift as something logged, not as an outage', () => {
    renderOutcome({ status: 'unavailable', kind: 'malformed' });
    const text = screen.getByRole('status').textContent ?? '';
    expect(text).toContain("we've logged it");
    expect(text).toContain('Check the Logs tab');
  });

  // Deployment topology is ours, not the reader's. A media buyer has no local
  // stack, no edge functions and no "environment" — seeing those words reads as
  // a broken product rather than a feature that has not switched on for them.
  it.each([
    ['not_configured'],
    ['timeout'],
    ['malformed'],
    ['unknown'],
  ] as const)('keeps engineering vocabulary out of the %s message', (kind) => {
    renderOutcome({ status: 'unavailable', kind } as never);
    const text = (screen.getByRole('status').textContent ?? '').toLowerCase();
    for (const term of ['local stack', 'edge function', 'this environment', 'wired up']) {
      expect(text).not.toContain(term);
    }
  });

  // A failure in a tool that spends money has to answer "did anything change?".
  // When the request never reached the service, it did not, and saying so is the
  // reassurance the reader needs.
  it('reassures that budgets are untouched when the request never reached the service', () => {
    renderOutcome({ status: 'unavailable', kind: 'unknown' } as never);
    expect((screen.getByRole('status').textContent ?? '').toLowerCase()).toContain('untouched');
  });

  // A TIMEOUT is the one path where we genuinely do not know: the cycle may still
  // be completing server-side, and on an autopilot portfolio it could still write.
  // Claiming safety here would be the most expensive kind of wrong, so the message
  // must send the reader to the record instead of guessing on their behalf.
  it('makes no budget-safety claim on a timeout, and points at the record instead', () => {
    renderOutcome({ status: 'unavailable', kind: 'timeout' } as never);
    const text = (screen.getByRole('status').textContent ?? '').toLowerCase();
    expect(text).not.toContain('untouched');
    expect(text).not.toContain('no budgets were changed');
    expect(text).not.toContain('nothing was changed');
    expect(text).toContain('logs');
  });

  it('shows a busy state while the cycle is running', () => {
    renderOutcome(undefined, true);
    expect(screen.getByRole('status').textContent).toContain('Running a cycle');
  });
});
