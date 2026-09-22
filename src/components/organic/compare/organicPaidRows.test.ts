import { describe, expect, it } from 'bun:test';
import type { BrandOrganicSnapshot, SnapshotAccountResult } from '@/lib/organic/brandOrganicSnapshot';
import { organicPeriod, organicReachByPlatform } from './organicPaidRows';

function account(
  platform: 'instagram' | 'facebook',
  id: string,
  reach: number,
  previous?: number,
): SnapshotAccountResult {
  return {
    platform,
    integrationAccountId: id,
    name: id,
    status: 'ok',
    metrics: { reach } as SnapshotAccountResult['metrics'],
    comparison:
      previous === undefined
        ? null
        : { reach: { current: reach, previous, percentageChange: ((reach - previous) / previous) * 100 } },
    trends: undefined as unknown as SnapshotAccountResult['trends'],
    range: { preset: 'last_7d', since: '2026-09-14', until: '2026-09-20' },
  };
}

const snapshot = (accounts: SnapshotAccountResult[]): BrandOrganicSnapshot => ({
  accounts,
  missing: [],
  loadedAt: '2026-09-21T00:00:00Z',
});

describe('organicReachByPlatform', () => {
  it("reads one account's reach straight through, with its own delta", () => {
    const [row] = organicReachByPlatform(snapshot([account('instagram', 'ig-1', 3200, 1600)]));
    expect(row).toMatchObject({ platform: 'instagram', reach: 3200, deltaPct: 100 });
  });

  it('blends several accounts on one platform the way the Compare view does', () => {
    const rows = organicReachByPlatform(
      snapshot([
        account('facebook', 'page-1', 100, 50),
        account('facebook', 'page-2', 300, 150),
        account('instagram', 'ig-1', 10),
      ]),
    );
    const facebook = rows.find((row) => row.platform === 'facebook');
    expect(facebook?.reach).toBe(400);
    expect(facebook?.deltaPct).toBe(100);
    expect(facebook?.accounts.map((a) => a.reach)).toEqual([100, 300]);
    expect(rows.find((row) => row.platform === 'instagram')?.reach).toBe(10);
  });
});

describe('organicPeriod', () => {
  it("is the organic side's resolved dates, which paid is then asked for", () => {
    expect(organicPeriod(snapshot([account('instagram', 'ig-1', 1)]))).toEqual({
      since: '2026-09-14',
      until: '2026-09-20',
    });
    expect(organicPeriod(snapshot([]))).toBeNull();
  });
});
