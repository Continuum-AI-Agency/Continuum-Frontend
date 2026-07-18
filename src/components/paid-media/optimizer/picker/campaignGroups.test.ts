import { describe, expect, it } from 'bun:test';

import type { AdSetSnapshot, WindowMetrics } from '@continuum/contracts';
import { getOptimizationMetricDefinition, OptimizationObjectiveSchema } from '@continuum/contracts';
import type { CampaignSection } from './campaignGroups';
import {
  buildCampaignSections,
  buildCboCampaignSections,
  defaultCollapsed,
  filterItems,
  filterSection,
  flattenRows,
  pickerCounts,
  sectionEligibleIds,
  topEligibleBySpend,
} from './campaignGroups';

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

describe('buildCboCampaignSections', () => {
  const cboSet = (id: string, campaignId: string, campaignName: string): AdSetSnapshot =>
    snap({
      id,
      campaignId,
      campaignName,
      status: 'frozen',
      freeze: true,
      freezeReason: 'unsupported_budget',
      currentBudget: 0,
      windows: { d3: win(30), d7: win(70), d14: win(140) },
    });

  it('groups only the CBO-held ad sets by their parent campaign', () => {
    const sections = buildCboCampaignSections([
      cboSet('a', 'c1', 'Summer CBO'),
      cboSet('b', 'c1', 'Summer CBO'),
      snap({ id: 'live', campaignId: 'c2', campaignName: 'Always-On' }), // eligible, not CBO
    ]);
    expect(sections).toHaveLength(1);
    expect(sections[0].campaignId).toBe('c1');
    expect(sections[0].totalCount).toBe(2);
  });

  it('excludes CBO ad sets without a campaign id (a convert needs one)', () => {
    const sections = buildCboCampaignSections([
      snap({
        id: 'orphan',
        status: 'frozen',
        freeze: true,
        freezeReason: 'unsupported_budget',
        currentBudget: 0,
        windows: { d3: win(0), d7: win(0), d14: win(0) },
      }),
    ]);
    expect(sections).toHaveLength(0);
  });

  it('ignores non-CBO holds (e.g. no_conversions)', () => {
    const sections = buildCboCampaignSections([
      snap({
        id: 'held',
        campaignId: 'c9',
        campaignName: 'Thin',
        status: 'frozen',
        freeze: true,
        freezeReason: 'no_conversions',
      }),
    ]);
    expect(sections).toHaveLength(0);
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

// ── browsing at scale ────────────────────────────────────────────────────────────────────
// An account with 300+ ad sets is not browsable by scrolling. These are the pieces the
// virtualized picker is built from.

const fleet = () => [
  snap({ id: 'a1', name: 'Prospecting Broad', campaignId: 'c1', campaignName: 'Summer Sale' }),
  snap({
    id: 'a2',
    name: 'Retargeting 30d',
    campaignId: 'c1',
    campaignName: 'Summer Sale',
    currentBudget: 200,
    windows: { d3: win(0), d7: win(0), d14: win(900, 9) },
  }),
  snap({
    id: 'b1',
    name: 'Lookalike 1%',
    campaignId: 'c2',
    campaignName: 'Always On',
    windows: { d3: win(0), d7: win(0), d14: win(0) },
  }),
  snap({
    id: 'b2',
    name: 'Held CBO',
    campaignId: 'c2',
    campaignName: 'Always On',
    currentBudget: 0,
    freeze: true,
    freezeReason: 'unsupported_budget',
  }),
];

const sectionById = (id: string) =>
  buildCampaignSections(fleet()).find((s) => s.campaignId === id) as CampaignSection;

describe('filterItems — tokenized AND search', () => {
  it('matches tokens in any order and across name + campaign (the old substring test could not)', () => {
    const summer = sectionById('c1');
    expect(filterItems(summer, { query: 'broad prospecting' }).map((i) => i.id)).toEqual(['a1']);
    expect(filterItems(summer, { query: 'summer retarget' }).map((i) => i.id)).toEqual(['a2']);
  });

  it('matches on ad-set id', () => {
    expect(filterItems(sectionById('c1'), { query: 'a2' }).map((i) => i.id)).toEqual(['a2']);
  });

  it('chips are additive: eligible + spending keeps only ad sets that are both', () => {
    const sections = buildCampaignSections(fleet());
    const all = sections.flatMap((s) => filterItems(s, { chips: ['eligible', 'spending'] }));
    expect(all.map((i) => i.id).sort()).toEqual(['a1', 'a2']); // b1 never spent, b2 is held
  });

  it('the held chip surfaces exactly the ineligible rows', () => {
    const sections = buildCampaignSections(fleet());
    const held = sections.flatMap((s) => filterItems(s, { chips: ['held'] }));
    expect(held.map((i) => i.id)).toEqual(['b2']);
  });
});

describe('flattenRows — the virtualizer index', () => {
  it('a collapsed campaign contributes its header and none of its ad sets', () => {
    const sections = buildCampaignSections(fleet());
    const rows = flattenRows(sections, { collapsed: new Set(['c2']) });
    expect(rows.filter((r) => r.kind === 'campaign')).toHaveLength(2);
    expect(rows.filter((r) => r.kind === 'adset').map((r) => r.item.id)).toEqual(['a2', 'a1']);
  });

  // The regression. The old picker computed `isCollapsed = !searching && collapsed.has(id)`,
  // so typing anything into the search box made every collapse control inert — you could click
  // it and nothing happened.
  it('honors an explicit collapse EVEN WHILE SEARCHING', () => {
    const sections = buildCampaignSections(fleet());
    const rows = flattenRows(sections, { collapsed: new Set(['c1']), query: 'a' });
    expect(rows.some((r) => r.kind === 'adset' && r.section.campaignId === 'c1')).toBe(false);
  });

  it('drops a campaign whose ad sets are all filtered out', () => {
    const sections = buildCampaignSections(fleet());
    const rows = flattenRows(sections, { collapsed: new Set(), query: 'lookalike' });
    expect(rows.filter((r) => r.kind === 'campaign').map((r) => r.section.campaignId)).toEqual([
      'c2',
    ]);
  });

  it('reports how many ad sets survive inside a collapsed campaign, so nothing hides silently', () => {
    const sections = buildCampaignSections(fleet());
    const rows = flattenRows(sections, { collapsed: new Set(['c1']) });
    const header = rows.find((r) => r.kind === 'campaign' && r.section.campaignId === 'c1');
    expect(header?.kind === 'campaign' && header.visibleCount).toBe(2);
  });
});

describe('selection helpers', () => {
  it('topEligibleBySpend picks the biggest spenders and never an ineligible one', () => {
    const sections = buildCampaignSections(fleet());
    expect(topEligibleBySpend(sections, 2)).toEqual(['a2', 'a1']);
    expect(topEligibleBySpend(sections, 10)).not.toContain('b2');
  });

  it('defaultCollapsed leaves the top spenders open and collapses the rest', () => {
    // 20+ big spenders in c1 push c3's single small ad set out of the top 20, so a 300-ad-set
    // account does not open fully expanded.
    const big = Array.from({ length: 22 }, (_, i) =>
      snap({
        id: `big${i}`,
        campaignId: 'c1',
        campaignName: 'Summer Sale',
        windows: { d3: win(0), d7: win(0), d14: win(1000 + i, 5) },
      }),
    );
    const small = snap({
      id: 'small',
      campaignId: 'c3',
      campaignName: 'Zeta',
      windows: { d3: win(0), d7: win(0), d14: win(1, 0) },
    });
    const collapsed = defaultCollapsed(buildCampaignSections([...big, small]));
    expect(collapsed.has('c1')).toBe(false); // holds the top spenders
    expect(collapsed.has('c3')).toBe(true); // nothing in the top 20
  });

  it('pickerCounts always reports the real fleet totals (nothing hidden without a signpost)', () => {
    expect(pickerCounts(buildCampaignSections(fleet()))).toEqual({
      total: 4,
      eligible: 3,
      held: 1,
      mismatch: 0,
    });
  });
});

// The bug the picker could never see: an ad set is ELIGIBLE (its budget is movable) and yet
// completely INERT, because it buys a different event than the portfolio's objective and
// runCycle freezes it on kpi_mismatch. On a live account 60 of 63 eligible ad sets were
// mismatched under a `purchase` objective — 95% of the budget enrolled and frozen solid.
describe('objective awareness', () => {
  const mixed = () => [
    snap({ id: 'buys-purchases', campaignId: 'c1', campaignName: 'C', kpiField: 'purchases' }),
    snap({ id: 'buys-convos', campaignId: 'c1', campaignName: 'C', kpiField: 'conversations' }),
    snap({ id: 'inherits', campaignId: 'c1', campaignName: 'C' }),
  ];

  it('flags exactly the ad sets that buy something else', () => {
    const [section] = buildCampaignSections(mixed(), 'adset', 'purchase');
    expect(section.adsets.filter((i) => i.mismatch).map((i) => i.id)).toEqual(['buys-convos']);
    expect(section.mismatchCount).toBe(1);
  });

  it('an ad set that declares no KPI inherits the objective and can never mismatch', () => {
    const [section] = buildCampaignSections(mixed(), 'adset', 'purchase');
    expect(section.adsets.find((i) => i.id === 'inherits')?.mismatch).toBe(false);
  });

  it('without an objective nothing is flagged — eligibility stays objective-agnostic', () => {
    const [section] = buildCampaignSections(mixed());
    expect(section.adsets.every((i) => !i.mismatch)).toBe(true);
    expect(section.mismatchCount).toBe(0);
  });

  it('counts the objective’s OWN event, not a max-of-everything proxy', () => {
    // 140 spend / 14 purchases = $10 CPA under `purchase`; under `lead` there are no leads at
    // all, so the cost is unknowable rather than borrowed from the purchase column.
    const [asPurchase] = buildCampaignSections(mixed(), 'adset', 'purchase');
    const [asLead] = buildCampaignSections(mixed(), 'adset', 'lead');
    expect(asPurchase.adsets.find((i) => i.id === 'buys-purchases')?.cpa).toBe(10);
    expect(asLead.adsets.find((i) => i.id === 'buys-purchases')?.cpa).toBeNull();
  });

  // A conversations ad set (a messaging account's real KPI) matches only its own objective.
  // Before the metric definitions covered the new objectives, this comparison read
  // `undefined.kpiField` and crashed — so this doubles as the D1 regression lock.
  it('matches a conversations ad set under `conversations` and flags it under `purchase`', () => {
    const convoFleet = () => [
      snap({ id: 'buys-convos', campaignId: 'c1', campaignName: 'C', kpiField: 'conversations' }),
    ];
    const [matched] = buildCampaignSections(convoFleet(), 'adset', 'conversations');
    expect(matched.adsets[0].mismatch).toBe(false);
    const [mismatched] = buildCampaignSections(convoFleet(), 'adset', 'purchase');
    expect(mismatched.adsets[0].mismatch).toBe(true);
  });

  it('never throws through the metric-definition lookup for any of the 11 objectives', () => {
    const snapshots = [
      snap({ id: 'buys-convos', campaignId: 'c1', campaignName: 'C', kpiField: 'conversations' }),
      snap({ id: 'buys-purchases', campaignId: 'c1', campaignName: 'C', kpiField: 'purchases' }),
      snap({ id: 'inherits', campaignId: 'c1', campaignName: 'C' }),
    ];
    expect(OptimizationObjectiveSchema.options).toHaveLength(11);
    for (const objective of OptimizationObjectiveSchema.options) {
      expect(() => buildCampaignSections(snapshots, 'adset', objective)).not.toThrow();
      const def = getOptimizationMetricDefinition(objective);
      expect(def.kpiField.length).toBeGreaterThan(0);
      expect(def.costLabel.length).toBeGreaterThan(0);
    }
  });
});
