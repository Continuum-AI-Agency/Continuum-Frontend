import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { PortfolioListItem } from '@continuum/contracts';
import { cleanup, fireEvent, render } from '@testing-library/react';

// The budget chart pulls in the BKLit chart stack; the apply-mode pill needs a Radix
// TooltipProvider ancestor. Neither is what these tests are about (the header actions,
// the sort control, and the clickable glance cards), so both are stubbed to keep the
// render focused on OptimizerOverview's own behavior.
mock.module('../charts/SpendByObjectiveStream', () => ({
  SpendByObjectiveStream: () => <div data-testid="spend-stream" />,
}));
mock.module('../ApplyModePill', () => ({ ApplyModePill: () => null }));
// Spread the real module: `mock.module` replaces it for the whole PROCESS and bun runs
// every test file in one, so a partial replacement here reaches the next file in the run.
let approvalFailure: Error | null = null;
let accountReadData: unknown = null;
const setFamilyMutate = mock((_input: unknown) => {});
let approvalMaps: { families: Record<string, string>; insights: Record<string, string> } = {
  families: {},
  insights: {},
};
const realOptimizerData = await import('../useOptimizerData');
mock.module('../useOptimizerData', () => ({
  ...realOptimizerData,
  useOptimizerSpendByObjective: () => ({ data: [], isLoading: false, isError: false }),
  // The account read is written by a worker on its own clock; absent is the normal case
  // and the overview has to stand on its own without it.
  useOptimizerAccountRead: () => ({ data: accountReadData, isLoading: false, isError: false }),
  useAccountApprovals: () => ({ data: approvalMaps, isLoading: false, isError: false }),
  // The third hook this file has had to stub for the same reason: the real one asks for a
  // QueryClient and these tests deliberately mount no provider. A hook added to the component
  // and not to this mock does not fail loudly — it takes the whole suite down at render.
  useRequestAccountRead: () => ({ mutate: () => {}, isPending: false, error: null }),
  // The real hook asks for a QueryClient, and these tests deliberately mount no provider —
  // the overview's own behaviour is what is under test, not React Query's wiring.
  // `mock.module` replaces the module for the whole process, so the failure case is driven
  // by a mutable handle rather than by a second, competing mock.
  useInsightApprovalMutations: () => ({
    setInsight: approvalFailure
      ? { mutate: () => {}, isError: true, error: approvalFailure }
      : { mutate: () => {}, isError: false, error: null },
    setFamily: { mutate: setFamilyMutate, isError: false, error: null },
  }),
}));

const { OptimizerOverview, sortPortfolios, dominantObjective, accountMix } = await import(
  './OptimizerOverview'
);
const { spendStream } = await import('../charts/chartData');
const { AccountReadEnvelopeSchema } = await import('../useOptimizerData');

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

const ZEBRA = portfolio({ id: 'z', name: 'Zebra', daily_total: 100 });
const ALPHA = portfolio({ id: 'a', name: 'Alpha', daily_total: 900 });

afterEach(() => {
  approvalFailure = null;
  accountReadData = null;
  approvalMaps = { families: {}, insights: {} };
  cleanup();
});

describe('OptimizerOverview', () => {
  // A write that fails and says nothing leaves the card looking like it accepted the
  // change. Until the approval RPCs exist in a given database, this is the normal path.
  it('says so when changing an insight was refused, instead of failing silently', () => {
    approvalFailure = new Error('Could not change this insight: function does not exist');
    const { getByTestId, queryByTestId } = render(
      <OptimizerOverview
        brandId="b1"
        portfolios={[ALPHA]}
        pendingCount={0}
        currency="USD"
        onOpenActions={() => {}}
        onSelectPortfolio={() => {}}
        onCreatePortfolio={() => {}}
      />,
    );
    expect(getByTestId('approval-error').textContent).toContain('function does not exist');
    expect(queryByTestId('approval-error')).not.toBeNull();
  });

  it('shows no approval note while nothing has been refused', () => {
    const { queryByTestId } = render(
      <OptimizerOverview
        brandId="b1"
        portfolios={[ALPHA]}
        pendingCount={0}
        currency="USD"
        onOpenActions={() => {}}
        onSelectPortfolio={() => {}}
        onCreatePortfolio={() => {}}
      />,
    );
    expect(queryByTestId('approval-error')).toBeNull();
  });

  it('fires onCreatePortfolio when the primary New portfolio button is clicked', () => {
    const onCreate = mock(() => {});
    const { getByRole } = render(
      <OptimizerOverview
        brandId="b1"
        portfolios={[ALPHA]}
        pendingCount={0}
        currency="USD"
        onOpenActions={() => {}}
        onSelectPortfolio={() => {}}
        onCreatePortfolio={onCreate}
      />,
    );

    fireEvent.click(getByRole('button', { name: 'New portfolio' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('selects a portfolio when its glance card is clicked', () => {
    const onSelect = mock((_id: string) => {});
    const { getByRole } = render(
      <OptimizerOverview
        brandId="b1"
        portfolios={[ALPHA]}
        pendingCount={0}
        currency="USD"
        onOpenActions={() => {}}
        onSelectPortfolio={onSelect}
        onCreatePortfolio={() => {}}
      />,
    );

    fireEvent.click(getByRole('button', { name: /Alpha/ }));
    expect(onSelect).toHaveBeenCalledWith('a');
  });

  it('warms the portfolio detail reads when a glance card is hovered', () => {
    const onPrefetch = mock((_id: string) => {});
    const { getByRole } = render(
      <OptimizerOverview
        brandId="b1"
        portfolios={[ALPHA]}
        pendingCount={0}
        currency="USD"
        onOpenActions={() => {}}
        onSelectPortfolio={() => {}}
        onCreatePortfolio={() => {}}
        onPrefetchPortfolio={onPrefetch}
      />,
    );

    fireEvent.mouseEnter(getByRole('button', { name: /Alpha/ }));
    expect(onPrefetch).toHaveBeenCalledWith('a');
  });

  it('reorders the glance list when the sort control changes the key', () => {
    const { getByRole, getAllByRole } = render(
      <OptimizerOverview
        brandId="b1"
        portfolios={[ZEBRA, ALPHA]}
        pendingCount={0}
        currency="USD"
        onOpenActions={() => {}}
        onSelectPortfolio={() => {}}
        onCreatePortfolio={() => {}}
      />,
    );

    // Default sort is name ascending → Alpha before Zebra.
    let cards = getAllByRole('button', { name: /Alpha|Zebra/ });
    expect(cards[0].textContent).toContain('Alpha');

    // Switch to daily budget ascending → Zebra ($100) before Alpha ($900).
    fireEvent.click(getByRole('button', { name: 'Daily budget' }));
    cards = getAllByRole('button', { name: /Alpha|Zebra/ });
    expect(cards[0].textContent).toContain('Zebra');
  });

  it('flips order when the direction toggle is pressed', () => {
    const { getByRole, getAllByRole } = render(
      <OptimizerOverview
        brandId="b1"
        portfolios={[ZEBRA, ALPHA]}
        pendingCount={0}
        currency="USD"
        onOpenActions={() => {}}
        onSelectPortfolio={() => {}}
        onCreatePortfolio={() => {}}
      />,
    );

    expect(getAllByRole('button', { name: /Alpha|Zebra/ })[0].textContent).toContain('Alpha');
    fireEvent.click(getByRole('button', { name: 'Sort ascending' }));
    expect(getAllByRole('button', { name: /Alpha|Zebra/ })[0].textContent).toContain('Zebra');
  });
});

describe('sortPortfolios', () => {
  it('sorts by name, daily budget and pending count in both directions', () => {
    const list = [ZEBRA, ALPHA];
    expect(sortPortfolios(list, 'name', 'asc').map((p) => p.id)).toEqual(['a', 'z']);
    expect(sortPortfolios(list, 'name', 'desc').map((p) => p.id)).toEqual(['z', 'a']);
    expect(sortPortfolios(list, 'daily', 'asc').map((p) => p.id)).toEqual(['z', 'a']);
    expect(sortPortfolios(list, 'daily', 'desc').map((p) => p.id)).toEqual(['a', 'z']);
  });

  it('treats a null daily budget as zero rather than sorting it to the top', () => {
    const unset = portfolio({ id: 'u', name: 'Unset', daily_total: null });
    expect(sortPortfolios([ALPHA, unset], 'daily', 'desc').map((p) => p.id)).toEqual(['a', 'u']);
  });
});

// Nothing in this file used to render the account read at all — `useOptimizerAccountRead` was
// mocked to `{data: null}` in every case. That is how a gate, two unpassed props and two
// crash-on-parse bugs all lived in this branch at once.
describe('the account read, on the screen that actually mounts it', () => {
  const envelope = (read: Record<string, unknown>) => ({
    utc_day: '2026-09-21',
    ready_at: '2026-09-21T06:00:00Z',
    read: AccountReadEnvelopeSchema.parse({ utc_day: '2026-09-21', read }).read,
  });

  const candidate = {
    id: 'dead_tail:a1',
    detector: 'dead_tail',
    impact_per_day: 120,
    impact_class: 'recoverable',
    impact_basis: 'spent with nothing to show',
    chart: null,
  };

  function mount() {
    return render(
      <OptimizerOverview
        brandId="b1"
        portfolios={[ALPHA]}
        pendingCount={0}
        currency="USD"
        onOpenActions={() => {}}
        onSelectPortfolio={() => {}}
        onCreatePortfolio={() => {}}
      />,
    );
  }

  // The Easyfit read on 2026-09-22, as the RPC returned it: no candidates, no guards, four
  // starved, a deck of 25/25, a scale of 1695 a day against 8500 planned, and a narrative
  // that says "Every check ran". The screen said "22 of 25 checks asked", "3 could not run"
  // and "Every check ran" at once; the owner asked for none of it.
  it('renders a quiet read as how the account is doing, and never counts the checks', () => {
    accountReadData = envelope({
      candidates: [],
      guards: [],
      starved: [
        { detector: 'creative_supply', missing: 'no creative-level rows' },
        { detector: 'scale_readiness', missing: 'no portfolio has a target to be under' },
        {
          detector: 'measurement_integrity',
          missing: 'campaign-level event counts are not loaded',
        },
        { detector: 'auction_pressure', missing: 'no prior window to compare against' },
      ],
      assumptions: ['Demo funnel: measured like a purchase.'],
      deck: { applies: 25, total: 25, muted: [] },
      scale_per_day: 1695.49,
      narrative:
        'Every check ran and none of them found money worth moving across this account today.',
      model: 'deterministic',
    });
    const { getByTestId, container } = mount();
    const card = getByTestId('account-lead-card');
    expect(card.getAttribute('data-mode')).toBe('quiet');
    // ALPHA plans 900 a day; the read measured 1695 — the pacing row says so, from the packet.
    expect(getByTestId('account-lead-pacing').textContent).toContain('188% of plan');
    // No spend history yet, so the mix is the plan's split — and says it is the plan.
    expect(getByTestId('account-lead-mix').textContent).toContain('Lead · 100%');
    expect(getByTestId('account-lead-mix').textContent).toContain('of the daily plan');
    // The footnotes survive, small, for an operator.
    expect(getByTestId('account-assumptions').textContent).toContain('Demo funnel');
    expect(getByTestId('account-starved').textContent).toContain('4 checks could not run today');

    const text = container.textContent ?? '';
    expect(text).not.toContain('checks asked');
    expect(text).not.toContain('checks apply');
    expect(text).not.toContain('Every check ran');
    expect(text).not.toContain('Nothing to move today');
  });

  it('seats the lead card, the four tiles and the dateline on one board', () => {
    accountReadData = envelope({
      candidates: [],
      guards: [],
      starved: [],
      scale_per_day: 1695.49,
      model: 'deterministic',
    });
    const { getByTestId } = mount();
    const board = getByTestId('account-board');
    expect(board.contains(getByTestId('account-lead-card'))).toBe(true);
    expect(board.contains(getByTestId('account-tiles'))).toBe(true);
    expect(board.contains(getByTestId('account-read-freshness'))).toBe(true);
    // Inside the board the card drops its own frame — one border, not a card in a card.
    expect(getByTestId('account-lead-card').className).toContain('rounded-none');
    expect(getByTestId('account-tiles').children).toHaveLength(4);
  });

  it('still shows the tiles when no read has ever landed', () => {
    accountReadData = null;
    const { getByTestId, queryByTestId } = mount();
    expect(getByTestId('account-tiles').children).toHaveLength(4);
    expect(queryByTestId('account-lead-card')).toBeNull();
    expect(queryByTestId('account-read')).toBeNull();
  });

  it('survives a starved row naming a detector this build has never heard of', () => {
    accountReadData = envelope({
      candidates: [candidate],
      guards: [],
      starved: [
        { detector: 'brand_new_detector', missing: 'a thing' },
        { detector: 'creative_supply', missing: 'creative rows' },
      ],
      model: 'deterministic',
    });
    // Before: ACCOUNT_DETECTOR_META[unknown].label threw and took the whole overview down.
    const { getByTestId } = mount();
    expect(getByTestId('account-read')).toBeTruthy();
  });

  it('keeps the good candidates when one row has a shape this build cannot read', () => {
    accountReadData = envelope({
      candidates: [candidate, { ...candidate, id: 'x:2', detector: 'brand_new_detector' }],
      guards: [],
      starved: [],
      model: 'deterministic',
    });
    // Before: the `.catch([])` sat on the ARRAY, so one bad row emptied every good one.
    const { getAllByTestId } = mount();
    expect(getAllByTestId('account-lead').length).toBe(1);
  });

  it("prints the read's own narrative rather than the constant fallback", () => {
    accountReadData = envelope({
      candidates: [candidate],
      guards: [],
      starved: [],
      narrative: 'Two portfolios are paying twice the account average.',
      model: 'gemini-2.5-flash',
    });
    const { getByTestId } = mount();
    expect(getByTestId('account-read').textContent).toContain('paying twice the account average');
    expect(getByTestId('account-read').textContent).not.toContain(
      'Across the account, most worth doing first',
    );
  });

  it('says what a figure buys, resolved from the book the account actually runs', () => {
    accountReadData = envelope({
      candidates: [candidate],
      guards: [],
      starved: [],
      model: 'deterministic',
    });
    // ALPHA is a `lead` portfolio, so the rung is the one `lead` sits on.
    const { getByTestId } = mount();
    expect(getByTestId('account-rung-note')).toBeTruthy();
  });
});

// The portfolios list used to say only "$500/day, 2 ad sets" — which makes a reader open every
// portfolio to discover which one is worth opening. The account read already knows.
describe('the portfolios list, in the same vocabulary as the card above it', () => {
  const inPortfolio = (portfolioId: string, over: Record<string, unknown> = {}) => ({
    id: `portfolio_reallocation:${portfolioId}`,
    detector: 'portfolio_reallocation',
    portfolio_ids: [portfolioId],
    impact_per_day: 66.67,
    impact_class: 'better_price',
    impact_basis: '200/day moved from a portfolio at 90 to one at 60',
    result_label: 'leads',
    chart: null,
    headline: {
      kind: 'efficiency',
      value: 33,
      unit: 'percent',
      label: 'cheaper per result',
      from: 90,
      to: 60,
    },
    ...over,
  });

  function mount(portfolios: PortfolioListItem[]) {
    return render(
      <OptimizerOverview
        brandId="b1"
        portfolios={portfolios}
        pendingCount={0}
        currency="USD"
        onOpenActions={() => {}}
        onSelectPortfolio={() => {}}
        onCreatePortfolio={() => {}}
      />,
    );
  }

  it('gives the named portfolio its own finding, in the detector’s own terms', () => {
    accountReadData = {
      utc_day: '2026-09-21',
      ready_at: '2026-09-21T06:00:00Z',
      read: AccountReadEnvelopeSchema.parse({
        utc_day: '2026-09-21',
        read: {
          candidates: [inPortfolio('a')],
          guards: [],
          starved: [],
          model: 'deterministic',
        },
      }).read,
    };
    const { getAllByTestId } = mount([ALPHA, ZEBRA]);
    const bands = getAllByTestId('portfolio-lead');
    // Only the portfolio the read named carries one.
    expect(bands).toHaveLength(1);
    expect(bands[0]?.textContent).toContain('Move budget between portfolios');
    expect(bands[0]?.textContent).toContain('33%');
    expect(bands[0]?.textContent).toContain('$66.67/day · $2,000/mo');
  });

  it('leaves every card bare when the read found nothing inside a portfolio', () => {
    accountReadData = {
      utc_day: '2026-09-21',
      ready_at: '2026-09-21T06:00:00Z',
      read: AccountReadEnvelopeSchema.parse({
        utc_day: '2026-09-21',
        read: {
          candidates: [inPortfolio('a', { portfolio_ids: [] })],
          guards: [],
          starved: [],
          model: 'deterministic',
        },
      }).read,
    };
    const { queryAllByTestId } = mount([ALPHA, ZEBRA]);
    expect(queryAllByTestId('portfolio-lead')).toHaveLength(0);
  });

  it('shows nothing on the cards when no read has been written yet', () => {
    const { queryAllByTestId } = mount([ALPHA, ZEBRA]);
    expect(queryAllByTestId('portfolio-lead')).toHaveLength(0);
  });
});

describe('dominantObjective', () => {
  const p = (id: string, objective: string, daily: number | null) =>
    portfolio({ id, name: id, daily_total: daily, objective: objective as never });

  it('picks the objective the account spends the most on, not the one it has most of', () => {
    expect(
      dominantObjective([p('a', 'lead', 100), p('b', 'lead', 100), p('c', 'purchase', 900)]),
    ).toBe('purchase');
  });

  it('says nothing when two objectives are tied, because a mixed account has no one answer', () => {
    expect(dominantObjective([p('a', 'lead', 500), p('b', 'purchase', 500)])).toBeNull();
  });

  it('ignores a row whose objective it cannot parse', () => {
    expect(dominantObjective([p('a', 'not_an_objective', 900), p('b', 'lead', 100)])).toBe('lead');
  });

  it('has no answer for an empty book', () => {
    expect(dominantObjective([])).toBeNull();
  });
});

// The stored read is a nightly snapshot: the worker bakes `state` into it once and
// `optimizer_get_account_read` serves that frozen row all day. So a write made at noon
// landed in the database and the card kept showing last night's answer — the control worked
// and looked broken, which is worse than one that refuses.
describe('an approval made today, against a read composed last night', () => {
  const frozen = (state: string | null) => ({
    utc_day: '2026-09-21',
    ready_at: '2026-09-21T06:00:00Z',
    read: AccountReadEnvelopeSchema.parse({
      utc_day: '2026-09-21',
      read: {
        candidates: [
          {
            id: 'dead_tail:a1',
            detector: 'dead_tail',
            impact_per_day: 120,
            impact_class: 'recoverable',
            impact_basis: 'spent with nothing to show',
            chart: null,
            state,
          },
        ],
        guards: [],
        starved: [],
        // dead_tail is a `structure` insight; the read was composed with that family
        // allowed to recommend and no further.
        ceiling_defaults: { structure: 'recommend', budget: 'recommend', creative: 'off' },
        model: 'deterministic',
      },
    }).read,
  });

  function mount() {
    return render(
      <OptimizerOverview
        brandId="b1"
        portfolios={[ALPHA]}
        pendingCount={0}
        currency="USD"
        onOpenActions={() => {}}
        onSelectPortfolio={() => {}}
        onCreatePortfolio={() => {}}
      />,
    );
  }

  // The observable is the card's own state note, not the "Always do this" control: that
  // control is hidden while `ADOPTING_A_DETECTOR_IS_ENFORCED` is false in AccountRead.tsx.
  // The overlay these tests are about — today's approval applied to last night's read — is
  // unchanged, and the note says the same three things the button's label did.
  it('shows the new state at once, without waiting for tomorrow to re-compose the row', () => {
    accountReadData = frozen('recommend');
    approvalMaps = { families: { structure: 'autopilot' }, insights: { dead_tail: 'autopilot' } };
    const { container } = mount();
    expect(container.textContent).toContain('Acts on its own');
  });

  it('still refuses to exceed the family, and says it was lowered', () => {
    accountReadData = frozen('recommend');
    // Asked for autopilot on the insight, but the family it belongs to only allows recommend.
    approvalMaps = { families: {}, insights: { dead_tail: 'autopilot' } };
    const { container, getByTestId } = mount();
    expect(getByTestId('state-lowered')).toBeTruthy();
    expect(container.textContent).not.toContain('Acts on its own');
  });

  it('leaves the stored state alone when nobody has approved anything', () => {
    accountReadData = frozen('recommend');
    const { container, queryByTestId } = mount();
    expect(container.textContent).not.toContain('Acts on its own');
    expect(queryByTestId('state-lowered')).toBeNull();
  });
});

// The account-level autonomy controls have a tab of their own now. They used to be a folded
// strip here, between the read and the portfolio list, and were the thing the owner said
// "looks wrong where it is".
describe('the family ceilings are not on Overview', () => {
  it('renders no autonomy strip, whatever the read carries', () => {
    accountReadData = {
      utc_day: '2026-09-21',
      ready_at: '2026-09-21T06:00:00Z',
      read: AccountReadEnvelopeSchema.parse({
        utc_day: '2026-09-21',
        read: {
          candidates: [],
          guards: [],
          starved: [],
          assumptions: ['x'],
          ceiling_defaults: { budget: 'recommend', structure: 'recommend' },
          model: 'deterministic',
        },
      }).read,
    };
    const { queryByTestId, container } = render(
      <OptimizerOverview
        brandId="b1"
        portfolios={[ALPHA]}
        pendingCount={0}
        currency="USD"
        onOpenActions={() => {}}
        onSelectPortfolio={() => {}}
        onCreatePortfolio={() => {}}
      />,
    );
    expect(queryByTestId('family-ceilings')).toBeNull();
    expect(container.textContent).not.toContain('allowed to do on its own');
    expect(setFamilyMutate).not.toHaveBeenCalled();
  });
});

describe('accountMix', () => {
  const p = (id: string, objective: string, daily: number) =>
    portfolio({ id, name: id, daily_total: daily, objective });

  it('splits the fortnight’s spend by objective when there is history, largest first', () => {
    const stream = spendStream(
      [
        { date: '2026-09-20', objective: 'lead', spend: 300 },
        { date: '2026-09-20', objective: 'purchase', spend: 100 },
        { date: '2026-09-21', objective: 'lead', spend: 320 },
        { date: '2026-09-21', objective: 'purchase', spend: 100 },
      ],
      14,
      '2026-09-21',
    );
    // 620 of 820 went to leads, whatever the plan says — the plan here is all purchases.
    expect(accountMix(stream, [p('a', 'purchase', 5000)])).toEqual({
      basis: 'spent',
      days: 14,
      slices: [
        { label: 'Lead', share: 76 },
        { label: 'Purchase', share: 24 },
      ],
    });
  });

  it('falls back to the daily plan before the first snapshot, and says so', () => {
    const stream = spendStream([], 14, '2026-09-21');
    expect(accountMix(stream, [p('a', 'lead', 3500), p('b', 'conversations', 5000)])).toEqual({
      basis: 'planned',
      slices: [
        { label: 'Conversations', share: 59 },
        { label: 'Lead', share: 41 },
      ],
    });
  });

  it('has nothing to say when neither spend nor plan carries any money', () => {
    expect(accountMix(spendStream([], 14, '2026-09-21'), [p('a', 'lead', 0)])).toBeNull();
  });
});
