import { describe, expect, it } from 'bun:test';
import type { CpaSeriesPoint, ResolvedRange, TimelineEvent } from '@continuum/contracts';
import { getOptimizationMetricDefinition } from '@continuum/contracts';
import { buildBeforeAfter, cycleWhen, dayRangeLabel, shortRangeLabel } from './beforeAfterModel';
import { readBody } from './news/realBodies.fixture';

// Before and after the last cycle, from the FORMULARIOS // TODOS body and the engine's cycle
// series the cost timeline draws (the redesign page's two windows: 30 leads at 58.78 MXN ·
// 1,763 MXN, then 56 leads at 38.59 MXN · 2,161 MXN).

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

function point(cycle_ts: string, over: Partial<CpaSeriesPoint> = {}): CpaSeriesPoint {
  return {
    cycle_ts,
    spend_d3: 0,
    conv_d3: 0,
    spend_d7: 0,
    conv_d7: 0,
    spend_d14: 0,
    conv_d14: 0,
    adsets: 9,
    ...over,
  };
}

/** The body's cycle (2026-09-25), the cycle a week before it, and one in between. Shuffled:
 *  the read orders it, the model must not trust the order. */
const series: CpaSeriesPoint[] = [
  point('2026-09-25T19:03:03.393+00:00', {
    spend_d3: 900,
    conv_d3: 24,
    spend_d7: 2161,
    conv_d7: 56,
    spend_d14: 3924,
    conv_d14: 86,
  }),
  point('2026-09-18T19:01:00Z', { spend_d7: 1763.4, conv_d7: 30, spend_d14: 3500, conv_d14: 70 }),
  point('2026-09-22T19:02:00Z', { spend_d7: 1900, conv_d7: 40 }),
];

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
    series,
    range,
    events,
    metric,
    target: 35,
    timeZone: MEXICO,
    ...over,
  });
}

describe('the two windows', () => {
  it('reads the last cycle and the cycle one window earlier off the engine series', () => {
    const model = build();
    expect(model.source).toBe('engine');
    // The engine's d7 at the 2026-09-25 cycle is the 7 complete days before it.
    expect(model.after).toEqual({
      label: 'week of September 18 to 24',
      short: 'week of Sep 18–24',
      spend: 2161,
      results: 56,
      cost: 2161 / 56,
    });
    expect(model.before).toEqual({
      label: 'week of September 11 to 17',
      short: 'week of Sep 11–17',
      spend: 1763.4,
      results: 30,
      cost: 1763.4 / 30,
    });
  });

  it('shortens a window to sit beside its figure, across a month edge too', () => {
    expect(shortRangeLabel('2026-09-21', '2026-09-27', 7)).toBe('week of Sep 21–27');
    expect(shortRangeLabel('2026-09-15', '2026-09-28', 14)).toBe('Sep 15–28');
    expect(shortRangeLabel('2026-09-28', '2026-10-04', 7)).toBe('week of Sep 28–Oct 4');
  });

  it('follows the range to the engine window nearest it', () => {
    const model = build({ range: { ...range, days: 14, window: 'd14', from: '2026-09-14' } });
    expect(model.after).toMatchObject({ label: 'September 11 to 24', spend: 3924, results: 86 });
    // No cycle ran 14 days before the last one.
    expect(model.before).toBeNull();
  });

  it('takes the earlier cycle a day either side, never further', () => {
    const drifted = [series[0], point('2026-09-17T23:59:00Z', { spend_d7: 1500, conv_d7: 25 })];
    expect(build({ series: drifted }).before).toMatchObject({ spend: 1500, results: 25 });
    const far = [series[0], point('2026-09-16T19:00:00Z', { spend_d7: 1500, conv_d7: 25 })];
    expect(build({ series: far }).before).toBeNull();
  });

  it('prices a window that bought nothing as no cost, not zero', () => {
    const quiet = [point('2026-09-25T19:03:03Z', { spend_d7: 120, conv_d7: 0 })];
    expect(build({ series: quiet }).after).toMatchObject({ spend: 120, results: 0, cost: null });
  });

  it('says nothing before the engine has a series, instead of printing zeros', () => {
    const model = build({ series: [] });
    expect(model.source).toBe('none');
    expect(model.after).toBeNull();
    expect(model.before).toBeNull();
    expect(model.projection).toBeNull();
    // The cycle line does not depend on the series.
    expect(model.lastCycle?.when).toBe('Friday 13:03');
  });
});

describe('the last cycle', () => {
  it('names when it ran, what it proposed and what landed since', () => {
    const { lastCycle } = build();
    expect(lastCycle?.at).toBe('2026-09-25T19:03:03.393+00:00');
    expect(lastCycle?.when).toBe('Friday 13:03');
    expect(lastCycle?.proposed).toBe('2 pauses, 1 creative change and 9 budget moves proposed');
    expect(lastCycle?.applied).toBe('4 budget moves and 1 status change applied');
  });

  it('says nothing landed when the rows and the ledger are silent', () => {
    const { report } = readBody('tours');
    const model = build({ report, events: [] });
    expect(model.lastCycle?.proposed).toBeNull();
    expect(model.lastCycle?.applied).toBe('none applied yet');
  });

  it('is absent before the first cycle', () => {
    expect(build({ report: null }).lastCycle).toBeNull();
  });
});

describe('the projection', () => {
  // The body's pauses: Ad set A at its interval (75.65 × 8 events = 605.23 over 8 leads) and
  // Ad set B, which bought nothing, at the 340.44 its zero-conversion evidence states.
  const projected = (3924 - 75.65374999999999 * 8 - 340.44) / (86 - 8);

  it('prices the engine window without the ad sets the pending pauses would remove', () => {
    expect(build().projection).toEqual({
      pauses: 2,
      remaining: 7,
      cost: projected,
      vsTarget: 'over',
      window: 'd14',
    });
  });

  it('reads "under" against a higher target and "on" when they meet', () => {
    expect(build({ target: 40 }).projection?.vsTarget).toBe('under');
    expect(build({ target: Math.round(projected * 100) / 100 }).projection?.vsTarget).toBe('on');
    expect(build({ target: null }).projection?.vsTarget).toBeNull();
  });

  it('is absent with no pending pause, and null-priced when the rest bought nothing', () => {
    const { report } = readBody('tours');
    expect(build({ report }).projection).toBeNull();
    const dead = build({ series: [{ ...series[0], conv_d14: 8 }] });
    expect(dead.projection).toMatchObject({ pauses: 2, cost: null, vsTarget: null });
  });

  it('refuses to price a pause whose spend neither the interval nor its evidence states', () => {
    const { report } = readBody('formularios');
    const recommendations = report.recommendations.map((rec) =>
      rec.kind === 'pause' && rec.evidence?.metric === 'spend'
        ? { ...rec, evidence: { ...rec.evidence, metric: 'cpp' } }
        : rec,
    );
    expect(build({ report: { ...report, recommendations } }).projection).toBeNull();
  });
});

describe('the words', () => {
  it('day ranges', () => {
    expect(dayRangeLabel('2026-09-14', '2026-09-20')).toBe('September 14 to 20');
    expect(dayRangeLabel('2026-09-28', '2026-10-04')).toBe('September 28 to October 4');
  });

  it('cycle time in the account’s zone', () => {
    expect(cycleWhen('2026-09-26T01:05:00Z', MEXICO)).toBe('Friday 19:05');
  });
});
