import { describe, expect, it } from 'bun:test';
import type { CyclePreviewItem } from '@continuum/contracts';
import { forecastAutopilot } from './autopilotForecast';

const item = (over: Partial<CyclePreviewItem>): CyclePreviewItem => ({
  adset_id: 'as',
  current_budget: 100,
  final_budget: 110,
  change_abs: 10,
  change_pct: 0.1,
  ...over,
});

describe('forecastAutopilot — the two guardrails between a scored move and a Meta write', () => {
  it('holds a move larger than the per-cycle cap and applies the rest', () => {
    const forecast = forecastAutopilot({
      items: [
        item({ adset_id: 'small', change_pct: 0.1 }),
        item({ adset_id: 'big', change_abs: -60, change_pct: -0.6 }),
      ],
      dailyTotal: 400,
      currency: 'USD',
      maxDailyApplyMinor: 100_000,
      maxChangePctPerCycle: 0.2,
    });
    expect(forecast.wouldApply.map((i) => i.adset_id)).toEqual(['small']);
    expect(forecast.wouldHold.map((i) => i.adset_id)).toEqual(['big']);
    expect(forecast.poolOverCeiling).toBe(false);
  });

  it('never counts an unchanged ad set as a write', () => {
    const forecast = forecastAutopilot({
      items: [item({ adset_id: 'flat', change_abs: 0, change_pct: 0 })],
      dailyTotal: 100,
      currency: 'USD',
      maxDailyApplyMinor: 100_000,
      maxChangePctPerCycle: 0.2,
    });
    expect(forecast.wouldApply).toHaveLength(0);
    expect(forecast.wouldHold).toHaveLength(0);
  });

  it('reports the pool over the ceiling — the cycle that writes nothing at all', () => {
    const forecast = forecastAutopilot({
      items: [item({})],
      dailyTotal: 1200,
      currency: 'USD',
      maxDailyApplyMinor: 100_000,
      maxChangePctPerCycle: 0.2,
    });
    expect(forecast.poolMinor).toBe(120_000);
    expect(forecast.poolOverCeiling).toBe(true);
  });

  it('scales the pool with the account currency, not a hardcoded 100', () => {
    // JPY has no sub-unit: ¥1,200/day is 1200 minor units, well under the ceiling that a
    // hardcoded ×100 would have read as breached.
    const forecast = forecastAutopilot({
      items: [item({})],
      dailyTotal: 1200,
      currency: 'JPY',
      maxDailyApplyMinor: 100_000,
      maxChangePctPerCycle: 0.2,
    });
    expect(forecast.poolMinor).toBe(1200);
    expect(forecast.poolOverCeiling).toBe(false);
  });
});
