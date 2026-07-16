import { describe, expect, it } from 'bun:test';
import type { AdSetSnapshot } from '@continuum/contracts';

import { campaignRows } from './whatIf';

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
