import { afterEach, describe, expect, it, mock } from 'bun:test';
import {
  type AdAccountReading,
  type EfficiencySeriesPoint,
  type PortfolioListItem,
  PortfolioListItemSchema,
  type PortfolioMetrics,
  PortfolioMetricsSchema,
} from '@continuum/contracts';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { PortfolioMetricsState } from '../../detail/usePortfolioMetrics';

// The lanes' reads, driven from real reads of Nov 2, 2026 (the fixtures beside this file).
// `mock.module` replaces a module for the whole process, so this file runs on its own; every
// mock spreads the real module.
type RecordedSeries = Record<string, { points: EfficiencySeriesPoint[] }>;
const recordedTrend = (await import('./resultTrend.fixture.json')).default;
const portfolioRows = (await import('./portfolioLanes.fixture.json')).default;
const recordedMetrics = (await import('./portfolioMetrics.fixture.json')).default as Record<
  string,
  unknown
>;
const metaSeries = recordedTrend.easyFitMetaSeries as unknown as RecordedSeries;

let efficiencySeries: EfficiencySeriesPoint[][] = [];
const realData = await import('../../../useOptimizerData');
mock.module('../../../useOptimizerData', () => ({
  ...realData,
  useOptimizerPortfolioEfficiency: () => ({
    series: efficiencySeries,
    pending: false,
    failed: 0,
    retryFailed: () => {},
  }),
}));

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
      const figure = realFigure.portfolioFigure({ portfolio, live: cycle, snapshot: cycle });
      if (figure) figures.set(portfolio.id, figure);
    });
    return { figures, pending: false };
  },
}));

let memberStates = new Map<string, PortfolioMetricsState>();
const realPlatforms = await import('../../platforms/portfolioPlatforms');
mock.module('../../platforms/portfolioPlatforms', () => ({
  ...realPlatforms,
  usePortfolioMemberStates: (ids: readonly string[]) =>
    new Map(ids.map((id) => [id, memberStates.get(id) ?? { status: 'unavailable' }])),
}));

const { default: PortfolioLanes } = await import('./PortfolioLanes');

afterEach(() => {
  cleanup();
  efficiencySeries = [];
  memberStates = new Map();
});

const parse = (rows: unknown[]) => rows.map((row) => PortfolioListItemSchema.parse(row));
const EASY_FIT_META = parse(portfolioRows.easyFitMeta);
const EASY_FIT_GOOGLE = parse(portfolioRows.easyFitGoogle);

const READING: AdAccountReading = {
  platform: 'meta',
  mode: 'operate',
  modeLabel: 'Autopilot',
  modeReason: '1 de 3 portafolios aplican solos dentro de sus topes.',
  result: {
    label: 'conversaciones',
    count: null,
    platformReported: null,
    costPerResult: null,
    goal: 45,
    spend: null,
    currency: 'MXN',
    windowDays: 7,
  },
  board: [{ module: 'portfolios', size: 'w', score: 20, reason: '3 portafolios contra su meta.' }],
  hidden: [],
  asks: [],
};
const SLOT = READING.board[0] as AdAccountReading['board'][number];

function mountLanes(platform: 'meta' | 'google_ads', portfolios: PortfolioListItem[]) {
  const onSelect = mock((_id: string) => {});
  const onCreate = mock(() => {});
  const utils = render(
    <PortfolioLanes
      ctx={{
        brandId: 'b1',
        platform,
        adAccountId: platform === 'meta' ? 'act_521903353286118' : null,
        currency: 'MXN',
        portfolios,
        reading: { ...READING, platform },
        onOpenActions: () => {},
        onOpenActivity: () => {},
        onSelectPortfolio: onSelect,
        onCreatePortfolio: onCreate,
      }}
      slot={SLOT}
    />,
  );
  return { ...utils, onSelect, onCreate };
}

const laneNames = (root: HTMLElement) =>
  [...root.querySelectorAll('[data-testid="board-lane-name"]')].map((name) => name.textContent);

describe('PortfolioLanes on Meta — Easy Fit, Nov 2', () => {
  it('draws one lane per portfolio, furthest over its goal first', () => {
    efficiencySeries = EASY_FIT_META.map((portfolio) => metaSeries[portfolio.id]?.points ?? []);
    const { getByTestId, getAllByTestId } = mountLanes('meta', EASY_FIT_META);
    expect(getByTestId('board-module-portfolios').getAttribute('data-module-state')).toBe('ready');
    expect(laneNames(getByTestId('board-lanes'))).toEqual([
      'Conversaciones Whatsapp',
      'Tours Programados - Octubre',
      'Leads // Google Ads only',
    ]);
    const status = getAllByTestId('board-lane').map((lane) => lane.getAttribute('data-status'));
    expect(status).toEqual(['above-goal', 'lost-ad-sets', 'no-goal']);
    const [conversaciones] = getAllByTestId('board-lane');
    expect(conversaciones?.textContent).toContain(
      '$53.12 MXN per conversation · goal $45.00 MXN · 18% over goal',
    );
    expect(conversaciones?.textContent).toContain('$3,000 MXN / day');
    expect(conversaciones?.textContent).toContain('6 waiting');
    expect(conversaciones?.textContent).toContain('Autopilot');
    expect(conversaciones?.querySelector('[data-testid="board-lane-bullet-goal"]')).toBeTruthy();
    // The lane with no goal draws no bullet: there is nothing to judge it against.
    const leads = getAllByTestId('board-lane')[2];
    expect(leads?.querySelector('[data-testid="board-lane-bullet"]')).toBeNull();
    expect(leads?.textContent).toContain('$50.00 MXN / day');
  });

  it('re-sorts by budget and by decisions', () => {
    efficiencySeries = EASY_FIT_META.map((portfolio) => metaSeries[portfolio.id]?.points ?? []);
    const { getByTestId, getByRole } = mountLanes('meta', EASY_FIT_META);
    fireEvent.click(getByRole('button', { name: 'Budget' }));
    expect(laneNames(getByTestId('board-lanes'))).toEqual([
      'Conversaciones Whatsapp',
      'Tours Programados - Octubre',
      'Leads // Google Ads only',
    ]);
    fireEvent.click(getByRole('button', { name: 'Decisions' }));
    expect(laneNames(getByTestId('board-lanes'))[0]).toBe('Conversaciones Whatsapp');
  });

  it('opens the portfolio a lane is about', () => {
    efficiencySeries = EASY_FIT_META.map((portfolio) => metaSeries[portfolio.id]?.points ?? []);
    const { getByRole, onSelect } = mountLanes('meta', EASY_FIT_META);
    fireEvent.click(getByRole('button', { name: /^Tours Programados - Octubre/ }));
    expect(onSelect).toHaveBeenCalledWith('ec956b3d-c9b1-48ea-b55b-bda303e68f79');
  });

  it('offers to create the first portfolio when there is none', () => {
    const { getByTestId, getByRole, onCreate } = mountLanes('meta', []);
    expect(getByTestId('board-module-portfolios').getAttribute('data-module-state')).toBe(
      'missing',
    );
    fireEvent.click(getByRole('button', { name: 'Create a portfolio' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});

describe('PortfolioLanes on Google — Easy Fit, Oct 25–31', () => {
  it('prices a Google lane from its metrics read, against its own goal', () => {
    for (const portfolio of EASY_FIT_GOOGLE) {
      const metrics: PortfolioMetrics = PortfolioMetricsSchema.parse(recordedMetrics[portfolio.id]);
      memberStates.set(portfolio.id, { status: 'ready', metrics });
    }
    const { getAllByTestId } = mountLanes('google_ads', EASY_FIT_GOOGLE);
    const [leads, test] = getAllByTestId('board-lane');
    // $29.09 for 1 lead against the $99 goal; stored at cycle time, so dated.
    expect(leads?.getAttribute('data-status')).toBe('on-track');
    expect(leads?.textContent).toContain('$29.09 MXN per lead · goal $99.00 MXN · 71% under goal');
    expect(leads?.textContent).toContain('as of Nov 1');
    expect(leads?.textContent).toContain('$670 MXN / day');
    expect(leads?.textContent).toContain('12 waiting');
    expect(leads?.querySelector('[data-platform="google_ads"]')).toBeTruthy();
    expect(test?.getAttribute('data-status')).toBe('no-goal');
  });

  it('says a lane with a goal is not read yet while its metrics read is not deployed', () => {
    const { getAllByTestId } = mountLanes('google_ads', EASY_FIT_GOOGLE);
    const [leads] = getAllByTestId('board-lane');
    expect(leads?.getAttribute('data-status')).toBe('unread');
    expect(leads?.textContent).toContain('not read yet · goal $99.00 MXN');
  });
});
