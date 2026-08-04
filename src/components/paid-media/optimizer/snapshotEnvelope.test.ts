import { describe, expect, it } from 'bun:test';
import { parseOptimizerSnapshotEnvelope } from './snapshotEnvelope';

const WINDOW = { spend: 0, purchases: 0, addToCarts: 0, clicks: 0, impressions: 0 };
const SNAPSHOT = {
  id: 'adset-1',
  status: 'active',
  currentBudget: 75,
  ageDays: 30,
  campaignId: 'campaign-1',
  campaignName: 'Prospecting',
  windows: { d3: WINDOW, d7: WINDOW, d14: WINDOW },
};

describe('parseOptimizerSnapshotEnvelope', () => {
  it('exposes ABO totals beside, never inside, optimization snapshots', () => {
    const parsed = parseOptimizerSnapshotEnvelope({
      snapshots: [SNAPSHOT],
      fetchedAt: '2026-08-01T12:00:00.000Z',
      budgetSummary: {
        currency: 'USD',
        activeDailyTotal: 75,
        campaigns: [
          {
            campaignId: 'campaign-1',
            campaignName: 'Prospecting',
            activeDailyBudgetTotal: 75,
            activeAdsetCount: 1,
          },
        ],
      },
    });

    expect(parsed.budgetSummary?.activeDailyTotal).toBe(75);
    expect(parsed.snapshots).toEqual([SNAPSHOT]);
    expect(parsed.snapshots[0]).not.toHaveProperty('budgetSummary');
  });

  it('reads older cached envelopes with no budget summary', () => {
    const parsed = parseOptimizerSnapshotEnvelope({ snapshots: [SNAPSHOT] });

    expect(parsed.budgetSummary).toBeNull();
    expect(parsed.fetchedAt).toBeNull();
    expect(parsed.snapshots).toHaveLength(1);
  });
});
