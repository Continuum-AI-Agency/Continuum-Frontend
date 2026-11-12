import { afterEach, describe, expect, it, mock } from 'bun:test';
import {
  type AdAccountReading,
  type AdAccountResult,
  type EfficiencySeriesPoint,
  type PaidAccountOverview,
  type PortfolioListItem,
  PortfolioListItemSchema,
  PortfolioMetricsSchema,
} from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, waitFor } from '@testing-library/react';
import { render } from '@/i18n/__tests__/render';
import type { PortfolioMetricsState } from '../../detail/usePortfolioMetrics';
import type { GoogleAdsOverviewState } from '../../platforms/useGoogleAdsOverview';

// The hero's reads, driven from real reads of Nov 2, 2026 (the fixtures beside this file).
// `mock.module` replaces a module for the whole process, so this file runs on its own; every
// mock spreads the real module.
type RecordedSeries = Record<string, { points: EfficiencySeriesPoint[] }>;
const recordedTrend = (await import('./resultTrend.fixture.json')).default;
const recordedGoogle = (await import('./resultGoogle.fixture.json')).default;
const portfolioRows = (await import('./portfolioLanes.fixture.json')).default;
const recordedMetrics = (await import('./portfolioMetrics.fixture.json')).default as Record<
  string,
  unknown
>;
const metaSeries = recordedTrend.easyFitMetaSeries as unknown as RecordedSeries;

let efficiencySeries: EfficiencySeriesPoint[][] = [];
let efficiencyPending = false;
const realData = await import('../../../useOptimizerData');
mock.module('../../../useOptimizerData', () => ({
  ...realData,
  useOptimizerPortfolioEfficiency: () => ({
    series: efficiencySeries,
    pending: efficiencyPending,
    failed: 0,
    retryFailed: () => {},
  }),
}));

// The live read is the cycle's window here, priced by the real portfolioFigure().
const realFigure = await import('../../portfolioFigure');
const realFigures = await import('../../usePortfolioFigures');
mock.module('../../usePortfolioFigures', () => ({
  ...realFigures,
  usePortfolioFigures: ({
    portfolios,
    series,
  }: {
    portfolios: readonly PortfolioListItem[];
    series: readonly (readonly EfficiencySeriesPoint[])[];
  }) => {
    const figures = new Map<string, NonNullable<ReturnType<typeof realFigure.portfolioFigure>>>();
    portfolios.forEach((portfolio, index) => {
      const cycle = realFigure.seriesWindowFigures(series[index] ?? []);
      const figure = realFigure.portfolioFigure({
        portfolio,
        live: cycle,
        snapshot: cycle,
      });
      if (figure) figures.set(portfolio.id, figure);
    });
    return { figures, pending: false };
  },
}));

// A Google portfolio's metrics read, as the lanes read it; 'unavailable' until a test sets one.
let memberStates = new Map<string, PortfolioMetricsState>();
const realPlatforms = await import('../../platforms/portfolioPlatforms');
mock.module('../../platforms/portfolioPlatforms', () => ({
  ...realPlatforms,
  usePortfolioMemberStates: (ids: readonly string[]) =>
    new Map(ids.map((id) => [id, memberStates.get(id) ?? { status: 'unavailable' }])),
}));

let googleState: GoogleAdsOverviewState = { status: 'loading' };
const realGoogle = await import('../../platforms/useGoogleAdsOverview');
mock.module('../../platforms/useGoogleAdsOverview', () => ({
  ...realGoogle,
  useGoogleAdsOverview: () => googleState,
}));

const dailyAsked: {
  adAccountId: string;
  resultBucket?: string;
  range: unknown;
}[] = [];
let dailyRead: PaidAccountOverview | null = null;
mock.module('@/lib/paid-media/paid-overview.client', () => ({
  fetchPaidAccountOverview: async (call: {
    adAccountId: string;
    resultBucket?: string;
    range: unknown;
  }) => {
    dailyAsked.push(call);
    if (!dailyRead) throw new Error('no daily read');
    return dailyRead;
  },
}));

const { default: ResultHero } = await import('./ResultHero');
const { buildGoogleOverview, GoogleAccountOverviewSchema, GoogleTopCampaignsSchema } = await import(
  '../../platforms/googleAdsOverviewModel'
);

afterEach(() => {
  cleanup();
  efficiencySeries = [];
  efficiencyPending = false;
  memberStates = new Map();
  googleState = { status: 'loading' };
  dailyRead = null;
  dailyAsked.length = 0;
});

const parse = (rows: unknown[]) => rows.map((row) => PortfolioListItemSchema.parse(row));
const EASY_FIT_META = parse(portfolioRows.easyFitMeta);
const VIVO_47_GOOGLE = parse(portfolioRows.vivo47Google);

/** The reading's output for an account, written as the seam type the hero renders from. Its own
 *  count is the producer's: the hero keeps its label, goal, kind and source, and prints the
 *  portfolios' figure instead. */
function readingOf(
  platform: 'meta' | 'google_ads',
  result: Partial<AdAccountResult> = {},
): AdAccountReading {
  return {
    platform,
    mode: platform === 'meta' ? 'operate' : 'recommend',
    modeLabel: platform === 'meta' ? 'Autopilot' : 'Continuum recommends',
    modeReason: 'Conversaciones Whatsapp opera en autopilot dentro de su tope de 20% por ciclo.',
    result: {
      label: 'conversaciones',
      count: 999,
      platformReported: null,
      costPerResult: 99,
      goal: 45,
      spend: 99,
      currency: 'MXN',
      windowDays: 7,
      source: 'producer',
      kind: 'conversations',
      ...result,
    },
    board: [
      {
        module: 'result',
        size: 'l',
        score: 80,
        reason: 'El resultado que cuenta, contra su meta.',
      },
    ],
    hidden: [],
    asks: [],
  };
}

function mountHero(
  platform: 'meta' | 'google_ads',
  portfolios: PortfolioListItem[],
  reading: AdAccountReading,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ResultHero
        ctx={{
          brandId: 'b1',
          platform,
          adAccountId: platform === 'meta' ? 'act_521903353286118' : null,
          currency: 'MXN',
          portfolios,
          reading,
          onOpenActions: () => {},
          onOpenActivity: () => {},
          onSelectPortfolio: () => {},
          onCreatePortfolio: () => {},
        }}
        slot={reading.board[0] as AdAccountReading['board'][number]}
      />
    </QueryClientProvider>,
  );
}

const raw = (root: HTMLElement, key: string) =>
  root.querySelector(`[data-figure="${key}"]`)?.getAttribute('data-figure-raw');
const textOf = (root: HTMLElement, key: string) =>
  root.querySelector(`[data-figure="${key}"]`)?.textContent;
const attr = (root: HTMLElement, name: string) =>
  root.querySelector(`[${name}]`)?.getAttribute(name);

describe('ResultHero on Meta — Easy Fit, Nov 2', () => {
  it('prints Conversaciones Whatsapp’s own figure, not the producer’s, with the reading’s goal', () => {
    efficiencySeries = EASY_FIT_META.map((portfolio) => metaSeries[portfolio.id]?.points ?? []);
    const { getByTestId, queryByTestId } = mountHero('meta', EASY_FIT_META, readingOf('meta'));
    const hero = getByTestId('board-module-result');
    expect(hero.getAttribute('data-module-state')).toBe('ready');
    expect(attr(hero, 'data-source')).toBe('portfolios');
    expect(attr(hero, 'data-reading-source')).toBe('producer');
    expect(attr(hero, 'data-kind')).toBe('conversations');
    // 462 conversations for $24,543.57: the figure the lane prints, never the reading's 999.
    expect(raw(hero, 'board.result.count')).toBe('462');
    expect(hero.textContent).not.toContain('999');
    expect(textOf(hero, 'board.result.cost')).toBe('$53.12 MXN');
    expect(textOf(hero, 'board.result.spend')).toBe('$24,544 MXN');
    expect(getByTestId('board-result-window').textContent).toBe('Last 7 days');
    // 462 of the 545 the spend buys at the reading's $45 goal: over it.
    expect(Number(getByTestId('board-ring').getAttribute('data-fraction'))).toBeCloseTo(0.847, 2);
    expect(getByTestId('board-result-distance').textContent).toBe('18% over goal');
    expect(getByTestId('board-result-distance').getAttribute('data-side')).toBe('above');
    expect(getByTestId('board-result-bullet-goal')).toBeTruthy();
    // The trend is dated history: each cycle's own measure, the last one named by its cycle.
    expect(getByTestId('board-trend-caption').textContent).toBe(
      '7-day cost per result as each cycle measured it · last 30 days',
    );
    expect(getByTestId('board-trend-line')).toBeTruthy();
    expect(getByTestId('board-trend-last').textContent).toBe('$53.12 MXN · cycle of Nov 2');
    expect(getByTestId('board-result-others').textContent).toBe(
      'Also bought: 10 purchases for $2,647 MXN · 0 leads for $0.00 MXN',
    );
    expect(queryByTestId('board-result-reported-switch')).toBeNull();
  });

  it('says the account has no portfolio instead of counting zero', () => {
    const { getByTestId } = mountHero('meta', [], readingOf('meta'));
    expect(getByTestId('board-module-result').getAttribute('data-module-state')).toBe('missing');
    expect(getByTestId('board-result-missing').textContent).toBe(
      'No portfolio on this account yet, so no result is counted against a goal.',
    );
  });

  it('holds its frame until every figure has landed', () => {
    efficiencyPending = true;
    const { getByTestId } = mountHero('meta', EASY_FIT_META, readingOf('meta'));
    expect(getByTestId('board-module-result').getAttribute('data-module-state')).toBe('loading');
  });
});

describe('ResultHero on Google — Vivo 47, Oct 26 – Nov 1', () => {
  const vivo = recordedGoogle.vivo47;
  const overview = buildGoogleOverview(
    GoogleAccountOverviewSchema.parse(vivo.account_overview),
    GoogleTopCampaignsSchema.parse(vivo.top_campaigns),
  );
  const ready: GoogleAdsOverviewState = {
    status: 'ready',
    account: {
      platform: 'google_ads',
      account_id: '3710693645',
      name: 'Vivo 47',
      status: null,
      currency: 'MXN',
    },
    overview,
    resultBucket: 'leads',
  };
  const TEST_1 = 'e642c737-ddde-4622-af8f-4b5622da98d0';
  const leadsReading = () =>
    readingOf('google_ads', {
      label: 'leads',
      kind: 'leads',
      goal: null,
      source: 'producer',
    });

  it('prints Test 1’s own figure, the metrics read its lane prints, dated', async () => {
    googleState = ready;
    memberStates.set(TEST_1, {
      status: 'ready',
      metrics: PortfolioMetricsSchema.parse(recordedMetrics[TEST_1]),
    });
    dailyRead = recordedTrend.google.vivo47_3710693645Leads as unknown as PaidAccountOverview;
    const { getByTestId, findByTestId } = mountHero('google_ads', VIVO_47_GOOGLE, leadsReading());
    const hero = getByTestId('board-module-result');
    expect(attr(hero, 'data-source')).toBe('portfolios');
    // $7,622.35 for 10 leads, Oct 26 – Nov 1, stored at cycle time: so dated.
    expect(raw(hero, 'board.result.count')).toBe('10');
    expect(textOf(hero, 'board.result.cost')).toBe('$762 MXN');
    expect(getByTestId('board-result-window').textContent).toStartWith('Last 7 days · as of Nov 2');
    expect(getByTestId('board-result-no-goal').textContent).toBe(
      'No portfolio sets a goal for this result.',
    );
    // The trend reads the account's days: 36 of them close 30 seven-day windows.
    expect(await findByTestId('board-trend-line')).toBeTruthy();
    expect(getByTestId('board-trend-caption').textContent).toBe(
      '7-day cost per result across the whole account · last 30 days',
    );
    expect(dailyAsked[0]).toMatchObject({
      adAccountId: '3710693645',
      resultBucket: 'leads',
      range: { preset: 'custom', since: '2026-09-27', until: '2026-11-01' },
    });
    expect(getByTestId('board-trend-last').textContent).toBe('$762 MXN · Nov 1');
  });

  it('falls back to Google’s own read of the account while no portfolio has a figure', async () => {
    googleState = ready;
    dailyRead = recordedTrend.google.vivo47_3710693645Leads as unknown as PaidAccountOverview;
    const { getByTestId, findByTestId } = mountHero('google_ads', VIVO_47_GOOGLE, leadsReading());
    const hero = getByTestId('board-module-result');
    expect(attr(hero, 'data-source')).toBe('google');
    expect(raw(hero, 'board.result.count')).toBe('10');
    expect(getByTestId('board-result-window').textContent).toBe(
      "Oct 26 – Nov 1 · Google's read of the whole account",
    );
    expect(await findByTestId('board-trend-line')).toBeTruthy();
  });

  it('keeps the V1 real-result count, over its 30 days, with what Google reports behind the switch', async () => {
    googleState = ready;
    dailyRead = recordedTrend.google.vivo47_3710693645Leads as unknown as PaidAccountOverview;
    memberStates.set(TEST_1, {
      status: 'ready',
      metrics: PortfolioMetricsSchema.parse(recordedMetrics[TEST_1]),
    });
    // The V1 card of Nov 2: 592 real leads and sales against 4,051 conversions Google reports.
    const reading = readingOf('google_ads', {
      label: 'leads y ventas reales',
      count: 592,
      platformReported: 4051,
      costPerResult: 69.08,
      goal: null,
      spend: null,
      windowDays: 30,
      source: 'inflated_conversion',
      kind: 'leads',
    });
    const { getByTestId, queryByTestId, findByTestId } = mountHero(
      'google_ads',
      VIVO_47_GOOGLE,
      reading,
    );
    const hero = getByTestId('board-module-result');
    expect(attr(hero, 'data-source')).toBe('reading');
    expect(attr(hero, 'data-reading-source')).toBe('inflated_conversion');
    expect(raw(hero, 'board.result.count')).toBe('592');
    expect(getByTestId('board-result-window').textContent).toBe(
      'Last 30 days · as the conversion card counts them',
    );
    expect(Number(getByTestId('board-ring').getAttribute('data-fraction'))).toBeCloseTo(
      592 / 4051,
      3,
    );
    expect(queryByTestId('board-result-reported')).toBeNull();
    fireEvent.click(getByTestId('board-result-reported-switch'));
    await waitFor(() => expect(getByTestId('board-result-reported')).toBeTruthy());
    expect(getByTestId('board-result-reported').textContent).toBe(
      '4,051 as Google counts them, $10.10 MXN each, against 592 counted',
    );
    // No daily read counts the real results, and Google's own daily count is another result.
    expect((await findByTestId('board-trend-missing')).textContent).toBe(
      'No daily read counts these results, so there is no trend to draw.',
    );
    expect(dailyAsked).toHaveLength(0);
  });

  it('names the reason Google cannot be read, in one line', () => {
    googleState = { status: 'no-grant' };
    const { getByTestId } = mountHero('google_ads', [], leadsReading());
    expect(getByTestId('board-module-result').getAttribute('data-module-state')).toBe('missing');
    expect(getByTestId('board-result-missing').textContent).toBe(
      'No Google Ads account is granted to this brand yet.',
    );
  });

  it('marks a failed Google read as an error', () => {
    googleState = {
      status: 'error',
      account: null,
      message: 'The Google Ads read did not answer.',
    };
    const { getByTestId } = mountHero('google_ads', [], leadsReading());
    expect(getByTestId('board-module-result').getAttribute('data-module-state')).toBe('error');
  });
});
