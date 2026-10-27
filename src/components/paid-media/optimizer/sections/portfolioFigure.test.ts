import { describe, expect, it } from 'bun:test';
import type { EfficiencySeriesPoint, PortfolioListItem } from '@continuum/contracts';
import {
  ageInDays,
  figureAsOfText,
  liveWindowFigures,
  portfolioFigure,
  STALE_AFTER_DAYS,
  seriesWindowFigures,
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
      memberIds: ['a', 'b', 'gone'],
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
