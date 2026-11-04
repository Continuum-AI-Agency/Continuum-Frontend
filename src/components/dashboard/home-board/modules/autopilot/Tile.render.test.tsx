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
import type { HomeOvernightLogData, PortfolioListItem } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { OptimizerActionFeedRow } from '@/components/paid-media/optimizer/useOptimizerData';
import type { HomeReadLoad } from '../../homeRead';
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

// The tile's Backend read; `unavailable` is what production answers until the Backend deploys.
let logLoad: HomeReadLoad<HomeOvernightLogData> = { status: 'unavailable' };
const realRead = await import('../../useHomeRead');
mock.module('../../useHomeRead', () => ({ ...realRead, useHomeRead: () => logLoad }));

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

describe('Overnight tile with the Backend read', () => {
  const LOG: HomeOvernightLogData = {
    window: {
      since: '2026-11-03T12:00:00.000Z',
      until: '2026-11-04T12:00:00.000Z',
      hours: 24,
    },
    entries: [
      {
        id: 'e1',
        at: '2026-11-04T07:00:05.002Z',
        source: 'apply_audit',
        kind: 'budget',
        title: 'Search',
        entityId: 'a1',
        entityName: 'Search',
        outcome: 'failed',
        outcomeReason: 'Meta refused the budget.',
        portfolioId: null,
        portfolioName: 'Leads',
        platform: 'meta',
        actor: 'autopilot',
        change: null,
        justification: null,
      },
    ],
    counts: {
      applied: 3,
      failed: 1,
      paused: 0,
      createdPaused: 0,
      pendingApproval: 0,
      queued: 0,
      undone: 0,
      skipped: 0,
      skippedByCap: 2,
    },
    bySource: {
      applyAudit: 4,
      cycleItem: 0,
      actionLedger: 0,
      recommendation: 0,
      audienceProposal: 0,
    },
    total: 4,
    truncated: false,
    capSkipped: {
      count: 2,
      items: [
        {
          id: 'c1',
          at: '2026-11-04T07:00:05.002Z',
          portfolioId: 'b9cebbcf-2832-440a-b326-3af20c19be37',
          platform: 'meta',
          entityId: 'as1',
          entityName: 'Retargeting',
          changePct: 0.6,
          capBreached: true,
          reason: 'Over the 20% cap.',
        },
      ],
    },
    source: { kind: 'optimizer_list_action_outcomes', ref: null, since: null, until: null },
  };
  const ready: HomeReadLoad<HomeOvernightLogData> = {
    status: 'ready',
    generatedAt: '2026-11-04T12:00:00Z',
    data: LOG,
  };

  afterEach(() => {
    logLoad = { status: 'unavailable' };
  });

  it('counts what the read counted, with each outcome and the cap, and a failure reads failed', () => {
    logLoad = ready;
    render(
      <AutopilotTile ctx={homeContext(EASY_FIT_META_BRAND_ID)} tile={tileOf('autopilot', 'l')} />,
    );
    const headline = screen.getByTestId('home-tile-autopilot-headline');
    expect(headline.getAttribute('data-value')).toBe('4');
    expect(headline.getAttribute('data-source')).toBe('overnight-log');
    expect(headline.getAttribute('data-skipped-by-cap')).toBe('2');
    expect(screen.getByTestId('home-tile-autopilot-summary').textContent).toBe(
      '3 applied · 1 failed · 2 skipped by cap',
    );
    expect(screen.getAllByTestId('home-overnight-row')[0]?.getAttribute('data-outcome')).toBe(
      'failed',
    );
  });

  it('opens the cap’s moves and drops the pending note', () => {
    logLoad = ready;
    render(
      <AutopilotTile ctx={homeContext(EASY_FIT_META_BRAND_ID)} tile={tileOf('autopilot', 'l')} />,
    );
    fireEvent.click(screen.getByTestId('home-tile-autopilot-open'));
    expect(screen.getByTestId('home-overnight-cap-item').textContent).toContain(
      'Retargeting: +60%',
    );
    expect(screen.queryByTestId('home-overnight-note')).toBeNull();
  });

  it('a window the ledgers hold nothing for is zero, without reading the feed', () => {
    logLoad = {
      status: 'missing',
      missing: { reason: 'no_data', detail: 'The Optimizer recorded no action.' },
    };
    render(
      <AutopilotTile ctx={homeContext(EASY_FIT_META_BRAND_ID)} tile={tileOf('autopilot', 'l')} />,
    );
    expect(screen.getByTestId('home-tile-autopilot-headline').getAttribute('data-value')).toBe('0');
    expect(screen.getByTestId('home-tile-autopilot-summary').textContent).toBe(
      'Nothing ran in the last 24 h.',
    );
  });

  it('without the read it counts the feed and keeps saying outcomes are pending, never an error', () => {
    logLoad = { status: 'unavailable' };
    render(
      <AutopilotTile ctx={homeContext(EASY_FIT_META_BRAND_ID)} tile={tileOf('autopilot', 'l')} />,
    );
    expect(screen.getByTestId('home-tile-autopilot').getAttribute('data-module-state')).toBe(
      'ready',
    );
    expect(screen.getByTestId('home-tile-autopilot-headline').getAttribute('data-source')).toBe(
      'feed',
    );
    fireEvent.click(screen.getByTestId('home-tile-autopilot-open'));
    expect(screen.getByTestId('home-overnight-note').textContent).toBe(OUTCOME_NOTE);
  });
});
