// A Google-only portfolio is recorded and described as Google, and a Meta one exactly as before.
//
// The live case (Vivo 47, portfolio e642c737, run 650ed50e, 2026-10-08): two Google campaigns,
// one of which bids for a result the portfolio does not price. Its cycle_items and
// recommendations landed as platform 'meta' — nothing on the item said otherwise — and the
// held campaign read "1 of 2 ad sets … bid for another result" and "Held · different goal —
// This ad set is bidding for …", naming an entity a Google account does not have.

import { describe, expect, test } from 'bun:test';
import type { MultiPlatformSnapshot } from '@continuum/contracts';
import {
  type AdSetSnapshot,
  DEFAULT_CONFIG,
  evaluateSettings,
  freezeLabel,
  type ItemDiagnostics,
  mapMultiPlatformSnapshotToAdSet,
  moveReasonText,
  portfolioConfidence,
  type ReallocationResult,
  runCycle,
} from '../../src';

const window = (spend: number, leads: number) => ({
  spend,
  purchases: 0,
  addToCarts: 0,
  clicks: 100,
  impressions: 5000,
  leads,
});

function googleCampaign(id: string, leadsD14: number, spendD14 = 1400): MultiPlatformSnapshot {
  const ref = {
    platform: 'google_ads' as const,
    level: 'campaign' as const,
    nativeLevel: 'campaign' as const,
    id,
    accountId: '3710693645',
  };
  return {
    platform: 'google_ads',
    level: 'campaign',
    native_level: 'campaign',
    id,
    accountId: '3710693645',
    name: `Vivo 47 ${id}`,
    automation: 'manual',
    budget: { kind: 'daily', minor: 70_000, currency: 'MXN', shared: false, ownerRef: ref },
    bidding: { strategyType: 'MAXIMIZE_CONVERSIONS', systemStatus: 'ENABLED' },
    windows: {
      d3: window(spendD14 * 0.2, Math.round(leadsD14 * 0.2)),
      d7: window(spendD14 * 0.5, Math.round(leadsD14 * 0.5)),
      d14: window(spendD14, leadsD14),
    },
  };
}

const leadsCampaign = (id: string, leadsD14: number, spendD14 = 1400): AdSetSnapshot =>
  mapMultiPlatformSnapshotToAdSet(googleCampaign(id, leadsD14, spendD14), {
    ageDays: 60,
    kpiField: 'leads',
    channelType: 'SEARCH',
  });

/** Vivo 47's shape: campaigns priced on leads — one converting, one spending into nothing —
 *  and one whose goal maps to no portfolio KPI. */
function vivo47(): AdSetSnapshot[] {
  return [
    leadsCampaign('g-leads', 40),
    leadsCampaign('g-zero', 0),
    mapMultiPlatformSnapshotToAdSet(googleCampaign('g-other', 0), {
      ageDays: 60,
      kpiField: null,
      channelType: 'SEARCH',
    }),
  ];
}

function metaAdSet(id: string, leadsD14: number): AdSetSnapshot {
  return {
    id,
    status: 'active',
    currentBudget: 700,
    ageDays: 60,
    kpiField: 'leads',
    windows: {
      d3: window(280, Math.round(leadsD14 * 0.2)),
      d7: window(700, Math.round(leadsD14 * 0.5)),
      d14: window(1400, leadsD14),
    },
  };
}

describe('a Google-only cycle says which platform and entity each row is about', () => {
  const result = runCycle(vivo47(), { objective: 'lead' });

  test('every item carries google_ads, its level and its entity ref', () => {
    expect(result.reallocation.items).toHaveLength(3);
    for (const item of result.reallocation.items) {
      expect(item.platform).toBe('google_ads');
      expect(item.level).toBe('campaign');
      expect(item.entityRef).toEqual({
        platform: 'google_ads',
        level: 'campaign',
        nativeLevel: 'campaign',
        id: item.id,
        accountId: '3710693645',
        name: `Vivo 47 ${item.id}`,
      });
    }
  });

  test('every recommendation carries google_ads, and names the campaign it is about', () => {
    const dead = result.recommendations.find((rec) => rec.adSetId === 'g-zero');
    expect(dead?.trigger).toBe('P3_low_significance');
    for (const rec of result.recommendations) {
      expect(rec.platform).toBe('google_ads');
      if (rec.adSetId.startsWith('g-')) expect(rec.entityRef?.id).toBe(rec.adSetId);
      else expect(rec.entityRef).toBeUndefined();
    }
  });

  test('the mismatch actionable counts campaigns, not ad sets', () => {
    const mismatch = result.confidence.actionables.find((a) => a.code === 'kpi_mismatch');
    expect(mismatch?.message).toStartWith('1 of 3 campaigns (');
    expect(mismatch?.message).toContain('bid for another result');
    for (const actionable of result.confidence.actionables) {
      expect(actionable.message).not.toContain('ad set');
    }
  });

  test('the held campaign is called a campaign in its persisted reason', () => {
    const held = result.reallocation.items.find((item) => item.id === 'g-other');
    expect(held?.freezeReason).toBe('kpi_mismatch');
    const reason = moveReasonText(held?.changeAbs, held);
    expect(reason).toStartWith('Held · different goal — This campaign is bidding for');
    expect(reason).not.toContain('ad set');
  });

  test('no engine reason or actionable in the cycle names an ad set', () => {
    for (const rec of result.recommendations) {
      expect(rec.reason).not.toContain('ad set');
      expect(rec.evidence?.comparator ?? '').not.toContain('ad set');
      expect(rec.evidence?.headline?.label ?? '').not.toContain('ad set');
    }
  });
});

const ITEM: ItemDiagnostics = {
  id: 'x',
  status: 'active',
  currentBudget: 700,
  score3d: 1,
  score7d: 1,
  score14d: 1,
  trajectoryRatio: 1,
  trajectoryState: 'neutral',
  weights: { d3: 0.2, d7: 0.4, d14: 0.4 },
  compositeScore: 1,
  effectiveScore: 1,
  portfolioShare: 0.5,
  rawBudget: 700,
  velocityCapped: 700,
  floor: 100,
  lowerBound: 500,
  upperBound: 900,
  finalBudget: 700,
  changeAbs: 0,
  changePct: 0,
  capBreached: false,
  floorRelaxed: false,
};

const realloc = (snapshots: AdSetSnapshot[]): ReallocationResult => ({
  totalBudget: 1400,
  pool: 1400,
  frozenBudget: 0,
  items: snapshots.map((s) => ({ ...ITEM, id: s.id })),
  allocatedTotal: 1400,
  conserved: true,
  residual: 0,
  feasibility: { sumLowerBounds: 1000, sumUpperBounds: 1800, overflow: false, underflow: false },
  notes: [],
});

/** A leads portfolio: one entity converting, one spending with zero tracked leads. */
const LEADS = { ...DEFAULT_CONFIG, kpiField: 'leads' as const };

describe('a tracking gap names the entity and the tracking of its own platform', () => {
  test('Google: campaigns and Google Ads conversion tracking, never ad sets or the pixel', () => {
    const snapshots = [leadsCampaign('g-a', 40), leadsCampaign('g-b', 0)];
    const gap = evaluateSettings(realloc(snapshots), snapshots, LEADS, { mode: 'balanced' }).find(
      (rec) => rec.trigger === 'S5_tracking_gap',
    );
    expect(gap?.reason).toStartWith('1 campaign spent');
    expect(gap?.reason).toContain('Google Ads conversion tracking is not reporting it');
    expect(gap?.reason).not.toContain('pixel');
    expect(gap?.evidence?.comparator).toEndWith('across 1 delivering campaign');
    expect(gap?.evidence?.headline?.label).toBe('campaign spending untracked');
    expect(gap?.evidence?.title?.comparator ?? '').toContain('1 campaña');

    const tracking = portfolioConfidence(snapshots, LEADS).actionables.find(
      (a) => a.code === 'tracking_gap',
    );
    expect(tracking?.message).toStartWith('1 campaign spent more than a target CPA');
    expect(tracking?.message).toContain('Google Ads conversion tracking is not reporting it.');
  });

  test('Meta: the sentences it always had', () => {
    const snapshots = [metaAdSet('m-a', 40), metaAdSet('m-b', 0)];
    const gap = evaluateSettings(realloc(snapshots), snapshots, LEADS, { mode: 'balanced' }).find(
      (rec) => rec.trigger === 'S5_tracking_gap',
    );
    expect(gap?.reason).toStartWith('1 ad set spent');
    expect(gap?.reason).toContain(
      'If they do convert, the pixel / CAPI is not reporting it — check',
    );
    expect(gap?.evidence?.comparator).toEndWith('across 1 delivering ad set');
    expect(gap?.evidence?.headline?.label).toBe('ad set spending untracked');
    expect(gap?.evidence?.title?.comparator ?? '').toContain('1 conjunto con');

    const tracking = portfolioConfidence(snapshots, LEADS).actionables.find(
      (a) => a.code === 'tracking_gap',
    );
    expect(tracking?.message).toBe(
      '1 ad set spent more than a target CPA over 14 days with no tracked conversions at all. ' +
        'The engine reads that as failure and will defund them; if they do convert, the pixel / ' +
        'CAPI is not reporting it.',
    );
  });
});

describe('a Meta cycle carries no platform identity', () => {
  test('no item and no recommendation carries a platform or an entity ref', () => {
    const result = runCycle([metaAdSet('m1', 40), metaAdSet('m2', 0)], { objective: 'lead' });
    for (const item of result.reallocation.items) {
      expect('platform' in item).toBe(false);
      expect('level' in item).toBe(false);
      expect('entityRef' in item).toBe(false);
    }
    expect(result.recommendations.length).toBeGreaterThan(0);
    for (const rec of result.recommendations) {
      expect('platform' in rec).toBe(false);
      expect('entityRef' in rec).toBe(false);
    }
  });
});

describe('freezeLabel', () => {
  const REASONS = [
    'no_conversions',
    'missing_window',
    'unsupported_budget',
    'lifetime_budget',
    'no_own_budget',
    'no_declared_objective',
    'kpi_mismatch',
    'something_new',
  ];

  test('a Meta entity, an empty one and no entity all read the Meta sentence', () => {
    for (const reason of REASONS) {
      const meta = freezeLabel(reason);
      expect(freezeLabel(reason, { platform: 'meta' })).toEqual(meta);
      expect(freezeLabel(reason, {})).toEqual(meta);
      expect(freezeLabel(reason, null)).toEqual(meta);
    }
    expect(freezeLabel('kpi_mismatch')?.hint).toStartWith(
      'This ad set is bidding for a different result than the portfolio prices',
    );
    expect(freezeLabel('unsupported_budget')?.label).toBe('Held · CBO/lifetime');
  });

  test('a Google campaign and a TikTok ad group are never called an ad set, nor sent to Meta', () => {
    const google = { platform: 'google_ads', level: 'campaign' };
    const tiktok = { platform: 'tiktok_ads', level: 'group' };
    for (const reason of REASONS) {
      for (const entity of [google, tiktok]) {
        const held = freezeLabel(reason, entity);
        expect(held).not.toBeNull();
        expect(`${held?.label} ${held?.hint}`).not.toMatch(/ad set|ad-set|\bMeta\b|CBO/);
      }
    }
    expect(freezeLabel('kpi_mismatch', google)?.hint).toStartWith('This campaign is bidding');
    expect(freezeLabel('kpi_mismatch', tiktok)?.hint).toStartWith('This ad group is bidding');
    expect(freezeLabel('no_declared_objective', google)?.hint).toContain(
      'Set a conversion goal on the campaign in Google Ads.',
    );
    expect(freezeLabel('unsupported_budget', tiktok)?.hint).toContain('TikTok Ads API');
  });
});
