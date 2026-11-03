import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  mock,
  setSystemTime,
} from 'bun:test';
import type { PortfolioListItem } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { OptimizerActionFeedRow } from '@/components/paid-media/optimizer/useOptimizerData';
import { homeContext, tileOf } from '../opps/__fixtures__/homeContext';
import {
  EASY_FIT_META_BRAND_ID,
  EASY_FIT_PORTFOLIOS,
  PINK_ELEPHANT_PORTFOLIOS,
} from '../opps/__fixtures__/portfolios';
import {
  EASY_FIT_ACTIONS,
  EASY_FIT_ACTIONS_IN_WINDOW,
  OVERNIGHT_NOW,
} from './__fixtures__/easyFitActions';

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
type ActionsRead = {
  data: OptimizerActionFeedRow[];
  isSuccess: boolean;
  isError: boolean;
  isRefetchError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
};
const readyActions = (data = EASY_FIT_ACTIONS): ActionsRead => ({
  data,
  isSuccess: true,
  isError: false,
  isRefetchError: false,
  hasNextPage: false,
  isFetchingNextPage: false,
});
let actionsRead = readyActions();
const fetchNextPage = mock(() => Promise.resolve());
const refetchActions = mock(() => Promise.resolve());
const refetchPortfolios = mock(() => Promise.resolve());
const actionWindows: number[] = [];
const realData = await import('@/components/paid-media/optimizer/useOptimizerData');
mock.module('@/components/paid-media/optimizer/useOptimizerData', () => ({
  ...realData,
  useOptimizerPortfolios: () => ({
    ...portfoliosRead,
    data: portfoliosRead.brandPortfolios,
    refetch: refetchPortfolios,
  }),
  useOptimizerActions: (_brandId: string, windowDays: number) => {
    actionWindows.push(windowDays);
    return { ...actionsRead, fetchNextPage, refetch: refetchActions };
  },
}));

const { default: AutopilotTile } = await import('./Tile');
const { OUTCOME_NOTE, OVERNIGHT_MISSING } = await import('./overnightModel');

beforeAll(() => setSystemTime(OVERNIGHT_NOW));
afterAll(() => setSystemTime());
afterEach(() => {
  cleanup();
  portfoliosRead = { hasAnswer: true, isError: false, brandPortfolios: EASY_FIT_PORTFOLIOS };
  actionsRead = readyActions();
  fetchNextPage.mockClear();
  refetchActions.mockClear();
  refetchPortfolios.mockClear();
  actionWindows.length = 0;
});

const frame = () => screen.getByTestId('home-tile-autopilot');
const ctx = homeContext(EASY_FIT_META_BRAND_ID, 'operate');

describe('Overnight tile', () => {
  it('headlines the actions of the last 24 h with their raw count', () => {
    render(<AutopilotTile ctx={ctx} tile={tileOf('autopilot', 'l')} />);
    expect(frame().getAttribute('data-module-state')).toBe('ready');
    const headline = screen.getByTestId('home-tile-autopilot-headline');
    expect(headline.getAttribute('data-value')).toBe(String(EASY_FIT_ACTIONS_IN_WINDOW));
    expect(frame().textContent).toContain('4 writes · 1 decision');
    expect(actionWindows.every((days) => days === 7)).toBe(true);
  });

  it('shows a verified write as applied and every other write as sent, never applied', () => {
    render(<AutopilotTile ctx={ctx} tile={tileOf('autopilot', 'l')} />);
    const rows = within(frame()).getAllByTestId('home-overnight-row');
    const outcomes = rows.map((row) => row.getAttribute('data-outcome'));
    expect(outcomes.slice(0, 3)).toEqual(['applied', 'applied', 'sent']);
    const sent = rows[2] as HTMLElement;
    expect(sent.textContent).toContain('Sent · outcome not readable yet');
    expect(sent.textContent).not.toContain('Applied');
  });

  it('pages back while every loaded row is still inside the 24 h, and holds the figure', () => {
    actionsRead = { ...readyActions(EASY_FIT_ACTIONS.slice(0, 3)), hasNextPage: true };
    render(<AutopilotTile ctx={ctx} tile={tileOf('autopilot')} />);
    expect(fetchNextPage).toHaveBeenCalled();
    expect(frame().getAttribute('data-module-state')).toBe('loading');
    expect(screen.queryByTestId('home-tile-autopilot-headline')).toBeNull();
  });

  it('is ready at zero when nothing ran in the last 24 h', () => {
    actionsRead = readyActions(EASY_FIT_ACTIONS.slice(EASY_FIT_ACTIONS_IN_WINDOW));
    render(<AutopilotTile ctx={ctx} tile={tileOf('autopilot')} />);
    expect(screen.getByTestId('home-tile-autopilot-headline').getAttribute('data-value')).toBe('0');
    expect(frame().textContent).toContain('Nothing ran in the last 24 h.');
  });

  it('is missing when no portfolio acts, saying so in one sentence', () => {
    portfoliosRead = { ...portfoliosRead, brandPortfolios: PINK_ELEPHANT_PORTFOLIOS };
    render(<AutopilotTile ctx={ctx} tile={tileOf('autopilot')} />);
    expect(frame().getAttribute('data-module-state')).toBe('missing');
    expect(screen.getByTestId('home-tile-missing').textContent).toBe(OVERNIGHT_MISSING);
    expect(screen.queryByTestId('home-tile-autopilot-headline')).toBeNull();
  });

  it('is an error with a Retry when the action feed failed', () => {
    actionsRead = { ...readyActions([]), isSuccess: false, isError: true };
    render(<AutopilotTile ctx={ctx} tile={tileOf('autopilot')} />);
    expect(frame().getAttribute('data-module-state')).toBe('error');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetchActions).toHaveBeenCalledTimes(1);
  });
});

describe('Overnight expanded', () => {
  it('lists every action of the window, says once that outcomes arrive with an update, and shows how each portfolio runs', async () => {
    render(<AutopilotTile ctx={ctx} tile={tileOf('autopilot', 's')} />);
    fireEvent.click(screen.getByTestId('home-tile-autopilot-open'));
    const sheet = await screen.findByTestId('home-overnight-module');
    expect(within(sheet).getAllByTestId('home-overnight-row')).toHaveLength(
      EASY_FIT_ACTIONS_IN_WINDOW,
    );
    expect(sheet.textContent?.split(OUTCOME_NOTE)).toHaveLength(2);
    const runs = within(sheet).getAllByTestId('home-overnight-run');
    expect(runs.map((run) => run.textContent)).toEqual([
      expect.stringContaining('Recommend'),
      expect.stringContaining('Autopilot'),
    ]);
    expect(runs[1]?.textContent).toContain('20% per cycle');
    expect(runs[1]?.textContent).toContain('$3,200 MXN a day');
    const automations = within(sheet).getByRole('link', {
      name: 'Change in Optimizer automations',
    });
    expect(automations.getAttribute('href')).toBe(
      '/scale?tab=performance&optimizerView=automations',
    );
    expect(automations.className.split(/\s+/)).toContain('hit-area');
    // Read-only: no autonomy control on the Home.
    expect(within(sheet).queryByRole('switch')).toBeNull();
    expect(within(sheet).queryByRole('tab')).toBeNull();
  });
});
