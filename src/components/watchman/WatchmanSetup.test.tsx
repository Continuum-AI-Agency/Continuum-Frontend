import { afterEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { render } from '@/i18n/__tests__/render';
import { ApiError } from '@/lib/api/errors';

const BRAND = '11111111-1111-4111-8111-111111111111';
const REQUEST = '22222222-2222-4222-8222-222222222222';
const input = {
  request_id: REQUEST,
  kind: 'organic',
  role: 'gtm',
  name: 'Launch owner',
  instructions: 'Own the October launch follow-up.',
  first_assignment: 'Create the launch plan.',
  timezone: 'Europe/London',
  budget_usd_month: 30,
};
const setup = {
  request_id: REQUEST,
  brand_id: BRAND,
  watchman_id: REQUEST,
  version: 4,
  status: 'needs_connection',
  completed_stages: ['principal', 'teammate', 'credential', 'responsibilities'],
  readiness: null,
  error: null,
  updated_at: '2026-11-26T10:00:00Z',
};
let fail = true;
let denied = false;
const calls: Array<Record<string, unknown>> = [];
const clients: QueryClient[] = [];
mock.module('@/lib/watchman/api', () => ({
  manageWatchman: async (_brand: string, request: Record<string, unknown>) => {
    calls.push(request);
    if (fail) throw new ApiError('Setup interrupted', 503, 'unavailable');
    return { watchman_id: REQUEST, status: 'paused', setup };
  },
  watchmanReads: {
    setup: async () => {
      if (denied) throw new ApiError('Forbidden', 403, 'forbidden');
      return { input, setup };
    },
  },
  watchmanQueryKeys: {
    all: (brand: string) => ['watchman', brand],
    part: (brand: string, part: string, id?: string) => ['watchman', brand, part, id ?? null],
  },
}));
const { WatchmanSetup } = await import('./WatchmanSetup');
const mount = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const completed = mock(() => undefined);
  render(
    <QueryClientProvider client={client}>
      <WatchmanSetup brandId={BRAND} onComplete={completed} />
    </QueryClientProvider>,
  );
  return completed;
};
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  calls.length = 0;
  fail = true;
  denied = false;
  window.history.replaceState(null, '', '/');
});

describe('teammate setup', () => {
  it('offers all four responsibilities and retains the same setup request after failure', async () => {
    mount();
    expect(screen.getByRole('button', { name: /Team lead/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Go to market/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    const name = screen.getByLabelText('Teammate name');
    fireEvent.change(name, { target: { value: 'Our launch teammate' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set up teammate' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    await screen.findByRole('alert');
    expect((name as HTMLInputElement).value).toBe('Our launch teammate');
    fireEvent.click(screen.getByRole('button', { name: 'Set up teammate' }));
    await waitFor(() => expect(calls).toHaveLength(2));
    expect((calls[0]?.create as Record<string, unknown>).request_id).toBe(
      (calls[1]?.create as Record<string, unknown>).request_id,
    );
    expect(calls[0]?.create).toMatchObject({
      role: 'gtm',
      kind: 'organic',
      name: 'Our launch teammate',
    });
  });
  it('hydrates the original durable setup intent on refresh before resuming', async () => {
    window.history.replaceState(null, '', `/?setupRequest=${REQUEST}`);
    fail = false;
    const completed = mount();
    const name = await screen.findByDisplayValue('Launch owner');
    expect((name as HTMLInputElement).readOnly).toBe(true);
    expect(screen.getByDisplayValue('Own the October launch follow-up.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Set up teammate' }));
    await waitFor(() => expect(completed).toHaveBeenCalledWith(REQUEST));
    expect(calls[0]?.create).toEqual(input);
    expect(calls).toHaveLength(1);
  });
  it('does not submit replacement defaults when reading the original setup is forbidden', async () => {
    window.history.replaceState(null, '', `/?setupRequest=${REQUEST}`);
    denied = true;
    mount();
    await screen.findByText("We couldn't restore this setup. Retry before continuing.");
    expect(screen.queryByRole('button', { name: 'Set up teammate' })).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
