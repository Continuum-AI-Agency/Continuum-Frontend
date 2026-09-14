import { describe, expect, it } from 'bun:test';
import { buildFlightPacing, pacingStatus, spendBetween } from './flightPacingModel';

const TODAY = '2026-09-11';
const flight = { period_start: '2026-09-01', period_end: '2026-09-30', period_budget: 3000 };

function snap(id: string, rows: Array<[string, number]>) {
  return { id, daily: rows.map(([date, spend]) => ({ date, spend })) };
}

describe('spendBetween', () => {
  it('sums enrolled ad sets only, inside the window', () => {
    const snapshots = [
      snap('a', [
        ['2026-09-01', 10],
        ['2026-09-02', 20],
        ['2026-09-03', 30],
      ]),
      snap('b', [
        ['2026-09-01', 5],
        ['2026-09-02', 5],
      ]),
      snap('c', [['2026-09-01', 999]]),
    ];
    expect(spendBetween(snapshots, ['a', 'b'], '2026-09-01', '2026-09-02')).toBe(40);
  });
  it('refuses a truncated series rather than under-reporting', () => {
    const snapshots = [snap('a', [['2026-09-05', 10]])];
    expect(spendBetween(snapshots, ['a'], '2026-09-01', '2026-09-10')).toBeNull();
  });
  it('is null with no series at all', () => {
    expect(spendBetween([{ id: 'a' }], ['a'], '2026-09-01', '2026-09-10')).toBeNull();
  });
});

describe('pacingStatus', () => {
  it('uses the engine thresholds (±5%)', () => {
    expect(pacingStatus(1.0)).toBe('on_track');
    expect(pacingStatus(1.049)).toBe('on_track');
    expect(pacingStatus(1.06)).toBe('overpacing');
    expect(pacingStatus(0.9)).toBe('underpacing');
  });
});

describe('buildFlightPacing', () => {
  it('no flight when any of start / end / budget is missing', () => {
    expect(
      buildFlightPacing({
        portfolio: { period_start: '2026-09-01', period_end: null, period_budget: 100 },
        runPacing: null,
        snapshots: [],
        enrolledIds: [],
        today: TODAY,
      }).kind,
    ).toBe('no_flight');
    expect(
      buildFlightPacing({
        portfolio: { ...flight, period_budget: 0 },
        runPacing: null,
        snapshots: [],
        enrolledIds: [],
        today: TODAY,
      }).kind,
    ).toBe('no_flight');
  });

  it('prefers the engine figures when the run paced this flight', () => {
    const m = buildFlightPacing({
      portfolio: flight,
      runPacing: {
        dailyTotal: 100,
        idealCumulative: 1000,
        pacingRatio: 0.8,
        status: 'underpacing',
        note: 'Underpacing (80%)',
        source: 'pacing',
        periodBudget: 3000,
        periodDays: 30,
        dayIndex: 11,
        actualSpendToDate: 800,
      },
      snapshots: [],
      enrolledIds: [],
      today: TODAY,
    });
    expect(m.kind).toBe('ready');
    if (m.kind !== 'ready') return;
    expect(m.source).toBe('engine');
    expect(m.spent).toBe(800);
    expect(m.dayIndex).toBe(11);
    expect(m.periodDays).toBe(30);
    expect(m.status).toBe('underpacing');
    expect(m.ratio).toBeCloseTo(0.8, 6);
    expect(m.timePct).toBeCloseTo((11 / 30) * 100, 6);
    expect(m.spentPct).toBeCloseTo((800 / 3000) * 100, 6);
    expect(m.projectedEnd).toBeCloseTo((800 / 11) * 30, 6);
    expect(m.dailyNeeded).toBeCloseTo(2200 / 20, 6);
    expect(m.note).toBe('Underpacing (80%)');
  });

  it('ignores an observed/fixed run row — its on_track is a placeholder, not a verdict', () => {
    const rows = [
      snap(
        'a',
        Array.from({ length: 11 }, (_, i) => [`2026-09-${String(i + 1).padStart(2, '0')}`, 100]),
      ),
    ];
    const m = buildFlightPacing({
      portfolio: flight,
      runPacing: {
        dailyTotal: 100,
        idealCumulative: 0,
        pacingRatio: 1,
        status: 'on_track',
        note: 'No pacing state',
        source: 'observed',
      },
      snapshots: rows,
      enrolledIds: ['a'],
      today: TODAY,
    });
    expect(m.kind).toBe('ready');
    if (m.kind !== 'ready') return;
    expect(m.source).toBe('client');
    expect(m.spent).toBe(1100);
    // ideal before day 11 = 100 × 10 = 1000 → 1.1 → overpacing
    expect(m.status).toBe('overpacing');
  });

  it('awaits a cycle when neither the run nor the series can say what was spent', () => {
    const m = buildFlightPacing({
      portfolio: flight,
      runPacing: null,
      snapshots: [snap('a', [['2026-09-09', 10]])],
      enrolledIds: ['a'],
      today: TODAY,
    });
    expect(m.kind).toBe('awaiting_cycle');
  });

  it('reports not_started and ended flights', () => {
    expect(
      buildFlightPacing({
        portfolio: { ...flight, period_start: '2026-09-20', period_end: '2026-09-30' },
        runPacing: null,
        snapshots: [],
        enrolledIds: [],
        today: TODAY,
      }).kind,
    ).toBe('not_started');
    const ended = buildFlightPacing({
      portfolio: { period_start: '2026-08-01', period_end: '2026-08-10', period_budget: 1000 },
      runPacing: null,
      snapshots: [
        snap('a', [
          ['2026-08-01', 500],
          ['2026-08-10', 400],
        ]),
      ],
      enrolledIds: ['a'],
      today: TODAY,
    });
    expect(ended.kind).toBe('ended');
    if (ended.kind === 'ended') {
      expect(ended.spent).toBe(900);
      expect(ended.spentPct).toBe(90);
    }
  });

  it('day one is on track by definition', () => {
    const m = buildFlightPacing({
      portfolio: { ...flight, period_start: TODAY, period_end: '2026-09-30' },
      runPacing: null,
      snapshots: [snap('a', [[TODAY, 0]])],
      enrolledIds: ['a'],
      today: TODAY,
    });
    expect(m.kind).toBe('ready');
    if (m.kind === 'ready') expect(m.status).toBe('on_track');
  });
});
