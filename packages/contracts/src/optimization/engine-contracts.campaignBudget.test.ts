import { describe, expect, test } from 'bun:test';
import { AdSetSnapshotSchema } from './engine-contracts';

/** The edge writes a CBO ad set's campaign budget BESIDE its zero currentBudget; the schema
 *  must keep it, or z.object strips it at ingest and the hold reason loses its figure. */
describe('AdSetSnapshotSchema campaignBudget', () => {
  test('a CBO ad set keeps campaignBudget and campaignBudgetType through parse', () => {
    const parsed = AdSetSnapshotSchema.safeParse(cboSnapshot());
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.currentBudget).toBe(0);
    expect(parsed.data.campaignBudget).toBe(450);
    expect(parsed.data.campaignBudgetType).toBe('daily');
  });

  test('an ad set that owns its budget parses without the campaign fields', () => {
    const { campaignBudget: _b, campaignBudgetType: _t, ...own } = cboSnapshot();
    const parsed = AdSetSnapshotSchema.safeParse({ ...own, currentBudget: 120 });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.campaignBudget).toBeUndefined();
  });
});

function cboSnapshot() {
  const window = { spend: 10, purchases: 1, addToCarts: 0, clicks: 5, impressions: 100 };
  return {
    id: 'adset-1',
    name: 'CBO ad set',
    status: 'active',
    currentBudget: 0,
    ageDays: 12,
    budgetType: 'daily',
    campaignBudget: 450,
    campaignBudgetType: 'daily',
    windows: { d3: window, d7: window, d14: window },
  };
}
