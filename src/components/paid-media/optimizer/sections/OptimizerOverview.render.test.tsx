import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { EfficiencySeriesPoint, PortfolioListItem } from '@continuum/contracts';
import { cleanup, fireEvent, render, within } from '@testing-library/react';
import type { PlatformCardsState } from '../useOptimizerData';
import type { PortfolioMetricsState } from './detail/usePortfolioMetrics';
import recordedGoogle from './platforms/__fixtures__/google-vivo47-paid-media-metrics.json';
import type { AccountPlatformMetricsState } from './platforms/useAccountPlatformMetrics';
import type { GoogleAdsOverviewState } from './platforms/useGoogleAdsOverview';
import type { TikTokAdsOverviewState } from './platforms/useTikTokAdsOverview';

// The apply-mode pill needs a tooltip provider ancestor and is not what these tests are
// about. `mock.module` replaces it for the whole PROCESS, so this file runs on its own.
mock.module('../ApplyModePill', () => ({ ApplyModePill: () => null }));

// Every read the Overview makes is driven from these handles. Spread the real module: a
// partial replacement here would reach the next file in the run.
let accountReadData: unknown = null;
let accountReadLoading = false;
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
// The platform tab lives in the URL (?platform=); the hook reads it through next/navigation.
const navigation = { params: new URLSearchParams('tab=performance') };
mock.module('next/navigation', () => ({
  usePathname: () => '/scale',
  useSearchParams: () => navigation.params,
}));
const replaceState = spyOn(window.history, 'replaceState').mockImplementation(() => undefined);

let adAccounts: {
  platform: string;
  account_id: string;
  name: string | null;
  status: string | null;
  currency: string | null;
}[] = [
  {
    platform: 'meta_ads',
    account_id: 'act_easyfit',
    name: 'Easy Fit',
    status: 'active',
    currency: 'MXN',
  },
];
let googleState: GoogleAdsOverviewState = { status: 'no-connection' };
/** What the Google tab asked its read for: [brandId, window]. */
const googleAsked: unknown[][] = [];
const realGoogleOverview = await import('./platforms/useGoogleAdsOverview');
mock.module('./platforms/useGoogleAdsOverview', () => ({
  ...realGoogleOverview,
  useGoogleAdsOverview: (...args: unknown[]) => {
    googleAsked.push(args);
    return googleState;
  },
}));

// The multi-platform producer. Its RPC is not deployed yet, so 'unavailable' is the default.
let metricsState: AccountPlatformMetricsState = { status: 'unavailable' };
const realMetrics = await import('./platforms/useAccountPlatformMetrics');
mock.module('./platforms/useAccountPlatformMetrics', () => ({
  ...realMetrics,
  useAccountPlatformMetrics: () => metricsState,
}));
const { EASY_FIT_MP1, META_ONLY } = await import('./platforms/__fixtures__/accountPlatformMetrics');

// Each portfolio's member platforms, read as the detail's By platform reads them. The RPC is
// not deployed yet, so every portfolio starts 'unavailable' and keeps the managed platform.
let memberStates = new Map<string, PortfolioMetricsState>();
const realPortfolioPlatforms = await import('./platforms/portfolioPlatforms');
mock.module('./platforms/portfolioPlatforms', () => ({
  ...realPortfolioPlatforms,
  usePortfolioMemberStates: (ids: readonly string[]) =>
    new Map(ids.map((id) => [id, memberStates.get(id) ?? { status: 'unavailable' }])),
}));
const { portfolioMetricsFixture } = await import(
  './attribution/__fixtures__/portfolioMetricsFixture'
);

// The TikTok tab's own snapshots read, for the advertiser the producer names.
let tiktokState: TikTokAdsOverviewState = { status: 'loading' };
const tiktokAsked: (string | null)[] = [];
const realTikTokOverview = await import('./platforms/useTikTokAdsOverview');
mock.module('./platforms/useTikTokAdsOverview', () => ({
  ...realTikTokOverview,
  useTikTokAdsOverview: (_brandId: string, advertiserId: string | null) => {
    tiktokAsked.push(advertiserId);
    return advertiserId ? tiktokState : { status: 'not-connected' };
  },
}));
const { buildGoogleOverview, GoogleAccountOverviewSchema, GoogleTopCampaignsSchema } = await import(
  './platforms/googleAdsOverviewModel'
);
const { TIKTOK_DOC_SHAPED_ENVELOPE } = await import('./platforms/__fixtures__/tiktokSnapshots');
const { buildTikTokOverview, TikTokSnapshotsEnvelopeSchema } = await import(
  './platforms/tiktokAdsOverviewModel'
);

// The brand's portfolio read, before any account filter, and one platform's cards. The Google
// tab selects its rows from the brand read with the real selector, so what these tests prove
// about which portfolios list is what the hook does.
let brandRows: PortfolioListItem[] = [];
let platformCardsState: PlatformCardsState = { status: 'ready', cards: [] };
const realOptimizerData = await import('../useOptimizerData');
mock.module('../useOptimizerData', () => ({
  ...realOptimizerData,
  useOptimizerPlatformPortfolios: (_brandId: string, platform: 'google_ads') => ({
    data: realOptimizerData.portfoliosOnPlatform(brandRows, platform, adAccounts),
    isPending: false,
  }),
  useOptimizerPlatformCards: () => platformCardsState,
  useOptimizerAdAccounts: () => ({
    data: adAccounts,
    isLoading: false,
    isError: false,
    isSuccess: true,
  }),
  useOptimizerAccountRead: () => ({
    data: accountReadData,
    isLoading: accountReadLoading,
    isError: false,
  }),
  useAccountApprovals: () => ({ data: approvalMaps, isLoading: false, isError: false }),
  useRequestAccountRead: () => ({ mutate: () => {}, isPending: false, error: null }),
  useOptimizerPortfolioEfficiency: () => efficiency,
  // The pacing read is a query per flight; the rows' pacing is not what this file renders.
  useOptimizerPortfolioPacing: () => new Map(),
  // A card's own control asks the service through this; nothing here confirms a write.
  useApplyOptimizerActions: () => ({ mutateAsync: async () => null }),
  useRevertOptimizerAction: () => ({ mutateAsync: async () => null, isPending: false }),
}));

const { OptimizerOverview, kindTileSub, autopilotTileSub } = await import('./OptimizerOverview');
const { cardActionAvailability, cardActionLabel, cardActionsOf, cardWriteOf } = await import(
  './platformCards/platformCardActionModel'
);
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
    // What the contract defaults a row without `platforms` to (a server before 20261015160023).
    platforms: [],
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

function mount(
  portfolios: PortfolioListItem[] = EASY_FIT,
  pendingCount = 4,
  chromeInShell?: boolean,
) {
  const onOpenActions = mock(() => {});
  const onOpenActivity = mock(() => {});
  const onSelect = mock((_id: string) => {});
  const onCreate = mock(() => {});
  const onPrefetch = mock((_id: string) => {});
  const utils = render(
    <OptimizerOverview
      adAccountId="act_easyfit"
      brandId="b1"
      chromeInShell={chromeInShell}
      currency="MXN"
      onCreatePortfolio={onCreate}
      onOpenActions={onOpenActions}
      onOpenActivity={onOpenActivity}
      onPrefetchPortfolio={onPrefetch}
      onSelectPortfolio={onSelect}
      pendingCount={pendingCount}
      portfolios={portfolios}
    />,
  );
  return { ...utils, onOpenActions, onOpenActivity, onSelect, onCreate, onPrefetch };
}

const follows = (a: Element, b: Element) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

afterEach(() => {
  navigation.params = new URLSearchParams('tab=performance');
  replaceState.mockClear();
  adAccounts = [
    {
      platform: 'meta_ads',
      account_id: 'act_easyfit',
      name: 'Easy Fit',
      status: 'active',
      currency: 'MXN',
    },
  ];
  googleState = { status: 'no-connection' };
  googleAsked.length = 0;
  metricsState = { status: 'unavailable' };
  memberStates = new Map();
  tiktokState = { status: 'loading' };
  tiktokAsked.length = 0;
  window.localStorage.clear();
  accountReadData = null;
  accountReadLoading = false;
  brandRows = [];
  platformCardsState = { status: 'ready', cards: [] };
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
  it('states the spend, the window and the decisions in one sentence', () => {
    const { getByTestId } = mount();
    expect(getByTestId('overview-headline').textContent).toBe(
      'The account spent $23,911 MXN in 7 days. 4 decisions waiting.',
    );
    expect(getByTestId('overview-decisions').className).toContain('text-primary-ink');
  });

  it('carries every figure with its provenance, on the node that prints it', () => {
    const { getByTestId } = mount();
    const headline = getByTestId('overview-headline');
    const spend = headline.querySelector('[data-figure="overview.spend"]');
    expect(spend?.getAttribute('data-figure-raw')).toBe('23911');
    expect(spend?.getAttribute('data-figure-window')).toBe('d7');
    expect(spend?.className).toContain('font-mono');
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

  it('carries the state on the cell, draws no box and no state border, and no chart', () => {
    const { getByTestId } = mount();
    const conversations = getByTestId('tile-kind-conversations');
    expect(conversations.getAttribute('data-state')).toBe('bad');
    expect(conversations.getAttribute('data-variant')).toBe('inline');
    expect(conversations.className).not.toContain('border-t-destructive');
    expect(conversations.className).not.toContain('bg-card');
    expect(getByTestId('tile-kind-leads').getAttribute('data-state')).toBe('warn');
    expect(getByTestId('tile-kind-purchases').getAttribute('data-state')).toBe('none');
    expect(getByTestId('tile-spend').getAttribute('data-emphasis')).toBe('hero');
    expect(getByTestId('account-tiles').querySelector('svg')).toBeNull();
  });

  it('colours only the cost that moved against last week: cheaper reads green', () => {
    const { getByTestId } = mount();
    const delta = getByTestId('tile-kind-conversations').querySelector(
      '[data-testid="cost-prior-delta"]',
    );
    expect(delta?.textContent).toBe('▼ 3%');
    expect(delta?.getAttribute('data-direction')).toBe('down');
    expect(delta?.className).toContain('text-success');
    expect(delta?.getAttribute('title')).toBe('prev. week $41.37 MXN');
    // A kind with no prior cost gets no delta at all — none is invented.
    expect(
      getByTestId('tile-kind-purchases').querySelector('[data-testid="cost-prior-delta"]'),
    ).toBeNull();
  });

  it('says cost, target and last week under a result kind', () => {
    const { getByTestId } = mount();
    expect(getByTestId('tile-kind-conversations').textContent).toContain('516');
    expect(getByTestId('tile-kind-conversations').textContent).toContain(
      '$39.95 MXN each · target $30.00 MXN · 33% over target · ▼ 3%',
    );
    const distance = getByTestId('tile-kind-conversations').querySelector(
      '[data-testid="cost-target-distance"]',
    );
    expect(distance?.className).toContain('text-destructive');
    expect(getByTestId('tile-kind-leads').textContent).toContain('target $25.00 MXN–$35.00 MXN');
    expect(getByTestId('tile-kind-purchases').textContent).toContain('$408 MXN no results');
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
    expect(tile.querySelector('[data-testid="cost-target-distance"]')).toBeNull();
  });

  it('reads the spend against the plan and names who only recommends', () => {
    const { getByTestId, onOpenActions } = mount();
    const spend = getByTestId('tile-spend');
    expect(spend.textContent).toContain('$23,911 MXN');
    expect(spend.textContent).toContain('$3,416 MXN per day · plan $4,184 MXN');
    expect(spend.getAttribute('data-state')).toBe('warn');
    expect(getByTestId('tile-autopilot').textContent).toContain('3/4');
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
    expect(kindTileSub(conversations as never, 'MXN')).toBe('$39.95 MXN each · target $30.00 MXN');
    expect(kindTileSub(leads as never, 'MXN')).toContain('target $25.00 MXN–$35.00 MXN');
    expect(kindTileSub(purchases as never, 'MXN')).toBe('$408 MXN no results');
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

describe('OptimizerOverview — the Jaina band follows the platform tab', () => {
  const bandOn = (params: string) => {
    navigation.params = new URLSearchParams(params);
    const { getByTestId } = mount();
    const band = getByTestId('jaina-entry-chips');
    const links = [...band.querySelectorAll('a')];
    return {
      band,
      labels: links.map((link) => link.textContent),
      hrefs: links.map((link) => link.getAttribute('href') ?? ''),
    };
  };

  it('asks across platforms on All, and its links carry no platform', () => {
    const { band, labels, hrefs } = bandOn('tab=performance');
    expect(labels).toContain('Which platform buys leads cheapest?');
    expect(band.getAttribute('data-platform')).toBeNull();
    for (const href of hrefs) expect(href).toStartWith('/scale?tab=jaina&new=1&prompt=');
  });

  it("keeps today's account questions on Meta, carrying meta", () => {
    const { labels, hrefs } = bandOn('tab=performance&platform=meta');
    expect(labels).toEqual([
      'Why is MENSAJES // TODOS expensive?',
      'What to pause this week?',
      'How is Septiembre - Tours Programados doing?',
      "Where's the budget?",
      'Summary for the client',
    ]);
    for (const href of hrefs)
      expect(href).toStartWith('/scale?tab=jaina&platform=meta&new=1&prompt=');
  });

  it("asks Google's questions on the Google tab, carrying google_ads", () => {
    grantGoogle();
    const { labels, hrefs } = bandOn('platform=google_ads');
    expect(labels).toEqual([
      'Which search terms bring leads?',
      'Is Search limited by budget?',
      'Which asset group is missing assets?',
      'Is any campaign not serving?',
    ]);
    for (const href of hrefs) {
      expect(href).toStartWith('/scale?tab=jaina&platform=google_ads&new=1&prompt=');
      expect(decodeURIComponent(href.split('prompt=')[1] ?? '')).toContain('Google Ads account');
    }
  });

  it("asks TikTok's questions on the TikTok tab, carrying tiktok_ads", () => {
    metricsState = { status: 'ready', metrics: EASY_FIT_MP1 };
    const { labels, hrefs } = bandOn('platform=tiktok_ads');
    expect(labels[0]).toBe('Which video is fatiguing?');
    expect(labels).toHaveLength(4);
    for (const href of hrefs) {
      expect(href).toStartWith('/scale?tab=jaina&platform=tiktok_ads&new=1&prompt=');
      expect(decodeURIComponent(href.split('prompt=')[1] ?? '')).toContain('TikTok Ads account');
    }
  });

  // PP-L1-tiktok-tab-ask-jaina-band-on-unconnected-tab: a question that deep-links to a TikTok
  // Ads prompt implies ads data the account does not have. The empty state is the whole tab.
  it('renders no band on a tab whose platform is not connected', () => {
    for (const platform of ['tiktok_ads', 'google_ads'] as const) {
      navigation.params = new URLSearchParams(`tab=performance&platform=${platform}`);
      const { queryByTestId, getByTestId } = mount();
      expect(getByTestId(`platform-connect-${platform}`)).toBeTruthy();
      expect(queryByTestId('jaina-entry-chips')).toBeNull();
    }
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
        onOpenActivity={() => {}}
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

// optimizer:multiplatform:signals:bench runs recorded Google signals through the real ingest,
// persist and optimizer_get_account_read on Postgres 16, then runs this block on the RPC's very
// answer (OPTIMIZER_ACCOUNT_READ_DOC). The committed copy is that answer from its last --record.
describe('OptimizerOverview — platform cards from the bench document', () => {
  const docPath =
    process.env.OPTIMIZER_ACCOUNT_READ_DOC ??
    join(import.meta.dir, 'platformCards/__fixtures__/accountReadPlatformCards.json');
  const document = AccountReadEnvelopeSchema.parse(JSON.parse(readFileSync(docPath, 'utf8')));
  const candidates = document?.read?.candidates ?? [];
  const platformCandidates = candidates.filter((c) => c.platform_card);

  it('the bench document: cardActionsOf keys exactly the candidates that carry a card_action', () => {
    const actions = cardActionsOf(candidates);
    const carrying = candidates.filter((c) => c.card_action);
    expect(carrying.length).toBeGreaterThan(0);
    expect([...actions.keys()].sort()).toEqual(carrying.map((c) => c.id).sort());
    for (const c of carrying) {
      expect(actions.get(c.id)).toEqual({
        portfolioId: c.card_action?.portfolio_id,
        action: c.card_action?.action,
        recommendationId: c.card_action?.recommendation_id,
        applyEnabled: c.card_action?.apply_enabled,
      });
    }
  });

  it('the bench document: every card renders its platform variant, and each ready card_action is the control platformCardActionModel words', () => {
    accountReadData = document;
    const { getByTestId, queryAllByTestId, queryByRole } = mount();
    const more = queryByRole('button', { name: / more · / });
    if (more) fireEvent.click(more);
    const variants = [
      ...getByTestId('account-cards').querySelectorAll('[data-testid="account-card"]'),
    ]
      .map((card) => card.getAttribute('data-variant'))
      .filter((variant) => variant !== 'generic')
      .sort();
    expect(variants).toEqual(platformCandidates.map((c) => c.platform_card?.variant ?? '').sort());

    const actions = cardActionsOf(candidates);
    const expected = platformCandidates.flatMap((c) => {
      const target = actions.get(c.id);
      const write = cardWriteOf(target);
      return c.platform_card && write && cardActionAvailability(c.platform_card, target) === 'ready'
        ? [cardActionLabel(write)]
        : [];
    });
    expect(expected.length).toBeGreaterThan(0);
    expect(
      queryAllByTestId('platform-card-action')
        .map((b) => b.textContent)
        .sort(),
    ).toEqual(expected.sort());
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
    expect(mensajes.textContent).toContain('$39.95 MXN');
    expect(mensajes.textContent).toContain('516');
    expect(mensajes.textContent).toContain('$20,612 MXN');
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

  it('puts the book on the meta line, beside the window', () => {
    const { getByTestId } = mount();
    expect(getByTestId('overview-subline').contains(getByTestId('book-line'))).toBe(true);
  });

  it('leaves the platform tabs and the toolbar to the shell when it draws them', () => {
    const { getByTestId, queryByTestId, queryByRole } = mount(EASY_FIT, 4, true);
    expect(queryByTestId('platform-tabs')).toBeNull();
    expect(queryByTestId('overview-weekly-report')).toBeNull();
    expect(queryByRole('button', { name: 'New portfolio' })).toBeNull();
    expect(queryByRole('button', { name: /Review 4 pending/ })).toBeNull();
    // The figures, the book and the decision tile's own Review stay.
    expect(getByTestId('book-line').textContent).toBe('4 portfolios · 36 ad sets');
    expect(getByTestId('tile-decisions').querySelector('button')?.textContent).toBe('Review →');
  });
});

// Vivo 47's recorded Google Ads read, as the Google tab's own test builds it.
const VIVO_47 = {
  platform: 'google_ads',
  account_id: '3710693645',
  name: 'Vivo 47',
  status: null,
  currency: 'MXN',
};
const VIVO_47_OVERVIEW = buildGoogleOverview(
  GoogleAccountOverviewSchema.parse(recordedGoogle.account_overview),
  GoogleTopCampaignsSchema.parse(recordedGoogle.top_campaigns),
);

const grantGoogle = () => {
  adAccounts = [
    ...adAccounts,
    {
      platform: 'google_ads',
      account_id: '3710693645',
      name: 'Vivo 47',
      status: null,
      currency: 'MXN',
    },
  ];
};

/** The Overview's own children, by test id — the order the O1 bench grades. */
const overviewChildren = (root: HTMLElement) =>
  [...root.children].map(
    (child) => child.getAttribute('data-testid') ?? `(${child.tagName.toLowerCase()})`,
  );

describe('OptimizerOverview — the platform tabs', () => {
  it('puts All · Meta · Google · TikTok above the headline, All selected by default', () => {
    grantGoogle();
    const { getByTestId } = mount();
    const tabs = getByTestId('platform-tabs');
    expect(
      [...tabs.querySelectorAll('[role="tab"]')].map((tab) => tab.getAttribute('data-tab')),
    ).toEqual(['all', 'meta', 'google_ads', 'tiktok_ads']);
    expect(getByTestId('platform-tab-all').getAttribute('aria-selected')).toBe('true');
    expect(follows(tabs, getByTestId('overview-headline'))).toBe(true);
  });

  it('keeps a platform with no connection in the row with Connect', () => {
    grantGoogle();
    const { getByTestId } = mount();
    expect(getByTestId('platform-tab-meta').textContent).toBe('Meta');
    expect(getByTestId('platform-tab-google_ads').textContent).toBe('Google');
    expect(getByTestId('platform-tab-tiktok_ads').textContent).toBe('TikTok· Connect');
  });

  it('shows a brand on Meta alone all four tabs, and no note: tabs, then the header line', () => {
    const { getByTestId, queryByTestId } = mount();
    const tabs = getByTestId('platform-tabs');
    expect(
      [...tabs.querySelectorAll('[role="tab"]')].map((tab) => tab.getAttribute('data-tab')),
    ).toEqual(['all', 'meta', 'google_ads', 'tiktok_ads']);
    expect(getByTestId('platform-tab-google_ads').getAttribute('data-connected')).toBe('false');
    expect(getByTestId('platform-tab-tiktok_ads').getAttribute('data-connected')).toBe('false');
    expect(queryByTestId('multiplatform-unavailable')).toBeNull();
    expect(overviewChildren(getByTestId('optimizer-overview')).slice(0, 3)).toEqual([
      'platform-tabs',
      '(div)',
      'overview-hero',
    ]);
  });

  it("offers a Meta-only brand Connect Google Ads on Google's tab, to the integration settings", () => {
    navigation.params = new URLSearchParams('tab=performance&platform=google_ads');
    const { getByTestId, queryByTestId } = mount();
    const connect = getByTestId('platform-connect-google_ads');
    expect(connect.textContent).toBe('Connect Google Ads');
    expect(connect.getAttribute('href')).toBe('/settings?section=integrations');
    expect(getByTestId('google-empty-no-connection').textContent).toContain(
      "Google Ads isn't connected.",
    );
    expect(queryByTestId('google-tab')).toBeNull();
  });

  it("offers a Meta-only brand Connect TikTok Ads on TikTok's tab, to the integration settings", () => {
    navigation.params = new URLSearchParams('tab=performance&platform=tiktok_ads');
    const { getByTestId } = mount();
    const connect = getByTestId('platform-connect-tiktok_ads');
    expect(connect.textContent).toBe('Connect TikTok Ads');
    expect(connect.getAttribute('href')).toBe('/settings?section=integrations');
    expect(getByTestId('tiktok-empty').textContent).toContain("TikTok Ads isn't connected yet");
  });

  it('shows a brand with Google connected its Google read on the tab, and no Connect', () => {
    grantGoogle();
    googleState = { status: 'ready', account: VIVO_47, overview: VIVO_47_OVERVIEW };
    navigation.params = new URLSearchParams('tab=performance&platform=google_ads');
    const { getByTestId, queryByTestId } = mount();
    expect(getByTestId('google-headline').textContent).toStartWith('Google spent $55,205 MXN');
    expect(getByTestId('google-tiles')).toBeTruthy();
    expect(queryByTestId('platform-connect-google_ads')).toBeNull();
    expect(getByTestId('platform-tab-google_ads').getAttribute('data-connected')).toBe('true');
  });

  it("keeps All exactly today's O1 for a Meta-only brand once the tabs sit above it", () => {
    const { getByTestId } = mount();
    expect(getByTestId('overview-headline').textContent).toStartWith(
      'The account spent $23,911 MXN',
    );
    expect(getByTestId('portfolio-rows')).toBeTruthy();
  });

  it('drops Connect from Google once a Google Ads account is granted to the brand', () => {
    adAccounts = [
      ...adAccounts,
      {
        platform: 'google_ads',
        account_id: '3710693645',
        name: 'Vivo 47',
        status: null,
        currency: 'MXN',
      },
    ];
    const { getByTestId } = mount();
    expect(getByTestId('platform-tab-google_ads').getAttribute('data-connected')).toBe('true');
    expect(getByTestId('platform-tab-google_ads').textContent).toBe('Google');
  });

  it('keeps the tab in the URL as ?platform=, and All out of it', () => {
    navigation.params = new URLSearchParams('tab=performance&platform=meta');
    const { getByTestId } = mount();
    fireEvent.click(getByTestId('platform-tab-google_ads'));
    expect(replaceState).toHaveBeenLastCalledWith(
      null,
      '',
      '/scale?tab=performance&platform=google_ads',
    );
    fireEvent.click(getByTestId('platform-tab-all'));
    expect(replaceState).toHaveBeenLastCalledWith(null, '', '/scale?tab=performance');
  });

  it('underlines the active platform tab in its own colour', () => {
    navigation.params = new URLSearchParams('platform=meta');
    const { getByTestId } = mount();
    expect(getByTestId('platform-tab-meta').className).toContain('border-platform-meta');
    expect(getByTestId('platform-tab-google_ads').className).toContain('border-transparent');
  });

  for (const tab of ['all', 'meta'] as const) {
    it(`renders today's O1 under ${tab}, with a Meta chip on every card and every row`, () => {
      navigation.params = new URLSearchParams(tab === 'all' ? '' : `platform=${tab}`);
      accountReadData = envelope({
        candidates: [candidate(), candidate({ id: 'dead_tail:prueba', portfolio_ids: ['prueba'] })],
        guards: [],
        model: 'deterministic',
      });
      const { getAllByTestId, getByTestId } = mount();
      expect(getByTestId('overview-headline')).toBeTruthy();
      expect(getByTestId('account-tiles')).toBeTruthy();
      const cards = getAllByTestId('account-card');
      const rows = getAllByTestId('portfolio-row');
      expect(cards).toHaveLength(2);
      expect(rows).toHaveLength(4);
      for (const node of [...cards, ...rows]) {
        const chip = node.querySelector('[data-testid="platform-chip"]');
        expect(chip?.getAttribute('data-platform')).toBe('meta');
        expect(chip?.textContent).toBe('Meta');
      }
    });
  }

  it('renders Google as its own screen, without the Meta book', () => {
    navigation.params = new URLSearchParams('platform=google_ads');
    googleState = { status: 'no-grant' };
    const { getByTestId, queryByTestId } = mount();
    expect(getByTestId('platform-tab-google_ads').getAttribute('aria-selected')).toBe('true');
    expect(getByTestId('google-empty-no-grant')).toBeTruthy();
    expect(queryByTestId('overview-headline')).toBeNull();
    expect(queryByTestId('portfolio-rows')).toBeNull();
  });

  it('renders TikTok as not connected, with no numbers', () => {
    navigation.params = new URLSearchParams('platform=tiktok_ads');
    const { getByTestId, queryAllByTestId } = mount();
    expect(getByTestId('tiktok-empty').textContent).toContain("TikTok Ads isn't connected yet");
    expect(queryAllByTestId('figure')).toHaveLength(0);
    expect(getByTestId('tiktok-empty').textContent).not.toMatch(/\d/);
  });
});

describe('OptimizerOverview — the multi-platform frame (MP1)', () => {
  const metaO1 = () => {
    navigation.params = new URLSearchParams('tab=performance&platform=meta');
    const { getByTestId, unmount } = mount();
    const snapshot = {
      headline: getByTestId('overview-headline').textContent,
      tiles: getByTestId('account-tiles').textContent,
    };
    unmount();
    return snapshot;
  };

  it('leads All with the producer: the account across platforms, its tiles, no Meta-only sum', () => {
    metricsState = { status: 'ready', metrics: EASY_FIT_MP1 };
    const { getByTestId, queryByTestId } = mount();
    const headline = getByTestId('overview-headline');
    expect(headline.getAttribute('data-source')).toBe('account-platform-metrics');
    expect(headline.textContent).toStartWith(
      'The account spent $38,411 MXN in 7 days across three platforms',
    );
    const tiles = getByTestId('account-tiles');
    expect(tiles.getAttribute('data-source')).toBe('account-platform-metrics');
    expect(tiles.textContent).toContain('Meta 62% · Google 29% · TikTok 9%');
    expect(tiles.textContent).toContain('Google cheapest at $31.40 MXN');
    expect(getByTestId('overview-subline').textContent).toContain('Meta takes 62% of the spend');
    expect(queryByTestId('multiplatform-unavailable')).toBeNull();
    // The cards and the rows stay: they are the O1 below the frame.
    expect(getByTestId('portfolio-rows')).toBeTruthy();
  });

  it('marks TikTok connected when the producer reads it, and keeps Connect on what it does not', () => {
    metricsState = { status: 'ready', metrics: EASY_FIT_MP1 };
    const first = mount();
    expect(first.getByTestId('platform-tab-tiktok_ads').getAttribute('data-connected')).toBe(
      'true',
    );
    first.unmount();
    metricsState = { status: 'ready', metrics: META_ONLY };
    grantGoogle();
    const second = mount();
    expect(second.getByTestId('platform-tab-tiktok_ads').textContent).toContain('Connect');
    expect(second.getByTestId('platform-tab-google_ads').getAttribute('data-connected')).toBe(
      'true',
    );
  });

  it("never puts the not-available note above the hero on All: tabs, header line, then today's Meta O1", () => {
    grantGoogle();
    const { getByTestId, queryByTestId } = mount();
    expect(queryByTestId('multiplatform-unavailable')).toBeNull();
    expect(overviewChildren(getByTestId('optimizer-overview')).slice(0, 3)).toEqual([
      'platform-tabs',
      '(div)',
      'overview-hero',
    ]);
    expect(getByTestId('overview-headline').getAttribute('data-source')).toBeNull();
    expect(getByTestId('overview-headline').textContent).toStartWith(
      'The account spent $23,911 MXN',
    );
  });

  it('says it is reading across platforms while the producer loads, with no figure', () => {
    metricsState = { status: 'loading' };
    const { getByTestId, queryByTestId } = mount();
    const headline = getByTestId('overview-headline');
    expect(headline.getAttribute('data-pending')).toBe('true');
    expect(headline.querySelector('.sr-only')?.textContent).toBe(
      'Reading the account across platforms…',
    );
    // The sentence-long bar is a placeholder, not a figure: hidden from assistive tech.
    expect(headline.querySelector('[data-slot="skeleton-text"]')?.getAttribute('aria-hidden')).toBe(
      'true',
    );
    expect(headline.querySelector('[data-figure]')).toBeNull();
    expect(queryByTestId('account-tiles')).toBeNull();
  });

  // PP-L1V-cls-overview-0.865: the rows used to sit under the band until the producer and the
  // account read landed, then got pushed down twice. Each block is held at its own size.
  it('holds the figure row and the platforms table open while the producer reads, borderless', () => {
    metricsState = { status: 'loading' };
    adAccounts = [
      ...adAccounts,
      {
        platform: 'google_ads',
        account_id: '123',
        name: 'Easy Fit Google',
        status: 'active',
        currency: 'MXN',
      },
    ];
    const { getByTestId, getAllByTestId, queryByTestId } = mount();
    const tiles = getByTestId('account-tiles-skeleton');
    expect(getAllByTestId('tile-skeleton')).toHaveLength(5);
    expect(getByTestId('platform-comparison-skeleton').textContent).toContain(
      'Platforms side by side',
    );
    expect(
      getByTestId('overview-subline').querySelectorAll('[data-slot="skeleton-text"]').length,
    ).toBeGreaterThan(0);
    const rows = getByTestId('portfolio-rows');
    expect(follows(tiles, rows)).toBe(true);
    for (const block of [tiles, getByTestId('platform-comparison-skeleton')]) {
      expect(
        block.getAttribute('aria-hidden') ?? block.querySelector('[aria-hidden]'),
      ).toBeTruthy();
      expect(block.outerHTML).not.toMatch(/(^|\s|")(border|rounded-lg border|bg-card)(\s|")/);
    }
    expect(queryByTestId('account-tiles')).toBeNull();
  });

  it('collapses the platforms placeholder to its Show line for a viewer who hid the table', () => {
    metricsState = { status: 'loading' };
    window.localStorage.setItem('continuum:optimizer:overview:platform-comparison', 'hidden');
    adAccounts = [
      ...adAccounts,
      { platform: 'google_ads', account_id: '1', name: null, status: 'active', currency: 'MXN' },
    ];
    const { getByTestId } = mount();
    expect(getByTestId('platform-comparison-skeleton').textContent).toBe(
      'Show platforms side by side',
    );
  });

  it('reserves no platforms table for a brand on one platform', () => {
    metricsState = { status: 'loading' };
    const { queryByTestId, getByTestId } = mount();
    expect(getByTestId('account-tiles-skeleton')).toBeTruthy();
    expect(queryByTestId('platform-comparison-skeleton')).toBeNull();
  });

  it('holds the recommendations open while the account read loads, and drops it once read', () => {
    accountReadLoading = true;
    const first = mount();
    const held = first.getByTestId('overview-recommendations-skeleton');
    expect(held.querySelector('[data-testid="account-card"]')).toBeNull();
    // Nothing is painted under cards that have not opened yet, so nothing is pushed.
    expect(first.queryByTestId('portfolio-rows')).toBeNull();
    cleanup();
    accountReadLoading = false;
    const second = mount();
    expect(second.queryByTestId('overview-recommendations-skeleton')).toBeNull();
    expect(second.queryByTestId('account-tiles-skeleton')).toBeNull();
    expect(second.getByTestId('portfolio-rows')).toBeTruthy();
  });

  it('paints the portfolio rows once, in their sorted order, after the cycles land', () => {
    efficiency = { series: [], pending: true, failed: 0, retryFailed };
    const first = mount();
    expect(first.queryByTestId('portfolio-rows')).toBeNull();
    cleanup();
    efficiency = { series: EASY_FIT_SERIES, pending: false, failed: 0, retryFailed };
    expect(mount().getByTestId('portfolio-rows')).toBeTruthy();
  });

  // PP-L1V-cls-overview-0.865 residual (768: 0.117–0.216, measured on the dev tree). Three
  // late arrivals still moved the rows: the read's freshness fact wrapped the meta line onto a
  // second line (+18px), the real card's title wrapped beside its footer column while the
  // placeholder ran full width on one line (+21px), and the spend tile's platform split wrapped
  // to two lines (+14px). Each placeholder now takes the shape the arrival will.
  it("holds the meta line's freshness fact while the account read loads", () => {
    accountReadLoading = true;
    const { getByTestId } = mount();
    const held = getByTestId('account-read-freshness-skeleton');
    expect(held.getAttribute('aria-hidden')).toBe('true');
    expect(getByTestId('overview-subline').contains(held)).toBe(true);
  });

  it('lays the recommendation placeholder out as the card: the title column beside its footer', () => {
    accountReadLoading = true;
    const { getByTestId } = mount();
    const held = getByTestId('overview-recommendations-skeleton');
    const grid = held.querySelector('.grid');
    expect(grid?.className).toContain('@2xl/recs:grid-cols-[minmax(0,1fr)_auto]');
    expect(held.querySelector('.\\@container\\/recs')).toBeTruthy();
    expect(grid?.querySelector('[data-testid="recommendation-footer-skeleton"]')).toBeTruthy();
    // The title is a sentence: it wraps where a title does, not one unbreakable bar.
    const title = grid?.querySelector('p [data-slot="skeleton-text"]');
    expect(title?.className).toContain('box-decoration-clone');
    expect(held.outerHTML).not.toMatch(/(^|\s|")(border|bg-card|bg-primary\/5|bg-muted\/50)(\s|")/);
  });

  // The bench's own brand reads Meta only: the two-platform placeholders (a top-spend fact, a
  // platform split, "across two platforms") wrapped onto lines the real page never has, and
  // everything below moved UP 47px when the producer landed (768 CLS 0.267).
  it('shapes the placeholders for one platform when only one is connected', () => {
    metricsState = { status: 'loading' };
    const { getByTestId, getAllByTestId } = mount();
    expect(getByTestId('overview-headline').textContent).toContain('on Meta');
    expect(getByTestId('overview-headline').textContent).not.toContain('two platforms');
    expect(getByTestId('overview-subline').textContent).not.toMatch(/takes \d+% of the spend/);
    expect(getAllByTestId('tile-skeleton')[0].textContent).not.toMatch(/Meta \d+% · Google/);
  });

  it("writes the spend placeholder's line as the platforms split it, so it wraps where it will", () => {
    metricsState = { status: 'loading' };
    adAccounts = [
      ...adAccounts,
      { platform: 'google_ads', account_id: '1', name: null, status: 'active', currency: 'MXN' },
    ];
    const { getAllByTestId, getByTestId } = mount();
    expect(getByTestId('overview-subline').textContent).toMatch(/takes \d+% of the spend/);
    const spend = getAllByTestId('tile-skeleton')[0];
    expect(spend.textContent).toMatch(/Meta \d+% · Google \d+%/);
    const sub = spend.querySelector('p.mt-1 [data-slot="skeleton-text"]');
    expect(sub?.className).toContain('box-decoration-clone');
  });

  it('names a failed read and falls back to the Meta figures', () => {
    metricsState = { status: 'error', message: 'Could not read the multi-platform numbers.' };
    const { getByTestId } = mount();
    expect(getByTestId('multiplatform-error').textContent).toContain('The figures below are Meta');
    expect(getByTestId('overview-headline').textContent).toStartWith(
      'The account spent $23,911 MXN',
    );
  });

  it("keeps Meta's tab exactly today's O1, whatever the producer says", () => {
    const before = metaO1();
    metricsState = { status: 'ready', metrics: EASY_FIT_MP1 };
    const after = metaO1();
    expect(after).toEqual(before);
    metricsState = { status: 'loading' };
    expect(metaO1()).toEqual(before);
    navigation.params = new URLSearchParams('tab=performance&platform=meta');
    metricsState = { status: 'unavailable' };
    const { queryByTestId } = mount();
    expect(queryByTestId('multiplatform-unavailable')).toBeNull();
  });

  it("leads Google's tab with its producer row, then the split by campaign type", () => {
    navigation.params = new URLSearchParams('tab=performance&platform=google_ads');
    metricsState = { status: 'ready', metrics: EASY_FIT_MP1 };
    const { getByTestId, queryByTestId } = mount();
    expect(getByTestId('platform-headline').textContent).toStartWith('Google spent $11,200 MXN');
    expect(getByTestId('platform-tiles-google_ads').textContent).toContain('118');
    // The edge read is the breakdown here, not a second headline.
    expect(queryByTestId('google-headline')).toBeNull();
  });

  it("reads Google's split by campaign type over the producer's own window", () => {
    navigation.params = new URLSearchParams('tab=performance&platform=google_ads');
    metricsState = { status: 'ready', metrics: EASY_FIT_MP1 };
    mount();
    expect(googleAsked.at(-1)?.[1]).toEqual({ since: '2026-09-21', until: '2026-09-27' });
  });

  it('says what is true when Google is connected but the Optimizer has not read it: the live figures come from Google', () => {
    grantGoogle();
    navigation.params = new URLSearchParams('tab=performance&platform=google_ads');
    googleState = { status: 'ready', account: VIVO_47, overview: VIVO_47_OVERVIEW };
    metricsState = {
      status: 'ready',
      metrics: {
        ...EASY_FIT_MP1,
        totals_by_platform: EASY_FIT_MP1.totals_by_platform.map((row) =>
          row.platform === 'google_ads'
            ? {
                ...row,
                spend: null,
                prior_spend: null,
                share_of_spend: null,
                spend_delta_pct: null,
                unclassified_spend: null,
                results_by_kind: [],
              }
            : row,
        ),
      },
    };
    const { getByTestId, queryByText } = mount();
    expect(queryByText(/nothing has been read from it yet/)).toBeNull();
    expect(getByTestId('platform-reading-note').textContent).toContain(
      "The live figures below come straight from Google. The Optimizer's own reading of Google starts once a portfolio holds Google campaigns.",
    );
    // Google's own read stands in full beneath it, over the producer's window.
    expect(getByTestId('google-headline').textContent).toStartWith('Google spent $55,205 MXN');
    expect(googleAsked.at(-1)?.[1]).toEqual({ since: '2026-09-21', until: '2026-09-27' });
    // The way in is the tab's own portfolio rows, which hold none yet.
    expect(getByTestId('platform-reading-note').querySelector('button')).toBeNull();
    expect(getByTestId('platform-portfolios-empty').querySelector('button')?.textContent).toBe(
      'Create a portfolio',
    );
  });

  it("falls back to Google's own edge read when the producer is not deployed", () => {
    navigation.params = new URLSearchParams('tab=performance&platform=google_ads');
    const { getByTestId, queryByTestId } = mount();
    expect(getByTestId('multiplatform-unavailable')).toBeTruthy();
    expect(getByTestId('google-empty-no-connection')).toBeTruthy();
    expect(queryByTestId('platform-headline')).toBeNull();
  });

  it("shows TikTok's tiles when the producer reads it, and Connect when it does not", () => {
    navigation.params = new URLSearchParams('tab=performance&platform=tiktok_ads');
    metricsState = { status: 'ready', metrics: EASY_FIT_MP1 };
    const connected = mount();
    expect(connected.getByTestId('platform-headline').textContent).toStartWith(
      'TikTok spent $3,300 MXN',
    );
    expect(connected.queryByTestId('tiktok-empty')).toBeNull();
    connected.unmount();
    metricsState = { status: 'ready', metrics: META_ONLY };
    const missing = mount();
    expect(missing.getByTestId('tiktok-empty').textContent).toContain('Connect');
    missing.unmount();
    metricsState = { status: 'unavailable' };
    const unavailable = mount();
    expect(unavailable.getByTestId('multiplatform-unavailable')).toBeTruthy();
    expect(unavailable.getByTestId('tiktok-empty')).toBeTruthy();
  });
});

describe('OptimizerOverview — the TikTok tab reads its snapshots (feature 06)', () => {
  it("reads the producer's TikTok advertiser and shows its spend, results, cost and top ad groups", () => {
    navigation.params = new URLSearchParams('tab=performance&platform=tiktok_ads');
    metricsState = { status: 'ready', metrics: EASY_FIT_MP1 };
    tiktokState = {
      status: 'ready',
      overview: buildTikTokOverview(
        TikTokSnapshotsEnvelopeSchema.parse(TIKTOK_DOC_SHAPED_ENVELOPE),
      ),
    };
    const { getByTestId, getAllByTestId, queryByTestId } = mount();
    expect(tiktokAsked).toContain('7000000000000000001');
    expect(getByTestId('tiktok-read').getAttribute('data-source')).toBe('tiktok-snapshots');
    expect(getByTestId('tiktok-tile-spend').textContent).toContain('$8,542 MXN');
    expect(getByTestId('tiktok-tile-results').textContent).toContain('101');
    expect(getByTestId('tiktok-tile-cost').textContent).toContain('$64.83 MXN');
    expect(getAllByTestId('tiktok-adgroup-row')).toHaveLength(3);
    expect(queryByTestId('tiktok-empty')).toBeNull();
  });

  it('keeps the not-connected state, and asks for no advertiser, when the producer has none', () => {
    navigation.params = new URLSearchParams('tab=performance&platform=tiktok_ads');
    metricsState = { status: 'ready', metrics: META_ONLY };
    const { getByTestId, queryByTestId } = mount();
    expect(getByTestId('tiktok-empty')).toBeTruthy();
    expect(queryByTestId('tiktok-read')).toBeNull();
    expect(tiktokAsked.every((id) => id === null)).toBe(true);
  });
});

describe('OptimizerOverview — the platforms side by side (feature 23)', () => {
  it('shows the comparison row under the All tiles, from the producer', () => {
    metricsState = { status: 'ready', metrics: EASY_FIT_MP1 };
    const { getByTestId } = mount();
    const row = getByTestId('platform-comparison');
    expect(follows(getByTestId('account-tiles'), row)).toBe(true);
    expect(follows(row, getByTestId('portfolio-rows'))).toBe(true);
    expect(getByTestId('comparison-sentence').textContent).toStartWith(
      'Google buys leads cheapest',
    );
  });

  it('is not on the Meta tab, nor on All before the producer is deployed', () => {
    const fallback = mount();
    expect(fallback.queryByTestId('platform-comparison')).toBeNull();
    fallback.unmount();
    navigation.params = new URLSearchParams('tab=performance&platform=meta');
    metricsState = { status: 'ready', metrics: EASY_FIT_MP1 };
    const meta = mount();
    expect(meta.queryByTestId('platform-comparison')).toBeNull();
  });

  it('stays hidden once the viewer hides it', () => {
    metricsState = { status: 'ready', metrics: EASY_FIT_MP1 };
    const first = mount();
    fireEvent.click(first.getByTestId('comparison-toggle'));
    first.unmount();
    const second = mount();
    expect(second.queryByTestId('platform-comparison')).toBeNull();
    expect(second.getByTestId('platform-comparison-hidden')).toBeTruthy();
  });
});

describe('OptimizerOverview — each row names its member platforms (feature 07)', () => {
  const rowChips = (row: Element) =>
    [...row.querySelectorAll('[data-testid="platform-chip"]')].map((chip) =>
      chip.getAttribute('data-platform'),
    );

  it('gives each portfolio one chip per platform it holds members on, Meta, Google, TikTok', () => {
    memberStates = new Map<string, PortfolioMetricsState>([
      ['formularios', { status: 'ready', metrics: portfolioMetricsFixture() }],
      [
        'prueba',
        {
          status: 'ready',
          metrics: portfolioMetricsFixture({ platforms: ['tiktok_ads', 'google_ads'] }),
        },
      ],
      ['tours', { status: 'loading' }],
    ]);
    const { getAllByTestId } = mount();
    const byId = new Map(
      getAllByTestId('portfolio-row').map((row) => [row.getAttribute('data-portfolio-id'), row]),
    );
    expect(rowChips(byId.get('formularios') as Element)).toEqual([
      'meta',
      'google_ads',
      'tiktok_ads',
    ]);
    expect(rowChips(byId.get('prueba') as Element)).toEqual(['google_ads', 'tiktok_ads']);
    // Not deployed yet: the managed platform. Still reading: no guess.
    expect(rowChips(byId.get('mensajes') as Element)).toEqual(['meta']);
    expect(rowChips(byId.get('tours') as Element)).toEqual([]);
  });
});

// G2 (google-ads plan): the Google tab gets the Meta tab's structure under its read — cards with
// their controls, the links to Actions and Activity, the portfolio rows — of the brand's Google
// portfolios, whichever ad account the page has selected (the mounts select Easy Fit's Meta one).
describe('OptimizerOverview — the Google tab (G2)', () => {
  const benchDocument = AccountReadEnvelopeSchema.parse(
    JSON.parse(
      readFileSync(
        join(import.meta.dir, 'platformCards/__fixtures__/accountReadPlatformCards.json'),
        'utf8',
      ),
    ),
  );
  const googleCards = (benchDocument?.read?.candidates ?? []).filter((c) => c.platform_card);
  const cardOf = (variant: string) => {
    const found = googleCards.find((c) => c.platform_card?.variant === variant);
    if (!found) throw new Error(`the bench document has no ${variant} card`);
    return found;
  };
  const BUDGET = cardOf('google_budget_limited');
  const NEGATIVES = cardOf('google_negative_terms');
  const switchedOff = (card: typeof BUDGET) => ({
    ...card,
    card_action: card.card_action ? { ...card.card_action, apply_enabled: false } : null,
  });

  // Easy Fit's Google-only portfolio sits on its Google customer; the mixed one on its Meta
  // account. Both are Google's; the Meta-only one is not.
  const GOOGLE_ONLY = portfolio({
    id: '7a7a7a7a-0000-4000-8000-0000000000e3',
    name: 'Google // Leads',
    ad_account_id: '5251780631',
    adset_count: 2,
    platforms: ['google_ads'],
  });
  const MIXED = portfolio({
    id: '7a7a7a7a-0000-4000-8000-0000000000e4',
    name: 'Leads // Meta + Google',
    ad_account_id: 'act_easyfit',
    adset_count: 5,
    platforms: ['meta', 'google_ads'],
  });
  const META_ROW = { ...MENSAJES, platforms: ['meta' as const] };

  const onGoogleTab = () => {
    grantGoogle();
    navigation.params = new URLSearchParams('tab=performance&platform=google_ads');
    googleState = { status: 'ready', account: VIVO_47, overview: VIVO_47_OVERVIEW };
    efficiency = { series: [], pending: false, failed: 0, retryFailed };
  };
  const rowIds = (root: HTMLElement) =>
    [...root.querySelectorAll('[data-testid="portfolio-row"]')].map((row) =>
      row.getAttribute('data-portfolio-id'),
    );
  const rowById = (root: HTMLElement, id: string) =>
    root.querySelector(`[data-portfolio-id="${id}"]`) as HTMLElement;
  const chipsOf = (node: Element) =>
    [...node.querySelectorAll('[data-testid="platform-chip"]')].map((chip) =>
      chip.getAttribute('data-platform'),
    );

  it("lists the brand's Google portfolios, whichever Meta account is selected", () => {
    onGoogleTab();
    brandRows = [META_ROW, GOOGLE_ONLY, MIXED];
    const { getByTestId, onSelect } = mount();
    const rows = getByTestId('portfolio-rows');
    expect(rowIds(rows).sort()).toEqual([GOOGLE_ONLY.id, MIXED.id].sort());
    expect(chipsOf(rowById(rows, GOOGLE_ONLY.id))).toEqual(['google_ads']);
    expect(chipsOf(rowById(rows, MIXED.id))).toEqual(['meta', 'google_ads']);
    // A Google portfolio enrolls campaigns, never ad sets; a mixed one holds both.
    const members = (id: string) =>
      within(rowById(rows, id)).getByTestId('portfolio-row-members').textContent;
    expect(members(GOOGLE_ONLY.id)).toBe('2 campaigns');
    expect(members(MIXED.id)).toBe('5 members');
    expect(rows.textContent).not.toContain('ad set');
    fireEvent.click(within(rows).getByRole('button', { name: /^Google \/\/ Leads/ }));
    expect(onSelect).toHaveBeenCalledWith(GOOGLE_ONLY.id);
  });

  // The parity bench's google.currency FAIL: Easy Fit's Google customer is granted with no
  // currency in its asset row, so a row read from the account list printed "99.00" bare.
  it("prints a Google row's money in its portfolio's currency, which the account list lacks", () => {
    onGoogleTab();
    const targetOf = () =>
      mount()
        .getByTestId('portfolio-rows')
        .querySelector(`[data-figure="portfolio-row.${GOOGLE_ONLY.id}.target"]`);
    brandRows = [{ ...GOOGLE_ONLY, cpa_target: 99, currency: 'MXN' }];
    const target = targetOf();
    expect(target?.getAttribute('data-figure-currency')).toBe('MXN');
    expect(target?.textContent).toContain('MXN');
    cleanup();
    brandRows = [{ ...GOOGLE_ONLY, cpa_target: 99, currency: null }];
    expect(targetOf()?.getAttribute('data-figure-currency')).toBe('none');
  });

  it("falls back to the brand's granted Google accounts when the server sends no platforms", () => {
    onGoogleTab();
    brandRows = [
      portfolio({ id: 'on-google', name: 'Vivo 47 // Google', ad_account_id: '3710693645' }),
      portfolio({ id: 'on-meta', name: 'Meta row', ad_account_id: 'act_easyfit' }),
      portfolio({ id: 'not-granted', name: 'Elsewhere', ad_account_id: '9999999999' }),
    ];
    const { getByTestId } = mount();
    const rows = getByTestId('portfolio-rows');
    expect(rowIds(rows)).toEqual(['on-google']);
    expect(chipsOf(rowById(rows, 'on-google'))).toEqual(['google_ads']);
  });

  it('renders a Google card with its own control, after the read and before the links and rows', () => {
    onGoogleTab();
    brandRows = [GOOGLE_ONLY];
    platformCardsState = { status: 'ready', cards: [BUDGET] };
    const { getByTestId, getAllByTestId } = mount();
    const cards = getAllByTestId('account-card');
    expect(cards).toHaveLength(1);
    const card = cards[0] as HTMLElement;
    expect(card.getAttribute('data-variant')).toBe('google_budget_limited');
    expect(chipsOf(card)).toEqual(['google_ads']);
    const write = cardWriteOf(cardActionsOf([BUDGET]).get(BUDGET.id));
    if (!write) throw new Error('the budget card carries no write');
    expect(within(card).getByTestId('platform-card-action').textContent).toBe(
      cardActionLabel(write),
    );
    expect(within(card).queryByTestId('account-card-action')).toBeNull();
    expect(within(card).getByTestId('account-card-portfolios').textContent).toBe('Google // Leads');
    const order = [
      getByTestId('google-tab'),
      getByTestId('overview-recommendations'),
      getByTestId('overview-links'),
      getByTestId('portfolio-rows'),
    ];
    for (let i = 1; i < order.length; i += 1) {
      expect(follows(order[i - 1] as Element, order[i] as Element)).toBe(true);
    }
  });

  it("renders the control disabled, with the reason, when the portfolio's writes to Google are off", () => {
    onGoogleTab();
    brandRows = [GOOGLE_ONLY];
    platformCardsState = {
      status: 'ready',
      cards: [switchedOff(BUDGET), switchedOff(NEGATIVES)],
    };
    const { getAllByTestId, queryAllByTestId } = mount();
    expect(queryAllByTestId('platform-card-action')).toHaveLength(0);
    expect(queryAllByTestId('platform-card-add-negatives')).toHaveLength(0);
    const disabled = getAllByTestId('platform-card-action-unavailable');
    expect(disabled).toHaveLength(2);
    for (const control of disabled) {
      expect(control.getAttribute('data-reason')).toBe('apply_disabled');
      expect((within(control).getByRole('button') as HTMLButtonElement).disabled).toBe(true);
      expect(control.textContent).toContain(
        'Writes to Google are switched off for this portfolio.',
      );
    }
  });

  it('links to Actions and Activity, on Google and on Meta', () => {
    for (const tab of ['google_ads', 'meta'] as const) {
      if (tab === 'google_ads') onGoogleTab();
      else navigation.params = new URLSearchParams('tab=performance&platform=meta');
      const { getByTestId, onOpenActions, onOpenActivity, unmount } = mount();
      expect(getByTestId('overview-link-actions').textContent).toBe('Review in Actions');
      expect(getByTestId('overview-link-activity').textContent).toBe('Activity');
      fireEvent.click(getByTestId('overview-link-actions'));
      fireEvent.click(getByTestId('overview-link-activity'));
      expect(onOpenActions).toHaveBeenCalledTimes(1);
      expect(onOpenActivity).toHaveBeenCalledTimes(1);
      unmount();
    }
  });

  it('says the cards could not be read when the read fails, never that there are none', () => {
    onGoogleTab();
    brandRows = [GOOGLE_ONLY];
    platformCardsState = { status: 'error' };
    const { getByTestId, queryByTestId } = mount();
    expect(getByTestId('platform-cards-error').textContent).toContain(
      "Google's recommendations could not be read",
    );
    expect(queryByTestId('overview-recommendations')).toBeNull();
    // The rest of the tab stands: the links and the rows.
    expect(getByTestId('overview-links')).toBeTruthy();
    expect(rowIds(getByTestId('portfolio-rows'))).toEqual([GOOGLE_ONLY.id]);
  });

  // Easy Fit's b9cebbcf read "no cycle yet" with dashes beside 218 real leads: the efficiency
  // series sums Meta ad-set snapshots, which a Google portfolio never writes.
  it("quotes a Google row's 7 days from its metrics read, in that read's currency", () => {
    onGoogleTab();
    const ran = { ...GOOGLE_ONLY, last_actual_cycle_at: '2026-09-28T06:49:48Z' };
    brandRows = [ran];
    memberStates = new Map<string, PortfolioMetricsState>([
      [
        ran.id,
        { status: 'ready', metrics: portfolioMetricsFixture({ platforms: ['google_ads'] }) },
      ],
    ]);
    const row = within(mount().getByTestId('portfolio-rows'));
    const figure = (part: string) =>
      row
        .getAllByTestId('figure')
        .find((node) => node.getAttribute('data-figure') === `portfolio-row.${ran.id}.${part}`);
    expect(figure('results')?.getAttribute('data-figure-raw')).toBe('118');
    expect(figure('spend')?.getAttribute('data-figure-raw')).toBe('4062');
    expect(figure('spend')?.getAttribute('data-figure-currency')).toBe('MXN');
    expect(row.getByTestId('portfolio-state-chip').textContent).not.toBe('no cycle yet');
  });

  // The visual bench's layout-shift FAIL (CLS 0.25 at 375): a skeleton that collapsed to
  // nothing, and rows that painted before the read above them, both pushed the screen.
  it('paints nothing under the read until the cards and the read above have settled', () => {
    onGoogleTab();
    brandRows = [GOOGLE_ONLY];
    const below = (root: ReturnType<typeof mount>) =>
      ['overview-recommendations-skeleton', 'overview-links', 'portfolio-rows'].filter((id) =>
        root.queryByTestId(id),
      );
    platformCardsState = { status: 'loading' };
    const cardsLoading = mount();
    expect(below(cardsLoading)).toEqual([]);
    cardsLoading.unmount();
    platformCardsState = { status: 'ready', cards: [] };
    googleState = { status: 'loading' };
    const readLoading = mount();
    expect(below(readLoading)).toEqual([]);
    readLoading.unmount();
    googleState = { status: 'ready', account: VIVO_47, overview: VIVO_47_OVERVIEW };
    expect(below(mount())).toEqual(['overview-links', 'portfolio-rows']);
  });

  it('shows no card section for none or an older server', () => {
    onGoogleTab();
    for (const state of [
      { status: 'ready', cards: [] },
      { status: 'unavailable' },
    ] as PlatformCardsState[]) {
      platformCardsState = state;
      const { queryByTestId, unmount } = mount();
      expect(queryByTestId('overview-recommendations')).toBeNull();
      expect(queryByTestId('overview-recommendations-skeleton')).toBeNull();
      expect(queryByTestId('platform-cards-error')).toBeNull();
      unmount();
    }
  });

  it('says no portfolio holds Google campaigns yet, with the way to create one', () => {
    onGoogleTab();
    brandRows = [META_ROW];
    const { getByTestId, onCreate } = mount();
    const empty = getByTestId('platform-portfolios-empty');
    expect(empty.textContent).toContain('No portfolio holds Google campaigns yet.');
    fireEvent.click(within(empty).getByRole('button', { name: 'Create a portfolio' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('shows an unconnected Google tab its empty state and nothing else', () => {
    navigation.params = new URLSearchParams('tab=performance&platform=google_ads');
    brandRows = [GOOGLE_ONLY];
    platformCardsState = { status: 'ready', cards: [BUDGET] };
    const { getByTestId, queryByTestId } = mount();
    expect(getByTestId('google-empty-no-connection')).toBeTruthy();
    for (const absent of [
      'overview-recommendations',
      'overview-recommendations-skeleton',
      'platform-cards-error',
      'overview-links',
      'portfolio-rows',
    ]) {
      expect(queryByTestId(absent)).toBeNull();
    }
  });
});
