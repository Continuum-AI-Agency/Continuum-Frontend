import { afterEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { render } from '@/i18n/__tests__/render';
import { ApiError } from '@/lib/api/errors';

const BRAND = '11111111-1111-4111-8111-111111111111';
const WM = '22222222-2222-4222-8222-222222222222';
const calls: Array<Record<string, unknown>> = [];
const clients: QueryClient[] = [];
let fail = false;
mock.module('@/lib/watchman/api', () => ({
  manageWatchman: async (_brand: string, input: Record<string, unknown>) => {
    calls.push(input);
    if (fail) throw new ApiError('Budget not saved', 503, 'unavailable');
    return {};
  },
  watchmanReads: {
    status: async () => ({
      watchmen: [{ id: WM, status: 'paused', autonomy: {}, budget: { budget_usd: 25 } }],
    }),
    tasks: async () => ({ tasks: [] }),
    reports: async () => ({ reports: [] }),
  },
  watchmanQueryKeys: {
    all: (brand: string) => ['watchman', brand],
    part: (brand: string, part: string, id?: string) => ['watchman', brand, part, id ?? null],
  },
}));
const { WatchmanSettings } = await import('./WatchmanSettings');
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <WatchmanSettings brandId={BRAND} watchmanId={WM} ready={false} />
    </QueryClientProvider>,
  );
}
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  calls.length = 0;
  fail = false;
});
describe('Watchman model budget recovery', () => {
  it('saves an explicit validated monthly limit for the selected teammate', async () => {
    mount();
    const input = await screen.findByLabelText('Monthly model budget (USD)');
    fireEvent.change(input, { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save budget' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]).toMatchObject({
      action: 'configure',
      watchman_id: WM,
      configure: { budget_usd_month: 40 },
    });
  });
  it('retains the chosen limit and shows a failed write for retry', async () => {
    fail = true;
    mount();
    const input = await screen.findByLabelText('Monthly model budget (USD)');
    fireEvent.change(input, { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save budget' }));
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0));
    expect((input as HTMLInputElement).value).toBe('50');
    expect(calls).toHaveLength(1);
  });
});
