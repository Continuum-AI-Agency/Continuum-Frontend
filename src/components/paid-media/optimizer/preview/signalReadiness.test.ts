import { describe, expect, it } from 'bun:test';
import type { AdSetSnapshot } from '@continuum/contracts';
import { HISTORY_CONFIDENT_DAYS, signalReadiness } from './signalReadiness';

// A minimal snapshot with just the fields signalReadiness reads. `d14` events and
// `daily` length are the levers; everything else is required-schema filler.
function snap(over: {
  id: string;
  kpiField?: AdSetSnapshot['kpiField'];
  days?: number;
  d14?: Partial<AdSetSnapshot['windows']['d14']>;
}): AdSetSnapshot {
  const zeroWindow = {
    spend: 0,
    purchases: 0,
    addToCarts: 0,
    clicks: 0,
    impressions: 0,
  };
  const daily = Array.from({ length: over.days ?? 0 }, (_, i) => ({
    date: `2026-07-${String(i + 1).padStart(2, '0')}`,
    ...zeroWindow,
  }));
  return {
    id: over.id,
    status: 'active',
    currentBudget: 100,
    ageDays: over.days ?? 0,
    kpiField: over.kpiField,
    windows: {
      d3: { ...zeroWindow },
      d7: { ...zeroWindow },
      d14: { ...zeroWindow, ...over.d14 },
    },
    daily,
  };
}

describe('signalReadiness', () => {
  it('derives the objective KPI without a local map', () => {
    const result = signalReadiness([snap({ id: 'a' })], 'conversations');
    expect(result.objectiveKpi).toBe('conversations');
  });

  it('flags currency_mismatch when a strict majority buy a different result', () => {
    // 3 ad sets optimize for link clicks, 1 declares the objective — most are frozen.
    const snapshots = [
      snap({ id: 'a', kpiField: 'linkClicks', days: 20, d14: { linkClicks: 40 } }),
      snap({ id: 'b', kpiField: 'linkClicks', days: 20, d14: { linkClicks: 30 } }),
      snap({ id: 'c', kpiField: 'linkClicks', days: 20, d14: { linkClicks: 25 } }),
      snap({ id: 'd', kpiField: 'purchases', days: 20, d14: { purchases: 5 } }),
    ];
    const result = signalReadiness(snapshots, 'purchase');
    expect(result.verdict).toBe('currency_mismatch');
    expect(result.declaredMismatched).toBe(3);
    expect(result.declaredMatching).toBe(1);
    expect(result.undeclared).toBe(0);
  });

  it('does not call a 50/50 split currency_mismatch — the aligned half can still score', () => {
    const snapshots = [
      snap({ id: 'a', kpiField: 'linkClicks', days: 20, d14: { linkClicks: 40 } }),
      snap({ id: 'b', kpiField: 'purchases', days: 20, d14: { purchases: 8 } }),
    ];
    const result = signalReadiness(snapshots, 'purchase');
    expect(result.verdict).not.toBe('currency_mismatch');
  });

  it('flags no_signal when no ad set produced a single objective event in 14d', () => {
    const snapshots = [
      snap({ id: 'a', kpiField: 'purchases', days: 20, d14: { purchases: 0 } }),
      snap({ id: 'b', days: 20, d14: { purchases: 0 } }),
    ];
    const result = signalReadiness(snapshots, 'purchase');
    expect(result.verdict).toBe('no_signal');
    expect(result.trackedShare).toBe(0);
  });

  it('prefers no_signal over thin_history — days cannot rescue an absent event stream', () => {
    // Young AND eventless: the blocker is the missing signal, not the short window.
    const result = signalReadiness([snap({ id: 'a', days: 3, d14: { purchases: 0 } })], 'purchase');
    expect(result.verdict).toBe('no_signal');
  });

  it('flags thin_history for a young account that IS converting', () => {
    const snapshots = [
      snap({ id: 'a', days: 4, d14: { purchases: 6 } }),
      snap({ id: 'b', days: 3, d14: { purchases: 2 } }),
    ];
    const result = signalReadiness(snapshots, 'purchase');
    expect(result.verdict).toBe('thin_history');
    expect(result.daysOfHistory).toBe(4);
    expect(result.trackedShare).toBe(1);
  });

  it('reports ready when aligned, tracked, and past the confidence window', () => {
    const snapshots = [
      snap({
        id: 'a',
        kpiField: 'purchases',
        days: HISTORY_CONFIDENT_DAYS,
        d14: { purchases: 12 },
      }),
      snap({ id: 'b', days: HISTORY_CONFIDENT_DAYS + 5, d14: { purchases: 9 } }),
    ];
    const result = signalReadiness(snapshots, 'purchase');
    expect(result.verdict).toBe('ready');
    expect(result.declaredMatching).toBe(1);
    expect(result.undeclared).toBe(1);
  });

  it('counts undeclared ad sets as aligned (they inherit the objective KPI)', () => {
    const result = signalReadiness(
      [snap({ id: 'a', days: 20, d14: { purchases: 4 } })],
      'purchase',
    );
    expect(result.undeclared).toBe(1);
    expect(result.declaredMismatched).toBe(0);
    expect(result.verdict).toBe('ready');
  });

  it('returns a stable zero object with no_signal for an empty account', () => {
    const result = signalReadiness([], 'purchase');
    expect(result).toEqual({
      objectiveKpi: 'purchases',
      declaredMatching: 0,
      declaredMismatched: 0,
      undeclared: 0,
      daysOfHistory: 0,
      trackedShare: 0,
      verdict: 'no_signal',
    });
  });
});
