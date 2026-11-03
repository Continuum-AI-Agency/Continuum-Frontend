import { describe, expect, it } from 'bun:test';
import {
  EASY_FIT_FLIGHT,
  EASY_FIT_RUN,
  FIXED_RUN,
  NO_FLIGHT,
  OCTOBER_FLIGHT,
  ready,
  USD_FLIGHT,
  USD_RUN,
} from './__fixtures__/pacing';
import { PACING_MISSING, type PacingRunRead, pacingView } from './pacingModel';

const ACCOUNTS = [
  { id: 'act_521903353286118', name: 'Easy Fit', currency: 'MXN', platform: 'meta' as const },
  { id: 'act_2870759213321514', name: 'Mensajes', currency: 'MXN', platform: 'meta' as const },
];

function runs(entries: [string, PacingRunRead][]): Map<string, PacingRunRead> {
  return new Map(entries);
}

describe('pacingView', () => {
  it('reads spent against the plan and what the plan expected by the cycle it was read on', () => {
    const view = pacingView({
      portfolios: { status: 'ready', rows: [EASY_FIT_FLIGHT, NO_FLIGHT] },
      runs: runs([[EASY_FIT_FLIGHT.id, ready(EASY_FIT_RUN)]]),
      accounts: ACCOUNTS,
      today: '2026-11-03',
    });
    expect(view.state).toBe('ready');
    if (view.state !== 'ready') return;
    expect(view.rows).toHaveLength(1);
    const [row] = view.rows;
    expect(row?.kind).toBe('running');
    if (row?.kind !== 'running' || row.spend.status !== 'read') throw new Error('not read');
    // Day 3 of 30: the cycle's spend covers Nov 1–2, two complete days of a 3,000/day plan.
    expect(row.spend.spent).toBe(1541.36);
    expect(row.spend.daysCovered).toBe(2);
    expect(row.spend.through).toBe('2026-11-02');
    expect(row.spend.expected).toBe(6000);
    expect(row.spend.gap).toBeCloseTo(-4458.64, 2);
    expect(row.spend.gapPct).toBe(-74);
    expect(row.spend.status === 'read' && row.spend.pace).toBe('underpacing');
    expect(view.headline).toEqual({
      currency: 'MXN',
      spent: 1541.36,
      plan: 90_000,
      expected: 6000,
      gap: -4458.64,
      gapPct: -74,
      pace: 'underpacing',
      portfolios: 1,
      through: '2026-11-02',
    });
  });

  it('keeps currencies apart and leads with the one most plans are in', () => {
    const second = { ...EASY_FIT_FLIGHT, id: 'p-2', name: 'Second MXN', period_budget: 30_000 };
    const view = pacingView({
      portfolios: { status: 'ready', rows: [USD_FLIGHT, EASY_FIT_FLIGHT, second] },
      runs: runs([
        [USD_FLIGHT.id, ready(USD_RUN)],
        [EASY_FIT_FLIGHT.id, ready(EASY_FIT_RUN)],
        [
          'p-2',
          ready({
            ...EASY_FIT_RUN,
            planVersion: '2026-11-01..2026-11-30@30000',
            periodBudget: 30_000,
            actualSpendToDate: 1000,
          }),
        ],
      ]),
      accounts: ACCOUNTS,
      today: '2026-11-03',
    });
    if (view.state !== 'ready') throw new Error(view.state);
    expect(view.groups.map((group) => group.currency)).toEqual(['MXN', 'USD']);
    const [mxn, usd] = view.groups;
    expect(mxn?.spent).toBe(2541.36);
    expect(mxn?.plan).toBe(120_000);
    expect(mxn?.expected).toBe(8000);
    expect(usd?.spent).toBe(205);
    expect(usd?.plan).toBe(3000);
    expect(view.headline.currency).toBe('MXN');
    expect(view.headline.spent).toBe(2541.36);
  });

  it('takes the currency from the ad account when the portfolio row has none', () => {
    const live = { ...OCTOBER_FLIGHT, period_start: '2026-11-01', period_end: '2026-11-30' };
    const view = pacingView({
      portfolios: { status: 'ready', rows: [live] },
      runs: runs([
        [
          live.id,
          ready({
            ...EASY_FIT_RUN,
            planVersion: '2026-11-01..2026-11-30@7064',
            periodBudget: 7064,
          }),
        ],
      ]),
      accounts: ACCOUNTS,
      today: '2026-11-03',
    });
    if (view.state !== 'ready') throw new Error(view.state);
    expect(view.headline.currency).toBe('MXN');
  });

  it('expects nothing on day one: the gap has no percent', () => {
    const view = pacingView({
      portfolios: { status: 'ready', rows: [EASY_FIT_FLIGHT] },
      runs: runs([
        [EASY_FIT_FLIGHT.id, ready({ ...EASY_FIT_RUN, dayIndex: 1, actualSpendToDate: 0 })],
      ]),
      accounts: ACCOUNTS,
      today: '2026-11-01',
    });
    if (view.state !== 'ready') throw new Error(view.state);
    expect(view.headline.expected).toBe(0);
    expect(view.headline.gapPct).toBeNull();
  });

  it('lists a flight that has not started and one that has ended, without counting either', () => {
    const december = {
      ...USD_FLIGHT,
      id: 'dec',
      name: 'December',
      period_start: '2026-12-01',
      period_end: '2026-12-31',
    };
    const view = pacingView({
      portfolios: { status: 'ready', rows: [EASY_FIT_FLIGHT, OCTOBER_FLIGHT, december] },
      runs: runs([[EASY_FIT_FLIGHT.id, ready(EASY_FIT_RUN)]]),
      accounts: ACCOUNTS,
      today: '2026-11-03',
    });
    if (view.state !== 'ready') throw new Error(view.state);
    expect(view.rows.map((row) => [row.name, row.kind])).toEqual([
      ['Conversaciones Whatsapp', 'running'],
      ['December', 'not_started'],
      ['Mensajes - Octubre', 'ended'],
    ]);
    expect(view.groups).toHaveLength(1);
    expect(view.groups[0]?.plan).toBe(90_000);
  });

  it('is missing when no portfolio has a plan for this period', () => {
    const view = pacingView({
      portfolios: { status: 'ready', rows: [NO_FLIGHT, OCTOBER_FLIGHT] },
      runs: runs([]),
      accounts: ACCOUNTS,
      today: '2026-11-03',
    });
    expect(view).toEqual({ state: 'missing', reason: PACING_MISSING.noPlan });
  });

  it('never reads the flat fallback or a verdict about an earlier plan as spend', () => {
    const rebased = { ...EASY_FIT_FLIGHT, period_budget: 80_000 };
    const view = pacingView({
      portfolios: { status: 'ready', rows: [EASY_FIT_FLIGHT, { ...rebased, id: 'rebased' }] },
      runs: runs([
        [EASY_FIT_FLIGHT.id, ready(FIXED_RUN)],
        ['rebased', ready(EASY_FIT_RUN)],
      ]),
      accounts: ACCOUNTS,
      today: '2026-11-03',
    });
    expect(view).toEqual({ state: 'missing', reason: PACING_MISSING.notPaced });
  });

  it('shows the read flights when another flight is still unpaced', () => {
    const view = pacingView({
      portfolios: { status: 'ready', rows: [EASY_FIT_FLIGHT, { ...USD_FLIGHT, currency: 'MXN' }] },
      runs: runs([
        [EASY_FIT_FLIGHT.id, ready(EASY_FIT_RUN)],
        [USD_FLIGHT.id, ready(null)],
      ]),
      accounts: ACCOUNTS,
      today: '2026-11-03',
    });
    if (view.state !== 'ready') throw new Error(view.state);
    expect(view.headline.spent).toBe(1541.36);
    expect(view.headline.plan).toBe(90_000);
    const unpaced = view.rows.find((row) => row.id === USD_FLIGHT.id);
    expect(unpaced?.kind === 'running' && unpaced.spend.status).toBe('unread');
  });

  it('is loading while the portfolios or a running flight are still being read', () => {
    expect(
      pacingView({
        portfolios: { status: 'pending' },
        runs: runs([]),
        accounts: ACCOUNTS,
        today: '2026-11-03',
      }).state,
    ).toBe('loading');
    expect(
      pacingView({
        portfolios: { status: 'ready', rows: [EASY_FIT_FLIGHT] },
        runs: runs([[EASY_FIT_FLIGHT.id, { status: 'pending' }]]),
        accounts: ACCOUNTS,
        today: '2026-11-03',
      }).state,
    ).toBe('loading');
  });

  it('is an error when the portfolios, or every running flight, failed to read', () => {
    expect(
      pacingView({
        portfolios: { status: 'error' },
        runs: runs([]),
        accounts: ACCOUNTS,
        today: '2026-11-03',
      }).state,
    ).toBe('error');
    expect(
      pacingView({
        portfolios: { status: 'ready', rows: [EASY_FIT_FLIGHT] },
        runs: runs([[EASY_FIT_FLIGHT.id, { status: 'error' }]]),
        accounts: ACCOUNTS,
        today: '2026-11-03',
      }).state,
    ).toBe('error');
  });

  it('leaves archived portfolios out', () => {
    const view = pacingView({
      portfolios: { status: 'ready', rows: [{ ...EASY_FIT_FLIGHT, status: 'archived' }] },
      runs: runs([[EASY_FIT_FLIGHT.id, ready(EASY_FIT_RUN)]]),
      accounts: ACCOUNTS,
      today: '2026-11-03',
    });
    expect(view.state).toBe('missing');
  });
});
