import { afterEach, beforeEach, describe, expect, it, mock, setSystemTime, spyOn } from 'bun:test';
import {
  HOME_READ_PATHS,
  type HomeBoardTile,
  type HomeBrandSignals,
  type HomeGoalTarget,
  type HomeProfileRow,
  homeGoalTargetDeleteRequestSchema,
  homeGoalTargetUpsertRequestSchema,
  readBrand,
  readHomeBoard,
} from '@continuum/contracts';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { ApiError, markFetchFailure } from '@/lib/api/errors';
import type { RequestOptions } from '@/lib/api/http.types';
import type { HomeAdAccount } from '@/lib/home/homeAccounts';
import type { HomeBoardContext } from '../../types';
import {
  BRAND_ID,
  GOOGLE_ACCOUNT,
  GOOGLE_READS,
  goalTarget,
  MTD_NOW,
  MXN_ACCOUNT,
  MXN_OVERVIEW,
  MXN_WEEK_OVERVIEW,
  USD_ACCOUNT,
  USD_OVERVIEW,
} from './__fixtures__/monthToDate';

// The Goal tile against its one boundary, the Supabase client: the reporting edge answers each
// account_overview read (or refuses it with the edge's real bodies, as supabase-js wraps them),
// and brand_role answers the caller's role. The goal targets go through the Backend client, the
// other boundary: never a real PUT, and the route is not deployed yet, so a 404 is the default
// here as it is in production. Everything between them and the tile is the real code.
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

type TargetCall = { path: string; method: string; body: unknown };
const targetCalls: TargetCall[] = [];
const NOT_DEPLOYED = () => {
  throw new ApiError('Not Found', 404);
};
let targetsAnswer: (call: TargetCall) => unknown = NOT_DEPLOYED;
const request = async (options: RequestOptions<unknown>) => {
  const call = {
    path: options.path,
    method: options.method ?? 'GET',
    body: options.body,
  };
  targetCalls.push(call);
  const json = targetsAnswer(call);
  return options.schema ? options.schema.parse(json) : json;
};
mock.module('@/lib/api/http', () => ({ request, http: { request } }));

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
const answersEveryRead = (body: EdgeBody): Answer => {
  if (body.platform === 'google-ads') {
    return {
      status: 200,
      body: body.resultBucket === 'purchases' ? GOOGLE_READS.purchases : GOOGLE_READS.leads,
    };
  }
  // A window starting on Nov 2 is the week target's: Monday, the week's one complete day.
  return {
    status: 200,
    body:
      body.range.since === '2026-11-02' && body.adAccountId === MXN_ACCOUNT.id
        ? MXN_WEEK_OVERVIEW
        : OVERVIEWS[body.adAccountId],
  };
};

const envelope = (targets: HomeGoalTarget[]) => ({
  state: 'ready',
  brandId: BRAND_ID,
  generatedAt: '2026-11-03T12:00:00Z',
  data: { targets },
});
/** The route deployed: answers the list, and echoes a PUT as the row it stored. */
const deployedRoute =
  (targets: HomeGoalTarget[]) =>
  ({ method, body }: TargetCall) => {
    if (method === 'GET') return envelope(targets);
    if (method === 'DELETE') return { deleted: true };
    return {
      target: goalTarget({
        ...(body as Partial<HomeGoalTarget>),
        updatedAt: '2026-11-03T15:00:00Z',
      }),
    };
  };

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
    brandId: BRAND_ID,
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
    brand_id: BRAND_ID,
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
  targetCalls.length = 0;
  targetsAnswer = NOT_DEPLOYED;
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
          brandId: BRAND_ID,
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

    await waitFor(() => expect(tileState(home)).toBe('missing'));
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

const openModule = async (home: ReturnType<typeof render>, button = 'Set a goal') => {
  fireEvent.click(await home.findByRole('button', { name: button }));
  return home.findByTestId('home-tile-goals-sheet');
};
const renderLeadsTile = (accounts: HomeAdAccount[] = [MXN_ACCOUNT]) =>
  render(<GoalsTile ctx={contextFor({ accounts, rows: brandGoals('leads') })} tile={TILE} />);
const writes = () => targetCalls.filter(({ method }) => method !== 'GET');

describe('the Goal tile, while the targets route is not available', () => {
  const unavailable: [string, () => unknown][] = [
    ['a 404', NOT_DEPLOYED],
    [
      'an envelope saying it is not deployed',
      () => ({
        state: 'missing',
        brandId: BRAND_ID,
        generatedAt: '2026-11-03T12:00:00Z',
        missing: { reason: 'not_deployed', detail: 'Goal targets are not deployed yet.' },
      }),
    ],
    [
      'a network failure',
      () => {
        throw markFetchFailure(new TypeError('Failed to fetch'));
      },
    ],
  ];

  for (const [name, route] of unavailable) {
    it(`stays ready on its real figure after ${name}, with no form and no second try`, async () => {
      const consoleError = spyOn(console, 'error');
      answer = answersEveryRead;
      targetsAnswer = route;
      const home = renderLeadsTile();

      const headline = await home.findByTestId('home-tile-goals-headline');
      expect(headline.getAttribute('data-value')).toBe('14');
      expect(headline.hasAttribute('data-target')).toBe(false);
      expect(tileState(home)).toBe('ready');
      expect(home.getByText('No target set yet')).toBeTruthy();
      expect(home.getByText('Targets and periods arrive with the goals update.')).toBeTruthy();
      expect(home.queryByRole('alert')).toBeNull();
      expect(home.queryByRole('button', { name: 'Retry' })).toBeNull();

      const sheet = await openModule(home);
      await waitFor(() => expect(sheet.textContent).toContain('Targets and periods arrive'));
      expect(home.queryByTestId('home-goals-target-form')).toBeNull();
      expect(targetCalls).toHaveLength(1);
      expect(consoleError).not.toHaveBeenCalled();
      consoleError.mockRestore();
    });
  }

  it('does not claim "no target" when the route answers with a failure, and offers no form', async () => {
    const consoleError = spyOn(console, 'error');
    answer = answersEveryRead;
    targetsAnswer = () => {
      throw new ApiError('home_read_failed', 502);
    };
    const home = renderLeadsTile();

    await home.findByTestId('home-tile-goals-headline');
    expect(tileState(home)).toBe('ready');
    expect(home.queryByText('No target set yet')).toBeNull();
    expect(home.getByTestId('home-tile-goals-target-note').textContent).toContain(
      'Couldn’t read this goal’s target',
    );
    const sheet = await openModule(home);
    await waitFor(() => expect(sheet.textContent).toContain('Couldn’t read this goal’s target'));
    expect(home.queryByTestId('home-goals-target-form')).toBeNull();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe('the Goal tile, with no target for the primary goal', () => {
  it('says so and sets one from the expanded form with a valid PUT, then compares', async () => {
    answer = answersEveryRead;
    targetsAnswer = deployedRoute([]);
    const home = renderLeadsTile();

    expect((await home.findByTestId('home-tile-goals-headline')).hasAttribute('data-target')).toBe(
      false,
    );
    expect(home.getByText('No target set yet')).toBeTruthy();
    expect(home.queryByText('Targets and periods arrive with the goals update.')).toBeNull();

    await openModule(home);
    await home.findByTestId('home-goals-target-form');
    fireEvent.change(home.getByLabelText('Target'), { target: { value: '70' } });
    fireEvent.change(home.getByLabelText('Period'), { target: { value: 'week' } });
    fireEvent.click(home.getByRole('button', { name: 'Save target' }));

    await waitFor(() => expect(writes()).toHaveLength(1));
    const [put] = writes();
    expect(put?.method).toBe('PUT');
    expect(put?.path).toBe(HOME_READ_PATHS.goalTargets);
    expect(homeGoalTargetUpsertRequestSchema.parse(put?.body)).toMatchObject({
      brandId: BRAND_ID,
      scope: 'brand',
      objectiveId: 'leads',
      metric: 'leads',
      target: 70,
      period: 'week',
    });
    await waitFor(() =>
      expect(home.getByTestId('home-tile-goals-headline').getAttribute('data-target')).toBe('70'),
    );
    expect(home.getByTestId('home-goals-target-status').textContent).toBe('Target saved.');
  });

  it('names the currency of a money goal, defaulting to the headline’s', async () => {
    answer = answersEveryRead;
    targetsAnswer = deployedRoute([]);
    const home = render(
      <GoalsTile
        ctx={contextFor({
          accounts: [MXN_ACCOUNT, USD_ACCOUNT],
          rows: brandGoals('purchase_value'),
        })}
        tile={TILE}
      />,
    );
    await openModule(home);
    await home.findByTestId('home-goals-target-form');
    expect((home.getByLabelText('Currency') as HTMLInputElement).value).toBe('MXN');
    fireEvent.change(home.getByLabelText('Target'), { target: { value: '9000' } });
    fireEvent.click(home.getByRole('button', { name: 'Save target' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(homeGoalTargetUpsertRequestSchema.parse(writes()[0]?.body).currency).toBe('MXN');
  });

  it('asks for dates only on a custom period, and refuses it without them before any write', async () => {
    answer = answersEveryRead;
    targetsAnswer = deployedRoute([]);
    const home = renderLeadsTile();
    await openModule(home);
    await home.findByTestId('home-goals-target-form');

    expect(home.queryByLabelText('Starts')).toBeNull();
    expect(home.queryByLabelText('Currency')).toBeNull();
    fireEvent.change(home.getByLabelText('Target'), { target: { value: '70' } });
    fireEvent.change(home.getByLabelText('Period'), { target: { value: 'custom' } });
    fireEvent.click(home.getByRole('button', { name: 'Save target' }));

    await waitFor(() =>
      expect(home.getByRole('alert').textContent).toBe(
        'A custom period needs a start and an end date.',
      ),
    );
    expect(writes()).toEqual([]);

    fireEvent.change(home.getByLabelText('Starts'), { target: { value: '2026-11-01' } });
    fireEvent.change(home.getByLabelText('Ends'), { target: { value: '2026-11-15' } });
    fireEvent.click(home.getByRole('button', { name: 'Save target' }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(homeGoalTargetUpsertRequestSchema.parse(writes()[0]?.body)).toMatchObject({
      period: 'custom',
      periodStart: '2026-11-01',
      periodEnd: '2026-11-15',
    });
  });

  it('shows the Backend’s words on a failed save, keeps the form, and never shows it saved', async () => {
    answer = answersEveryRead;
    const route = deployedRoute([]);
    targetsAnswer = (call) => {
      if (call.method === 'PUT') {
        throw new ApiError('goal_target_write_failed', 502, undefined, {
          error: 'goal_target_write_failed',
        });
      }
      return route(call);
    };
    const home = renderLeadsTile();
    await openModule(home);
    await home.findByTestId('home-goals-target-form');
    fireEvent.change(home.getByLabelText('Target'), { target: { value: '70' } });
    fireEvent.click(home.getByRole('button', { name: 'Save target' }));

    await waitFor(() =>
      expect(home.getByRole('alert').textContent).toContain('goal_target_write_failed'),
    );
    expect((home.getByLabelText('Target') as HTMLInputElement).value).toBe('70');
    expect(home.queryByTestId('home-goals-target-status')).toBeNull();
    expect(home.getByTestId('home-tile-goals-headline').hasAttribute('data-target')).toBe(false);
    expect(home.getByText('No target set yet')).toBeTruthy();
  });

  it('shows the words of a refused payload, not its code', async () => {
    answer = answersEveryRead;
    const route = deployedRoute([]);
    targetsAnswer = (call) => {
      if (call.method === 'PUT') {
        throw new ApiError('invalid_payload', 400, undefined, {
          error: 'invalid_payload',
          details: [{ message: 'A money target names its currency.' }],
        });
      }
      return route(call);
    };
    const home = renderLeadsTile();
    await openModule(home);
    await home.findByTestId('home-goals-target-form');
    fireEvent.change(home.getByLabelText('Target'), { target: { value: '70' } });
    fireEvent.click(home.getByRole('button', { name: 'Save target' }));
    await waitFor(() =>
      expect(home.getByRole('alert').textContent).toContain('A money target names its currency.'),
    );
  });
});

describe('the Goal tile, with a target set', () => {
  it('reads the figure over the target’s period and paces it on complete days only', async () => {
    answer = answersEveryRead;
    targetsAnswer = deployedRoute([goalTarget()]);
    const home = renderLeadsTile();

    const headline = await home.findByTestId('home-tile-goals-headline');
    expect(headline.getAttribute('data-value')).toBe('8');
    expect(headline.getAttribute('data-target')).toBe('70');
    expect(calls.map(({ body }) => [body.range.since, body.range.until])).toEqual([
      ['2026-11-01', '2026-11-02'],
      ['2026-11-02', '2026-11-02'],
    ]);
    // One complete day of seven owes 10: counting today it would owe 20 and read 60% below.
    expect(home.getByTestId('home-tile-goals-pace').textContent).toBe(
      'Nov 2 – Nov 8 · day 1 of 7 · expected 10 by now · 20% below pace',
    );
    expect(home.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('11');
    expect(home.getByTestId('home-tile-goals-target').textContent).toBe('of 70');
    expect(home.queryByText('No target set yet')).toBeNull();
    expect(home.container.textContent?.toLowerCase()).not.toContain('projected');
    expect(home.container.textContent?.toLowerCase()).not.toContain('month end');
  });

  it('makes one read per account for a month target: the month’s own', async () => {
    answer = answersEveryRead;
    targetsAnswer = deployedRoute([goalTarget({ period: 'month', target: 300 })]);
    const home = renderLeadsTile();

    const headline = await home.findByTestId('home-tile-goals-headline');
    expect(headline.getAttribute('data-value')).toBe('14');
    expect(calls).toHaveLength(1);
    expect(home.getByTestId('home-tile-goals-pace').textContent).toBe(
      'Nov 1 – Nov 30 · day 2 of 30 · expected 20 by now · 30% below pace',
    );
  });

  it('draws the ring in the expanded module, against the target', async () => {
    answer = answersEveryRead;
    targetsAnswer = deployedRoute([goalTarget()]);
    const home = renderLeadsTile();
    await openModule(home, 'Edit target');

    const ring = await home.findByTestId('home-goals-ring');
    expect(ring.textContent).toContain('8');
    expect(ring.textContent).toContain('of 70');
    expect((home.getByLabelText('Target') as HTMLInputElement).value).toBe('70');
  });

  it('says a period has not started, with no pace, no ring and no read of it', async () => {
    answer = answersEveryRead;
    targetsAnswer = deployedRoute([
      goalTarget({ period: 'custom', periodStart: '2026-12-01', periodEnd: '2026-12-31' }),
    ]);
    const home = renderLeadsTile();

    const headline = await home.findByTestId('home-tile-goals-headline');
    expect(headline.getAttribute('data-value')).toBe('14');
    expect(headline.hasAttribute('data-target')).toBe(false);
    expect(home.getByTestId('home-tile-goals-target-note').textContent).toContain(
      'Its period starts Dec 1',
    );
    expect(home.queryByRole('progressbar')).toBeNull();
    expect(home.queryByTestId('home-tile-goals-pace')).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('says a period started today has no complete day to compare', async () => {
    setSystemTime(new Date('2026-11-02T15:00:00Z'));
    answer = answersEveryRead;
    targetsAnswer = deployedRoute([goalTarget()]);
    const home = renderLeadsTile();

    await home.findByTestId('home-tile-goals-headline');
    expect(home.getByTestId('home-tile-goals-target-note').textContent).toContain(
      'Its period started today',
    );
    expect(home.queryByRole('progressbar')).toBeNull();
  });

  it('measures a running quarter on the 1st, when the month has nothing of its own', async () => {
    setSystemTime(new Date('2026-11-01T15:00:00Z'));
    answer = answersEveryRead;
    targetsAnswer = deployedRoute([goalTarget({ period: 'quarter', target: 900 })]);
    const home = renderLeadsTile();

    const headline = await home.findByTestId('home-tile-goals-headline');
    expect(headline.getAttribute('data-target')).toBe('900');
    expect(calls.map(({ body }) => [body.range.since, body.range.until])).toEqual([
      ['2026-10-01', '2026-10-31'],
    ]);
  });

  it('is an error when the period’s read fails, and Retry reads it again', async () => {
    let refuse = true;
    answer = (body) =>
      body.range.since === '2026-11-02' && refuse
        ? { status: 502, body: { error: 'Meta API unavailable' } }
        : answersEveryRead(body);
    targetsAnswer = deployedRoute([goalTarget()]);
    const home = renderLeadsTile();

    await waitFor(() => expect(tileState(home)).toBe('error'));
    refuse = false;
    fireEvent.click(home.getByRole('button', { name: 'Retry' }));
    expect((await home.findByTestId('home-tile-goals-headline')).getAttribute('data-value')).toBe(
      '8',
    );
  });

  it('closes out an ended period on its final figure, with no pace', async () => {
    answer = answersEveryRead;
    targetsAnswer = deployedRoute([
      goalTarget({ period: 'custom', periodStart: '2026-10-01', periodEnd: '2026-10-31' }),
    ]);
    const home = renderLeadsTile();

    await home.findByTestId('home-tile-goals-pace');
    expect(calls[1]?.body.range).toEqual({
      preset: 'custom',
      since: '2026-10-01',
      until: '2026-10-31',
    });
    expect(home.getByTestId('home-tile-goals-pace').textContent).toBe(
      'Oct 1 – Oct 31 · ended · 20% of target',
    );
  });

  it('never compares a money target in another currency: says so, with no ring', async () => {
    answer = answersEveryRead;
    targetsAnswer = deployedRoute([
      goalTarget({
        objectiveId: 'purchase_value',
        metric: 'purchase_value',
        period: 'month',
        target: 600,
        currency: 'USD',
      }),
    ]);
    const home = render(
      <GoalsTile
        ctx={contextFor({ accounts: [MXN_ACCOUNT], rows: brandGoals('purchase_value') })}
        tile={TILE}
      />,
    );

    const headline = await home.findByTestId('home-tile-goals-headline');
    expect(headline.getAttribute('data-value')).toBe('5400');
    expect(headline.hasAttribute('data-target')).toBe(false);
    expect(home.getByTestId('home-tile-goals-target-note').textContent).toBe(
      'This target is in USD and these figures are in MXN, so they are not compared.',
    );
    expect(home.queryByRole('progressbar')).toBeNull();
    expect(home.queryByTestId('home-tile-goals-pace')).toBeNull();
    await openModule(home, 'Edit target');
    await home.findByTestId('home-goals-target-form');
    expect(home.queryByTestId('home-goals-ring')).toBeNull();
  });

  it('ignores a target for another metric under the same id', async () => {
    answer = answersEveryRead;
    targetsAnswer = deployedRoute([goalTarget({ metric: 'clicks' })]);
    const home = renderLeadsTile();
    await home.findByTestId('home-tile-goals-headline');
    expect(home.getByText('No target set yet')).toBeTruthy();
  });

  it('removes the target with a valid DELETE and goes back to the month', async () => {
    answer = answersEveryRead;
    targetsAnswer = deployedRoute([goalTarget()]);
    const home = renderLeadsTile();
    await openModule(home, 'Edit target');
    await home.findByTestId('home-goals-target-form');
    fireEvent.click(home.getByRole('button', { name: 'Remove target' }));

    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]?.method).toBe('DELETE');
    expect(homeGoalTargetDeleteRequestSchema.parse(writes()[0]?.body)).toEqual({
      brandId: BRAND_ID,
      scope: 'brand',
      objectiveId: 'leads',
    });
    await waitFor(() =>
      expect(home.getByTestId('home-tile-goals-headline').getAttribute('data-value')).toBe('14'),
    );
    expect(home.getByText('No target set yet')).toBeTruthy();
  });

  it('keeps the target on a failed remove, in the Backend’s words', async () => {
    answer = answersEveryRead;
    const route = deployedRoute([goalTarget()]);
    targetsAnswer = (call) => {
      if (call.method === 'DELETE') throw new ApiError('goal_targets_not_deployed', 503);
      return route(call);
    };
    const home = renderLeadsTile();
    await openModule(home, 'Edit target');
    await home.findByTestId('home-goals-target-form');
    fireEvent.click(home.getByRole('button', { name: 'Remove target' }));

    await waitFor(() =>
      expect(home.getByRole('alert').textContent).toContain('goal_targets_not_deployed'),
    );
    expect(home.getByTestId('home-tile-goals-headline').getAttribute('data-target')).toBe('70');
    expect(home.getByTestId('home-goals-ring')).toBeTruthy();
  });

  it('offers the form at brand scope only', async () => {
    answer = answersEveryRead;
    targetsAnswer = deployedRoute([]);
    const home = renderLeadsTile([MXN_ACCOUNT, USD_ACCOUNT]);
    await openModule(home);
    await home.findByTestId('home-goals-target-form');
    fireEvent.change(home.getByLabelText('Ad accounts in view'), {
      target: { value: USD_ACCOUNT.id },
    });
    await waitFor(() => expect(home.queryByTestId('home-goals-target-form')).toBeNull());
    expect(home.getByTestId('home-goals-target-note').textContent).toContain(
      'Targets are set for the whole brand',
    );
  });

  it('asks for no target at all on a brand with no ad account', async () => {
    targetsAnswer = deployedRoute([]);
    render(<GoalsTile ctx={contextFor({ accounts: [] })} tile={TILE} />);
    expect(targetCalls).toEqual([]);
  });
});
