import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { HomeBoardTile, HomeOrganicWeekData } from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { OrganicCalendarDraft } from '@/components/organic/primitives/types';
import { render } from '@/i18n/__tests__/render';
import type { HomeBoardContext } from '../../types';
import { DRAFT_ROWS, NOW, POSTS } from './__fixtures__/organicWeek';
import { buildOrganicWeek } from './organicWeekModel';
import type { OrganicWeekLoad } from './useOrganicWeek';
import type { OrganicWeekRead } from './useOrganicWeekRead';

// The tile's reads and the calendar's approve hook are mocked: the week model has its own test,
// and the approve hook is the calendar's. `mock.module` replaces a module for the whole process,
// so this file runs on its own; every mock spreads the real module.
const READY = buildOrganicWeek({ now: NOW, posts: POSTS, drafts: DRAFT_ROWS });
let retried = 0;
let load: OrganicWeekLoad;
const reset = () => {
  retried = 0;
  load = {
    week: READY,
    loading: false,
    failed: false,
    retry: () => (retried += 1),
  };
};
reset();
const realWeek = await import('./useOrganicWeek');
mock.module('./useOrganicWeek', () => ({
  ...realWeek,
  useOrganicWeek: () => load,
}));

// The tile's Backend read; `unavailable` is what production answers until the Backend deploys.
let weekRead: OrganicWeekRead = { data: null, unavailable: true };
const realWeekRead = await import('./useOrganicWeekRead');
mock.module('./useOrganicWeekRead', () => ({
  ...realWeekRead,
  useOrganicWeekRead: () => weekRead,
}));

const approved: OrganicCalendarDraft[] = [];
const realApprove = await import('@/components/organic/hooks/useApproveScheduleDraft');
mock.module('@/components/organic/hooks/useApproveScheduleDraft', () => ({
  ...realApprove,
  useApproveScheduleDraft: () => ({
    approveAndSchedule: async (card: OrganicCalendarDraft) => {
      approved.push(card);
      return true;
    },
    isApproving: false,
  }),
}));

const realHome = await import('@/lib/home/homeAccounts');
mock.module('@/lib/home/homeAccounts', () => ({
  ...realHome,
  useOrganicSnapshot: () => ({
    status: 'ready',
    data: {
      accounts: [
        {
          platform: 'instagram',
          integrationAccountId: 'ig-1',
          name: 'pinkelephant',
          status: 'ok',
          metrics: { reach: 12_400, totalInteractions: 310 },
          comparison: null,
          trends: undefined,
          range: undefined,
        },
      ],
      missing: [],
      loadedAt: '2026-11-03T18:00:00Z',
    },
  }),
}));

const { default: OrganicTile } = await import('./Tile');
const {
  default: OrganicWeekModule,
  BEST_TIME_COLD,
  PER_POST_NOT_READABLE,
} = await import('./Module');

afterEach(() => {
  cleanup();
  reset();
  approved.length = 0;
});

const ACCOUNTS: HomeBoardContext['organicAccounts'] = [
  { platform: 'instagram', integrationAccountId: 'ig-1', name: 'pinkelephant' },
];
const ctxWith = (organicAccounts = ACCOUNTS) =>
  ({
    brandId: '8e5b7185-e43f-4150-b763-b86c4f5297a0',
    organicAccounts,
  }) as HomeBoardContext;
const tileOf = (size: HomeBoardTile['size'] = 'm'): HomeBoardTile => ({
  id: 'organic',
  size,
  urgency: 1,
  score: 50,
  why: null,
});

function withQueries(node: ReactNode) {
  return <QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>;
}

const stateOf = (root: HTMLElement) =>
  root.querySelector('[data-testid="home-tile-organic"]')?.getAttribute('data-module-state');

describe('Organic week tile', () => {
  it('heads with the posts this week, published plus scheduled', () => {
    const { container, getByTestId } = render(<OrganicTile ctx={ctxWith()} tile={tileOf()} />);
    expect(stateOf(container)).toBe('ready');
    const headline = getByTestId('home-tile-organic-headline');
    expect(headline.getAttribute('data-value')).toBe('6');
    expect(headline.textContent).toBe('6');
    expect(getByTestId('home-tile-organic-waiting').textContent).toBe('2 drafts need approval');
    expect(container.querySelectorAll('[data-day]').length).toBe(7);
  });

  it('never offers an approve button on the tile itself', () => {
    const { queryByTestId } = render(<OrganicTile ctx={ctxWith()} tile={tileOf('l')} />);
    expect(queryByTestId('home-organic-approve')).toBeNull();
  });

  it('shows the figure and one line at size s', () => {
    const { container, getByTestId } = render(<OrganicTile ctx={ctxWith()} tile={tileOf('s')} />);
    expect(getByTestId('home-tile-organic-headline').getAttribute('data-value')).toBe('6');
    expect(container.querySelectorAll('[data-day]').length).toBe(0);
  });

  it('is missing, naming why, when the brand has no organic account', () => {
    const { container, getByTestId } = render(<OrganicTile ctx={ctxWith([])} tile={tileOf()} />);
    expect(stateOf(container)).toBe('missing');
    expect(getByTestId('home-tile-missing').textContent).toBe(
      'No organic account is connected — connect Instagram or Facebook in Integrations.',
    );
  });

  it('is missing when the week holds nothing', () => {
    load = {
      ...load,
      week: buildOrganicWeek({ now: NOW, posts: [], drafts: [] }),
    };
    const { container, getByTestId, queryByTestId } = render(
      <OrganicTile ctx={ctxWith()} tile={tileOf()} />,
    );
    expect(stateOf(container)).toBe('missing');
    expect(getByTestId('home-tile-missing').textContent).toBe(
      'Nothing published, scheduled or drafted this week — plan posts in the Organic calendar.',
    );
    expect(queryByTestId('home-tile-organic-headline')).toBeNull();
  });

  it('loads while the reads are on their way, never with a figure', () => {
    load = { ...load, week: null, loading: true };
    const { container, queryByTestId } = render(<OrganicTile ctx={ctxWith()} tile={tileOf()} />);
    expect(stateOf(container)).toBe('loading');
    expect(queryByTestId('home-tile-organic-headline')).toBeNull();
  });

  it('says a failed read failed, and retries it', () => {
    load = { ...load, week: null, failed: true };
    const { container, getByText } = render(<OrganicTile ctx={ctxWith()} tile={tileOf()} />);
    expect(stateOf(container)).toBe('error');
    fireEvent.click(getByText('Retry'));
    expect(retried).toBe(1);
  });
});

describe('Organic week module (expanded)', () => {
  it('approves a waiting draft inline, with the calendar hook', async () => {
    const { getAllByTestId } = render(
      withQueries(<OrganicWeekModule brandId="b1" organicAccounts={ACCOUNTS} />),
    );
    const buttons = getAllByTestId('home-organic-approve');
    expect(buttons.length).toBe(2);
    fireEvent.click(buttons[0] as HTMLElement);
    await waitFor(() => expect(approved.length).toBe(1));
    expect(approved[0]?.backendDraftId).toBe('d3');
  });

  it('says best time is not read yet, and links to Organic to read it', () => {
    const { getByTestId } = render(
      withQueries(<OrganicWeekModule brandId="b1" organicAccounts={ACCOUNTS} />),
    );
    const line = getByTestId('home-organic-best-time');
    expect(line.textContent).toBe(BEST_TIME_COLD);
    expect(BEST_TIME_COLD).toBe('Best time not read yet — open Organic to read it.');
    expect(line.querySelector('a')?.getAttribute('href')).toBe('/organic?tab=metrics');
  });

  it('names the per-post figures that are not readable yet, and keeps the 7-day rollup', () => {
    const { getByText, getByTestId } = render(
      withQueries(<OrganicWeekModule brandId="b1" organicAccounts={ACCOUNTS} />),
    );
    expect(getByText(PER_POST_NOT_READABLE)).toBeTruthy();
    expect(getByTestId('home-organic-rollup').textContent).toContain('12.4K');
  });

  it('marks a draft approved but never scheduled', () => {
    const { getByText } = render(
      withQueries(<OrganicWeekModule brandId="b1" organicAccounts={ACCOUNTS} />),
    );
    expect(getByText('Approved, not scheduled yet')).toBeTruthy();
  });
});

describe('Organic week with the Backend read', () => {
  const POST = {
    postId: 'p1',
    platform: 'instagram' as const,
    accountId: '1784',
    publishedAt: '2026-11-03T15:00:00Z',
    day: '2026-11-03',
    permalink: 'https://instagram.com/p/1',
    mediaType: 'REEL',
    reach: 12_300,
    interactions: 240,
    engagementRate: 0.0195,
    reachCapturedOn: '2026-11-04',
    reachLift: 2.14,
    isTrial: false,
    publishedThrough: 'external' as const,
  };
  const WEEK: HomeOrganicWeekData = {
    week: {
      since: '2026-11-02',
      until: '2026-11-08',
      timeZone: 'America/Mexico_City',
    },
    baseline: {
      since: '2026-10-05',
      until: '2026-11-01',
      days: 28,
      statistic: 'median',
    },
    days: (['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const).map((weekday, index) => ({
      date: `2026-11-0${index + 2}`,
      weekday,
      published: index === 1 ? [POST] : [],
      scheduled: [],
      drafts: [],
    })),
    accounts: [],
    totals: { published: 1, scheduled: 0, drafts: 0, withReach: 1 },
    topPost: {
      postId: 'p1',
      platform: 'instagram',
      accountId: '1784',
      reach: 12_300,
      reachLift: 2.14,
    },
    sources: [],
  };

  afterEach(() => {
    weekRead = { data: null, unavailable: true };
  });

  it('adds the top post to the tile', () => {
    weekRead = { data: WEEK, unavailable: false };
    const { getByTestId } = render(<OrganicTile ctx={ctxWith()} tile={tileOf()} />);
    const top = getByTestId('home-tile-organic-top-post');
    expect(top.textContent).toBe('Top post: 12.3K reach · 2.1× its account’s usual');
    expect(top.getAttribute('data-reach')).toBe('12300');
  });

  it('opens reach per post and drops the pending line', () => {
    weekRead = { data: WEEK, unavailable: false };
    const { getByTestId, queryByText } = render(
      withQueries(<OrganicWeekModule brandId="b1" organicAccounts={ACCOUNTS} />),
    );
    const row = getByTestId('home-organic-reach-row');
    expect(row.getAttribute('data-reach')).toBe('12300');
    expect(row.textContent).toContain('12.3K reach · 2.1× usual');
    expect(queryByText(PER_POST_NOT_READABLE)).toBeNull();
  });

  it('a read holding nothing for the week says nothing, and does not claim it is pending', () => {
    weekRead = { data: null, unavailable: false };
    const { queryByTestId } = render(
      withQueries(<OrganicWeekModule brandId="b1" organicAccounts={ACCOUNTS} />),
    );
    expect(queryByTestId('home-organic-reach')).toBeNull();
    expect(queryByTestId('home-organic-reach-note')).toBeNull();
  });

  it('without the read the tile is as it was, never an error', () => {
    weekRead = { data: null, unavailable: true };
    const { container, queryByTestId } = render(<OrganicTile ctx={ctxWith()} tile={tileOf()} />);
    expect(stateOf(container)).toBe('ready');
    expect(queryByTestId('home-tile-organic-top-post')).toBeNull();
  });
});
