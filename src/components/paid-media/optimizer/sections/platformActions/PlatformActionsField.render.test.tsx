import { afterEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';

type Answer = { data: unknown; error: unknown };
const answers: Record<string, Answer[]> = {};
const calls: { fn: string; args?: Record<string, unknown> }[] = [];
const rpc = mock(async (fn: string, args?: Record<string, unknown>) => {
  calls.push({ fn, args });
  return answers[fn]?.shift() ?? { data: null, error: { message: `no answer for ${fn}` } };
});

mock.module('@/lib/supabase/client', () => ({ createSupabaseBrowserClient: () => ({ rpc }) }));

const { PlatformActionsField } = await import('./PlatformActionsField');
const {
  fetchPlatformActions,
  GET_PLATFORM_ACTIONS_RPC,
  SET_PLATFORM_ACTIONS_RPC,
  savePlatformActions,
} = await import('./usePortfolioPlatformActions');
const { MissingRpcError } = await import('../platforms/multiplatformRead');

const PORTFOLIO = '0be73981-6287-44ff-8b57-0d083e3e6625';
const MIXED = [
  { platform: 'meta', allowed_actions: ['set_budget', 'set_status'], accounts: 1 },
  { platform: 'google_ads', allowed_actions: ['set_budget', 'set_status'], accounts: 1 },
];

function answer(fn: string, ...queue: Answer[]) {
  answers[fn] = queue;
}

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PlatformActionsField portfolioId={PORTFOLIO} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  calls.length = 0;
  for (const key of Object.keys(answers)) delete answers[key];
});

describe('fetchPlatformActions', () => {
  it('keeps the platforms the executor writes for and drops Meta and unknown ones', async () => {
    answer(GET_PLATFORM_ACTIONS_RPC, {
      data: [...MIXED, { platform: 'snapchat', allowed_actions: [], accounts: 1 }],
      error: null,
    });
    expect(await fetchPlatformActions(PORTFOLIO)).toEqual([
      { platform: 'google_ads', allowed: ['set_budget', 'set_status'], accounts: 1 },
    ]);
    expect(calls).toEqual([{ fn: GET_PLATFORM_ACTIONS_RPC, args: { p_portfolio_id: PORTFOLIO } }]);
  });

  it('tells a missing RPC apart from a failed read', async () => {
    answer(GET_PLATFORM_ACTIONS_RPC, { data: null, error: { code: 'PGRST202' } });
    await expect(fetchPlatformActions(PORTFOLIO)).rejects.toBeInstanceOf(MissingRpcError);
    answer(GET_PLATFORM_ACTIONS_RPC, { data: null, error: { code: '42501' } });
    await expect(fetchPlatformActions(PORTFOLIO)).rejects.toThrow(
      'The allowed actions could not be read.',
    );
  });
});

describe('savePlatformActions', () => {
  it('sends the whole list and surfaces the database refusal word for word', async () => {
    answer(SET_PLATFORM_ACTIONS_RPC, { data: ['add_negatives', 'set_status'], error: null });
    expect(
      await savePlatformActions(PORTFOLIO, 'google_ads', ['set_status', 'add_negatives']),
    ).toEqual(['add_negatives', 'set_status']);
    expect(calls[0]?.args).toEqual({
      p_portfolio_id: PORTFOLIO,
      p_platform: 'google_ads',
      p_allowed_actions: ['set_status', 'add_negatives'],
    });
    answer(SET_PLATFORM_ACTIONS_RPC, {
      data: null,
      error: { code: 'P0002', message: 'optimizer: portfolio x has no google_ads account' },
    });
    await expect(savePlatformActions(PORTFOLIO, 'google_ads', [])).rejects.toThrow(
      'optimizer: portfolio x has no google_ads account',
    );
  });
});

describe('PlatformActionsField', () => {
  it('lists every Google kind with what it does, the default two ticked, and no Meta row', async () => {
    answer(GET_PLATFORM_ACTIONS_RPC, { data: MIXED, error: null });
    const view = mount();
    const row = await view.findByRole('group', { name: 'Google actions' });
    const boxes = [...row.querySelectorAll('[data-slot="checkbox"]')];
    expect(boxes.map((box) => box.getAttribute('aria-checked'))).toEqual([
      'true',
      'true',
      'false',
      'false',
      'false',
    ]);
    expect(row.textContent).toContain('Add negative keywords');
    expect(row.textContent).toContain('Stop search terms that spend without converting');
    expect(view.queryByRole('group', { name: 'Meta actions' })).toBeNull();
    expect(view.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true);
  });

  it('saves the ticked kinds and re-reads what the database stored', async () => {
    answer(
      GET_PLATFORM_ACTIONS_RPC,
      { data: MIXED, error: null },
      {
        data: [
          MIXED[0],
          {
            platform: 'google_ads',
            allowed_actions: ['add_negatives', 'set_budget', 'set_status'],
            accounts: 1,
          },
        ],
        error: null,
      },
    );
    answer(SET_PLATFORM_ACTIONS_RPC, {
      data: ['add_negatives', 'set_budget', 'set_status'],
      error: null,
    });
    const view = mount();
    fireEvent.click(await view.findByText('Add negative keywords'));
    const save = view.getByRole('button', { name: 'Save' });
    expect(save.hasAttribute('disabled')).toBe(false);
    fireEvent.click(save);
    await waitFor(() =>
      expect(calls.filter((c) => c.fn === GET_PLATFORM_ACTIONS_RPC)).toHaveLength(2),
    );
    expect(calls.find((c) => c.fn === SET_PLATFORM_ACTIONS_RPC)?.args).toEqual({
      p_portfolio_id: PORTFOLIO,
      p_platform: 'google_ads',
      p_allowed_actions: ['set_status', 'set_budget', 'add_negatives'],
    });
    await waitFor(() =>
      expect(view.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true),
    );
  });

  it('shows why the database refused a save', async () => {
    answer(GET_PLATFORM_ACTIONS_RPC, { data: MIXED, error: null });
    answer(SET_PLATFORM_ACTIONS_RPC, {
      data: null,
      error: { code: '42501', message: 'optimizer: no edit access to this brand' },
    });
    const view = mount();
    fireEvent.click(await view.findByText('Pause or enable'));
    fireEvent.click(view.getByRole('button', { name: 'Save' }));
    expect(await view.findByText('optimizer: no edit access to this brand')).toBeTruthy();
  });

  it('holds a platform stored empty locked — a read-only account — with no Save', async () => {
    answer(GET_PLATFORM_ACTIONS_RPC, {
      data: [{ platform: 'google_ads', allowed_actions: [], accounts: 1 }],
      error: null,
    });
    const view = mount();
    expect((await view.findByTestId('platform-actions-locked')).textContent).toContain('read-only');
    const row = view.getByRole('group', { name: 'Google actions' });
    const boxes = [...row.querySelectorAll('[data-slot="checkbox"]')];
    expect(boxes).toHaveLength(5);
    expect(boxes.every((box) => box.hasAttribute('data-disabled'))).toBe(true);
    expect(view.queryByRole('button', { name: 'Save' })).toBeNull();
  });

  it('never saves an empty list: unticking every kind disables Save and says why', async () => {
    answer(GET_PLATFORM_ACTIONS_RPC, { data: MIXED, error: null });
    const view = mount();
    fireEvent.click(await view.findByText('Pause or enable'));
    fireEvent.click(view.getByText('Change budgets'));
    expect(view.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true);
    expect(view.getByText(/Keep at least one/)).toBeTruthy();
    expect(calls.some((c) => c.fn === SET_PLATFORM_ACTIONS_RPC)).toBe(false);
  });

  it('says a Meta-only portfolio has nothing to choose here, and that a missing RPC is not an error', async () => {
    answer(GET_PLATFORM_ACTIONS_RPC, { data: [MIXED[0]], error: null });
    const metaOnly = mount();
    expect(await metaOnly.findByText(/holds no Google or TikTok campaigns/)).toBeTruthy();
    cleanup();
    answer(GET_PLATFORM_ACTIONS_RPC, { data: null, error: { code: 'PGRST202' } });
    const older = mount();
    expect(await older.findByText(/aren’t available yet/)).toBeTruthy();
  });
});
