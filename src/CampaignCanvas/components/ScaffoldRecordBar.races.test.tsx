import { afterEach, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { CanvasScaffoldRead, ScaffoldSummary } from '@/lib/paid-media/jaina-activity-client';

const loaded: string[] = [], accounts: (string | null)[] = [];
const summary = (id: string): ScaffoldSummary => ({ id, name: id, adAccountId: `act_${id}`, currentVersionId: `v_${id}`, createdAt: '' });
const pending = new Map<string, ReturnType<typeof deferred<CanvasScaffoldRead>>>();
function deferred<T>() { let resolve!: (v: T) => void, reject!: (e: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const onAccount = (value: string | null) => { accounts.push(value); };
mock.module('@/lib/paid-media/jaina-activity-client', () => ({
  fetchBrandScaffolds: async ({ brandId }: { brandId: string }) => [summary(`${brandId}A`), summary(`${brandId}B`)],
  fetchCanvasScaffoldRead: ({ scaffold }: { scaffold: ScaffoldSummary }) => { const read = deferred<CanvasScaffoldRead>(); pending.set(scaffold.id, read); return read.promise; },
}));
mock.module('@/lib/campaign-canvas/hydrate', () => ({ buildHydratedCanvasGraph: (read: CanvasScaffoldRead) => read.scaffold.id }));
const store = { hydration: null, isDirty: false, nodes: [{}], loadHydratedGraph: (id: string) => loaded.push(id) };
mock.module('../stores/useCampaignStore', () => ({
  graphFingerprint: (nodes: unknown[], edges: unknown[]) => JSON.stringify({ nodes, edges }),
  useCampaignStore: Object.assign((select: (state: unknown) => unknown) => select(store), { getState: () => store }),
}));
mock.module('@/components/ui/ToastProvider', () => ({ useToast: () => ({ toast: () => {} }) }));
mock.module('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange }: { children: ReactNode; value: string; onValueChange: (v: string) => void }) => <select data-testid="picker" value={value} onChange={(e) => onValueChange(e.target.value)}><option value="" />{children}</select>,
  SelectTrigger: () => null, SelectValue: () => null, SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>, SelectItem: ({ children, value }: { children: ReactNode; value: string }) => <option value={value}>{children}</option>,
}));
mock.module('@/components/ui/tooltip', () => ({ TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>, Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>, TooltipTrigger: ({ render: node }: { render: ReactNode }) => <>{node}</>, TooltipContent: () => null }));
const { ScaffoldRecordBar } = await import('./ScaffoldRecordBar');
afterEach(() => { cleanup(); pending.clear(); loaded.length = 0; accounts.length = 0; });
const queryClient = new QueryClient();
const bar = (brandId = 'one', requestedScaffoldId: string | null = null) => <QueryClientProvider client={queryClient}><ScaffoldRecordBar brandId={brandId} requestedScaffoldId={requestedScaffoldId} onAdAccountChange={onAccount} onPropose={() => {}} /></QueryClientProvider>;
const choose = async (id: string) => { await waitFor(() => expect(screen.getByTestId('picker')).toBeTruthy()); fireEvent.change(screen.getByTestId('picker'), { target: { value: id } }); };
const complete = async (id: string, error = false) => { await act(async () => { const d = pending.get(id)!; if (error) d.reject(new Error(`late ${id}`)); else d.resolve({ scaffold: summary(id) } as CanvasScaffoldRead); }); };
it('a late older selection cannot overwrite the latest graph or account', async () => {
  render(bar()); await choose('oneA'); await choose('oneB'); await complete('oneB'); await complete('oneA');
  expect(loaded).toEqual(['oneB']); expect(accounts.at(-1)).toBe('act_oneB');
});
it('an older failure cannot change error or clear a newer loading state', async () => {
  render(bar()); await choose('oneA'); await choose('oneB'); await complete('oneA', true);
  expect(screen.queryByRole('alert')).toBeNull(); expect(screen.getByText('Loading')).toBeTruthy();
  expect((screen.getByTestId('canvas-propose-via-jaina') as HTMLButtonElement).disabled).toBe(true);
  await complete('oneB'); expect(screen.queryByText('Loading')).toBeNull();
});
it('brand changes invalidate old graph, account and failure completions', async () => {
  const view = render(bar()); await choose('oneA'); view.rerender(bar('two')); await choose('twoB'); await complete('twoB'); await complete('oneA');
  expect(loaded).toEqual(['twoB']); expect(accounts.at(-1)).toBe('act_twoB'); expect(screen.queryByRole('alert')).toBeNull();
});
it('unmount invalidates pending graph and account writes', async () => {
  const view = render(bar()); await choose('oneA'); const count = accounts.length; view.unmount(); await complete('oneA');
  expect(loaded).toEqual([]); expect(accounts.length).toBe(count);
});
it('a different requested scaffold invalidates a pending auto-load', async () => {
  const view = render(bar('one', 'oneA')); await waitFor(() => expect(pending.has('oneA')).toBe(true)); view.rerender(bar('one', 'oneB'));
  await waitFor(() => expect(pending.has('oneB')).toBe(true)); await complete('oneB'); await complete('oneA', true);
  expect(loaded).toEqual(['oneB']); expect(screen.queryByRole('alert')).toBeNull();
});
