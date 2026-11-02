import { afterEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { AppliedWriteRow, BudgetWritePreview, type BudgetWritePreviewProps } from './WritePreview';
import { guardrailChecks } from './writePreviewModel';

afterEach(cleanup);

// Easy Fit's "Leads // Google Ads only" move, as the cycle proposes it (G12's example).
const MOVES: BudgetWritePreviewProps['moves'] = [
  {
    key: 'budget:pmax',
    entityId: '22357506300',
    name: 'PMax | Octubre | Easy Fit | Leads',
    before: 320,
    after: 400,
  },
  {
    key: 'budget:search',
    entityId: '22357506301',
    name: 'Search | Octubre | Easy Fit',
    before: 350,
    after: 270,
  },
];

const CHECKS = guardrailChecks({
  portfolio: {
    apply_mode: 'recommend',
    max_change_pct_per_cycle: 0.3,
    max_daily_apply_minor: 130_000,
    daily_total: 670,
  },
  moves: [{ change_pct: 0.25 }, { change_pct: -0.23 }],
  currency: 'MXN',
});

function preview(over: Partial<BudgetWritePreviewProps> = {}) {
  const onApprove = mock((_keys: string[]) => {});
  const onApply = mock(() => {});
  const view = render(
    <BudgetWritePreview
      busy={false}
      checks={CHECKS}
      currency="MXN"
      moves={MOVES}
      now={new Date('2026-11-02T15:00:00Z')}
      onApply={onApply}
      onApprove={onApprove}
      platforms={['google_ads']}
      state={{ kind: 'approve', keys: ['budget:pmax', 'budget:search'], approved: 0 }}
      writesBlocked={false}
      {...over}
    />,
  );
  return { ...view, onApprove, onApply };
}

describe('BudgetWritePreview', () => {
  it('draws each budget before → after with both figures and the change written beside the bars', () => {
    preview();
    const bars = screen.getAllByTestId('write-bar');
    expect(bars.map((bar) => bar.textContent)).toEqual([
      'PMax | Octubre | Easy Fit | Leads$320 MXN$400 MXN+25%',
      'Search | Octubre | Easy Fit$350 MXN$270 MXN-23%',
    ]);
    expect(bars.map((bar) => bar.getAttribute('data-direction'))).toEqual(['up', 'down']);
    // The raw id rides on hover; the name is what a person reads.
    expect(within(bars[0] as HTMLElement).getByTitle('22357506300').textContent).toBe(
      'PMax | Octubre | Easy Fit | Leads',
    );
    // Two thin bars per entity, on one scale: 400 is the full length. The after bar grows out
    // of the before one, so its target length is read off the data, not mid-spring.
    const first = within(bars[0] as HTMLElement);
    expect(first.getByTestId('write-bar-before').getAttribute('data-pct')).toBe('80');
    const after = first.getByTestId('write-bar-after');
    expect(after.getAttribute('data-pct')).toBe('100');
    expect(after.className).toContain('rounded-full');
    expect(screen.getByTestId('write-net').textContent).toBe('Net $0.00 MXN/day');
  });

  it('reads the guardrails as a checklist, each with its state and what it found', () => {
    preview();
    const checks = within(screen.getByTestId('write-checks')).getAllByRole('listitem');
    expect(
      checks.map((check) => [check.getAttribute('data-check'), check.getAttribute('data-state')]),
    ).toEqual([
      ['max_change', 'pass'],
      ['daily_cap', 'pass'],
      ['created_paused', 'pass'],
      ['undo', 'pass'],
    ]);
    expect(checks.map((check) => check.textContent)).toEqual([
      'Max 30% per cycleEvery move is inside it',
      'Max $1,300 MXN/day appliedThe daily total, $670 MXN, is inside it',
      'New objects are created PAUSEDThese moves change budgets and create nothing',
      'Undo the same dayRecently applied puts the prior budget back in one click',
    ]);
  });

  it('approves the moves waiting on a person through the handler it is given', () => {
    const { onApprove } = preview();
    fireEvent.click(screen.getByRole('button', { name: 'Approve 2 moves' }));
    expect(onApprove.mock.calls).toEqual([[['budget:pmax', 'budget:search']]]);
  });

  it('holds Approve in observe mode and says why', () => {
    const { onApprove } = preview({
      writesBlocked: true,
      blockedReason: 'Observe mode writes nothing.',
    });
    const approve = screen.getByRole('button', { name: 'Approve 2 moves' }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    expect(screen.getByTestId('write-state').textContent).toContain('Observe mode writes nothing.');
    fireEvent.click(approve);
    expect(onApprove).not.toHaveBeenCalled();
  });

  it('once approved, says it is queued and offers Apply, the write the queue confirms', () => {
    const { onApply } = preview({ state: { kind: 'queued', count: 2 } });
    expect(screen.queryByRole('button', { name: /^Approve/ })).toBeNull();
    expect(screen.getByTestId('write-state').getAttribute('data-state')).toBe('queued');
    expect(screen.getByText('Queued: approved, not written yet')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Apply now' }));
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('counts the approved moves beside Approve when only some still wait', () => {
    preview({ state: { kind: 'approve', keys: ['budget:pmax'], approved: 1 } });
    expect(screen.getByRole('button', { name: 'Approve 1 move' })).toBeTruthy();
    expect(screen.getByTestId('write-state').textContent).toContain(
      '1 more is approved and wait for Apply',
    );
  });

  it('says what autopilot has queued on its own, and when', () => {
    preview({ autopilotRun: { at: '2026-11-03T02:00:00Z', othersWait: true } });
    const line = screen.getByTestId('write-autopilot-run');
    expect(line.textContent).toContain('Queued for');
    expect(line.textContent).toContain(
      "Autopilot writes the Meta ad sets' budgets inside these guardrails on its own",
    );
    expect(line.textContent).toContain('and every move on another platform, waits here');
  });

  it('stands for an armed autopilot with no move to decide: its guardrails and its next run', () => {
    preview({
      moves: [],
      state: { kind: 'none' },
      autopilotRun: { at: '2026-11-03T02:00:00Z', othersWait: false },
    });
    expect(screen.queryByTestId('write-bars')).toBeNull();
    expect(screen.queryByTestId('write-state')).toBeNull();
    expect(screen.getByTestId('write-preview').textContent).toContain('Autopilot budget moves');
    expect(screen.getByTestId('write-checks')).toBeTruthy();
  });

  it('draws nothing when there is no move and autopilot does not run on its own', () => {
    preview({ moves: [], state: { kind: 'none' } });
    expect(screen.queryByTestId('write-preview')).toBeNull();
  });

  it('paints marks only from the board palette and never prints micro type', () => {
    const { container } = preview();
    expect(container.innerHTML).not.toMatch(/text-[23]xs|text-\[1[01]px\]/);
    const after = screen.getAllByTestId('write-bar-after').map((bar) => bar.style.background);
    expect(after).toEqual(['var(--board-search)', 'var(--board-pmax)']);
  });
});

// Recently applied: the same write, after it landed, with the undo the server allows.
const APPLIED = {
  id: '66666666-6666-4666-8666-666666666666',
  ts: '2026-11-02T09:00:00Z',
  family: 'money',
  op: 'budget',
  portfolio_id: '11111111-1111-4111-8111-111111111111',
  portfolio_name: 'Conversaciones Whatsapp',
  entity_id: '120231000000000001',
  before: { minor: 18_000 },
  after: { minor: 21_500 },
  actor_kind: 'autopilot',
  reversible: true,
  justification: 'Earned a larger share of the pool.',
} as const;

function applied(over: Record<string, unknown> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrap = (children: ReactNode) => (
    <QueryClientProvider client={client}>
      <ul>{children}</ul>
    </QueryClientProvider>
  );
  return render(
    wrap(
      <AppliedWriteRow
        brandId="b1"
        currency="MXN"
        entityNames={new Map([['120231000000000001', 'ALEIRA · Broad']])}
        row={{ ...APPLIED, ...over } as never}
      />,
    ),
  );
}

describe('AppliedWriteRow', () => {
  it('draws the applied budget before → after and says it is applied, with its undo', () => {
    applied();
    const row = screen.getByTestId('applied-write');
    expect(row.textContent).toContain('Daily budget ALEIRA · Broad');
    expect(row.textContent).toContain('$180 MXN$215 MXN+19%');
    expect(row.textContent).toContain('Why: Earned a larger share of the pool.');
    expect(screen.getByTestId('action-applied-state').textContent).toBe('Applied');
    // The Meta write's own undo, gated on the server's reversible flag.
    expect(screen.getByRole('button', { name: 'Revert' })).toBeTruthy();
  });

  it('shows only the Reverted badge once undone, never the undo a second time', () => {
    applied({ reverted_by: '77777777-7777-4777-8777-777777777777' });
    expect(screen.queryByTestId('action-applied-state')).toBeNull();
    expect(screen.getByText('Reverted')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Revert' })).toBeNull();
  });

  it('never calls a stopped write applied, and offers no undo the server refuses', () => {
    applied({ outcome: 'failed', reversible: false });
    expect(screen.getByTestId('action-applied-state').textContent).toBe('Not applied');
    expect(screen.queryByRole('button', { name: 'Revert' })).toBeNull();
  });

  it('prints a change that is not money as its two values, without bars', () => {
    applied({ op: 'status', before: { status: 'ACTIVE' }, after: { status: 'PAUSED' } });
    const row = screen.getByTestId('applied-write');
    expect(row.textContent).toContain('ACTIVEPAUSED');
    expect(row.querySelector('[style*="width"]')).toBeNull();
  });
});
