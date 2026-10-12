// A pacing status is a VERDICT: it compares spend to date against what the plan expected by
// now. Two cycles have no such comparison and used to wear the verdict's word anyway:
//
//   - a portfolio with no flight window (the daily total is the live sum, or a human's fixed
//     number): runCycle stamped `status: 'on_track'` with idealCumulative 0 and
//     pacingRatio 1, and that row reached a brief as "and is on track";
//   - day 1 of a real flight: nothing was due before today, so idealCumulative is 0 and the
//     ratio is 1 by construction — computePacing called that `on_track`.
//
// Both now say `unknown`, and the note says why. Every reader (the Backend brief packet, the
// Frontend hero) already refused a status not measured against a plan; this makes the engine
// stop producing one.
import { describe, expect, test } from 'bun:test';
import type { AdSetSnapshot, WindowMetrics } from '../src/index';
import { computePacing, runCycle } from '../src/index';

const win = (spend: number, purchases: number): WindowMetrics => ({
  spend,
  purchases,
  addToCarts: 0,
  clicks: 0,
  impressions: 0,
});

const adset = (id: string, currentBudget: number): AdSetSnapshot => ({
  id,
  status: 'active',
  currentBudget,
  ageDays: 40,
  windows: { d3: win(30, 3), d7: win(70, 7), d14: win(140, 14) },
});

describe('pacing status is a verdict, not a placeholder', () => {
  test('a cycle with no flight window has no verdict', () => {
    const r = runCycle([adset('a', 100), adset('b', 100)], {
      mode: 'balanced',
      total: 200,
      config: { cpaTarget: 50 },
    });
    expect(r.pacing.source).toBe('observed');
    expect(r.pacing.status).toBe('unknown');
    expect(r.pacing.idealCumulative).toBe(0);
    expect(r.pacing.dailyTotal).toBe(200);
    expect(r.pacing.note).toContain('No pacing state');
  });

  test('day 1 of a flight expected nothing yet, so there is nothing to be on or off', () => {
    const p = computePacing(
      { periodBudget: 3000, periodDays: 30, dayIndex: 1, actualSpendToDate: 0 },
      'MXN',
    );
    expect(p.source).toBe('pacing');
    expect(p.idealCumulative).toBe(0);
    expect(p.status).toBe('unknown');
    expect(p.dailyTotal).toBeCloseTo(100, 6);
    expect(p.pacingRatio).toBe(1);
    expect(p.note).toMatch(/day 1/i);
    expect(p.note).toContain('100 MXN');
  });

  test('from day 2 the ideal is positive and the verdict is real', () => {
    const onTrack = computePacing({
      periodBudget: 3000,
      periodDays: 30,
      dayIndex: 2,
      actualSpendToDate: 100,
    });
    expect(onTrack.idealCumulative).toBe(100);
    expect(onTrack.status).toBe('on_track');

    const under = computePacing({
      periodBudget: 3000,
      periodDays: 30,
      dayIndex: 11,
      actualSpendToDate: 800,
    });
    expect(under.status).toBe('underpacing');

    const over = computePacing({
      periodBudget: 3000,
      periodDays: 30,
      dayIndex: 11,
      actualSpendToDate: 1200,
    });
    expect(over.status).toBe('overpacing');
  });

  test('a day-1 flight still drives the daily total through runCycle', () => {
    const r = runCycle([adset('a', 100), adset('b', 100)], {
      mode: 'balanced',
      pacing: { periodBudget: 3000, periodDays: 30, dayIndex: 1, actualSpendToDate: 0 },
      config: { cpaTarget: 50 },
    });
    expect(r.pacing.source).toBe('pacing');
    expect(r.pacing.status).toBe('unknown');
    expect(r.reallocation.totalBudget).toBeCloseTo(100, 6);
  });
});
