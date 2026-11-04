import { afterEach, describe, expect, it, mock } from 'bun:test';
import type {
  HomeOpportunitiesData,
  HomeOpportunityCard,
  PortfolioListItem,
} from '@continuum/contracts';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { HomeReadLoad } from '../../homeRead';
import { homeContext, tileOf } from './__fixtures__/homeContext';
import {
  EASY_FIT_META_BRAND_ID,
  EASY_FIT_PORTFOLIOS,
  PINK_ELEPHANT_PORTFOLIOS,
  portfolioWith,
} from './__fixtures__/portfolios';

// `mock.module` replaces a module for the whole process, so this file runs on its own; every mock
// spreads the real module.
type PortfoliosRead = {
  hasAnswer: boolean;
  isError: boolean;
  brandPortfolios: PortfolioListItem[];
};
let portfoliosRead: PortfoliosRead = {
  hasAnswer: true,
  isError: false,
  brandPortfolios: EASY_FIT_PORTFOLIOS,
};
const refetch = mock(() => Promise.resolve());
const platformCardReads: string[] = [];
const realData = await import('@/components/paid-media/optimizer/useOptimizerData');
mock.module('@/components/paid-media/optimizer/useOptimizerData', () => ({
  ...realData,
  useOptimizerPortfolios: () => ({
    ...portfoliosRead,
    data: portfoliosRead.brandPortfolios,
    refetch,
  }),
  useOptimizerPlatformCards: (brandId: string, platform: string) => {
    if (brandId) platformCardReads.push(platform);
    return { status: 'loading' };
  },
}));

// The Optimizer's queue is imported as is; here it is a stub that says which portfolio and
// account it was handed.
const realGroup = await import(
  '@/components/paid-media/optimizer/sections/OptimizerActionsPortfolioGroup'
);
mock.module('@/components/paid-media/optimizer/sections/OptimizerActionsPortfolioGroup', () => ({
  ...realGroup,
  OptimizerActionsPortfolioGroup: (props: {
    portfolio: PortfolioListItem;
    adAccountId: string;
  }) => (
    <div
      data-account={props.adAccountId}
      data-portfolio={props.portfolio.id}
      data-testid="optimizer-queue"
    />
  ),
}));

// The tile's Backend read; `unavailable` is what production answers until the Backend deploys.
let stack: HomeReadLoad<HomeOpportunitiesData> = { status: 'unavailable' };
const realGoalRead = await import('../../useHomeGoalRead');
mock.module('../../useHomeGoalRead', () => ({ ...realGoalRead, useHomeGoalRead: () => stack }));

const { default: OppsTile } = await import('./Tile');
const { OPPS_MISSING, OPPS_GOAL_UNITS_NOTE } = await import('./oppsModel');

afterEach(() => {
  cleanup();
  portfoliosRead = { hasAnswer: true, isError: false, brandPortfolios: EASY_FIT_PORTFOLIOS };
  stack = { status: 'unavailable' };
  refetch.mockClear();
  platformCardReads.length = 0;
});

const frame = () => screen.getByTestId('home-tile-opps');
const ctx = homeContext(EASY_FIT_META_BRAND_ID);

describe('Opportunities tile', () => {
  it('headlines the waiting decisions with the raw count optimizer_list_portfolios gives', () => {
    render(<OppsTile ctx={ctx} tile={tileOf('opps', 'l')} />);
    expect(frame().getAttribute('data-module-state')).toBe('ready');
    const headline = screen.getByTestId('home-tile-opps-headline');
    expect(headline.getAttribute('data-value')).toBe('9');
    expect(frame().textContent).toContain('Conversaciones Whatsapp');
    expect(frame().textContent).toContain('9 recommendations');
  });

  it('keeps the old Home touch-target rule: padded links in a column that keeps them apart', () => {
    portfoliosRead = {
      ...portfoliosRead,
      brandPortfolios: [...EASY_FIT_PORTFOLIOS, ...PINK_ELEPHANT_PORTFOLIOS],
    };
    render(<OppsTile ctx={ctx} tile={tileOf('opps', 'l')} />);
    const list = screen.getByTestId('home-tile-opps-portfolios');
    expect(list.className.split(/\s+/)).toContain('hit-area-column');
    const links = within(list).getAllByRole('link');
    expect(links).toHaveLength(2);
    for (const link of links) expect(link.className.split(/\s+/)).toContain('hit-area');
    expect(links[0]?.getAttribute('href')).toBe(
      '/scale?tab=performance&optimizerView=portfolios&portfolio=0fd6f383-6a70-4ce1-baf8-c869bc5d4aec',
    );
  });

  it("links to the Optimizer's decisions instead of a verb no write backs", () => {
    render(
      <OppsTile ctx={homeContext(EASY_FIT_META_BRAND_ID, 'recommend')} tile={tileOf('opps')} />,
    );
    const review = screen.getByTestId('home-tile-opps-review');
    expect(review.getAttribute('href')).toBe('/scale?tab=performance&optimizerView=actions');
    expect(frame().textContent).not.toContain('Add to checklist');
  });

  it('shows the figure and one line at size s', () => {
    render(<OppsTile ctx={ctx} tile={tileOf('opps', 's')} />);
    expect(screen.queryByTestId('home-tile-opps-portfolios')).toBeNull();
    expect(frame().textContent).toContain('Conversaciones Whatsapp: 9 recommendations');
  });

  it('is ready at zero when the active portfolios have nothing waiting', () => {
    portfoliosRead = {
      ...portfoliosRead,
      brandPortfolios: [EASY_FIT_PORTFOLIOS[0] as PortfolioListItem],
    };
    render(<OppsTile ctx={ctx} tile={tileOf('opps')} />);
    expect(screen.getByTestId('home-tile-opps-headline').getAttribute('data-value')).toBe('0');
    expect(frame().textContent).toContain('Nothing waits for a decision right now.');
  });

  it('is missing, in one sentence with the place to fix it, when no portfolio is active', () => {
    portfoliosRead = {
      ...portfoliosRead,
      brandPortfolios: [
        portfolioWith(EASY_FIT_PORTFOLIOS[1] as PortfolioListItem, { status: 'archived' }),
      ],
    };
    render(<OppsTile ctx={ctx} tile={tileOf('opps')} />);
    expect(frame().getAttribute('data-module-state')).toBe('missing');
    expect(screen.getByTestId('home-tile-missing').textContent).toBe(OPPS_MISSING);
    expect(screen.getByRole('link', { name: 'Create a portfolio' }).getAttribute('href')).toBe(
      '/scale?tab=performance&optimizerView=create',
    );
    expect(screen.queryByTestId('home-tile-opps-headline')).toBeNull();
  });

  it('is an error with a Retry when the read failed, never a zero', () => {
    portfoliosRead = { hasAnswer: false, isError: true, brandPortfolios: [] };
    render(<OppsTile ctx={ctx} tile={tileOf('opps')} />);
    expect(frame().getAttribute('data-module-state')).toBe('error');
    expect(screen.queryByTestId('home-tile-opps-headline')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('is loading, with no figure, until the read answers', () => {
    portfoliosRead = { hasAnswer: false, isError: false, brandPortfolios: [] };
    render(<OppsTile ctx={ctx} tile={tileOf('opps')} />);
    expect(frame().getAttribute('data-module-state')).toBe('loading');
    expect(screen.queryByTestId('home-tile-opps-headline')).toBeNull();
  });
});

describe('Opportunities expanded', () => {
  it("opens the Optimizer's queue for the portfolio with most waiting, on its own account", async () => {
    render(<OppsTile ctx={ctx} tile={tileOf('opps', 'l')} />);
    fireEvent.click(screen.getByTestId('home-tile-opps-open'));
    expect((await screen.findByTestId('home-opps-goal-units')).textContent).toBe(
      OPPS_GOAL_UNITS_NOTE,
    );
    const queue = await screen.findByTestId('optimizer-queue');
    expect(queue.getAttribute('data-portfolio')).toBe('0fd6f383-6a70-4ce1-baf8-c869bc5d4aec');
    expect(queue.getAttribute('data-account')).toBe('521903353286118');
    // A Meta portfolio reads no Google or TikTok cards.
    expect(platformCardReads).toEqual([]);
  });

  it("reads a Google portfolio's cards, and only one portfolio's queue at a time", async () => {
    portfoliosRead = {
      ...portfoliosRead,
      brandPortfolios: [...EASY_FIT_PORTFOLIOS, ...PINK_ELEPHANT_PORTFOLIOS],
    };
    render(<OppsTile ctx={ctx} tile={tileOf('opps', 'l')} />);
    fireEvent.click(screen.getByTestId('home-tile-opps-open'));
    expect(await screen.findAllByTestId('optimizer-queue')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /Evento Webinar 29 Octubre/ }));
    const queues = screen.getAllByTestId('optimizer-queue');
    expect(queues).toHaveLength(1);
    expect(queues[0]?.getAttribute('data-portfolio')).toBe('e4db2796-0cc9-4582-9c1d-b9a60ec2f3ed');
    expect(platformCardReads).toContain('google_ads');
    expect(platformCardReads).not.toContain('tiktok_ads');
  });
});

describe('Opportunities tile with the Backend read', () => {
  const opportunity = (impact: Partial<HomeOpportunityCard['impact']>): HomeOpportunityCard => ({
    id: 'platform_signal:1',
    origin: 'account_read',
    detector: 'dead_tail',
    adAccountId: '5251780631',
    portfolioIds: [],
    label: 'Spending on nothing',
    basis: '"gimnasios" spent $275 MXN with no conversions.',
    headline: null,
    confidence: 0.5,
    state: null,
    cta: { kind: 'none', targetId: null },
    cardAction: null,
    source: { kind: 'optimizer_get_account_read', ref: 'r1', since: null, until: '2026-11-04' },
    impact: {
      moneyPerDay: 9.16,
      currency: 'MXN',
      impactClass: 'recoverable',
      unit: 'goal',
      goalMetric: 'leads',
      goalUnits: 0.43,
      costPerResult: 21.19,
      goalUnitsBasis: 'portfolio_price',
      goalUnitsBecause: "At the portfolio's own 21.19 MXN per result over the last 14 days.",
      ...impact,
    },
  });
  const ready = (cards: HomeOpportunityCard[]): HomeReadLoad<HomeOpportunitiesData> => ({
    status: 'ready',
    generatedAt: '2026-11-04T12:00:00Z',
    data: {
      goal: { metric: 'leads', label: 'Leads', from: 'results' },
      opportunities: cards,
      total: cards.length,
      accounts: [],
    },
  });

  it('prints the top opportunity in goal units, on the tile', () => {
    stack = ready([opportunity({})]);
    render(<OppsTile ctx={ctx} tile={tileOf('opps', 'l')} />);
    const impact = screen.getByTestId('home-tile-opps-impact');
    expect(impact.getAttribute('data-unit')).toBe('goal');
    expect(impact.getAttribute('data-goal-units')).toBe('0.43');
    expect(impact.textContent).toContain('+0.43 leads a day');
    expect(impact.textContent).toContain('Spending on nothing');
  });

  it('keeps the figure in money where the read did not convert it, and does not pretend', () => {
    stack = ready([
      opportunity({ unit: 'money', goalUnits: null, costPerResult: null, goalUnitsBasis: null }),
    ]);
    render(<OppsTile ctx={ctx} tile={tileOf('opps', 'm')} />);
    const impact = screen.getByTestId('home-tile-opps-impact');
    expect(impact.getAttribute('data-unit')).toBe('money');
    expect(impact.textContent).toContain('$9.16 MXN a day');
  });

  it('opens a stack saying why each figure is what it is, and drops the pending line', () => {
    stack = ready([opportunity({})]);
    render(<OppsTile ctx={ctx} tile={tileOf('opps', 'l')} />);
    fireEvent.click(screen.getByTestId('home-tile-opps-open'));
    const rows = screen.getAllByTestId('home-opps-stack-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.textContent).toContain('21.19 MXN per result');
    expect(rows[0]?.textContent).toContain('Confidence 50%');
    expect(screen.queryByTestId('home-opps-goal-units')).toBeNull();
  });

  it('without the read the tile draws what it drew, and the sheet keeps its honest line', () => {
    stack = { status: 'unavailable' };
    render(<OppsTile ctx={ctx} tile={tileOf('opps', 'l')} />);
    expect(screen.queryByTestId('home-tile-opps-impact')).toBeNull();
    expect(frame().getAttribute('data-module-state')).toBe('ready');
    fireEvent.click(screen.getByTestId('home-tile-opps-open'));
    expect(screen.getByTestId('home-opps-goal-units').textContent).toBe(OPPS_GOAL_UNITS_NOTE);
  });
});
