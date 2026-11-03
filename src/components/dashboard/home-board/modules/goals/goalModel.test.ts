import { describe, expect, it } from 'bun:test';
import type { HomeObjective, HomeProfileRow } from '@continuum/contracts';
import { googleOverviewForHome } from '@/lib/home/homeOverviewModel';
import {
  GOOGLE_ACCOUNT,
  GOOGLE_READS,
  MTD_NOW,
  MTD_WINDOW,
  MXN_ACCOUNT,
  MXN_OVERVIEW,
  USD_ACCOUNT,
  USD_OVERVIEW,
} from './__fixtures__/monthToDate';
import {
  type GoalAccountRead,
  type GoalLoad,
  goalFigure,
  goalObjectives,
  goalTileView,
  goalWindowLabel,
  monthToDateWindow,
} from './goalModel';

const objective = (
  metric: HomeObjective['metric'],
  role: HomeObjective['role'] = 'primary',
): HomeObjective => ({ id: metric, label: metric, metric, role });

const mxn: GoalAccountRead = { account: MXN_ACCOUNT, overview: MXN_OVERVIEW };
const usd: GoalAccountRead = { account: USD_ACCOUNT, overview: USD_OVERVIEW };
const google: GoalAccountRead = {
  account: GOOGLE_ACCOUNT,
  overview: googleOverviewForHome(GOOGLE_READS),
};

const savedRow = (objectives: HomeObjective[]): HomeProfileRow => ({
  brand_id: 'b1',
  scope: 'brand',
  objectives,
  source: 'user',
});

describe('monthToDateWindow', () => {
  it('runs from the 1st of the month through yesterday', () => {
    expect(monthToDateWindow(MTD_NOW, 'UTC')).toEqual(MTD_WINDOW);
  });

  it('has no window on the 1st: the month has no complete day yet', () => {
    expect(monthToDateWindow(new Date('2026-11-01T18:00:00Z'), 'UTC')).toBeNull();
  });

  it('reads the calendar day in the zone it is given', () => {
    // 02:00 UTC on Nov 2 is still Nov 1 in Mexico City: no complete day there yet.
    expect(monthToDateWindow(new Date('2026-11-02T02:00:00Z'), 'America/Mexico_City')).toBeNull();
    expect(monthToDateWindow(new Date('2026-11-02T02:00:00Z'), 'UTC')).toEqual({
      since: '2026-11-01',
      until: '2026-11-01',
    });
  });

  it('names the days it covers', () => {
    expect(goalWindowLabel(MTD_WINDOW)).toBe('Nov 1 – Nov 2');
    expect(goalWindowLabel({ since: '2026-11-01', until: '2026-11-01' })).toBe('Nov 1');
  });

  it('crosses a month boundary only to name yesterday', () => {
    expect(monthToDateWindow(new Date('2026-12-31T12:00:00Z'), 'UTC')).toEqual({
      since: '2026-12-01',
      until: '2026-12-30',
    });
  });
});

describe('goalFigure', () => {
  it('never adds money across currencies: one amount per currency, the lead one first', () => {
    const figure = goalFigure(objective('purchase_value'), [mxn, usd]);
    expect(figure.unit).toBe('currency');
    expect(figure.amounts.map(({ currency, value }) => [currency, value])).toEqual([
      ['MXN', 5400],
      ['USD', 300],
    ]);
    expect(figure.amounts.some((amount) => amount.value === 5700)).toBe(false);
  });

  it('leads with the currency most spending accounts use, whatever order they were read in', () => {
    const mxnTwo: GoalAccountRead = {
      account: { ...MXN_ACCOUNT, id: 'act_1003', name: 'Easy Fit MX 2' },
      overview: MXN_OVERVIEW,
    };
    const figure = goalFigure(objective('spend'), [usd, mxn, mxnTwo]);
    expect(figure.amounts.map(({ currency, value }) => [currency, value])).toEqual([
      ['MXN', 6241],
      ['USD', 120],
    ]);
  });

  it('sums a count across accounts in different currencies', () => {
    const figure = goalFigure(objective('leads'), [mxn, usd]);
    expect(figure.amounts).toHaveLength(1);
    expect(figure.amounts[0]).toMatchObject({ currency: null, value: 16, accountCount: 2 });
    expect(figure.amounts[0]?.series).toEqual([7, 9]);
  });

  it('counts a Google account through its result bucket', () => {
    const expected = (GOOGLE_READS.leads.trends ?? []).reduce(
      (sum, day) => sum + (day.conversions ?? 0),
      0,
    );
    const figure = goalFigure(objective('leads'), [google]);
    expect(figure.amounts[0]?.value).toBe(expected);
    expect(figure.amounts[0]?.value).toBe(2);
  });

  it('leaves Google out of a goal it does not report, and says so when it is all there is', () => {
    expect(goalFigure(objective('conversations'), [mxn, google]).amounts[0]?.value).toBe(41);
    const googleOnly = goalFigure(objective('conversations'), [google]);
    expect(googleOnly.amounts).toEqual([]);
    expect(googleOnly.unreported).toBe(true);
  });

  it('draws the series day by day, in date order', () => {
    expect(goalFigure(objective('spend'), [mxn]).amounts[0]?.series).toEqual([1500.25, 1620.25]);
  });
});

describe('goalObjectives', () => {
  it('leads with the saved primary and keeps its saved secondaries', () => {
    const saved = [objective('leads'), objective('conversations', 'secondary')];
    const goals = goalObjectives({
      scope: 'brand',
      rows: [savedRow(saved)],
      reads: [mxn],
      suggested: [],
    });
    expect(goals.primary.metric).toBe('leads');
    expect(goals.secondaries.map((goal) => goal.metric)).toEqual(['conversations']);
    expect(goals.source).toBe('team');
  });

  it('follows the results when nothing is saved', () => {
    const goals = goalObjectives({
      scope: 'brand',
      rows: [],
      reads: [usd],
      suggested: [objective('purchase_value'), objective('leads', 'secondary')],
    });
    expect(goals.primary.metric).toBe('purchase_value');
    expect(goals.secondaries.map((goal) => goal.metric)).toEqual(['purchases']);
    expect(goals.source).toBe('results');
  });

  it('fills secondaries from the suggestion, never more than three, never the primary twice', () => {
    const goals = goalObjectives({
      scope: 'brand',
      rows: [savedRow([objective('leads')])],
      reads: [mxn],
      suggested: [
        objective('leads'),
        objective('conversations', 'secondary'),
        objective('clicks', 'secondary'),
        objective('impressions', 'secondary'),
        objective('spend', 'secondary'),
      ],
    });
    expect(goals.secondaries.map((goal) => goal.metric)).toEqual([
      'conversations',
      'clicks',
      'impressions',
    ]);
  });
});

describe('goalTileView', () => {
  const base = {
    accounts: [MXN_ACCOUNT],
    window: MTD_WINDOW,
    rows: [savedRow([objective('leads')])],
    suggested: [],
  };
  const ready = (reads: GoalAccountRead[]): GoalLoad => ({ status: 'ready', reads, failures: [] });

  it('is missing, with a sentence, on the 1st of the month', () => {
    const view = goalTileView({ ...base, window: null, load: { status: 'idle' } });
    expect(view).toEqual({
      state: 'missing',
      reason: 'month-start',
      sentence:
        'The month started today, so there is no complete day to count yet. The first figure lands tomorrow.',
    });
  });

  it('is missing when there is no ad account to measure', () => {
    const view = goalTileView({ ...base, accounts: [], load: { status: 'idle' } });
    expect(view.state).toBe('missing');
    expect(view.state === 'missing' && view.reason).toBe('no-account');
  });

  it('is ready on the primary month-to-date figure', () => {
    const view = goalTileView({ ...base, load: ready([mxn]) });
    expect(view.state).toBe('ready');
    if (view.state !== 'ready') return;
    expect(view.headline).toMatchObject({ currency: null, value: 14 });
    expect(view.others).toEqual([]);
  });

  it('puts a money headline on the lead currency and keeps the other one apart', () => {
    const view = goalTileView({
      ...base,
      accounts: [MXN_ACCOUNT, USD_ACCOUNT],
      rows: [savedRow([objective('purchase_value')])],
      load: ready([mxn, usd]),
    });
    if (view.state !== 'ready') throw new Error(`expected ready, got ${view.state}`);
    expect(view.headline).toMatchObject({ currency: 'MXN', value: 5400 });
    expect(view.others.map(({ currency, value }) => [currency, value])).toEqual([['USD', 300]]);
  });

  it('is missing when the read answered but no account counts the goal', () => {
    const view = goalTileView({
      ...base,
      accounts: [GOOGLE_ACCOUNT],
      rows: [savedRow([objective('conversations')])],
      load: ready([google]),
    });
    expect(view).toMatchObject({ state: 'missing', reason: 'not-counted' });
    expect(view.state === 'missing' && view.sentence).toBe(
      'Google Ads doesn’t count conversations, so this goal has no figure for these ad accounts.',
    );
  });

  it('is an error when no account answered, and counts the ones that did not', () => {
    const failures = [{ account: MXN_ACCOUNT, error: new Error('down') }];
    expect(goalTileView({ ...base, load: { status: 'error', failures } }).state).toBe('error');
    const partial = goalTileView({
      ...base,
      accounts: [MXN_ACCOUNT, USD_ACCOUNT],
      load: { status: 'ready', reads: [usd], failures },
    });
    expect(partial.state === 'ready' && partial.unanswered).toBe(1);
  });

  it('is loading only while the read is on its way', () => {
    expect(goalTileView({ ...base, load: { status: 'loading' } }).state).toBe('loading');
  });
});
