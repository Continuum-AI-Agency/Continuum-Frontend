import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { PortfolioListItem } from '@continuum/contracts';
import { act, cleanup, fireEvent } from '@testing-library/react';
import { render, screen, within } from '@/i18n/__tests__/render';

// The apply-mode pill needs a TooltipProvider ancestor and is not what these tests are about.
mock.module('../../ApplyModePill', () => ({
  ApplyModePill: ({ applyMode }: { applyMode: string | null | undefined }) => (
    <span data-testid="apply-mode">{applyMode}</span>
  ),
}));

// Spread the real module: `mock.module` replaces it for the whole PROCESS, so a partial
// replacement here would reach the next file in the run.
let accountReadData: unknown = null;
const setFamilyMutate = mock((_input: unknown) => {});
let familyFailure: Error | null = null;
// The dial, the scopes and Stop write through the mutations the Manage section uses; each call is
// answered by the test, so a write is pending until the test says the database has answered.
type Answer = { resolve: () => void; reject: (error: unknown) => void };
let answers: Answer[] = [];
const answered = () =>
  new Promise<void>((resolve, reject) => {
    answers.push({ resolve: () => resolve(), reject });
  });
const updateMutateAsync = mock((_input: unknown) => answered());
const setPausedMutateAsync = mock((_input: unknown) => answered());
const realOptimizerData = await import('../../useOptimizerData');
mock.module('../../useOptimizerData', () => ({
  ...realOptimizerData,
  useOptimizerAccountRead: () => ({
    data: accountReadData,
    isLoading: false,
    isError: false,
  }),
  useAccountApprovals: () => ({
    data: { families: { budget: 'autopilot' }, insights: {} },
    isLoading: false,
    isError: false,
  }),
  useInsightApprovalMutations: () => ({
    setInsight: { mutate: () => {}, isError: false, error: null },
    setFamily: {
      mutate: setFamilyMutate,
      isError: Boolean(familyFailure),
      error: familyFailure,
    },
  }),
  useOptimizerMutations: () => ({
    update: { mutateAsync: updateMutateAsync, isPending: false },
    setPaused: { mutateAsync: setPausedMutateAsync, isPending: false },
  }),
}));

const { AccountAutomations } = await import('./AccountAutomations');
const { AccountReadEnvelopeSchema } = await import('../../useOptimizerData');

function portfolio(
  overrides: Partial<PortfolioListItem> & { id: string; name: string },
): PortfolioListItem {
  return {
    ad_account_id: 'act_1',
    objective: 'lead',
    level: 'adset',
    mode: 'balanced',
    apply_mode: 'recommend',
    daily_total: 500,
    period_budget: null,
    status: 'active',
    next_realloc_at: null,
    adset_count: 2,
    pending_recommendations: 0,
    ...overrides,
  };
}

const withRead = () => ({
  utc_day: '2026-09-22',
  ready_at: '2026-09-22T00:01:07Z',
  read: AccountReadEnvelopeSchema.parse({
    utc_day: '2026-09-22',
    read: {
      candidates: [],
      guards: [],
      starved: [],
      ceiling_defaults: {
        budget: 'recommend',
        structure: 'recommend',
        creative_swap: 'off',
      },
      model: 'deterministic',
    },
  }).read,
});

afterEach(() => {
  accountReadData = null;
  familyFailure = null;
  setFamilyMutate.mockClear();
  updateMutateAsync.mockClear();
  setPausedMutateAsync.mockClear();
  answers = [];
  cleanup();
});

function mount(portfolios: PortfolioListItem[], onManage = mock((_id: string) => {})) {
  return {
    onManage,
    ...render(
      <AccountAutomations
        adAccountId="act_1"
        brandId="b1"
        onManagePortfolio={onManage}
        portfolios={portfolios}
      />,
    ),
  };
}

describe('AccountAutomations — the account-level ceilings', () => {
  it('shows what each family may do, under the defaults the read was composed with', () => {
    accountReadData = withRead();
    const { getByTestId } = mount([portfolio({ id: 'a', name: 'Alpha' })]);
    const grid = getByTestId('family-ceilings');
    // creative_swap ships as 'off' on this read, and nobody has touched it.
    const swap = grid.querySelector('[data-family="creative_swap"]');
    expect(swap?.querySelector('[aria-pressed="true"]')?.getAttribute('data-state-option')).toBe(
      'off',
    );
    // budget was chosen by someone: the choice wins over the shipped value.
    const budget = grid.querySelector('[data-family="budget"]');
    expect(budget?.querySelector('[aria-pressed="true"]')?.getAttribute('data-state-option')).toBe(
      'autopilot',
    );
  });

  it('writes the family that was clicked', () => {
    accountReadData = withRead();
    const { getByTestId } = mount([portfolio({ id: 'a', name: 'Alpha' })]);
    const structure = getByTestId('family-ceilings').querySelector('[data-family="structure"]');
    fireEvent.click(structure?.querySelector('[data-state-option="autopilot"]') as HTMLElement);
    expect(setFamilyMutate).toHaveBeenCalledWith({
      family: 'structure',
      state: 'autopilot',
    });
  });

  it('says why a change was refused, on the panel where it was asked', () => {
    accountReadData = withRead();
    familyFailure = new Error('Could not change what this family may do: function does not exist');
    const { getByTestId } = mount([portfolio({ id: 'a', name: 'Alpha' })]);
    expect(getByTestId('family-error').textContent).toContain('function does not exist');
  });

  // Without the read there are no defaults to show as "in force", and a panel that pressed
  // 'Suggest' on every row would be presenting a guess as a setting.
  it('says the ceilings arrive with the first read, rather than guessing them', () => {
    accountReadData = null;
    const { getByTestId, queryByTestId } = mount([portfolio({ id: 'a', name: 'Alpha' })]);
    expect(queryByTestId('family-ceilings')).toBeNull();
    expect(getByTestId('family-ceilings-pending').textContent).toContain('first account read');
  });
});

describe('AccountAutomations — autonomy per portfolio', () => {
  const book = [
    portfolio({ id: 'a', name: 'Alpha', apply_mode: 'autopilot' }),
    portfolio({
      id: 'b',
      name: 'Beta',
      apply_mode: 'autopilot',
      autopilot_paused: true,
    }),
    portfolio({
      id: 'c',
      name: 'Gamma',
      apply_mode: 'recommend',
      pending_recommendations: 3,
    }),
  ];

  it('counts what runs on its own, and what has been stopped', () => {
    const { getByTestId } = mount(book);
    const meta = getByTestId('portfolio-autonomy-meta').textContent ?? '';
    expect(meta).toContain('2 of 3 on autopilot');
    expect(meta).toContain('1 stopped');
  });

  it('lists every portfolio with its mode and what is waiting on a person', () => {
    const { getByTestId } = mount(book);
    const list = getByTestId('portfolio-autonomy');
    expect(list.querySelectorAll('[data-portfolio]')).toHaveLength(3);
    const gamma = list.querySelector('[data-portfolio="c"]');
    expect(gamma?.textContent).toContain('3 waiting on a decision');
    expect(gamma?.querySelector('[data-testid="apply-mode"]')?.textContent).toBe('recommend');
    expect(list.querySelector('[data-portfolio="a"]')?.textContent).toContain('nothing waiting');
  });

  it('sends the reader to the portfolio’s own Manage section to change it', () => {
    const { getByTestId, onManage } = mount(book);
    const gamma = getByTestId('portfolio-autonomy').querySelector('[data-portfolio="c"]');
    fireEvent.click(gamma?.querySelector('button') as HTMLElement);
    expect(onManage).toHaveBeenCalledWith('c');
  });
});

describe('AccountAutomations — autopilot that has missed a cycle is counted as stale', () => {
  it('names the stale autopilot portfolios beside the stopped ones', () => {
    const { getByTestId } = mount([
      portfolio({
        id: 'c',
        name: 'Citas Agosto - check leads',
        apply_mode: 'autopilot',
        adset_count: 12,
        last_actual_cycle_at: '2026-08-05T12:00:00Z',
        stale_for_days: 49,
        roster_state: 'absent',
        roster_absent_since: '2026-08-06T12:00:00Z',
        roster_missing_count: 12,
      }),
      portfolio({
        id: 'b',
        name: 'Beta',
        apply_mode: 'autopilot',
        autopilot_paused: true,
      }),
      portfolio({
        id: 'm',
        name: 'MENSAJES',
        apply_mode: 'autopilot',
        stale_for_days: null,
      }),
    ]);
    const meta = getByTestId('portfolio-autonomy-meta').textContent ?? '';
    expect(meta).toBe('3 of 3 on autopilot · 1 stopped · 1 stale');
  });

  it('says nothing about staleness when no row carries the read', () => {
    const { getByTestId } = mount([
      portfolio({ id: 'a', name: 'Alpha', apply_mode: 'autopilot' }),
      portfolio({ id: 'g', name: 'Gamma', apply_mode: 'recommend' }),
    ]);
    expect(getByTestId('portfolio-autonomy-meta').textContent).toBe('1 of 2 on autopilot');
  });
});

// G14: the autonomy dial per portfolio. Observe and Autopilot are apply modes; Recommend and
// Approve are both 'recommend', told apart by whether Continuum may write the portfolio's
// platforms (Meta unless switched off, Google only when switched on).
describe('AccountAutomations — the autonomy dial (G14)', () => {
  const armed = {
    max_change_pct_per_cycle: 0.2,
    max_daily_apply_minor: 130_000,
    currency: 'MXN',
  } satisfies Partial<PortfolioListItem>;
  const card = (id: string) =>
    screen
      .getByTestId('portfolio-autonomy')
      .querySelector(`[data-portfolio="${id}"]`) as HTMLElement;
  const dial = (id: string) => within(card(id)).getByTestId('autonomy-dial');
  const step = (id: string, level: string) =>
    dial(id).querySelector(`[data-level-option="${level}"]`) as HTMLButtonElement;
  const answerNext = async (outcome: 'ok' | Error) => {
    const answer = answers.shift();
    await act(async () => {
      if (outcome === 'ok') answer?.resolve();
      else answer?.reject(outcome);
    });
  };

  it('puts each portfolio on its level, and counts the levels above the list', () => {
    mount([
      portfolio({ id: 'o', name: 'Watching', apply_mode: 'observe' }),
      portfolio({ id: 'a', name: 'Approving', apply_mode: 'recommend' }),
      portfolio({ id: 'p', name: 'Flying', apply_mode: 'autopilot', ...armed }),
      portfolio({
        id: 'r',
        name: 'Client applies',
        apply_mode: 'recommend',
        platforms: ['google_ads'],
      }),
    ]);
    expect(dial('o').getAttribute('data-level')).toBe('observe');
    expect(dial('a').getAttribute('data-level')).toBe('approve');
    expect(dial('p').getAttribute('data-level')).toBe('autopilot');
    expect(dial('r').getAttribute('data-level')).toBe('recommend');
    const summary = screen.getByTestId('autonomy-summary');
    for (const level of ['observe', 'recommend', 'approve', 'autopilot']) {
      expect(summary.querySelector(`[data-level="${level}"]`)?.textContent).toMatch(/1$/);
    }
  });

  it('writes the apply mode of the level chosen, and moves only once the write is answered', async () => {
    mount([portfolio({ id: 'a', name: 'Approving', apply_mode: 'recommend' })]);
    fireEvent.click(step('a', 'observe'));
    expect(updateMutateAsync).toHaveBeenCalledWith({
      portfolio_id: 'a',
      patch: { apply_mode: 'observe' },
    });
    // Asked, not answered: the dial stays where the database still has it.
    expect(dial('a').getAttribute('data-level')).toBe('approve');
    expect(step('a', 'autopilot').disabled).toBe(true);
    await answerNext('ok');
    expect(dial('a').getAttribute('data-level')).toBe('observe');
    expect(within(card('a')).queryByTestId('autonomy-error')).toBeNull();
  });

  it('leaves the dial where it was and says why when the write is refused', async () => {
    mount([portfolio({ id: 'a', name: 'Approving', apply_mode: 'recommend' })]);
    fireEvent.click(step('a', 'observe'));
    await answerNext(new Error('Could not update the portfolio.'));
    expect(dial('a').getAttribute('data-level')).toBe('approve');
    expect(within(card('a')).getByTestId('autonomy-error').textContent).toBe(
      'Could not update the portfolio. Nothing was changed.',
    );
  });

  it('asks before turning autopilot on, and writes it only when the person says so', async () => {
    mount([
      portfolio({
        id: 'a',
        name: 'Approving',
        apply_mode: 'recommend',
        ...armed,
      }),
    ]);
    fireEvent.click(step('a', 'autopilot'));
    expect(updateMutateAsync).not.toHaveBeenCalled();
    const ask = await screen.findByRole('alertdialog');
    expect(ask.textContent).toContain('Turn on autopilot for “Approving”?');
    expect(ask.textContent).toContain('Max 20% per cycle · Max $1,300 MXN/day');
    fireEvent.click(within(ask).getByRole('button', { name: 'Turn on autopilot' }));
    expect(updateMutateAsync).toHaveBeenCalledWith({
      portfolio_id: 'a',
      patch: { apply_mode: 'autopilot' },
    });
    await answerNext('ok');
    expect(dial('a').getAttribute('data-level')).toBe('autopilot');
  });

  it('sends the person to Manage to preview the cycle instead, writing nothing', async () => {
    const { onManage } = mount([
      portfolio({
        id: 'a',
        name: 'Approving',
        apply_mode: 'recommend',
        ...armed,
      }),
    ]);
    fireEvent.click(step('a', 'autopilot'));
    const ask = await screen.findByRole('alertdialog');
    fireEvent.click(within(ask).getByRole('button', { name: 'Preview in Manage' }));
    expect(onManage).toHaveBeenCalledWith('a');
    expect(updateMutateAsync).not.toHaveBeenCalled();
  });

  it('locks Autopilot until both caps are set, and says which', () => {
    mount([portfolio({ id: 'a', name: 'Approving', apply_mode: 'recommend' })]);
    expect(step('a', 'autopilot').disabled).toBe(true);
    expect(step('a', 'autopilot').getAttribute('data-locked')).toBe('true');
    const lock = within(card('a')).getByTestId('autonomy-lock');
    expect(lock.getAttribute('data-lock')).toBe('autopilot');
    expect(lock.textContent).toContain('Needs both caps first');
    const caps = within(card('a')).getByTestId('autonomy-caps');
    expect(caps.querySelector('[data-cap="per-cycle"]')?.getAttribute('data-missing')).toBe('true');
    expect(caps.querySelector('[data-cap="daily"]')?.getAttribute('data-missing')).toBe('true');
  });

  it('locks Approve and Autopilot when the portfolio’s writes are switched off', () => {
    mount([
      portfolio({
        id: 'r',
        name: 'Client applies',
        apply_mode: 'recommend',
        platforms: ['google_ads'],
        platform_writes: { google_ads: false },
        ...armed,
      }),
    ]);
    expect(step('r', 'approve').disabled).toBe(true);
    expect(step('r', 'autopilot').disabled).toBe(true);
    expect(step('r', 'observe').disabled).toBe(false);
    const locks = within(card('r')).getAllByTestId('autonomy-lock');
    // Both levels share one reason, said once.
    expect(locks).toHaveLength(1);
    expect(locks[0]?.textContent).toContain(
      'Writes to Google are switched off for this portfolio, so Continuum only recommends.',
    );
  });

  it('locks Autopilot on a portfolio whose whole roster has left the account', () => {
    mount([
      portfolio({
        id: 't',
        name: 'Tours Programados - Octubre',
        apply_mode: 'recommend',
        last_cycle_current: false,
        withdrawn_reason: 'roster_absent',
        ...armed,
      }),
    ]);
    expect(step('t', 'autopilot').disabled).toBe(true);
    expect(within(card('t')).getByTestId('autonomy-lock').textContent).toContain(
      'Withdrawn: its whole roster has left the ad account.',
    );
  });

  it('shows the caps autopilot writes inside, priced in the portfolio’s currency', () => {
    mount([portfolio({ id: 'p', name: 'Flying', apply_mode: 'autopilot', ...armed })]);
    const caps = within(card('p')).getByTestId('autonomy-caps');
    expect(caps.querySelector('[data-cap="per-cycle"]')?.textContent).toBe('Max 20% per cycle');
    expect(caps.querySelector('[data-cap="daily"]')?.textContent).toBe('Max $1,300 MXN/day');
    expect(caps.querySelector('[data-cap="paused"]')?.textContent).toBe(
      'New objects created PAUSED',
    );
  });

  it('stops autopilot through its kill switch, and says it is stopped once answered', async () => {
    mount([portfolio({ id: 'p', name: 'Flying', apply_mode: 'autopilot', ...armed })]);
    fireEvent.click(within(card('p')).getByRole('button', { name: 'Stop autopilot' }));
    expect(setPausedMutateAsync).toHaveBeenCalledWith({
      portfolio_id: 'p',
      paused: true,
      reason: 'Stopped from Automations',
    });
    await answerNext('ok');
    expect(within(card('p')).getByRole('button', { name: 'Resume autopilot' })).toBeTruthy();
    expect(within(card('p')).getAllByTestId('autonomy-note')[0]?.textContent).toContain(
      'Stopped by a person',
    );
  });

  it('saves a scope as a partial patch on autopilot, and holds the switches off below it', async () => {
    mount([
      portfolio({ id: 'p', name: 'Flying', apply_mode: 'autopilot', ...armed }),
      portfolio({ id: 'a', name: 'Approving', apply_mode: 'recommend' }),
    ]);
    const swap = () => within(card('p')).getByRole('switch', { name: 'Creative rotation' });
    fireEvent.click(swap());
    expect(updateMutateAsync).toHaveBeenCalledWith({
      portfolio_id: 'p',
      patch: { autopilot_scopes: { creative_swap: true } },
    });
    // Off until the database answers; on once it has, before the list read catches up.
    expect(swap().getAttribute('aria-checked')).toBe('false');
    await answerNext('ok');
    expect(swap().getAttribute('aria-checked')).toBe('true');
    const held = within(card('a')).getByRole('switch', {
      name: 'Creative rotation',
    });
    expect(
      held.hasAttribute('data-disabled') || held.getAttribute('aria-disabled') === 'true',
    ).toBe(true);
    expect(within(card('a')).getByTestId('autonomy-scopes-locked')).toBeTruthy();
  });

  it('offers the move between platforms only to a portfolio on more than one', () => {
    mount([
      portfolio({
        id: 'm',
        name: 'Meta only',
        apply_mode: 'autopilot',
        ...armed,
      }),
      portfolio({
        id: 'x',
        name: 'Meta and Google',
        apply_mode: 'autopilot',
        platforms: ['meta', 'google_ads'],
        platform_writes: { google_ads: true },
        ...armed,
      }),
    ]);
    expect(
      within(card('m')).queryByRole('switch', {
        name: 'Move budget between platforms',
      }),
    ).toBeNull();
    expect(
      within(card('x')).getByRole('switch', {
        name: 'Move budget between platforms',
      }),
    ).toBeTruthy();
  });
});
