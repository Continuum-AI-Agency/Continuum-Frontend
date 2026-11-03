import { afterEach, beforeEach, describe, expect, it, mock, setSystemTime } from 'bun:test';
import {
  type HomeBoardTile,
  type HomeBrandSignals,
  type HomeProfileRow,
  readBrand,
  readHomeBoard,
} from '@continuum/contracts';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import type { HomeAdAccount } from '@/lib/home/homeAccounts';
import type { HomeBoardContext } from '../../types';
import {
  GOOGLE_ACCOUNT,
  GOOGLE_READS,
  MTD_NOW,
  MXN_ACCOUNT,
  MXN_OVERVIEW,
  USD_ACCOUNT,
  USD_OVERVIEW,
} from './__fixtures__/monthToDate';

// The Goal tile against its one boundary, the Supabase client: the reporting edge answers each
// account_overview read (or refuses it with the edge's real bodies, as supabase-js wraps them),
// and brand_role answers the caller's role. Everything between it and the tile is the real code.
// `mock.module` replaces a module for the whole process, so this file runs on its own.

type EdgeBody = {
  platform: string;
  brandId: string;
  adAccountId: string;
  scope: string;
  range: { preset: string; since?: string; until?: string };
  resultBucket?: string;
};
type Answer = { status: number; body: unknown };

const calls: { route: string; body: EdgeBody }[] = [];
let answer: (body: EdgeBody) => Answer = () => ({ status: 500, body: {} });
let role: string | null = 'owner';

mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    functions: {
      invoke: async (route: string, options: { body: EdgeBody }) => {
        calls.push({ route, body: options.body });
        const { status, body } = answer(options.body);
        return status >= 400
          ? {
              data: null,
              error: new FunctionsHttpError(new Response(JSON.stringify(body), { status })),
            }
          : { data: body, error: null };
      },
    },
    schema: () => ({
      rpc: async (fn: string) => ({ data: fn === 'brand_role' ? role : null, error: null }),
    }),
  }),
}));
const saved: { scope: string; metrics: string[] }[] = [];
mock.module('@/app/(post-auth)/dashboard/actions', () => ({
  saveHomeObjectivesAction: async (
    _brandId: string,
    scope: string,
    objectives: { metric: string }[],
  ) => {
    saved.push({ scope, metrics: objectives.map((goal) => goal.metric) });
    return { ok: true };
  },
  resetHomeObjectivesAction: async () => ({ ok: true }),
}));

const { default: GoalsTile } = await import('./Tile');

const OVERVIEWS: Record<string, unknown> = {
  [MXN_ACCOUNT.id]: MXN_OVERVIEW,
  [USD_ACCOUNT.id]: USD_OVERVIEW,
};
const answersEveryRead = (body: EdgeBody): Answer =>
  body.platform === 'google-ads'
    ? {
        status: 200,
        body: body.resultBucket === 'purchases' ? GOOGLE_READS.purchases : GOOGLE_READS.leads,
      }
    : { status: 200, body: OVERVIEWS[body.adAccountId] };

const TILE: HomeBoardTile = { id: 'goals', size: 'l', urgency: 2, score: 80, why: null };

function contextFor(input: {
  accounts: HomeAdAccount[];
  rows?: HomeProfileRow[];
  business?: HomeBrandSignals['business'];
}): HomeBoardContext {
  const signals: HomeBrandSignals = {
    accounts: { ads: input.accounts.length, organic: 0 },
    savedGoal: null,
    business: input.business ?? null,
    portfolios: [],
    approvalRequired: false,
  };
  const reading = readBrand(signals);
  return {
    brandId: 'brand-1',
    brandName: 'Easy Fit',
    userId: 'user-1',
    adAccounts: input.accounts,
    organicAccounts: [],
    profileRows: input.rows ?? [],
    reading,
    board: readHomeBoard(signals, { reading, language: 'en' }),
    setup: null,
    brandBookRefreshedAt: null,
  };
}

const brandGoals = (...metrics: HomeProfileRow['objectives'][number]['metric'][]) => [
  {
    brand_id: 'brand-1',
    scope: 'brand',
    source: 'user' as const,
    objectives: metrics.map((metric, index) => ({
      id: metric,
      label: metric === 'leads' ? 'Leads' : metric === 'purchase_value' ? 'Revenue' : metric,
      metric,
      role: index === 0 ? ('primary' as const) : ('secondary' as const),
    })),
  },
];

const tileState = (home: ReturnType<typeof render>) =>
  home.getByTestId('home-tile-goals').getAttribute('data-module-state');

beforeEach(() => setSystemTime(MTD_NOW));
afterEach(() => {
  cleanup();
  setSystemTime();
  calls.length = 0;
  saved.length = 0;
  answer = () => ({ status: 500, body: {} });
  role = 'owner';
});

describe('the Goal tile, ready', () => {
  it('leads with the primary goal month to date, read from the 1st through yesterday', async () => {
    answer = answersEveryRead;
    const home = render(
      <GoalsTile
        ctx={contextFor({ accounts: [MXN_ACCOUNT], rows: brandGoals('leads', 'conversations') })}
        tile={TILE}
      />,
    );

    const headline = await home.findByTestId('home-tile-goals-headline');
    expect(headline.getAttribute('data-value')).toBe('14');
    expect(headline.textContent).toBe('14');
    expect(tileState(home)).toBe('ready');
    expect(calls.map(({ route, body }) => [route, body])).toEqual([
      [
        'paid-media-reporting/metrics',
        {
          platform: 'meta',
          brandId: 'brand-1',
          adAccountId: MXN_ACCOUNT.id,
          scope: 'account_overview',
          range: { preset: 'custom', since: '2026-11-01', until: '2026-11-02' },
        },
      ],
    ]);
    expect(home.getByText('No target set yet')).toBeTruthy();
    expect(home.getByTestId('home-tile-goals-secondaries').textContent).toContain('41');
    expect(home.getByRole('img', { name: 'Leads, per day this month' })).toBeTruthy();
  });

  it('never adds money across currencies: the headline is the lead currency, the other apart', async () => {
    answer = answersEveryRead;
    const home = render(
      <GoalsTile
        ctx={contextFor({
          accounts: [MXN_ACCOUNT, USD_ACCOUNT],
          rows: brandGoals('purchase_value'),
        })}
        tile={TILE}
      />,
    );

    const headline = await home.findByTestId('home-tile-goals-headline');
    expect(headline.getAttribute('data-value')).toBe('5400');
    expect(headline.getAttribute('data-currency')).toBe('MXN');
    const currencies = home.getByTestId('home-tile-goals-currencies').textContent ?? '';
    expect(currencies).toContain('MXN');
    expect(currencies).toContain('300');
    expect(home.container.textContent).not.toContain('5,700');
  });

  it('reads a Google account once per business result, over the same window', async () => {
    answer = answersEveryRead;
    const home = render(
      <GoalsTile
        ctx={contextFor({ accounts: [GOOGLE_ACCOUNT], rows: brandGoals('leads') })}
        tile={TILE}
      />,
    );

    expect((await home.findByTestId('home-tile-goals-headline')).getAttribute('data-value')).toBe(
      '2',
    );
    expect(calls.map(({ route, body }) => [route, body.resultBucket, body.range.since])).toEqual([
      ['paid-media-reporting/metrics?platform=google-ads', 'leads', '2026-11-01'],
      ['paid-media-reporting/metrics?platform=google-ads', 'purchases', '2026-11-01'],
    ]);
  });
});

describe('the Goal tile, missing', () => {
  it('shows the goal the Brand Book suggests, as text, when there is no ad account', async () => {
    const home = render(
      <GoalsTile
        ctx={contextFor({
          accounts: [],
          business: {
            calls: ['Agenda tu cita', 'Reserva tu clase muestra'],
            descriptions: ['Gym and fitness club'],
          },
        })}
        tile={TILE}
      />,
    );

    expect(tileState(home)).toBe('missing');
    expect(home.getByTestId('home-tile-goals-inferred').textContent).toContain('Leads');
    expect(home.getByTestId('home-tile-goals-inferred').textContent).toContain(
      'Read from your Brand Book',
    );
    expect(home.getByTestId('home-tile-missing').textContent).toStartWith(
      'No ad account is connected',
    );
    expect(home.queryByTestId('home-tile-goals-headline')).toBeNull();
    expect(calls).toEqual([]);
  });

  it('says the month has no complete day yet on the 1st, and reads nothing', async () => {
    setSystemTime(new Date('2026-11-01T15:00:00Z'));
    answer = answersEveryRead;
    const home = render(<GoalsTile ctx={contextFor({ accounts: [MXN_ACCOUNT] })} tile={TILE} />);

    expect(tileState(home)).toBe('missing');
    expect(home.getByTestId('home-tile-missing').textContent).toStartWith(
      'The month started today',
    );
    expect(calls).toEqual([]);
  });
});

describe('the Goal tile, when the read fails', () => {
  it('says the platform did not answer and reads again on Retry', async () => {
    answer = () => ({ status: 502, body: { error: 'Meta API unavailable' } });
    const home = render(
      <GoalsTile
        ctx={contextFor({ accounts: [MXN_ACCOUNT], rows: brandGoals('leads') })}
        tile={TILE}
      />,
    );

    await waitFor(() => expect(tileState(home)).toBe('error'));
    expect(home.getByRole('alert').textContent).toContain('didn’t answer');
    answer = answersEveryRead;
    fireEvent.click(home.getByRole('button', { name: 'Retry' }));
    expect((await home.findByTestId('home-tile-goals-headline')).getAttribute('data-value')).toBe(
      '14',
    );
    expect(calls).toHaveLength(2);
  });

  it('says why in the Google tab’s words when Google refused every read', async () => {
    answer = () => ({
      status: 409,
      body: {
        error:
          'Google refused this connection’s login (revoked or expired). Reconnect Google in Settings → Integrations.',
        errorCode: 'TOKEN_EXPIRED',
        platform: 'google',
      },
    });
    const home = render(<GoalsTile ctx={contextFor({ accounts: [GOOGLE_ACCOUNT] })} tile={TILE} />);

    await waitFor(() =>
      expect(home.getByText('Google Ads could not be read for Pink Elephant')).toBeTruthy(),
    );
    expect(tileState(home)).toBe('error');
    expect(home.queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(home.getByTestId('platform-connect-google_ads')).toBeTruthy();
  });

  it('tells a viewer their role cannot read Google Ads', async () => {
    answer = () => ({
      status: 404,
      body: { error: 'Google Ads account not configured or access token missing' },
    });
    role = 'viewer';
    const home = render(<GoalsTile ctx={contextFor({ accounts: [GOOGLE_ACCOUNT] })} tile={TILE} />);

    await waitFor(() =>
      expect(home.getByText('Your role on this brand can’t read Google Ads')).toBeTruthy(),
    );
  });
});

describe('the Goal tile, setting a goal', () => {
  it('opens the expanded module from "Set a goal", where the goal is edited and saved', async () => {
    answer = answersEveryRead;
    const home = render(
      <GoalsTile
        ctx={contextFor({ accounts: [MXN_ACCOUNT, USD_ACCOUNT], rows: brandGoals('leads') })}
        tile={TILE}
      />,
    );

    fireEvent.click(await home.findByRole('button', { name: 'Set a goal' }));
    const sheet = await home.findByTestId('home-tile-goals-sheet');
    await waitFor(() => expect(sheet.textContent).toContain('Targets and periods arrive'));
    expect(home.getByLabelText('Ad accounts in view')).toBeTruthy();

    fireEvent.click(home.getByRole('button', { name: 'Edit goal Leads' }));
    fireEvent.click(await home.findByRole('button', { name: 'Conversations started' }));
    await waitFor(() => expect(saved).toEqual([{ scope: 'brand', metrics: ['conversations'] }]));
    await waitFor(() =>
      expect(home.getByTestId('home-tile-goals-headline').getAttribute('data-value')).toBe('46'),
    );
  });
});
