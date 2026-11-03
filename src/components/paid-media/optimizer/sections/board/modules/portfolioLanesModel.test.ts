import { describe, expect, it } from 'bun:test';
import {
  type EfficiencySeriesPoint,
  type PortfolioListItem,
  PortfolioListItemSchema,
} from '@continuum/contracts';
import { portfolioFigure, seriesWindowFigures } from '../../portfolioFigure';
import rows from './portfolioLanes.fixture.json';
import {
  LANE_STATUS_LABEL,
  laneGoal,
  laneStatus,
  portfolioLane,
  sortLanes,
} from './portfolioLanesModel';
import recorded from './resultTrend.fixture.json';

// optimizer_list_portfolios and optimizer_get_cpa_series as they answered on Nov 2, 2026.
const parse = (list: unknown[]): PortfolioListItem[] =>
  list.map((row) => PortfolioListItemSchema.parse(row));
const easyFitMeta = parse(rows.easyFitMeta);
const easyFitGoogle = parse(rows.easyFitGoogle);
const byName = (list: PortfolioListItem[], name: string) =>
  list.find((portfolio) => portfolio.name === name) as PortfolioListItem;

type RecordedSeries = Record<string, { points: EfficiencySeriesPoint[] }>;
const series = recorded.easyFitMetaSeries as unknown as RecordedSeries;
const NOW = Date.parse('2026-11-02T18:00:00Z');

function figureOf(portfolio: PortfolioListItem, live: boolean) {
  const cycle = seriesWindowFigures(series[portfolio.id]?.points ?? []);
  return portfolioFigure({ portfolio, live: live ? cycle : null, snapshot: cycle, now: NOW });
}

describe('a lane’s status', () => {
  it('reads Easy Fit Meta as it stood: one above its goal, one lost, one without a goal', () => {
    const lanes = easyFitMeta.map((portfolio) =>
      portfolioLane(
        portfolio,
        figureOf(portfolio, portfolio.name !== 'Tours Programados - Octubre'),
        'MXN',
      ),
    );
    const status = Object.fromEntries(lanes.map((lane) => [lane.portfolio.name, lane.status]));
    expect(status).toEqual({
      'Leads // Google Ads only': 'no-goal',
      // $24,543.57 for 462 conversations: $53.12 against the $45 goal.
      'Conversaciones Whatsapp': 'above-goal',
      'Tours Programados - Octubre': 'lost-ad-sets',
    });
    const conversaciones = lanes.find((lane) => lane.portfolio.name === 'Conversaciones Whatsapp');
    expect(conversaciones?.cost).toBeCloseTo(53.12, 2);
    expect(conversaciones?.goal).toBe(45);
    expect(conversaciones?.vsGoalPct).toBe(18);
    expect(conversaciones?.words.one).toBe('conversation');
    expect(conversaciones?.dailyBudget).toBe(3000);
    expect(conversaciones?.pending).toBe(6);
    expect(conversaciones?.asOf).toBeNull();
  });

  it('dates a figure that is the last cycle’s, not live', () => {
    const tours = byName(easyFitMeta, 'Tours Programados - Octubre');
    const lane = portfolioLane(tours, figureOf(tours, false), 'MXN');
    expect(lane.asOf).toBe('as of Oct 14 · 19 days old');
    expect(lane.goal).toBe(296);
  });

  it('is on track at or under the goal, and not read yet with a goal but no figure', () => {
    expect(
      laneStatus({ roster_state: 'present', withdrawn_reason: null }, 45, { vsTargetPct: -8 }),
    ).toBe('on-track');
    expect(
      laneStatus({ roster_state: 'present', withdrawn_reason: null }, 45, { vsTargetPct: 0 }),
    ).toBe('on-track');
    expect(laneStatus({ roster_state: 'present', withdrawn_reason: null }, 99, null)).toBe(
      'unread',
    );
    expect(LANE_STATUS_LABEL['lost-ad-sets']).toBe('Lost its ad sets');
  });

  it('plans a Google portfolio at what the last cycle conserved, not the stored total', () => {
    const leads = byName(easyFitGoogle, 'Leads // Google Ads only');
    const lane = portfolioLane(leads, null, null);
    // daily_total 1,870 kept two paused campaigns; every cycle conserved 670.
    expect(lane.dailyBudget).toBe(670);
    expect(lane.goal).toBe(99);
    expect(lane.currency).toBe('MXN');
    expect(laneGoal(byName(easyFitGoogle, 'Test — Google Ads (Easy Fit)'))).toBeNull();
  });
});

describe('sorting the lanes', () => {
  const lanes = easyFitMeta.map((portfolio) =>
    portfolioLane(portfolio, figureOf(portfolio, true), 'MXN'),
  );
  const names = (sorted: ReturnType<typeof sortLanes>) => sorted.map((lane) => lane.portfolio.name);

  it('puts the one furthest over its goal first, and the ones with no distance after', () => {
    expect(names(sortLanes(lanes, 'distance'))[0]).toBe('Conversaciones Whatsapp');
    expect(names(sortLanes(lanes, 'distance')).at(-1)).toBe('Leads // Google Ads only');
  });

  it('puts the largest budget and the most decisions first', () => {
    expect(names(sortLanes(lanes, 'budget'))).toEqual([
      'Conversaciones Whatsapp',
      'Tours Programados - Octubre',
      'Leads // Google Ads only',
    ]);
    expect(names(sortLanes(lanes, 'decisions'))[0]).toBe('Conversaciones Whatsapp');
  });
});
