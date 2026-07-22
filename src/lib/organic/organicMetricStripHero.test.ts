import { describe, expect, it } from 'bun:test';
import type {
  BrandOrganicSnapshot,
  SnapshotAccountResult,
} from '@/lib/organic/brandOrganicSnapshot';
import {
  restKpisExcludingPlatform,
  selectHeroAccountRow,
} from '@/lib/organic/organicMetricStripHero';
import type { ResolvedOrganicAccount } from '@/lib/organic/resolve-organic-account';

function row(
  platform: SnapshotAccountResult['platform'],
  integrationAccountId: string,
  name: string,
): SnapshotAccountResult {
  return {
    platform,
    integrationAccountId,
    name,
    status: 'ok',
    metrics: {},
    comparison: null,
    trends: [],
    range: { preset: 'last_7d', since: '2026-07-14', until: '2026-07-21' },
  };
}

function snapshot(accounts: SnapshotAccountResult[]): BrandOrganicSnapshot {
  return { accounts, missing: [], loadedAt: '2026-07-21T00:00:00.000Z' };
}

function selection(
  platform: 'instagram' | 'youtube',
  integrationAccountId: string,
): ResolvedOrganicAccount {
  return {
    platform,
    account: { integrationAccountId, name: integrationAccountId, externalAccountId: null },
  };
}

describe('selectHeroAccountRow', () => {
  it('returns the row matching the selected account', () => {
    const rows = [row('instagram', 'ig-1', 'Primary'), row('instagram', 'ig-2', 'Secondary')];
    const result = selectHeroAccountRow(snapshot(rows), selection('instagram', 'ig-2'));
    expect(result?.integrationAccountId).toBe('ig-2');
  });

  it('matches on platform as well as account id', () => {
    const rows = [row('instagram', 'shared', 'IG'), row('youtube', 'shared', 'YT')];
    const result = selectHeroAccountRow(snapshot(rows), selection('youtube', 'shared'));
    expect(result?.platform).toBe('youtube');
  });

  it('returns null when the selected account has no loaded row (caller falls back)', () => {
    const rows = [row('instagram', 'ig-1', 'Primary')];
    expect(selectHeroAccountRow(snapshot(rows), selection('instagram', 'ig-missing'))).toBeNull();
  });

  it('returns null when there is no selection', () => {
    const rows = [row('instagram', 'ig-1', 'Primary')];
    expect(selectHeroAccountRow(snapshot(rows), null)).toBeNull();
  });

  it('returns null when the snapshot has not loaded', () => {
    expect(selectHeroAccountRow(null, selection('instagram', 'ig-1'))).toBeNull();
  });
});

describe('restKpisExcludingPlatform', () => {
  const kpis = [
    { platform: 'instagram' as const, id: 'ig' },
    { platform: 'facebook' as const, id: 'fb' },
    { platform: 'youtube' as const, id: 'yt' },
  ];

  it('drops the hero platform so it is not shown twice', () => {
    const rest = restKpisExcludingPlatform(kpis, 'instagram');
    expect(rest.map((k) => k.platform)).toEqual(['facebook', 'youtube']);
  });

  it('keeps every platform when there is no hero platform', () => {
    expect(restKpisExcludingPlatform(kpis, null)).toHaveLength(3);
  });
});
