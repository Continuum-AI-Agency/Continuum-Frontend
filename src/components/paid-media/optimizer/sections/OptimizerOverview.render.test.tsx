import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { EfficiencySeriesPoint, PortfolioListItem } from '@continuum/contracts';
import { cleanup, fireEvent, render } from '@testing-library/react';

// The apply-mode pill needs a tooltip provider ancestor and is not what these tests are
// about. `mock.module` replaces it for the whole PROCESS, so this file runs on its own.
mock.module('../ApplyModePill', () => ({ ApplyModePill: () => null }));

// Every read the Overview makes is driven from these handles. Spread the real module: a
// partial replacement here would reach the next file in the run.
let accountReadData: unknown = null;
let approvalMaps: { families: Record<string, string>; insights: Record<string, string> } = {
  families: {},
  insights: {},
};
const retryFailed = mock(() => {});
let efficiency: {
  series: EfficiencySeriesPoint[][];
  pending: boolean;
  failed: number;
  retryFailed: () => void;
} = { series: [], pending: false, failed: 0, retryFailed };
const realOptimizerData = await import('../useOptimizerData');
mock.module('../useOptimizerData', () => ({
  ...realOptimizerData,
  useOptimizerAccountRead: () => ({ data: accountReadData, isLoading: false, isError: false }),
  useAccountApprovals: () => ({ data: approvalMaps, isLoading: false, isError: false }),
  useRequestAccountRead: () => ({ mutate: () => {}, isPending: false, error: null }),
  useOptimizerPortfolioEfficiency: () => efficiency,
}));

const { OptimizerOverview, kindTileSub, autopilotTileSub } = await import('./OptimizerOverview');
const { AccountReadEnvelopeSchema } = await import('../useOptimizerData');
const { autopilotSummary, resultKinds, portfolioWindow, spendState } = await import(
  './account/overviewModel'
);

function portfolio(
  overrides: Partial<PortfolioListItem> & { id: string; name: string },
): PortfolioListItem {
  return {
    ad_account_id: 'act_1',
    objective: 'lead',
    level: 'adset',
    mode: 'balanced',
    apply_mode: 'autopilot',
    daily_total: 500,
    period_budget: null,
    status: 'active',
    next_realloc_at: null,
    adset_count: 2,
    pending_recommendations: 0,
    ...overrides,
  };
}

function point(overrides: Partial<EfficiencySeriesPoint> = {}): EfficiencySeriesPoint {
  return {
    cycle_ts: '2026-09-28T06:00:00Z',
    spend_d3: 0,
    conv_d3: 0,
    spend_d7: 0,
    conv_d7: 0,
    spend_d14: 0,
    conv_d14: 0,
    adsets: 1,
    ...overrides,
  };
}

// Easy Fit on 27 September, as the proposal quotes it.
const MENSAJES = portfolio({
  id: 'mensajes',
  name: 'MENSAJES // TODOS',
  objective: 'conversations',
  cpa_target: 30,
  daily_total: 3000,
  adset_count: 12,
});
const FORMULARIOS = portfolio({
  id: 'formularios',
  name: 'FORMULARIOS // TODOS',
  cpa_target: 35,
  daily_total: 324,
  adset_count: 9,
  pending_recommendations: 3,
});
const PRUEBA = portfolio({
  id: 'prueba',
  name: 'Prueba',
  cpa_target: 25,
  daily_total: 110,
  adset_count: 3,
  apply_mode: 'recommend',
  pending_recommendations: 1,
});
const TOURS = portfolio({
  id: 'tours',
  name: 'Septiembre - Tours Programados',
  objective: 'purchase',
  cpa_target: 120,
  daily_total: 750,
  adset_count: 12,
});
const EASY_FIT = [MENSAJES, FORMULARIOS, PRUEBA, TOURS];
const EASY_FIT_SERIES: EfficiencySeriesPoint[][] = [
  [point({ spend_d7: 20_612, conv_d7: 516, spend_d14: 42_744, conv_d14: 1_051 })],
  [point({ spend_d7: 2_161, conv_d7: 56, spend_d14: 5_570, conv_d14: 114 })],
  [point({ spend_d7: 730, conv_d7: 22, spend_d14: 1_230, conv_d14: 44 })],
  [point({ spend_d7: 408, conv_d7: 0, spend_d14: 408, conv_d14: 0 })],
];

const candidate = (overrides: Record<string, unknown> = {}) => ({
  id: 'dead_tail:formularios',
  detector: 'dead_tail',
  portfolio_ids: ['formularios'],
  impact_per_day: 48.8,
  impact_class: 'recoverable',
  impact_basis: '405 MXN in 7 days for 4 leads.',
  result_label: 'leads',
  chart: null,
  headline: {
    kind: 'efficiency',
    value: 101,
    unit: 'currency_per_day',
    label: 'per lead',
    from: 35,
    to: 101,
  },
  cta: { kind: 'portfolio', target_id: 'formularios' },
  evidence: { portfolio: 'ITESO // AGOSTO - RTG', window_days: 7 },
  ...overrides,
});

const envelope = (read: Record<string, unknown>, readyAt = twentyMinutesAgo()) => ({
  utc_day: '2026-09-28',
  ready_at: readyAt,
  refresh: null,
  read: AccountReadEnvelopeSchema.parse({ utc_day: '2026-09-28', read }).read,
});

function twentyMinutesAgo(): string {
  return new Date(Date.now() - 20 * 60_000).toISOString();
}

function mount(portfolios: PortfolioListItem[] = EASY_FIT, pendingCount = 4) {
  const onOpenActions = mock(() => {});
  const onSelect = mock((_id: string) => {});
  const onCreate = mock(() => {});
  const onPrefetch = mock((_id: string) => {});
  const utils = render(
    <OptimizerOverview
      adAccountId="act_easyfit"
      brandId="b1"
      currency="MXN"
      onCreatePortfolio={onCreate}
      onOpenActions={onOpenActions}
      onPrefetchPortfolio={onPrefetch}
      onSelectPortfolio={onSelect}
      pendingCount={pendingCount}
      portfolios={portfolios}
    />,
  );
  return { ...utils, onOpenActions, onSelect, onCreate, onPrefetch };
}

const follows = (a: Element, b: Element) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

afterEach(() => {
  accountReadData = null;
  approvalMaps = { families: {}, insights: {} };
  efficiency = { series: EASY_FIT_SERIES, pending: false, failed: 0, retryFailed };
  cleanup();
});
efficiency = { series: EASY_FIT_SERIES, pending: false, failed: 0, retryFailed };

describe('OptimizerOverview — the order above the fold', () => {
  it('renders the sentence, the sub-line, the Jaina band, the tiles, the cards, then the rows', () => {
    accountReadData = envelope({ candidates: [candidate()], guards: [], model: 'deterministic' });
    const { getByTestId } = mount();
    const blocks = [
      getByTestId('overview-headline'),
      getByTestId('overview-subline'),
      getByTestId('jaina-entry-chips'),
      getByTestId('account-tiles'),
      getByTestId('account-cards'),
      getByTestId('portfolio-rows'),
    ];
    for (let i = 1; i < blocks.length; i += 1) {
      expect(follows(blocks[i - 1] as Element, blocks[i] as Element)).toBe(true);
    }
  });

  it('renders none of the old surface: no lead card, no stream, no read sentence, no footnotes', () => {
    accountReadData = envelope({
      candidates: [candidate()],
      guards: [],
      starved: [{ detector: 'creative_supply', missing: 'no creative-level rows' }],
      assumptions: ['Demo funnel: measured like a purchase.'],
      narrative: 'The auction moved, not the ad.',
      model: 'brief',
    });
    const { container, queryByTestId } = mount();
    const text = container.textContent ?? '';
    for (const gone of [
      'The auction moved',
      'Across the account',
      'checks could not run',
      'Spend by objective',
      'Daily budget',
      'Spent yesterday',
      'Buys',
      'How sure',
      'Demo funnel',
    ]) {
      expect(text).not.toContain(gone);
    }
    expect(queryByTestId('account-lead-card')).toBeNull();
    expect(queryByTestId('account-read')).toBeNull();
    expect(queryByTestId('account-starved')).toBeNull();
    expect(queryByTestId('account-assumptions')).toBeNull();
    expect(container.querySelector('canvas, .recharts-wrapper')).toBeNull();
  });
});

describe('OptimizerOverview — the sentence, from typed fields', () => {
  it('states the spend, one clause per result kind with its distance, and the decisions', () => {
    const { getByTestId } = mount();
    const headline = getByTestId('overview-headline').textContent ?? '';
    expect(headline).toContain('The account spent 23,911 MXN in 7 days: ');
    expect(headline).toContain('conversations at 39.95 MXN (33% over target)');
    expect(headline).toContain('leads at 37.06 MXN (15% over target)');
    expect(headline).toContain('and 0 purchases in Septiembre - Tours Programados.');
    expect(headline).toContain('4 decisions waiting.');
  });

  it('carries every figure with its provenance, on the node that prints it', () => {
    const { getByTestId } = mount();
    const headline = getByTestId('overview-headline');
    const spend = headline.querySelector('[data-figure="overview.spend"]');
    expect(spend?.getAttribute('data-figure-raw')).toBe('23911');
    expect(spend?.getAttribute('data-figure-window')).toBe('d7');
    expect(
      headline.querySelector('[data-figure="overview.kind.conversations.cost"]'),
    ).not.toBeNull();
    expect(
      headline.querySelector('[data-figure="overview.kind.purchases.results"]'),
    ).not.toBeNull();
  });

  it('says the window it covers and when the read was taken', () => {
    accountReadData = envelope({ candidates: [], guards: [], model: 'deterministic' });
    const { getByTestId } = mount();
    expect(getByTestId('overview-window').textContent).toBe('Sep 21–27');
    expect(getByTestId('overview-subline').textContent).toContain('Read 20 min ago');
  });

  it('says it is still reading while no series has landed', () => {
    efficiency = { series: [], pending: true, failed: 0, retryFailed };
    const { getByTestId } = mount();
    expect(getByTestId('overview-headline').textContent).toBe("Reading the account's cycles…");
    expect(getByTestId('overview-headline').getAttribute('data-pending')).toBe('true');
  });

  it('says no cycle has been measured, rather than a spend of zero', () => {
    efficiency = { series: [[], [], [], []], pending: false, failed: 0, retryFailed };
    const { getByTestId, queryByTestId } = mount();
    expect(getByTestId('overview-headline').textContent).toContain(
      'No portfolio has a measured cycle yet. 4 decisions waiting.',
    );
    expect(queryByTestId('overview-window')).toBeNull();
  });

  it('refuses to print a partial sum as the account when a portfolio could not be read', () => {
    efficiency = {
      series: [[], ...EASY_FIT_SERIES.slice(1)],
      pending: false,
      failed: 1,
      retryFailed,
    };
    const { getByTestId } = mount();
    const headline = getByTestId('overview-headline');
    expect(headline.getAttribute('data-incomplete')).toBe('true');
    expect(headline.textContent).toContain('Could not read the cycle of 1 portfolio');
    expect(headline.textContent).not.toContain('The account spent');
    fireEvent.click(getByTestId('overview-retry'));
    expect(retryFailed).toHaveBeenCalledTimes(1);
    expect(getByTestId('tile-spend').textContent).toContain('—');
    expect(getByTestId('tile-spend').textContent).toContain('incomplete read');
    expect(getByTestId('tile-spend').getAttribute('data-state')).toBe('none');
  });

  it('counts a single decision and none at all in their own words', () => {
    expect(mount(EASY_FIT, 1).getByTestId('overview-decisions').textContent).toBe(
      '1 decision waiting.',
    );
    cleanup();
    expect(mount(EASY_FIT, 0).getByTestId('overview-decisions').textContent).toBe(
      'No decisions waiting.',
    );
  });
});

describe('OptimizerOverview — the tiles', () => {
  const tiles = (root: HTMLElement) => [...root.querySelectorAll('[data-testid^="tile-"]')];

  it('renders spend, one tile per result kind, decisions and autopilot — six for Easy Fit', () => {
    const { getByTestId } = mount();
    const ids = tiles(getByTestId('account-tiles')).map((tile) => tile.getAttribute('data-testid'));
    expect(ids).toEqual([
      'tile-spend',
      'tile-kind-conversations',
      'tile-kind-leads',
      'tile-kind-purchases',
      'tile-decisions',
      'tile-autopilot',
    ]);
  });

  it('renders four when the account buys one thing', () => {
    efficiency = {
      series: [EASY_FIT_SERIES[1] as EfficiencySeriesPoint[]],
      pending: false,
      failed: 0,
      retryFailed,
    };
    const { getByTestId } = mount([FORMULARIOS], 3);
    expect(tiles(getByTestId('account-tiles'))).toHaveLength(4);
  });

  it('never renders more than six — a fourth result kind does not get a tile', () => {
    const five = [
      MENSAJES,
      FORMULARIOS,
      TOURS,
      portfolio({ id: 'traffic', name: 'Tráfico', objective: 'traffic', cpa_target: 2 }),
      portfolio({ id: 'signups', name: 'Registros', objective: 'signup', cpa_target: 10 }),
    ];
    efficiency = {
      series: [
        EASY_FIT_SERIES[0] as EfficiencySeriesPoint[],
        EASY_FIT_SERIES[1] as EfficiencySeriesPoint[],
        EASY_FIT_SERIES[3] as EfficiencySeriesPoint[],
        [point({ spend_d7: 300, conv_d7: 100, spend_d14: 600, conv_d14: 200 })],
        [point({ spend_d7: 200, conv_d7: 10, spend_d14: 400, conv_d14: 20 })],
      ],
      pending: false,
      failed: 0,
      retryFailed,
    };
    const { getByTestId } = mount(five);
    expect(tiles(getByTestId('account-tiles'))).toHaveLength(6);
  });

  it('takes its top border colour from the state, never from a chart', () => {
    const { getByTestId } = mount();
    const conversations = getByTestId('tile-kind-conversations');
    expect(conversations.getAttribute('data-state')).toBe('bad');
    expect(conversations.className).toContain('border-t-destructive');
    const leads = getByTestId('tile-kind-leads');
    expect(leads.getAttribute('data-state')).toBe('warn');
    expect(leads.className).toContain('border-t-warning');
    expect(getByTestId('tile-kind-purchases').getAttribute('data-state')).toBe('none');
    expect(getByTestId('tile-kind-purchases').className).toContain('border-t-border');
    expect(getByTestId('account-tiles').querySelector('svg')).toBeNull();
  });

  it('says cost, target and last week under a result kind', () => {
    const { getByTestId } = mount();
    expect(getByTestId('tile-kind-conversations').textContent).toContain('516');
    expect(getByTestId('tile-kind-conversations').textContent).toContain(
      '39.95 MXN · target 30.00 MXN · prev. week 41.37 MXN',
    );
    expect(getByTestId('tile-kind-leads').textContent).toContain('target 25.00 MXN–35.00 MXN');
    expect(getByTestId('tile-kind-purchases').textContent).toContain('408 MXN no results');
  });

  it("shows 'no target' in the neutral state when the portfolio has no target", () => {
    efficiency = {
      series: [EASY_FIT_SERIES[2] as EfficiencySeriesPoint[]],
      pending: false,
      failed: 0,
      retryFailed,
    };
    const { getByTestId } = mount([{ ...PRUEBA, cpa_target: null }], 1);
    const tile = getByTestId('tile-kind-leads');
    expect(tile.getAttribute('data-state')).toBe('none');
    expect(tile.textContent).toContain('no target');
    expect(getByTestId('overview-headline').textContent).toContain(
      'leads at 33.18 MXN (no target)',
    );
  });

  it('reads the spend against the plan and names who only recommends', () => {
    const { getByTestId, onOpenActions } = mount();
    const spend = getByTestId('tile-spend');
    expect(spend.textContent).toContain('23,911 MXN');
    expect(spend.textContent).toContain('3,416 MXN per day · plan 4,184 MXN');
    expect(spend.getAttribute('data-state')).toBe('warn');
    expect(getByTestId('tile-autopilot').textContent).toContain('3 of 4');
    expect(getByTestId('tile-autopilot').textContent).toContain(
      'Prueba recommends, does not apply',
    );
    expect(getByTestId('tile-decisions').textContent).toContain('in 2 portfolios');
    fireEvent.click(getByTestId('tile-decisions').querySelector('button') as HTMLButtonElement);
    expect(onOpenActions).toHaveBeenCalledTimes(1);
  });
});

describe('the tile words', () => {
  it('reads spend inside a tenth of the plan as ok, outside as warn, and no plan as none', () => {
    expect(spendState(3416, 4184)).toBe('warn');
    expect(spendState(4000, 4184)).toBe('ok');
    expect(spendState(100, 0)).toBe('none');
  });

  it('writes the second line of a kind tile from its figures', () => {
    const windows = new Map(
      EASY_FIT.map((row, index) => [row.id, portfolioWindow(row, EASY_FIT_SERIES[index] ?? [])]),
    );
    const [conversations, leads, purchases] = resultKinds(EASY_FIT, windows as never);
    expect(kindTileSub(conversations as never, 'MXN')).toBe(
      '39.95 MXN · target 30.00 MXN · prev. week 41.37 MXN',
    );
    expect(kindTileSub(leads as never, 'MXN')).toContain('target 25.00 MXN–35.00 MXN');
    expect(kindTileSub(purchases as never, 'MXN')).toBe('408 MXN no results');
  });

  it('writes the second line of the autopilot tile', () => {
    expect(autopilotTileSub(autopilotSummary(EASY_FIT))).toBe('Prueba recommends, does not apply');
    expect(autopilotTileSub(autopilotSummary([MENSAJES, FORMULARIOS]))).toBe(
      'all apply on their own',
    );
    expect(autopilotTileSub(autopilotSummary([{ ...MENSAJES, autopilot_paused: true }]))).toBe(
      '1 paused',
    );
    expect(
      autopilotTileSub(
        autopilotSummary([PRUEBA, { ...PRUEBA, id: 'p2' }, { ...PRUEBA, id: 'p3' }]),
      ),
    ).toBe('3 recommend, do not apply');
  });
});

describe('OptimizerOverview — the Jaina band', () => {
  it('asks about the account with the worst portfolio and the silent one named', () => {
    const { getByTestId } = mount();
    const band = getByTestId('jaina-entry-chips');
    expect(band.textContent).toContain('Ask Jaina');
    const links = [...band.querySelectorAll('a')];
    expect(links.length).toBeGreaterThanOrEqual(4);
    const prompts = links.map((link) =>
      decodeURIComponent((link.getAttribute('href') ?? '').split('prompt=')[1] ?? ''),
    );
    expect(prompts.some((prompt) => prompt.includes('MENSAJES // TODOS'))).toBe(true);
    expect(prompts.some((prompt) => prompt.includes('Septiembre - Tours Programados'))).toBe(true);
  });
});

describe('OptimizerOverview — the weekly report', () => {
  it('opens Jaina with the weekly-report ask for the selected ad account', () => {
    const { getByRole } = mount();
    const link = getByRole('link', { name: /weekly report/i });
    const href = link.getAttribute('href') ?? '';
    expect(href.startsWith('/scale?tab=jaina&prompt=')).toBe(true);
    const prompt = decodeURIComponent(href.split('prompt=')[1] ?? '');
    expect(prompt).toStartWith('Weekly report for the ad account "act_easyfit"');
    expect(prompt).toContain('Period A');
    expect(prompt).toContain('Period B');
  });

  it('offers no weekly report while no ad account is selected', () => {
    const { queryByRole } = render(
      <OptimizerOverview
        adAccountId={null}
        brandId="b1"
        currency="MXN"
        onCreatePortfolio={() => {}}
        onOpenActions={() => {}}
        onSelectPortfolio={() => {}}
        pendingCount={0}
        portfolios={EASY_FIT}
      />,
    );
    expect(queryByRole('link', { name: /weekly report/i })).toBeNull();
  });
});

describe('OptimizerOverview — the cards', () => {
  it('renders the read as cards, the lead marked, and nothing when no read has landed', () => {
    const { queryByTestId } = mount();
    expect(queryByTestId('account-cards')).toBeNull();
    cleanup();
    accountReadData = envelope({
      candidates: [
        candidate(),
        candidate({
          id: 'delivery_collapse:formularios',
          detector: 'delivery_collapse',
          impact_per_day: 80,
        }),
      ],
      guards: [],
      model: 'deterministic',
    });
    const { getByTestId } = mount();
    const cards = [
      ...getByTestId('account-cards').querySelectorAll('[data-testid="account-card"]'),
    ];
    expect(cards).toHaveLength(2);
    expect(cards[0]?.getAttribute('data-lead')).toBe('true');
    expect(cards[1]?.getAttribute('data-lead')).toBe('false');
  });

  it('applies what was approved today against last night’s read', () => {
    accountReadData = envelope({
      candidates: [candidate()],
      guards: [],
      ceiling_defaults: { structure: 'autopilot' },
      model: 'deterministic',
    });
    approvalMaps = { families: {}, insights: { dead_tail: 'autopilot' } };
    const { container } = mount();
    expect(container.textContent).toContain('Acts on its own');
  });
});

describe('OptimizerOverview — the rows', () => {
  const rowNames = (root: HTMLElement) =>
    [...root.querySelectorAll('[data-testid="portfolio-row"]')].map(
      (row) => row.querySelector('p')?.textContent,
    );

  it('lists every portfolio as one row, furthest over target first', () => {
    const { getByTestId } = mount();
    expect(rowNames(getByTestId('portfolio-rows'))).toEqual([
      'MENSAJES // TODOS',
      'Prueba',
      'FORMULARIOS // TODOS',
      'Septiembre - Tours Programados',
    ]);
  });

  it('hands each row its window, so the row prints cost, results and spend', () => {
    const { getByTestId } = mount();
    const rows = getByTestId('portfolio-rows');
    const mensajes = [...rows.querySelectorAll('[data-testid="portfolio-row"]')][0] as HTMLElement;
    expect(mensajes.getAttribute('data-state')).toBe('bad');
    expect(mensajes.textContent).toContain('39.95 MXN');
    expect(mensajes.textContent).toContain('516');
    expect(mensajes.textContent).toContain('20,612 MXN');
  });

  it('reorders by name and flips direction', () => {
    const { getByTestId, getByRole } = mount();
    fireEvent.click(getByRole('button', { name: 'Name' }));
    expect(rowNames(getByTestId('portfolio-rows'))[0]).toBe('FORMULARIOS // TODOS');
    fireEvent.click(getByRole('button', { name: 'Ascending' }));
    expect(rowNames(getByTestId('portfolio-rows'))[0]).toBe('Septiembre - Tours Programados');
  });

  it('opens a portfolio when its row is clicked, and warms it on hover', () => {
    const { getByRole, onSelect, onPrefetch } = mount();
    const row = getByRole('button', { name: /^Prueba/ });
    fireEvent.mouseEnter(row);
    expect(onPrefetch).toHaveBeenCalledWith('prueba');
    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledWith('prueba');
  });
});

describe('OptimizerOverview — the header', () => {
  it('counts the book and offers the two actions', () => {
    const { getByTestId, getByRole, onCreate, onOpenActions } = mount();
    expect(getByTestId('book-line').textContent).toBe('4 portfolios · 36 ad sets');
    fireEvent.click(getByRole('button', { name: 'New portfolio' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    fireEvent.click(getByRole('button', { name: /Review 4 pending/ }));
    expect(onOpenActions).toHaveBeenCalledTimes(1);
  });

  it('subtracts the ad sets the rosters have lost and names them', () => {
    const { getByTestId } = mount([
      { ...MENSAJES, roster_state: 'partial', roster_missing_count: 4 },
      FORMULARIOS,
    ]);
    expect(getByTestId('book-line').textContent).toBe('2 portfolios · 17 ad sets · 4 lost');
  });
});
