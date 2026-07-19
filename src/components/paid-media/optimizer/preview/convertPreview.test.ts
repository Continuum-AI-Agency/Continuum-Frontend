import { describe, expect, it } from 'bun:test';
import type { CampaignSection } from '../picker/campaignGroups';
import { convertPreviewRows, convertPreviewTotals } from './convertPreview';

const adset = (id: string, over: Partial<CampaignSection['adsets'][number]> = {}) => ({
  id,
  name: `AdSet ${id}`,
  eligible: false,
  reason: 'Campaign holds the budget',
  currentBudget: 0,
  spend14: 140,
  events14: 7,
  cpa: 20,
  adCount: 2,
  freezeReason: 'unsupported_budget',
  ...over,
});

const section: CampaignSection = {
  campaignId: 'cmp1',
  campaignName: 'CBO Campaign',
  adsets: [adset('a1'), adset('a2', { spend14: 70, events14: 0, cpa: null })],
  eligibleCount: 0,
  totalCount: 2,
  totalBudget: 350,
  totalSpend14: 210,
  totalEvents14: 7,
  totalAds: 4,
  cpa: 30,
  mismatchCount: 0,
};

describe('convertPreviewRows', () => {
  it('joins budgets with the section rows by adset id, carrying spend context', () => {
    const rows = convertPreviewRows(section, [
      { adset_id: 'a1', adset_name: 'ignored', daily_major: 20 },
      { adset_id: 'a2', daily_major: 10 },
    ]);
    expect(rows).toEqual([
      { adsetId: 'a1', name: 'AdSet a1', spend14: 140, cpa: 20, newDailyBudget: 20 },
      { adsetId: 'a2', name: 'AdSet a2', spend14: 70, cpa: null, newDailyBudget: 10 },
    ]);
  });

  it('still previews a budget the snapshot read missed, without spend context', () => {
    const rows = convertPreviewRows(section, [
      { adset_id: 'ghost', adset_name: ' Fresh AdSet ', daily_major: 5 },
    ]);
    expect(rows).toEqual([
      { adsetId: 'ghost', name: 'Fresh AdSet', spend14: null, cpa: null, newDailyBudget: 5 },
    ]);
  });

  it('falls back to the raw id when no name exists anywhere', () => {
    const rows = convertPreviewRows(section, [{ adset_id: 'ghost', daily_major: 5 }]);
    expect(rows[0].name).toBe('ghost');
  });
});

describe('convertPreviewTotals', () => {
  it('sums the new daily budgets against the campaign-held budget', () => {
    const rows = convertPreviewRows(section, [
      { adset_id: 'a1', daily_major: 20 },
      { adset_id: 'a2', daily_major: 10.5 },
    ]);
    expect(convertPreviewTotals(section, rows)).toEqual({
      campaignBudgetToday: 350,
      newDailyTotal: 30.5,
      adsetCount: 2,
    });
  });
});
