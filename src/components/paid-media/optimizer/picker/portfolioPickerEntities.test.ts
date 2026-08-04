import { describe, expect, it } from 'bun:test';
import type {
  AdSetSnapshot,
  OptimizerAdsetInventoryItem,
  PortfolioAdset,
  WindowMetrics,
} from '@continuum/contracts';
import { buildCampaignSections, sectionEligibleIds } from './campaignGroups';
import { buildPortfolioPickerEntities } from './portfolioPickerEntities';

const ZERO: WindowMetrics = {
  spend: 0,
  purchases: 0,
  addToCarts: 0,
  clicks: 0,
  impressions: 0,
};

const snapshot = (id: string): AdSetSnapshot => ({
  id,
  name: 'Live snapshot name',
  status: 'active',
  currentBudget: 50,
  ageDays: 10,
  campaignId: 'campaign-1',
  campaignName: 'Campaign',
  windows: { d3: ZERO, d7: ZERO, d14: ZERO },
});

const inventory = (
  id: string,
  lifecycle: OptimizerAdsetInventoryItem['lifecycle'],
): OptimizerAdsetInventoryItem => ({
  id,
  name: `${lifecycle} inventory name`,
  campaignId: 'campaign-1',
  campaignName: 'Campaign',
  configuredStatus: lifecycle === 'active' ? 'ACTIVE' : lifecycle.toUpperCase(),
  effectiveStatus: lifecycle === 'active' ? 'ACTIVE' : lifecycle.toUpperCase(),
  lifecycle,
  currentBudget: 25,
  optimizationGoal: null,
  adCount: 0,
});

const enrolled = (id: string, name: string): PortfolioAdset => ({
  adset_id: id,
  adset_name: name,
  active: true,
  last_seen_at: null,
  missing_since: '2026-08-01T00:00:00.000Z',
});

describe('buildPortfolioPickerEntities', () => {
  it('merges live metrics with inactive inventory without manufacturing engine snapshots', () => {
    const entities = buildPortfolioPickerEntities({
      snapshots: [snapshot('active')],
      inventory: [
        inventory('active', 'active'),
        inventory('paused', 'recoverable'),
        inventory('deleted', 'deleted'),
      ],
      enrolled: [enrolled('deleted', 'Stored deleted name'), enrolled('ghost', 'Stored ghost')],
    });

    expect(entities.find((row) => row.id === 'active')).toMatchObject({
      name: 'Live snapshot name',
      optimizable: true,
      canAdd: true,
      providerLifecycle: 'active',
    });
    expect(entities.find((row) => row.id === 'paused')).toMatchObject({
      optimizable: false,
      canAdd: true,
      providerLifecycle: 'recoverable',
      currentBudget: 25,
    });
    expect(entities.find((row) => row.id === 'deleted')).toMatchObject({
      optimizable: false,
      canAdd: false,
      providerLifecycle: 'deleted',
    });
    expect(entities.find((row) => row.id === 'ghost')).toMatchObject({
      name: 'Stored ghost',
      optimizable: false,
      canAdd: false,
      providerLifecycle: 'unknown',
    });
    expect(entities.find((row) => row.id === 'paused')).not.toHaveProperty('status');
  });

  it('keeps recoverable rows individually addable but out of active bulk selection', () => {
    const entities = buildPortfolioPickerEntities({
      snapshots: [snapshot('active')],
      inventory: [inventory('active', 'active'), inventory('paused', 'recoverable')],
      enrolled: [],
    });
    const [section] = buildCampaignSections(entities);

    expect(section.adsets.find((row) => row.id === 'paused')).toMatchObject({
      eligible: false,
      canAdd: true,
      providerLifecycle: 'recoverable',
    });
    expect(sectionEligibleIds(section.adsets)).toEqual(['active']);
  });
});
