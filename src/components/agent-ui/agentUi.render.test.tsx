import { afterEach, describe, expect, it, mock } from 'bun:test';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { render } from '@/i18n/__tests__/render';
import { AgentRecap } from './AgentRecap';
import { AgentSteering } from './AgentSteering';
import { AwaySummary } from './AwaySummary';
import { ContextMap } from './ContextMap';
import { CostWaterfall } from './CostWaterfall';
import { JudgeBracket } from './JudgeBracket';
import type { Attempt, RecapItem, RunSpan } from './model';
import { ParallelAttempts } from './ParallelAttempts';
import { TraceWaterfall } from './TraceWaterfall';

afterEach(cleanup);

const spans: RunSpan[] = [
  { id: 'root', kind: 'agent', name: 'Orchestrator', startMs: 0, endMs: 9000, status: 'ok' },
  {
    id: 'plan',
    parentId: 'root',
    kind: 'llm',
    name: 'Plan the brief',
    detail: 'opus',
    startMs: 0,
    endMs: 2000,
    tokens: 900,
    costUsd: 0.3,
    status: 'ok',
  },
  {
    id: 'meta',
    parentId: 'root',
    kind: 'tool',
    name: 'Fetch Meta insights',
    startMs: 2000,
    endMs: 8000,
    tokens: 4000,
    costUsd: 0.05,
    status: 'ok',
  },
];

describe('TraceWaterfall', () => {
  it('folds a branch away and back, keeping its rolled-up cost', () => {
    render(<TraceWaterfall spans={spans} />);
    expect(screen.getByText('Fetch Meta insights')).toBeTruthy();
    const orchestrator = screen.getByText('Orchestrator').closest('tr') as HTMLElement;
    expect(within(orchestrator).getByText('$0.35')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Collapse Orchestrator' }));
    expect(screen.queryByText('Fetch Meta insights')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Expand Orchestrator' }));
    expect(screen.getByText('Fetch Meta insights')).toBeTruthy();
  });

  it('marks the slowest finished call', () => {
    render(<TraceWaterfall spans={spans} />);
    const slow = screen.getByText('Fetch Meta insights').closest('tr') as HTMLElement;
    expect(within(slow).getByText('Slowest')).toBeTruthy();
  });

  it('says so when the run has no steps', () => {
    render(<TraceWaterfall spans={[]} />);
    expect(screen.getByText('No steps yet.')).toBeTruthy();
  });
});

describe('CostWaterfall', () => {
  const order = () =>
    within(screen.getByRole('list'))
      .getAllByRole('listitem')
      .map((li) => li.textContent);

  it('ranks by cost, then by tokens on the switch', () => {
    render(<CostWaterfall spans={spans} />);
    expect(order()[0]).toContain('Plan the brief');
    fireEvent.click(screen.getByRole('button', { name: 'Tokens' }));
    expect(order()[0]).toContain('Fetch Meta insights');
  });
});

describe('ContextMap', () => {
  it('shows what is used and what is free', () => {
    render(
      <ContextMap
        maxTokens={1000}
        parts={[
          { id: 's', kind: 'system', label: 'System prompt', tokens: 300 },
          { id: 'h', kind: 'history', label: 'Chat', tokens: 200 },
        ]}
      />,
    );
    expect(screen.getByText(/of 1K tokens · 50%/)).toBeTruthy();
    expect(screen.getByText('500 free')).toBeTruthy();
  });

  it('warns once the window overflows', () => {
    render(
      <ContextMap
        maxTokens={100}
        parts={[{ id: 'h', kind: 'history', label: 'Chat', tokens: 150 }]}
      />,
    );
    expect(screen.getByText(/over the window/)).toBeTruthy();
    expect(screen.queryByText(/free$/)).toBeNull();
  });
});

describe('ParallelAttempts', () => {
  const attempts: Attempt[] = [
    { id: 'a', label: 'Bold hook', status: 'done', score: 0.62 },
    { id: 'b', label: 'Founder story', status: 'done', score: 0.88 },
    { id: 'c', label: 'UGC cut', status: 'running', progress: 0.4 },
    { id: 'd', label: 'Price led', status: 'failed', error: 'Render timed out' },
  ];

  it('picks the best by default and lets another finished attempt be picked', () => {
    const onPick = mock();
    render(<ParallelAttempts attempts={attempts} onPick={onPick} />);
    const best = screen.getByRole('button', { name: /Founder story/ });
    expect(best.getAttribute('aria-pressed')).toBe('true');
    expect(within(best).getByText('Best')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Bold hook/ }));
    expect(onPick).toHaveBeenCalledWith(attempts[0]);
    expect(screen.getByRole('button', { name: /Bold hook/ }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('never lets a running or failed attempt be picked', () => {
    render(<ParallelAttempts attempts={attempts} />);
    expect((screen.getByRole('button', { name: /UGC cut/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((screen.getByRole('button', { name: /Price led/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByText('Render timed out')).toBeTruthy();
  });
});

describe('JudgeBracket', () => {
  const entrants = ['a', 'b', 'c', 'd'].map((id) => ({ id, label: `Clip ${id.toUpperCase()}` }));

  it('opens the match being judged, then any match chosen', () => {
    render(
      <JudgeBracket
        entrants={entrants}
        rounds={[
          [
            {
              a: 'a',
              b: 'b',
              winner: 'a',
              reason: 'A lands the hook in one second.',
              scores: { a: 8.1, b: 6.2 },
            },
            { a: 'c', b: 'd' },
          ],
        ]}
      />,
    );
    expect(screen.getByText('The judge is comparing…')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Semifinal: Clip A against Clip B' }));
    expect(screen.getByText('A lands the hook in one second.')).toBeTruthy();
  });

  it('crowns the champion once the final is decided', () => {
    render(
      <JudgeBracket
        entrants={entrants.slice(0, 2)}
        rounds={[[{ a: 'a', b: 'b', winner: 'b', reason: 'B is clearer.' }]]}
      />,
    );
    const final = screen.getByRole('button', { name: 'Final: Clip A against Clip B' });
    expect(final.getAttribute('data-on-path')).toBe('true');
    expect(screen.getByText('B is clearer.')).toBeTruthy();
  });
});

const since = Date.parse('2026-11-09T00:00:00Z');
const until = since + 9 * 3_600_000;
const recap: RecapItem[] = [
  { id: '1', at: since + 3_600_000, tone: 'done', title: 'Paused 2 ad sets' },
  {
    id: '2',
    at: since + 7_200_000,
    tone: 'needs',
    title: 'Raise budget 20%',
    actionLabel: 'Approve',
  },
  {
    id: '3',
    at: since + 8_000_000,
    tone: 'failed',
    title: 'Google sync failed',
    actionLabel: 'Retry',
  },
];

describe('AgentRecap', () => {
  it('tallies the window and handles an item in place', () => {
    const onAction = mock();
    render(<AgentRecap since={since} until={until} items={recap} onAction={onAction} />);
    expect(screen.getByText('9h 0m')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
    expect(onAction).toHaveBeenCalledWith(recap[1]);
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.getByLabelText('Handled')).toBeTruthy();
  });
});

describe('AwaySummary', () => {
  it('folds into a divider on Got it and opens again from it', async () => {
    const onDismiss = mock();
    render(<AwaySummary since={since} now={until} items={recap} onDismiss={onDismiss} />);
    expect(screen.getByRole('region', { name: 'While you were away' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    const divider = await screen.findByRole('button', {
      name: /While you were away · 1 needs you · 1 failed · 1 done/,
    });

    fireEvent.click(divider);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Got it' })).toBeTruthy());
  });

  it('lists what needs you first', () => {
    render(<AwaySummary since={since} now={until} items={recap} onAction={() => {}} />);
    const rows = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(rows[0].textContent).toContain('Raise budget 20%');
    expect(rows[2].textContent).toContain('Paused 2 ad sets');
  });

  it('renders nothing when nothing happened', () => {
    const { container } = render(<AwaySummary since={since} now={until} items={[]} />);
    expect(container.textContent).toBe('');
  });
});

describe('AgentSteering', () => {
  const steps = [
    { id: 's1', label: 'Pull last week', status: 'done' as const },
    { id: 's2', label: 'Compare channels', status: 'running' as const },
  ];

  it('queues a trimmed note, clears the field and interrupts on demand', () => {
    const onQueue = mock();
    const onInterrupt = mock();
    render(
      <AgentSteering
        steps={steps}
        queued={[]}
        running
        onQueue={onQueue}
        onInterrupt={onInterrupt}
      />,
    );
    const field = screen.getByLabelText('Note for the agent') as HTMLInputElement;

    fireEvent.change(field, { target: { value: '  Skip TikTok  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Queue' }));
    expect(onQueue).toHaveBeenCalledWith('Skip TikTok');
    expect(field.value).toBe('');

    fireEvent.click(screen.getByRole('button', { name: 'Interrupt' }));
    expect(onInterrupt).toHaveBeenCalledTimes(1);
  });

  it('shows queued notes with a remove, and picked-up notes inside the plan', () => {
    const onRemove = mock();
    const note = { id: 'n1', text: 'Skip TikTok' };
    render(
      <AgentSteering
        steps={[...steps, { id: 'n0', label: 'Use EUR', status: 'pending', fromNote: true }]}
        queued={[note]}
        running
        onQueue={() => {}}
        onRemove={onRemove}
      />,
    );
    expect(within(screen.getByRole('list', { name: 'Plan' })).getByText('Your note')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Remove note: Skip TikTok' }));
    expect(onRemove).toHaveBeenCalledWith(note);
  });

  it('cannot be steered when the agent is not running', () => {
    const onQueue = mock();
    render(<AgentSteering steps={steps} queued={[]} running={false} onQueue={onQueue} />);
    expect((screen.getByLabelText('Note for the agent') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Queue' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
