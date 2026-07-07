import { describe, expect, it } from 'bun:test';
import type { AdSetSnapshot } from '@continuum/contracts';

import { campaignRows, runWhatIf } from './whatIf';

function window(spend: number, purchases: number) {
  return {
    spend,
    purchases,
    addToCarts: purchases * 2,
    clicks: purchases * 5,
    impressions: spend * 10,
  };
}

function snap(over: Partial<AdSetSnapshot> & { id: string }): AdSetSnapshot {
  return {
    status: 'active',
    currentBudget: 500,
    ageDays: 30,
    windows: { d3: window(150, 3), d7: window(350, 8), d14: window(700, 16) },
    ...over,
  } as AdSetSnapshot;
}

describe('campaignRows', () => {
  it('extracts current budget + 14d spend/conversions per ad set, sorted by spend', () => {
    const rows = campaignRows(
      [
        snap({
          id: 'small',
          windows: { d3: window(10, 1), d7: window(20, 2), d14: window(40, 4) },
        }),
        snap({
          id: 'big',
          windows: { d3: window(100, 5), d7: window(300, 12), d14: window(900, 30) },
        }),
      ],
      'purchase',
    );
    expect(rows.map((r) => r.adsetId)).toEqual(['big', 'small']);
    expect(rows[0]).toMatchObject({ currentBudget: 500, spend14: 900, conv14: 30 });
  });
});

describe('runWhatIf', () => {
  it('returns null with no ad sets', () => {
    expect(runWhatIf([], { objective: 'purchase', mode: 'balanced', total: 100 })).toBeNull();
  });

  it('conserves the total and produces before/after budgets per ad set', () => {
    const snapshots = [
      snap({
        id: 'strong',
        windows: { d3: window(150, 9), d7: window(350, 20), d14: window(700, 40) },
      }),
      snap({
        id: 'weak',
        windows: { d3: window(150, 1), d7: window(350, 2), d14: window(700, 4) },
      }),
    ];
    const result = runWhatIf(snapshots, { objective: 'purchase', mode: 'balanced', total: 1000 });
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.items).toHaveLength(2);
    expect(result.allocatedTotal).toBeCloseTo(1000, 0);
    // Each item carries a current and a proposed budget.
    for (const item of result.items) {
      expect(typeof item.current_budget).toBe('number');
      expect(typeof item.final_budget).toBe('number');
    }
  });

  it('carries a snapshot freeze through as a HELD item (unchanged budget)', () => {
    const snapshots = [
      snap({
        id: 'live',
        windows: { d3: window(150, 6), d7: window(350, 14), d14: window(700, 28) },
      }),
      snap({
        id: 'held',
        freeze: true,
        freezeReason: 'no_conversions',
        windows: { d3: window(120, 0), d7: window(300, 0), d14: window(600, 0) },
      }),
    ];
    const result = runWhatIf(snapshots, { objective: 'purchase', mode: 'balanced', total: 1000 });
    const held = result?.items.find((item) => item.adset_id === 'held');
    expect(held?.diagnostics?.freezeReason).toBe('no_conversions');
    expect(held?.change_abs).toBe(0);
  });
});
