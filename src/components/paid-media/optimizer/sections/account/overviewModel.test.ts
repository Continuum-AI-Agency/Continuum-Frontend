import { describe, expect, it } from 'bun:test';
import type { EfficiencySeriesPoint, PortfolioListItem } from '@continuum/contracts';
import {
  accountSpend,
  autopilotSummary,
  decisionsLabel,
  headlineClauses,
  joinClauses,
  latestCycle,
  portfolioWindow,
  resultCount,
  resultKinds,
  resultWords,
  sortPortfolioRows,
  vsPriorLabel,
  vsTargetLabel,
  windowLabel,
  windowState,
} from './overviewModel';

// Easy Fit's four portfolios on 27 September, as the proposal quotes them: conversations at
// 39.95 against 30, two lead books at 38.59 / 33.17 against 35 / 25, and Tours with 408
// spent and no purchase yet.

function portfolio(
  overrides: Partial<PortfolioListItem> & { id: string; name: string },
): PortfolioListItem {
  return {
    ad_account_id: 'act_1',
    objective: 'lead',
    level: 'adset',
    mode: 'balanced',
    apply_mode: 'autopilot',
    daily_total: 500,
    period_budget: null,
    status: 'active',
    next_realloc_at: null,
    adset_count: 2,
    pending_recommendations: 0,
    ...overrides,
  };
}

function point(overrides: Partial<EfficiencySeriesPoint> = {}): EfficiencySeriesPoint {
  return {
    cycle_ts: '2026-09-28T06:00:00Z',
    spend_d3: 0,
    conv_d3: 0,
    spend_d7: 0,
    conv_d7: 0,
    spend_d14: 0,
    conv_d14: 0,
    adsets: 1,
    ...overrides,
  };
}

const MENSAJES = portfolio({
  id: 'mensajes',
  name: 'MENSAJES // TODOS',
  objective: 'conversations',
  cpa_target: 30,
  daily_total: 3000,
});
const FORMULARIOS = portfolio({
  id: 'formularios',
  name: 'FORMULARIOS // TODOS',
  cpa_target: 35,
  daily_total: 324,
  pending_recommendations: 3,
});
const PRUEBA = portfolio({
  id: 'prueba',
  name: 'Prueba',
  cpa_target: 25,
  daily_total: 110,
  apply_mode: 'recommend',
  pending_recommendations: 1,
});
const TOURS = portfolio({
  id: 'tours',
  name: 'Septiembre - Tours Programados',
  objective: 'purchase',
  cpa_target: 120,
  daily_total: 750,
});

const SERIES = {
  mensajes: [point({ spend_d7: 20_612, conv_d7: 516, spend_d14: 42_744, conv_d14: 1_051 })],
  formularios: [point({ spend_d7: 2_161, conv_d7: 56, spend_d14: 5_570, conv_d14: 114 })],
  prueba: [point({ spend_d7: 730, conv_d7: 22, spend_d14: 1_230, conv_d14: 44 })],
  tours: [point({ spend_d7: 408, conv_d7: 0, spend_d14: 408, conv_d14: 0 })],
};

function windowsOf(rows: Array<[PortfolioListItem, EfficiencySeriesPoint[]]>) {
  const windows = new Map();
  for (const [row, series] of rows) {
    const window = portfolioWindow(row, series);
    if (window) windows.set(row.id, window);
  }
  return windows;
}

const EASY_FIT = windowsOf([
  [MENSAJES, SERIES.mensajes],
  [FORMULARIOS, SERIES.formularios],
  [PRUEBA, SERIES.prueba],
  [TOURS, SERIES.tours],
]);

describe('portfolioWindow', () => {
  it('reads the latest cycle and prices the window against the target', () => {
    const window = portfolioWindow(MENSAJES, SERIES.mensajes);
    expect(window?.spend).toBe(20_612);
    expect(window?.results).toBe(516);
    expect(window?.costPerResult).toBeCloseTo(39.95, 1);
    expect(window?.target).toBe(30);
    expect(window?.vsTargetPct).toBe(33);
    expect(window?.state).toBe('bad');
  });

  it('derives last week from the fortnight minus the week, on the same series', () => {
    const window = portfolioWindow(MENSAJES, SERIES.mensajes);
    expect(window?.priorSpend).toBe(22_132);
    expect(window?.priorResults).toBe(535);
    expect(window?.priorCostPerResult).toBeCloseTo(41.37, 1);
    expect(window?.vsPriorPct).toBe(-3);
  });

  it('takes the LAST point — the series arrives oldest first', () => {
    const window = portfolioWindow(PRUEBA, [
      point({ cycle_ts: '2026-09-20T06:00:00Z', spend_d7: 1, conv_d7: 1 }),
      ...SERIES.prueba,
    ]);
    expect(window?.spend).toBe(730);
    expect(window?.cycleTs).toBe('2026-09-28T06:00:00Z');
  });

  it('has no cost and no distance with zero results, and cannot be judged', () => {
    const window = portfolioWindow(TOURS, SERIES.tours);
    expect(window?.costPerResult).toBeNull();
    expect(window?.vsTargetPct).toBeNull();
    expect(window?.state).toBe('none');
    expect(window?.spend).toBe(408);
  });

  it('has no target when none was set, and reads neutral', () => {
    const window = portfolioWindow({ ...PRUEBA, cpa_target: null }, SERIES.prueba);
    expect(window?.target).toBeNull();
    expect(window?.vsTargetPct).toBeNull();
    expect(window?.state).toBe('none');
    expect(window?.costPerResult).toBeCloseTo(33.18, 1);
  });

  it('scales awareness to a cost per thousand', () => {
    const window = portfolioWindow(
      portfolio({ id: 'a', name: 'Alcance', objective: 'awareness', cpa_target: 60 }),
      [point({ spend_d7: 600, conv_d7: 10_000, spend_d14: 600, conv_d14: 10_000 })],
    );
    expect(window?.costPerResult).toBe(60);
    expect(window?.target).toBe(60_000);
  });

  it('is null before the first cycle — a zero would read as "spent nothing"', () => {
    expect(portfolioWindow(PRUEBA, [])).toBeNull();
  });
});

describe('windowState', () => {
  it('reads at or under target as ok, up to a quarter over as warn, beyond as bad', () => {
    expect(windowState(-12)).toBe('ok');
    expect(windowState(0)).toBe('ok');
    expect(windowState(10)).toBe('warn');
    expect(windowState(25)).toBe('warn');
    expect(windowState(26)).toBe('bad');
    expect(windowState(null)).toBe('none');
  });
});

describe('resultKinds', () => {
  const kinds = resultKinds([MENSAJES, FORMULARIOS, PRUEBA, TOURS], EASY_FIT);

  it('folds the portfolios into one row per result kind, largest spend first', () => {
    expect(kinds.map((kind) => kind.kind)).toEqual(['conversations', 'leads', 'purchases']);
    expect(kinds[1]?.portfolioIds).toEqual(['formularios', 'prueba']);
  });

  it('blends the leads across both books and keeps the targets as a range', () => {
    const leads = kinds[1];
    expect(leads?.results).toBe(78);
    expect(leads?.spend).toBe(2_891);
    expect(leads?.costPerResult).toBeCloseTo(37.06, 1);
    expect(leads?.targetRange).toEqual({ min: 25, max: 35 });
    // Each book's target weighted by its results: (56·35 + 22·25) / 78.
    expect(leads?.target).toBeCloseTo(32.18, 1);
    expect(leads?.vsTargetPct).toBe(15);
    expect(leads?.state).toBe('warn');
  });

  it('keeps a kind with zero results, so the sentence can say 0 purchases', () => {
    const purchases = kinds[2];
    expect(purchases?.results).toBe(0);
    expect(purchases?.spend).toBe(408);
    expect(purchases?.costPerResult).toBeNull();
    expect(purchases?.state).toBe('none');
  });

  it('names the kind in the sentence’s own words, from the KPI field', () => {
    expect(kinds[0]?.words).toEqual({ one: 'conversation', many: 'conversations' });
    expect(resultWords('unknown_kpi', 'Widget events')).toEqual({
      one: 'widget events',
      many: 'widget events',
    });
  });

  it('leaves out a portfolio with no window rather than counting it as zero', () => {
    const partial = windowsOf([[MENSAJES, SERIES.mensajes]]);
    const only = resultKinds([MENSAJES, FORMULARIOS], partial);
    expect(only).toHaveLength(1);
    expect(only[0]?.kind).toBe('conversations');
  });
});

describe('accountSpend and latestCycle', () => {
  it('sums the window over every portfolio that has one', () => {
    expect(accountSpend(EASY_FIT)).toEqual({
      spend: 23_911,
      priorSpend: 22_132 + 3_409 + 500 + 0,
      portfolios: 4,
    });
  });

  it('has nothing to say before the first cycle', () => {
    expect(accountSpend(new Map())).toBeNull();
    expect(latestCycle(new Map())).toBeNull();
  });

  it('dates the window from the most recent cycle across the account', () => {
    const windows = windowsOf([
      [MENSAJES, [point({ cycle_ts: '2026-09-27T06:00:00Z', spend_d7: 1 })]],
      [PRUEBA, [point({ cycle_ts: '2026-09-28T06:00:00Z', spend_d7: 1 })]],
    ]);
    expect(latestCycle(windows)).toBe('2026-09-28T06:00:00Z');
  });
});

describe('windowLabel', () => {
  it('covers the seven full days before the cycle ran', () => {
    expect(windowLabel('2026-09-28T06:00:00Z')).toBe('Sep 21–27');
  });

  it('names both months when the window straddles one', () => {
    expect(windowLabel('2026-10-03T06:00:00Z')).toBe('Sep 26 – Oct 2');
  });

  it('is null without a cycle or with a date it cannot read', () => {
    expect(windowLabel(null)).toBeNull();
    expect(windowLabel('not a date')).toBeNull();
  });
});

describe('the sentence’s words', () => {
  it('says the distance to target as over, under, on, or none', () => {
    expect(vsTargetLabel(33)).toBe('33% over target');
    expect(vsTargetLabel(-12)).toBe('12% under target');
    expect(vsTargetLabel(0)).toBe('on target');
    expect(vsTargetLabel(null)).toBe('no target');
  });

  it('signs the move against last week', () => {
    expect(vsPriorLabel(12)).toBe('+12% vs prev. week');
    expect(vsPriorLabel(-3)).toBe('−3% vs prev. week');
    expect(vsPriorLabel(0)).toBe('0% vs prev. week');
    expect(vsPriorLabel(null)).toBeNull();
  });

  it('pluralises a count', () => {
    expect(resultCount(1, { one: 'lead', many: 'leads' })).toBe('1 lead');
    expect(resultCount(0, { one: 'purchase', many: 'purchases' })).toBe('0 purchases');
  });

  it('counts the decisions waiting', () => {
    expect(decisionsLabel(0)).toBe('no decisions waiting');
    expect(decisionsLabel(1)).toBe('1 decision waiting');
    expect(decisionsLabel(4)).toBe('4 decisions waiting');
  });

  it('joins clauses the way the sentence reads', () => {
    expect(joinClauses([])).toBe('');
    expect(joinClauses(['a'])).toBe('a');
    expect(joinClauses(['a', 'b'])).toBe('a and b');
    expect(joinClauses(['a', 'b', 'c'])).toBe('a, b and c');
  });

  it('composes one clause per kind: a cost with its distance, or a count with its owner', () => {
    const names = new Map([
      ['tours', 'Tours'],
      ['mensajes', 'MENSAJES'],
    ]);
    const kinds = resultKinds([MENSAJES, FORMULARIOS, PRUEBA, TOURS], EASY_FIT);
    const clauses = headlineClauses(kinds, (value) => `${value.toFixed(2)} MXN`, names);
    expect(clauses[0]).toMatchObject({
      shape: 'cost',
      cost: '39.95 MXN',
      distance: '33% over target',
    });
    expect(clauses[2]).toMatchObject({ shape: 'count', count: '0 purchases', where: 'Tours' });
  });

  it('names no owner when three or more portfolios share the silent kind', () => {
    const three = [1, 2, 3].map((n) =>
      portfolio({ id: `t${n}`, name: `Tours ${n}`, objective: 'purchase' }),
    );
    const windows = windowsOf(three.map((row) => [row, SERIES.tours]));
    const names = new Map(three.map((row) => [row.id, row.name]));
    const [clause] = headlineClauses(resultKinds(three, windows), String, names);
    expect(clause).toMatchObject({ shape: 'count', where: null });
  });
});

describe('autopilotSummary', () => {
  it('counts who applies alone, names who only recommends, and counts the stopped', () => {
    const summary = autopilotSummary([
      MENSAJES,
      FORMULARIOS,
      PRUEBA,
      { ...TOURS, autopilot_paused: true },
    ]);
    expect(summary).toEqual({ autopilot: 3, total: 4, recommending: ['Prueba'], paused: 1 });
  });
});

describe('sortPortfolioRows', () => {
  const rows = [MENSAJES, FORMULARIOS, PRUEBA, TOURS];

  it('puts the portfolio furthest over its target first, and the unjudgeable last', () => {
    const ids = sortPortfolioRows(rows, EASY_FIT, 'distance', 'asc').map((row) => row.id);
    expect(ids).toEqual(['mensajes', 'prueba', 'formularios', 'tours']);
  });

  it('keeps the unjudgeable last when the list is turned around', () => {
    const ids = sortPortfolioRows(rows, EASY_FIT, 'distance', 'desc').map((row) => row.id);
    // MENSAJES and Prueba both sit 33% over; a tie keeps the list's own order.
    expect(ids).toEqual(['formularios', 'mensajes', 'prueba', 'tours']);
  });

  it('still sorts by name, budget and pending work', () => {
    expect(sortPortfolioRows(rows, EASY_FIT, 'name', 'asc')[0]?.id).toBe('formularios');
    expect(sortPortfolioRows(rows, EASY_FIT, 'daily', 'desc')[0]?.id).toBe('mensajes');
    expect(sortPortfolioRows(rows, EASY_FIT, 'pending', 'desc')[0]?.id).toBe('formularios');
  });

  it('treats a null budget as zero rather than sorting it to the top', () => {
    const sorted = sortPortfolioRows(
      [{ ...PRUEBA, daily_total: null }, MENSAJES],
      EASY_FIT,
      'daily',
      'desc',
    );
    expect(sorted[0]?.id).toBe('mensajes');
  });
});
