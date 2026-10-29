import { describe, expect, it } from 'bun:test';
import type { EfficiencySeriesPoint, PortfolioListItem } from '@continuum/contracts';
import { portfolioMetricsFixture } from './attribution/__fixtures__/portfolioMetricsFixture';
import {
  ageInDays,
  figureAsOfText,
  liveWindowFigures,
  platformFigures,
  portfolioFigure,
  portfolioFigureFromReads,
  STALE_AFTER_DAYS,
  seriesWindowFigures,
  sumPlatformFigures,
} from './portfolioFigure';

// "Tours Programados" (Easy Fit), the case that opened this: autopilot's last cycle ran on
// Oct 15, and on Oct 26 the list priced that cycle's window as if it were this week's.
const TOURS = {
  id: 'tours',
  name: 'Tours Programados',
  objective: 'lead',
  target_metric: null,
  cpa_target: 300,
} as unknown as PortfolioListItem;

const NOW = Date.parse('2026-10-26T15:00:00Z');

const window = (spend: number, leads: number) => ({
  spend,
  leads,
  purchases: 0,
  addToCarts: 0,
  clicks: 0,
  impressions: 0,
});

const snapshot = (id: string, d7: [number, number], d14: [number, number]) => ({
  id,
  windows: { d3: window(0, 0), d7: window(...d7), d14: window(...d14) },
});

const cycle = (cycle_ts: string, spend_d7: number, conv_d7: number) =>
  ({
    cycle_ts,
    spend_d7,
    conv_d7,
    spend_d14: spend_d7 * 2,
    conv_d14: conv_d7 * 2,
  }) as unknown as EfficiencySeriesPoint;

describe('liveWindowFigures', () => {
  it('sums the live 7 complete days and the 7 before them over the members only', () => {
    const live = liveWindowFigures({
      snapshots: [
        snapshot('a', [1000, 4], [1800, 7]),
        snapshot('b', [650, 2], [1200, 4]),
        snapshot('not-a-member', [9999, 99], [9999, 99]),
      ],
      memberIds: ['a', 'b'],
      portfolio: TOURS,
      readAt: '2026-10-26T09:00:00Z',
    });
    expect(live).toEqual({
      spend: 1650,
      results: 6,
      priorSpend: 1350,
      priorResults: 5,
      cycleTs: '2026-10-26T09:00:00Z',
    });
  });

  it('is null when the read misses even one member: a paused ad set drops out with its spend', () => {
    // Conversaciones Whatsapp, 2026-10-26: 2 of 3 members active priced $883 live against
    // $12,199 at the last cycle. A partial sum must not stand as the current figure.
    expect(
      liveWindowFigures({
        snapshots: [snapshot('a', [500, 10], [900, 20]), snapshot('b', [383, 9], [700, 15])],
        memberIds: ['a', 'b', 'paused-this-week'],
        portfolio: TOURS,
        readAt: '2026-10-26T09:00:00Z',
      }),
    ).toBeNull();
  });

  it('is null when the read cannot see a member, or carries no read time', () => {
    const snapshots = [snapshot('x', [10, 1], [20, 2])];
    expect(
      liveWindowFigures({ snapshots, memberIds: ['a'], portfolio: TOURS, readAt: '2026-10-26' }),
    ).toBeNull();
    expect(
      liveWindowFigures({ snapshots, memberIds: ['x'], portfolio: TOURS, readAt: null }),
    ).toBeNull();
    expect(
      liveWindowFigures({ snapshots, memberIds: [], portfolio: TOURS, readAt: '2026-10-26' }),
    ).toBeNull();
  });
});

describe('portfolioFigureFromReads — a member paused inside the window', () => {
  const reads = (inactiveWindows?: ReturnType<typeof snapshot>[]) =>
    portfolioFigureFromReads({
      portfolio: TOURS,
      snapshots: [snapshot('a', [500, 10], [900, 20]), snapshot('b', [383, 9], [700, 15])],
      inactiveWindows,
      readAt: '2026-10-26T09:00:00Z',
      memberIds: ['a', 'b', 'paused-this-week'],
      series: [],
      now: NOW,
    });

  it('stays live when the read carries the paused member beside the fleet', () => {
    const figure = reads([snapshot('paused-this-week', [11_316, 30], [20_000, 50])]);
    expect(figure?.source).toBe('live');
    expect(figure?.spend).toBe(12_199);
    expect(figure?.results).toBe(49);
  });

  it('is not live when the read (an older edge) carries no window for the paused member', () => {
    expect(reads()).toBeNull();
    expect(reads([])).toBeNull();
  });
});

// Google and TikTok members have no live read the browser can sum: their figure is the
// portfolio metrics read, a stored read dated by its window. The fixture's window is
// Sep 21–27 in MXN; Meta 3,455 / 78, Google 4,062 / 118, TikTok 1,300 / 18 leads.
describe('portfolioFigureFromReads — Google, TikTok and mixed portfolios', () => {
  const NOW_SEP = Date.parse('2026-09-28T12:00:00Z');
  const on = (platforms: PortfolioListItem['platforms']) =>
    ({
      ...TOURS,
      cpa_target: 30,
      platforms,
      last_actual_cycle_at: '2026-09-28T06:49:48Z',
    }) as PortfolioListItem;
  const reads = (
    portfolio: PortfolioListItem,
    metrics: ReturnType<typeof portfolioMetricsFixture> | null,
    extra: Partial<Parameters<typeof portfolioFigureFromReads>[0]> = {},
  ) =>
    portfolioFigureFromReads({
      portfolio,
      snapshots: null,
      readAt: null,
      memberIds: null,
      series: [],
      metrics,
      now: NOW_SEP,
      ...extra,
    });

  it('prices a Google-only portfolio from its metrics read, dated by the window, never live', () => {
    const figure = reads(
      on(['google_ads']),
      portfolioMetricsFixture({ platforms: ['google_ads'] }),
    );
    expect(figure?.source).toBe('snapshot');
    expect(figure?.spend).toBe(4062);
    expect(figure?.results).toBe(118);
    expect(figure?.costPerResult).toBeCloseTo(4062 / 118, 6);
    expect(figure?.vsTargetPct).toBe(15);
    expect(figure?.currency).toBe('MXN');
    // The window ends Sep 27, so the figure is as of Sep 28 — the way a cycle dates its 7 days.
    expect(figure?.cycleTs).toBe('2026-09-28T00:00:00.000Z');
    expect(figure?.asOfLabel).toBe('as of Sep 28');
    expect(figure?.stale).toBe(false);
  });

  it('prices a TikTok-only portfolio the same way', () => {
    const figure = reads(
      on(['tiktok_ads']),
      portfolioMetricsFixture({ platforms: ['tiktok_ads'] }),
    );
    expect(figure?.source).toBe('snapshot');
    expect(figure?.spend).toBe(1300);
    expect(figure?.results).toBe(18);
    expect(figure?.currency).toBe('MXN');
    expect(figureAsOfText(figure)).toBe('as of Sep 28');
  });

  it('says how old a window is that ended early', () => {
    const metrics = portfolioMetricsFixture({ platforms: ['google_ads'] });
    const figure = reads(on(['google_ads']), metrics, { now: Date.parse('2026-10-02T12:00:00Z') });
    expect(figure?.ageDays).toBe(4);
    expect(figure?.stale).toBe(true);
    expect(figureAsOfText(figure)).toBe('as of Sep 28 · 4 days old');
  });

  it("sums a mixed portfolio's platforms when they share a currency, over the Meta live read", () => {
    const figure = reads(on(['meta', 'google_ads', 'tiktok_ads']), portfolioMetricsFixture(), {
      // The Meta live read sees only the Meta half: it must not stand as the whole.
      snapshots: [snapshot('a', [500, 10], [900, 20])],
      readAt: '2026-09-28T09:00:00Z',
      memberIds: ['a'],
    });
    expect(figure?.source).toBe('snapshot');
    expect(figure?.spend).toBe(3455 + 4062 + 1300);
    expect(figure?.results).toBe(78 + 118 + 18);
    expect(figure?.currency).toBe('MXN');
  });

  it('is null before the first cycle or without the read: never a zero, never the Meta half', () => {
    const metrics = portfolioMetricsFixture({ platforms: ['google_ads'] });
    expect(reads({ ...on(['google_ads']), last_actual_cycle_at: null }, metrics)).toBeNull();
    expect(
      reads(on(['meta', 'google_ads']), null, {
        snapshots: [snapshot('a', [500, 10], [900, 20])],
        readAt: '2026-09-28T09:00:00Z',
        memberIds: ['a'],
      }),
    ).toBeNull();
  });

  it('keeps a Meta-only portfolio on its live read when the metrics read lists Meta alone', () => {
    const figure = reads(on(['meta']), portfolioMetricsFixture({ platforms: ['meta'] }), {
      snapshots: [snapshot('a', [500, 10], [900, 20])],
      readAt: '2026-09-28T09:00:00Z',
      memberIds: ['a'],
    });
    expect(figure?.source).toBe('live');
    expect(figure?.spend).toBe(500);
    expect(figure?.currency).toBeUndefined();
  });

  it('never sums platforms across currencies: no headline, each part in its own', () => {
    const parts = platformFigures(
      on(['meta', 'google_ads']),
      portfolioMetricsFixture({ platforms: ['meta', 'google_ads'] }),
    );
    const mixed = [
      { ...parts[0], currency: 'MXN' },
      { ...parts[1], currency: 'USD' },
    ] as typeof parts;
    expect(sumPlatformFigures(mixed, null)).toBeNull();
    expect(mixed.map(({ platform, spend, currency }) => [platform, spend, currency])).toEqual([
      ['meta', 3455, 'MXN'],
      ['google_ads', 4062, 'USD'],
    ]);
    expect(sumPlatformFigures(parts, { spend: 7000, results: 180 })).toEqual({
      spend: 3455 + 4062,
      results: 78 + 118,
      priorSpend: 7000,
      priorResults: 180,
      cycleTs: '2026-09-28T00:00:00.000Z',
      currency: 'MXN',
    });
    expect(sumPlatformFigures([], null)).toBeNull();
  });
});

describe('portfolioFigure', () => {
  const live = {
    spend: 1650,
    results: 6,
    priorSpend: 1350,
    priorResults: 5,
    cycleTs: '2026-10-26T09:00:00Z',
  };
  const lastCycle = seriesWindowFigures([
    cycle('2026-10-14T06:00:00Z', 2000, 7),
    cycle('2026-10-15T06:00:00Z', 2650, 10),
  ]);

  it('prices the live read when there is one, ignoring the cycle snapshot', () => {
    const figure = portfolioFigure({ portfolio: TOURS, live, snapshot: lastCycle, now: NOW });
    expect(figure?.source).toBe('live');
    expect(figure?.spend).toBe(1650);
    expect(figure?.costPerResult).toBe(275);
    expect(figure?.vsTargetPct).toBe(-8);
    expect(figure?.asOfLabel).toBeNull();
    expect(figure?.stale).toBe(false);
    expect(figureAsOfText(figure)).toBeNull();
  });

  it('falls back to the last cycle only without a live read, and dates it', () => {
    const figure = portfolioFigure({ portfolio: TOURS, live: null, snapshot: lastCycle, now: NOW });
    expect(figure?.source).toBe('snapshot');
    expect(figure?.spend).toBe(2650);
    expect(figure?.costPerResult).toBe(265);
    expect(figure?.vsTargetPct).toBe(-12);
    expect(figure?.asOfLabel).toBe('as of Oct 15');
    expect(figure?.ageDays).toBe(11);
    expect(figure?.stale).toBe(true);
    expect(figureAsOfText(figure)).toBe('as of Oct 15 · 11 days old');
  });

  it('dates a recent snapshot without calling it stale', () => {
    const yesterday = seriesWindowFigures([cycle('2026-10-25T06:00:00Z', 2650, 10)]);
    const figure = portfolioFigure({ portfolio: TOURS, live: null, snapshot: yesterday, now: NOW });
    expect(figure?.ageDays).toBe(1);
    expect(figure?.stale).toBe(false);
    expect(figureAsOfText(figure)).toBe('as of Oct 25');
  });

  it('turns stale only past STALE_AFTER_DAYS', () => {
    const at = (days: number) => new Date(NOW - days * 24 * 60 * 60 * 1000 - 60_000).toISOString();
    const stale = (days: number) =>
      portfolioFigure({
        portfolio: TOURS,
        live: null,
        snapshot: { ...live, cycleTs: at(days) },
        now: NOW,
      })?.stale;
    expect(stale(STALE_AFTER_DAYS)).toBe(false);
    expect(stale(STALE_AFTER_DAYS + 1)).toBe(true);
  });

  it('is null with neither read: nothing measured is not a zero', () => {
    expect(portfolioFigure({ portfolio: TOURS, live: null, snapshot: null, now: NOW })).toBeNull();
    expect(seriesWindowFigures([])).toBeNull();
  });
});

describe('ageInDays', () => {
  it('counts whole days and never goes negative', () => {
    expect(ageInDays('2026-10-26T14:00:00Z', NOW)).toBe(0);
    expect(ageInDays('2026-10-27T14:00:00Z', NOW)).toBe(0);
    expect(ageInDays('2026-10-24T14:00:00Z', NOW)).toBe(2);
  });
});
