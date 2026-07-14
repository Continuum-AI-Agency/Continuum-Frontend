import { afterEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

const rpc = mock(async () => ({ data: [], error: null }));
mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    rpc,
    schema: () => ({ rpc }),
    functions: { invoke: rpc },
  }),
}));

const { adviseSetup } = await import('@continuum/contracts');
const { BudgetHint, SetupAdvisor, TargetHint } = await import('./SetupAdvisor');

function wrap(children: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}

const win = (spend: number, purchases: number) => ({
  spend,
  purchases,
  addToCarts: 0,
  clicks: 0,
  impressions: 0,
});

// deno-lint-ignore no-explicit-any
// biome-ignore lint/suspicious/noExplicitAny: minimal snapshot fixture for a pure advisor call
const adset = (id: string, over: Record<string, unknown> = {}): any => ({
  id,
  status: 'active',
  currentBudget: 300,
  ageDays: 30,
  windows: { d3: win(0, 0), d7: win(0, 0), d14: win(200, 8) },
  ...over,
});

const advise = (snapshots: unknown[], target: number | null = null) =>
  adviseSetup({
    // biome-ignore lint/suspicious/noExplicitAny: fixture
    snapshots: snapshots as any,
    objective: 'purchase',
    mode: 'balanced',
    typedDailyTotal: null,
    typedTarget: target,
  });

afterEach(() => {
  cleanup();
  rpc.mockClear();
});

describe('SetupAdvisor', () => {
  it('says nothing when the selection is clean', () => {
    const advice = advise([adset('a'), adset('b'), adset('c')], 25);
    const { container } = wrap(
      <SetupAdvisor
        advice={advice}
        brandId="brand"
        selectedIds={['a', 'b', 'c']}
        onChangeSelection={() => {}}
        onUseBudget={() => {}}
        onUseTarget={() => {}}
      />,
    );
    expect(container.innerHTML).toBe('');
  });

  // The most expensive lie in the setup form was the word "(optional)" on the CPA field.
  it('warns that a blank target silently means the engine’s $50 default', () => {
    const advice = advise([adset('a'), adset('b')]);
    wrap(
      <SetupAdvisor
        advice={advice}
        brandId="brand"
        selectedIds={['a', 'b']}
        onChangeSelection={() => {}}
        onUseBudget={() => {}}
        onUseTarget={() => {}}
      />,
    );
    expect(document.body.textContent).toContain('$50 default');
    expect(document.body.textContent).toContain('proposed for pause');
  });

  it('the kpi_mismatch repair deselects exactly the ad sets the engine would freeze', () => {
    const selected = ['keep', 'drop1', 'drop2'];
    const advice = advise(
      [
        adset('keep', { kpiField: 'purchases' }),
        adset('drop1', { kpiField: 'conversations' }),
        adset('drop2', { kpiField: 'leads' }),
      ],
      25,
    );
    const onChangeSelection = mock((_ids: string[]) => {});
    wrap(
      <SetupAdvisor
        advice={advice}
        brandId="brand"
        selectedIds={selected}
        onChangeSelection={onChangeSelection}
        onUseBudget={() => {}}
        onUseTarget={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Deselect 2' }));
    expect(onChangeSelection).toHaveBeenCalledWith(['keep']);
  });
});

describe('the hints under the money fields', () => {
  it('BudgetHint offers the sum of what the selection runs today, and writes it verbatim', () => {
    const advice = advise([adset('a'), adset('b')], 25); // 300 + 300 = 600 → ceil step 50 → 600
    const onUse = mock((_value: string) => {});
    wrap(<BudgetHint advice={advice} currency="USD" onUse={onUse} />);
    fireEvent.click(screen.getByRole('button', { name: 'Use' }));
    expect(onUse).toHaveBeenCalledWith('600');
  });

  it('TargetHint offers the blended ACTUAL cost, and writes it verbatim', () => {
    // 2 ad sets × ($200 spend / 8 purchases) = $25 blended.
    const advice = advise([adset('a'), adset('b')]);
    const onUse = mock((_value: string) => {});
    wrap(<TargetHint advice={advice} currency="USD" onUse={onUse} />);
    fireEvent.click(screen.getByRole('button', { name: 'Use' }));
    expect(onUse).toHaveBeenCalledWith('25');
  });

  it('offers no target at all when the selection has no tracked results', () => {
    const advice = advise([
      adset('a', { windows: { d3: win(0, 0), d7: win(0, 0), d14: win(90, 0) } }),
    ]);
    const { container } = wrap(<TargetHint advice={advice} currency="USD" onUse={() => {}} />);
    expect(container.innerHTML).toBe('');
  });
});
