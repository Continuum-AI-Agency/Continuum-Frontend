import { describe, expect, it } from 'bun:test';

import type { AdSetSnapshot, WindowMetrics } from '@continuum/contracts';
import { buildCampaignSections, filterSection, sectionEligibleIds } from './campaignGroups';

function win(spend: number, purchases = 0): WindowMetrics {
  return { spend, purchases, addToCarts: 0, clicks: 0, impressions: 0 };
}

function snap(overrides: Partial<AdSetSnapshot> & { id: string }): AdSetSnapshot {
  return {
    status: 'active',
    currentBudget: 50,
    ageDays: 20,
    windows: { d3: win(30, 3), d7: win(70, 7), d14: win(140, 14) },
    ...overrides,
  } as AdSetSnapshot;
}

describe('buildCampaignSections — eligibility', () => {
  it('marks an active ad set with an ad-set daily budget as eligible (no reason)', () => {
    const [section] = buildCampaignSections([
      snap({ id: 'a', name: 'Broad', campaignId: 'c1', campaignName: 'Summer' }),
    ]);
    expect(section.adsets[0].eligible).toBe(true);
    expect(section.adsets[0].reason).toBeNull();
  });

  it('holds a CBO/lifetime ad set (frozen + unsupported_budget) with a visible reason', () => {
    const [section] = buildCampaignSections([
      snap({
        id: 'b',
        name: 'CBO set',
        campaignId: 'c1',
        campaignName: 'Summer',
        status: 'frozen',
        freeze: true,
        freezeReason: 'unsupported_budget',
        currentBudget: 0,
        windows: { d3: win(30), d7: win(70), d14: win(140) },
      }),
    ]);
    expect(section.adsets[0].eligible).toBe(false);
    expect(section.adsets[0].reason).toBe('Held · CBO/lifetime');
  });

  it('holds a zero-budget ad set with the campaign-budget fallback reason', () => {
    const [section] = buildCampaignSections([
      snap({ id: 'c', campaignId: 'c1', campaignName: 'Summer', currentBudget: 0 }),
    ]);
    expect(section.adsets[0].eligible).toBe(false);
    expect(section.adsets[0].reason).toContain('campaign level');
  });
});

describe('buildCampaignSections — grouping', () => {
  it('groups ad sets under their campaign and counts eligibility', () => {
    const sections = buildCampaignSections([
      snap({ id: 'a', name: 'Broad', campaignId: 'c1', campaignName: 'Summer' }),
      snap({ id: 'b', name: 'LAL', campaignId: 'c1', campaignName: 'Summer', currentBudget: 0 }),
      snap({ id: 'c', name: 'Retarget', campaignId: 'c2', campaignName: 'Always-On' }),
    ]);
    const summer = sections.find((s) => s.campaignId === 'c1');
    expect(summer?.totalCount).toBe(2);
    expect(summer?.eligibleCount).toBe(1);
    expect(sections.map((s) => s.campaignName)).toEqual(['Always-On', 'Summer']);
  });

  it('sinks ad sets without a campaign into an Ungrouped section at the bottom', () => {
    const sections = buildCampaignSections([
      snap({ id: 'x', campaignId: 'c1', campaignName: 'Summer' }),
      snap({ id: 'y' }),
    ]);
    expect(sections[sections.length - 1].campaignName).toBe('Ungrouped');
  });
});

describe('filterSection', () => {
  const [section] = buildCampaignSections([
    snap({ id: 'a', name: 'Broad prospecting', campaignId: 'c1', campaignName: 'Summer Sale' }),
    snap({ id: 'b', name: 'Retargeting', campaignId: 'c1', campaignName: 'Summer Sale' }),
  ]);

  it('keeps every ad set when the query hits the campaign name', () => {
    expect(filterSection(section, 'summer')).toHaveLength(2);
  });
  it('narrows to matching ad sets otherwise', () => {
    const rows = filterSection(section, 'retarget');
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('b');
  });
  it('returns all ad sets for an empty query', () => {
    expect(filterSection(section, '  ')).toHaveLength(2);
  });
});

describe('sectionEligibleIds', () => {
  it('returns only the eligible ad-set ids', () => {
    const [section] = buildCampaignSections([
      snap({ id: 'a', campaignId: 'c1', campaignName: 'Summer' }),
      snap({ id: 'b', campaignId: 'c1', campaignName: 'Summer', currentBudget: 0 }),
    ]);
    expect(sectionEligibleIds(section.adsets)).toEqual(['a']);
  });
});

// A campaign snapshot is self-referential (campaignId === id), so each section
// holds exactly one row: the campaign itself.
describe('campaign mode', () => {
  const CAMPAIGN_HELD_REASON =
    'No campaign budget — this campaign splits budget at the ad-set level (ABO).';

  it('yields a 1-row eligible section for a CBO campaign, carrying its budgetType', () => {
    const [section] = buildCampaignSections(
      [
        snap({
          id: 'camp1',
          name: 'Summer CBO',
          campaignId: 'camp1',
          campaignName: 'Summer CBO',
          currentBudget: 300,
          budgetType: 'lifetime',
        }),
      ],
      'campaign',
    );
    expect(section.adsets).toHaveLength(1);
    expect(section.adsets[0].id).toBe('camp1');
    expect(section.adsets[0].eligible).toBe(true);
    expect(section.adsets[0].reason).toBeNull();
    expect(section.adsets[0].budgetType).toBe('lifetime');
    expect(section.eligibleCount).toBe(1);
    expect(section.totalCount).toBe(1);
  });

  it('holds an ABO campaign with the campaign-mode reason, not the CBO/lifetime label', () => {
    const [section] = buildCampaignSections(
      [
        snap({
          id: 'camp2',
          name: 'Always-On ABO',
          campaignId: 'camp2',
          campaignName: 'Always-On ABO',
          currentBudget: 0,
          status: 'frozen',
          freeze: true,
          freezeReason: 'unsupported_budget',
          windows: { d3: win(30), d7: win(70), d14: win(140) },
        }),
      ],
      'campaign',
    );
    expect(section.adsets[0].eligible).toBe(false);
    expect(section.adsets[0].reason).toBe(CAMPAIGN_HELD_REASON);
  });

  it('returns the eligible campaign id from sectionEligibleIds', () => {
    const sections = buildCampaignSections(
      [
        snap({
          id: 'cbo',
          campaignId: 'cbo',
          campaignName: 'CBO',
          currentBudget: 200,
          budgetType: 'daily',
        }),
        snap({
          id: 'abo',
          campaignId: 'abo',
          campaignName: 'ABO',
          currentBudget: 0,
          status: 'frozen',
          freeze: true,
          freezeReason: 'unsupported_budget',
          windows: { d3: win(0), d7: win(0), d14: win(0) },
        }),
      ],
      'campaign',
    );
    const cbo = sections.find((s) => s.campaignId === 'cbo');
    expect(sectionEligibleIds(cbo?.adsets ?? [])).toEqual(['cbo']);
  });
});

describe('metrics — per row + campaign aggregates', () => {
  it('derives per-row CPA + carries adCount, and aggregates the campaign', () => {
    const [section] = buildCampaignSections([
      snap({
        id: 'a',
        name: 'Broad',
        campaignId: 'c1',
        campaignName: 'Summer',
        currentBudget: 40,
        adCount: 3,
        windows: { d3: win(30, 3), d7: win(70, 7), d14: win(200, 10) },
      }),
      snap({
        id: 'b',
        name: 'LAL',
        campaignId: 'c1',
        campaignName: 'Summer',
        currentBudget: 60,
        adCount: 2,
        windows: { d3: win(30, 3), d7: win(70, 7), d14: win(100, 10) },
      }),
    ]);
    const broad = section.adsets.find((r) => r.id === 'a');
    expect(broad?.cpa).toBe(20); // 200 spend / 10 results
    expect(broad?.adCount).toBe(3);
    expect(section.totalBudget).toBe(100);
    expect(section.totalSpend14).toBe(300);
    expect(section.totalAds).toBe(5);
    expect(section.cpa).toBe(15); // 300 spend / 20 results (blended)
  });

  it('sorts eligible ad sets ahead of held ones, by spend desc', () => {
    const [section] = buildCampaignSections([
      snap({
        id: 'small',
        campaignId: 'c1',
        campaignName: 'S',
        windows: { d3: win(0), d7: win(0), d14: win(50) },
      }),
      snap({
        id: 'cbo',
        campaignId: 'c1',
        campaignName: 'S',
        currentBudget: 0,
        windows: { d3: win(0), d7: win(0), d14: win(999) },
      }),
      snap({
        id: 'big',
        campaignId: 'c1',
        campaignName: 'S',
        windows: { d3: win(0), d7: win(0), d14: win(500) },
      }),
    ]);
    expect(section.adsets.map((r) => r.id)).toEqual(['big', 'small', 'cbo']);
  });
});
