import { afterEach, describe, expect, it, mock } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';

type Answer = { data: unknown; error: unknown };
const queue: (Answer | Promise<Answer>)[] = [];
const calls: { fn: string; args?: Record<string, unknown> }[] = [];
const rpc = mock(async (fn: string, args?: Record<string, unknown>) => {
  calls.push({ fn, args });
  return (await queue.shift()) ?? { data: null, error: { message: 'no answer queued' } };
});

mock.module('@/lib/supabase/client', () => ({ createSupabaseBrowserClient: () => ({ rpc }) }));

const { GoalCostCapField } = await import('./GoalCostCapField');
const { SET_GOAL_AS_COST_CAP_RPC, saveGoalAsCostCap } = await import('./useGoalAsCostCap');

const PORTFOLIO = '0be73981-6287-44ff-8b57-0d083e3e6625';
const UNCHECKED_HELP =
  'The Optimizer measures the portfolio against this goal and never changes bid settings on the platforms.';
const CHECKED_HELP =
  'The Optimizer proposes setting the Google Ads target CPA (bid setting) of each campaign to this goal, in steps of up to 10% a day.';

function mount(
  props: Partial<Parameters<typeof GoalCostCapField>[0]> = {},
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  const view = render(
    <QueryClientProvider client={client}>
      <GoalCostCapField
        enabled={false}
        goal={36}
        maxChangePctPerCycle={0.1}
        portfolioId={PORTFOLIO}
        targetMetric="lead"
        {...props}
      />
    </QueryClientProvider>,
  );
  const checkbox = () => view.getByRole('checkbox', { name: /cost cap on the ad platforms/ });
  return { ...view, checkbox, client };
}

afterEach(() => {
  cleanup();
  calls.length = 0;
  queue.length = 0;
});

describe('saveGoalAsCostCap', () => {
  it('calls the setter with the portfolio and the flag and parses its answer', async () => {
    queue.push({
      data: {
        goal_as_platform_cost_cap: true,
        allowed_actions: { google_ads: ['set_bid_target'] },
      },
      error: null,
    });
    expect(await saveGoalAsCostCap(PORTFOLIO, true)).toEqual({
      goal_as_platform_cost_cap: true,
      allowed_actions: { google_ads: ['set_bid_target'] },
    });
    expect(calls).toEqual([
      { fn: SET_GOAL_AS_COST_CAP_RPC, args: { p_portfolio_id: PORTFOLIO, p_enabled: true } },
    ]);
  });

  it('throws plain English for a database refusal and for an unreadable answer', async () => {
    queue.push({ data: null, error: { code: '42501', message: 'permission denied' } });
    await expect(saveGoalAsCostCap(PORTFOLIO, true)).rejects.toThrow(
      "You don't have access to change this portfolio. Ask a member of the brand.",
    );
    queue.push({ data: { allowed_actions: [] }, error: null });
    await expect(saveGoalAsCostCap(PORTFOLIO, true)).rejects.toThrow(
      "The setting couldn't be saved. Try again.",
    );
  });
});

describe('GoalCostCapField', () => {
  it('shows the stored value with the matching help', () => {
    const off = mount();
    expect(off.checkbox().getAttribute('aria-checked')).toBe('false');
    expect(off.getByText(UNCHECKED_HELP)).toBeTruthy();
    cleanup();
    const on = mount({ enabled: true });
    expect(on.checkbox().getAttribute('aria-checked')).toBe('true');
    expect(on.getByText(CHECKED_HELP)).toBeTruthy();
  });

  it('ticks optimistically, saves, and invalidates every optimizer read', async () => {
    let resolve: (answer: Answer) => void = () => {};
    queue.push(new Promise<Answer>((r) => (resolve = r)));
    const view = mount();
    const invalidate = mock(view.client.invalidateQueries.bind(view.client));
    view.client.invalidateQueries = invalidate;

    fireEvent.click(view.checkbox());
    expect(view.checkbox().getAttribute('aria-checked')).toBe('true');
    expect(view.getByText(CHECKED_HELP)).toBeTruthy();
    await waitFor(() =>
      expect(calls[0]?.args).toEqual({ p_portfolio_id: PORTFOLIO, p_enabled: true }),
    );
    expect(view.checkbox().getAttribute('aria-disabled')).toBe('true');

    resolve({
      data: {
        goal_as_platform_cost_cap: true,
        allowed_actions: { google_ads: ['set_bid_target'] },
      },
      error: null,
    });
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['optimizer'] }));
    expect(view.checkbox().getAttribute('aria-checked')).toBe('true');
  });

  it('rolls back and explains when the save fails', async () => {
    queue.push({ data: null, error: { code: 'P0002', message: 'portfolio not found' } });
    const view = mount({ enabled: true });
    fireEvent.click(view.checkbox());
    await waitFor(() =>
      expect(view.getByText('This portfolio no longer exists. Reload the page.')).toBeTruthy(),
    );
    expect(view.checkbox().getAttribute('aria-checked')).toBe('true');
    expect(view.getByText(CHECKED_HELP)).toBeTruthy();
  });

  it('is disabled with the reason when the goal is not a cost per conversion', () => {
    const view = mount({ targetMetric: 'awareness' });
    expect(view.checkbox().getAttribute('aria-disabled')).toBe('true');
    expect(
      view.getByText(
        "Only a cost-per-conversion goal can be the platforms' cost cap. This portfolio's goal is a CPM.",
      ),
    ).toBeTruthy();
    fireEvent.click(view.checkbox());
    expect(calls).toEqual([]);
  });

  it('is disabled with the reason when there is no goal', () => {
    const view = mount({ goal: null });
    expect(view.checkbox().getAttribute('aria-disabled')).toBe('true');
    expect(
      view.getByText(
        'Set a portfolio CPA goal above to use it as the cost cap on the ad platforms.',
      ),
    ).toBeTruthy();
  });

  it('still lets a person switch it off when the goal stopped qualifying', async () => {
    queue.push({
      data: { goal_as_platform_cost_cap: false, allowed_actions: { google_ads: ['set_budget'] } },
      error: null,
    });
    const view = mount({ enabled: true, goal: null });
    expect(view.checkbox().getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(view.checkbox());
    await waitFor(() =>
      expect(calls[0]?.args).toEqual({ p_portfolio_id: PORTFOLIO, p_enabled: false }),
    );
  });
});
