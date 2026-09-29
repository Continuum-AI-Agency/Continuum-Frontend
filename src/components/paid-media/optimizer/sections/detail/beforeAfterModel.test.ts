import { describe, expect, it } from 'bun:test';
import type { ResolvedRange, TimelineEvent } from '@continuum/contracts';
import { getOptimizationMetricDefinition } from '@continuum/contracts';
import { buildBeforeAfter, cycleWhen, dayRangeLabel, shortRangeLabel } from './beforeAfterModel';
import { readBody } from './news/realBodies.fixture';
import type { RecapModel } from './recapModel';

// Before and after the last cycle, from the FORMULARIOS // TODOS body and the figures the
// redesign page quotes for its two windows (30 leads at 58.78 MXN · 1,763 MXN, then 56 leads
// at 38.59 MXN · 2,161 MXN).

const MEXICO = 'America/Mexico_City';
const metric = getOptimizationMetricDefinition('lead');

const range: ResolvedRange = {
  spec: { kind: 'preset', preset: 'd7' },
  from: '2026-09-21',
  to: '2026-09-27',
  days: 7,
  label: 'Last 7 days',
  previous: { from: '2026-09-14', to: '2026-09-20' },
  lookback: 'd7',
  window: 'd7',
  flightMissing: false,
};

const recap: RecapModel = {
  source: 'daily',
  windowUsed: null,
  current: {
    spend: 2161,
    results: 56,
    impressions: 0,
    clicks: 0,
    costPerResult: 38.59,
    daysCovered: 7,
  },
  previous: {
    spend: 1763,
    results: 30,
    impressions: 0,
    clicks: 0,
    costPerResult: 58.78,
    daysCovered: 7,
  },
  series: [],
  delta: { spend: 0.23, results: 0.87, costPerResult: -0.34 },
  vsTarget: 0.1,
};

/** The two ad sets the body's pending pauses name, with what they bought this week. */
const PAUSED_A = '900000000000000001';
const PAUSED_B = '900000000000000002';
const snapshots = [
  { id: PAUSED_A, daily: [{ date: '2026-09-22', spend: 405, leads: 4 }] },
  { id: PAUSED_B, daily: [{ date: '2026-09-23', spend: 125, leads: 0 }] },
  { id: '900000000000000003', daily: [{ date: '2026-09-23', spend: 1631, leads: 52 }] },
  // Outside the range: must not count.
  { id: '900000000000000004', daily: [{ date: '2026-09-10', spend: 999, leads: 9 }] },
];
const enrolledIds = [PAUSED_A, PAUSED_B, '900000000000000003', '900000000000000004'];

const events: TimelineEvent[] = [
  { ts: '2026-09-25T19:10:00Z', kind: 'applied', label: 'Budgets applied', count: 4 },
  { ts: '2026-09-26T09:00:00Z', kind: 'status', label: 'Ad set paused', count: 1 },
  // Before the cycle: an older reallocation, not this cycle's.
  { ts: '2026-09-20T19:10:00Z', kind: 'applied', label: 'Budgets applied', count: 9 },
];

function build(over: Partial<Parameters<typeof buildBeforeAfter>[0]> = {}) {
  const { report } = readBody('formularios');
  return buildBeforeAfter({
    report,
    recap,
    range,
    events,
    snapshots,
    enrolledIds,
    metric,
    target: 35,
    timeZone: MEXICO,
    ...over,
  });
}

describe('the two windows', () => {
  it('labels each by its days and carries results, cost and spend', () => {
    const model = build();
    expect(model.before).toEqual({
      label: 'semana del 14 al 20 de septiembre',
      short: 'semana 14–20 sep',
      spend: 1763,
      results: 30,
      cost: 58.78,
    });
    expect(model.after).toEqual({
      label: 'semana del 21 al 27 de septiembre',
      short: 'semana 21–27 sep',
      spend: 2161,
      results: 56,
      cost: 38.59,
    });
  });

  it('shortens a window to sit beside its figure, across a month edge too', () => {
    expect(shortRangeLabel('2026-09-21', '2026-09-27', 7)).toBe('semana 21–27 sep');
    expect(shortRangeLabel('2026-09-15', '2026-09-28', 14)).toBe('15–28 sep');
    expect(shortRangeLabel('2026-09-28', '2026-10-04', 7)).toBe('semana 28 sep–4 oct');
  });

  it('says nothing when the range has no data yet, instead of printing zeros', () => {
    const empty: RecapModel = {
      ...recap,
      source: 'none',
      current: { ...recap.current, spend: 0, results: 0, costPerResult: null },
      previous: null,
    };
    const model = build({ recap: empty });
    expect(model.source).toBe('none');
    expect(model.after).toBeNull();
    expect(model.before).toBeNull();
    expect(model.projection).toBeNull();
    expect(build().source).toBe('daily');
  });

  it('has no "before" when the recap has no prior window', () => {
    expect(build({ recap: { ...recap, previous: null } }).before).toBeNull();
    expect(build({ range: { ...range, previous: null } }).before).toBeNull();
  });

  it('a range that is not a week says "del"', () => {
    const model = build({ range: { ...range, days: 14, from: '2026-09-14', previous: null } });
    expect(model.after.label).toBe('del 14 al 27 de septiembre');
  });
});

describe('the last cycle', () => {
  it('names when it ran, what it proposed and what landed since', () => {
    const { lastCycle } = build();
    expect(lastCycle?.at).toBe('2026-09-25T19:03:03.393+00:00');
    expect(lastCycle?.when).toBe('viernes 13:03');
    expect(lastCycle?.proposed).toBe(
      '2 pausas, 1 cambio de creativo y 9 movimientos de presupuesto propuestas',
    );
    expect(lastCycle?.applied).toBe('4 movimientos de presupuesto y 1 cambio de estado aplicados');
  });

  it('says nothing landed when the rows and the ledger are silent', () => {
    const { report } = readBody('tours');
    const model = build({ report, events: [] });
    expect(model.lastCycle?.proposed).toBeNull();
    expect(model.lastCycle?.applied).toBe('ninguna aplicada todavía');
  });

  it('is absent before the first cycle', () => {
    expect(build({ report: null }).lastCycle).toBeNull();
  });
});

describe('the projection', () => {
  it('prices the window without the ad sets the pending pauses would remove', () => {
    const { projection } = build();
    // 2161 − 405 − 125 = 1631 over 56 − 4 − 0 = 52 leads.
    expect(projection).toEqual({
      pauses: 2,
      remaining: 2,
      cost: 31.365384615384617,
      vsTarget: 'bajo',
    });
  });

  it('reads "sobre" against a lower target and "en" when they meet', () => {
    expect(build({ target: 30 }).projection?.vsTarget).toBe('sobre');
    expect(build({ target: 31.37 }).projection?.vsTarget).toBe('en');
    expect(build({ target: null }).projection?.vsTarget).toBeNull();
  });

  it('is absent with no pending pause, and null-priced when the rest bought nothing', () => {
    const { report } = readBody('tours');
    expect(build({ report }).projection).toBeNull();
    const dead = build({
      recap: { ...recap, current: { ...recap.current, results: 4 } },
    });
    expect(dead.projection).toMatchObject({ pauses: 2, cost: null, vsTarget: null });
  });

  it('falls back to the engine window when a snapshot has no daily series', () => {
    const { projection } = build({
      snapshots: [
        { id: PAUSED_A, windows: { d7: { spend: 405, leads: 4 } } },
        { id: PAUSED_B, windows: { d7: { spend: 125, leads: 0 } } },
      ],
    });
    expect(projection?.cost).toBeCloseTo(31.37, 2);
  });
});

describe('the words', () => {
  it('day ranges', () => {
    expect(dayRangeLabel('2026-09-14', '2026-09-20')).toBe('14 al 20 de septiembre');
    expect(dayRangeLabel('2026-09-28', '2026-10-04')).toBe('28 de septiembre al 4 de octubre');
  });

  it('cycle time in the account’s zone', () => {
    expect(cycleWhen('2026-09-26T01:05:00Z', MEXICO)).toBe('viernes 19:05');
  });
});
