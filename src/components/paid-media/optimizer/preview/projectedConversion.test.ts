import { describe, expect, it } from 'bun:test';
import type { AdSetSnapshot } from '@continuum/contracts';
import type { CampaignSection } from '../picker/campaignGroups';
import { buildCboCampaignSections } from '../picker/campaignGroups';
import { floorClampedAdsetIds } from './convertPreview';
import {
  ASSUMED_MIN_DAILY_BUDGET_MINOR,
  buildProjectedConversion,
  buildProjectedConversions,
  projectedCyclePreviewInput,
} from './projectedConversion';

const ZERO = { spend: 0, purchases: 0, addToCarts: 0, clicks: 0, impressions: 0 };

/** A held CBO ad set: budget lives on the campaign, so the ingest froze it
 *  `unsupported_budget` — exactly what the projection is fed on a real account. */
function heldSnapshot(
  id: string,
  campaignId: string,
  { spend7, kpiField = 'purchases' }: { spend7: number; kpiField?: string },
): AdSetSnapshot {
  return {
    id,
    name: `AdSet ${id}`,
    campaignId,
    campaignName: `Campaign ${campaignId}`,
    kpiField,
    status: 'frozen',
    freeze: true,
    freezeReason: 'unsupported_budget',
    currentBudget: 0,
    ageDays: 30,
    windows: {
      d3: { ...ZERO },
      d7: { ...ZERO, spend: spend7 },
      d14: { ...ZERO, spend: spend7 * 2, purchases: 4 },
    },
  } as unknown as AdSetSnapshot;
}

function section(overrides: Partial<CampaignSection> & { campaignId: string }): CampaignSection {
  return {
    campaignName: 'Campaign c1',
    adsets: [],
    eligibleCount: 0,
    totalCount: 2,
    totalBudget: 300,
    totalSpend14: 0,
    totalEvents14: 0,
    totalAds: 0,
    cpa: null,
    mismatchCount: 0,
    ...overrides,
  };
}

describe('buildProjectedConversion', () => {
  const snapshots = [
    heldSnapshot('a1', 'c1', { spend7: 700 }),
    heldSnapshot('a2', 'c1', { spend7: 350 }),
  ];

  it('projects each held ad set off its own trailing spend and totals the split', () => {
    const projection = buildProjectedConversion(section({ campaignId: 'c1' }), snapshots, {
      currency: 'USD',
    });
    if (!projection) throw new Error('expected a projection');

    // 700 over 7d = 100/day; 350 over 7d = 50/day.
    expect(projection.rows.map((row) => row.newDailyBudget)).toEqual([100, 50]);
    expect(projection.totals).toEqual({
      campaignBudgetToday: 300,
      newDailyTotal: 150,
      adsetCount: 2,
    });
    expect(projection.campaignId).toBe('c1');
    expect(projection.campaignName).toBe('Campaign c1');
  });

  it('produces an engine-scorable fleet: active, unfrozen, budgeted', () => {
    const projection = buildProjectedConversion(section({ campaignId: 'c1' }), snapshots, {
      currency: 'USD',
    });
    if (!projection) throw new Error('expected a projection');

    expect(projection.postConvert).toHaveLength(2);
    expect(projection.postConvert.every((snapshot) => snapshot.status === 'active')).toBe(true);
    expect(projection.postConvert.every((snapshot) => snapshot.freeze === undefined)).toBe(true);
    expect(projection.postConvert.every((snapshot) => snapshot.freezeReason === undefined)).toBe(
      true,
    );
    expect(projection.postConvert.map((snapshot) => snapshot.currentBudget)).toEqual([100, 50]);
  });

  it('scores under the KPI the fleet actually declares, not a guessed purchase default', () => {
    const messaging = [
      heldSnapshot('a1', 'c1', { spend7: 700, kpiField: 'conversations' }),
      heldSnapshot('a2', 'c1', { spend7: 350, kpiField: 'conversations' }),
      heldSnapshot('a3', 'c1', { spend7: 70, kpiField: 'purchases' }),
    ];
    const projection = buildProjectedConversion(section({ campaignId: 'c1' }), messaging, {
      currency: 'USD',
    });
    expect(projection?.objective).toBe('conversations');
  });

  it('counts the ad sets resting on the ASSUMED account minimum rather than on real spend', () => {
    const withDark = [
      heldSnapshot('a1', 'c1', { spend7: 700 }),
      heldSnapshot('a2', 'c1', { spend7: 0 }),
      heldSnapshot('a3', 'c1', { spend7: 0 }),
    ];
    const projection = buildProjectedConversion(section({ campaignId: 'c1' }), withDark, {
      currency: 'USD',
    });
    if (!projection) throw new Error('expected a projection');

    expect(projection.floorAdsetCount).toBe(2);
    // The floor is the ASSUMPTION, not a read value: 100 minor = 1.00 in a 2-decimal currency.
    expect(ASSUMED_MIN_DAILY_BUDGET_MINOR).toBe(100);
    expect(projection.rows.map((row) => row.newDailyBudget)).toEqual([100, 1, 1]);
  });

  it('honors a zero-decimal currency when deciding what the floor clamps', () => {
    // JPY offset is 1, so 700 spend over 7d = 100 minor = 100 major, well clear of the floor.
    const jpy = [
      heldSnapshot('a1', 'c1', { spend7: 700 }),
      heldSnapshot('a2', 'c1', { spend7: 7 }),
    ];
    expect(floorClampedAdsetIds(jpy, { currency: 'JPY', minDailyBudgetMinor: 100 })).toEqual([
      'a2',
    ]);
  });

  it('returns null when the campaign has no held ad sets in the metrics read', () => {
    expect(
      buildProjectedConversion(section({ campaignId: 'ghost' }), snapshots, { currency: 'USD' }),
    ).toBeNull();
  });

  it('ignores ad sets of other campaigns and ad sets held for other reasons', () => {
    const mixed: AdSetSnapshot[] = [
      heldSnapshot('a1', 'c1', { spend7: 700 }),
      heldSnapshot('other', 'c2', { spend7: 700 }),
      {
        ...heldSnapshot('learning', 'c1', { spend7: 700 }),
        freezeReason: 'learning_phase',
      } as AdSetSnapshot,
    ];
    const projection = buildProjectedConversion(section({ campaignId: 'c1' }), mixed, {
      currency: 'USD',
    });
    expect(projection?.rows.map((row) => row.adsetId)).toEqual(['a1']);
  });
});

describe('buildProjectedConversions', () => {
  it('projects every CBO campaign the picker grouped, and only those', () => {
    const fleet: AdSetSnapshot[] = [
      heldSnapshot('a1', 'c1', { spend7: 700 }),
      heldSnapshot('a2', 'c2', { spend7: 350 }),
      // An ABO ad set with its own budget: optimizable already, never a convert target.
      {
        ...heldSnapshot('a3', 'c3', { spend7: 210 }),
        status: 'active',
        freeze: undefined,
        freezeReason: undefined,
        currentBudget: 30,
      } as AdSetSnapshot,
    ];
    const projections = buildProjectedConversions(buildCboCampaignSections(fleet), fleet, {
      currency: 'USD',
    });
    expect(projections.map((projection) => projection.campaignId)).toEqual(['c1', 'c2']);
  });

  it('returns nothing on an account with no CBO campaigns', () => {
    expect(buildProjectedConversions([], [], { currency: 'USD' })).toEqual([]);
  });
});

describe('projectedCyclePreviewInput', () => {
  it('asks the real engine to score the projected fleet at the projected total', () => {
    const snapshots = [
      heldSnapshot('a1', 'c1', { spend7: 700 }),
      heldSnapshot('a2', 'c1', { spend7: 350 }),
    ];
    const projection = buildProjectedConversion(section({ campaignId: 'c1' }), snapshots, {
      currency: 'USD',
    });
    if (!projection) throw new Error('expected a projection');

    const input = projectedCyclePreviewInput(projection, { brandId: 'b1', accountId: 'act_1' });
    expect(input.brandId).toBe('b1');
    expect(input.accountId).toBe('act_1');
    expect(input.objective).toBe('purchase');
    expect(input.mode).toBe('balanced');
    expect(input.total).toBeCloseTo(150, 5);
    expect(input.snapshots).toBe(projection.postConvert);
  });
});
