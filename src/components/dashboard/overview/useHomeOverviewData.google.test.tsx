import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { PaidAccountOverview, PaidRankedEntity } from '@continuum/contracts';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import pinkGoogle from './__fixtures__/pink-google-account-overview.json';

// PP-DT-E-home-google-results-absent (deep test 2026-10-31, lane E): the Home's reads hard-coded
// `platform: 'meta'`, so a Google Ads customer was never read and Pink Elephant's Home said
// "Connect a Meta ad account". A Google account is read through the same clients with
// `platform: 'google-ads'`, once per business result Google counts (`resultBucket`).

const pink = pinkGoogle as unknown as {
  leads: PaidAccountOverview;
  purchases: PaidAccountOverview;
};

type OverviewCall = { platform: string; adAccountId: string; resultBucket?: string };
type RankingCall = OverviewCall & { kpi: string; scope: string; direction?: string };

const fetchPaidAccountOverview = mock(async (call: OverviewCall): Promise<PaidAccountOverview> => {
  if (call.platform === 'meta') {
    return {
      currency: 'MXN',
      metrics: { spend: 1000, roas: 0, ctr: 1, conversations: 30, leads: 4 },
      comparison: {
        spend: { current: 1000, previous: 900 },
        conversations: { current: 30, previous: 25 },
        leads: { current: 4, previous: 2 },
      },
    };
  }
  return call.resultBucket === 'purchases' ? pink.purchases : pink.leads;
});

const rankedRow = (id: string, kpi: string, value: number): PaidRankedEntity => ({
  id,
  name: `Campaign ${id}`,
  metrics: { spend: 100 },
  rank: 1,
  kpi: kpi as PaidRankedEntity['kpi'],
  kpi_value: value,
  kpi_unit: 'number',
});

const fetchPaidRanking = mock(async (call: RankingCall): Promise<PaidRankedEntity[]> => {
  if (call.platform === 'meta') return [rankedRow('meta-1', call.kpi, 3)];
  return [rankedRow('google-1', call.kpi, 2)];
});

mock.module('@/lib/paid-media/paid-overview.client', () => ({ fetchPaidAccountOverview }));
mock.module('@/lib/paid-media/paid-ranking.client', () => ({ fetchPaidRanking }));

const { useAccountTotals, useCreativeExtremes, useTopCampaigns } = await import(
  './useHomeOverviewData'
);

const PINK = {
  id: '6619636193',
  name: 'Pink Elephant',
  currency: null,
  platform: 'google_ads',
} as const;
const META = { id: 'act_1', name: 'Vivo 47', currency: 'MXN', platform: 'meta' } as const;

beforeEach(() => {
  fetchPaidAccountOverview.mockClear();
  fetchPaidRanking.mockClear();
});
afterEach(() => cleanup());

describe('the Home reads a Google Ads account', () => {
  it('reads it on Google, once per business result Google counts', async () => {
    const { result } = renderHook(() => useAccountTotals('brand-pink', [PINK], 0));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const calls = fetchPaidAccountOverview.mock.calls.map(([call]) => call);
    expect(calls.map((call) => [call.platform, call.adAccountId, call.resultBucket])).toEqual([
      ['google-ads', '6619636193', 'leads'],
      ['google-ads', '6619636193', 'purchases'],
    ]);
  });

  it("names the money in the read's own currency when the account row has none", async () => {
    const { result } = renderHook(() => useAccountTotals('brand-pink', [PINK], 0));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    if (result.current.status !== 'ready') throw new Error('not ready');
    const [group] = result.current.data.groups;
    expect(group?.currency).toBe('MXN');
    expect(group?.totals.current.leads).toBe(2);
    expect(group?.totals.current.spend).toBeCloseTo(3099.5863, 4);
  });

  it('adds a Meta and a Google account of one currency, Meta keeping its conversations', async () => {
    const { result } = renderHook(() => useAccountTotals('brand-vivo', [META, PINK], 0));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    if (result.current.status !== 'ready') throw new Error('not ready');
    expect(result.current.data.groups).toHaveLength(1);
    const totals = result.current.data.groups[0]?.totals;
    expect(totals?.current.leads).toBe(6);
    expect(totals?.current.conversations).toBe(30);
    expect(totals?.previous.conversations).toBe(25);
    const meta = fetchPaidAccountOverview.mock.calls.find(([call]) => call.platform === 'meta');
    expect(meta?.[0].resultBucket).toBeUndefined();
  });

  it("ranks its campaigns by the goal's business result, beside Meta's", async () => {
    const { result } = renderHook(() => useTopCampaigns('brand-vivo', [META, PINK], 'leads', 0));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const google = fetchPaidRanking.mock.calls.find(([call]) => call.platform === 'google-ads');
    expect(google?.[0]).toMatchObject({
      adAccountId: '6619636193',
      scope: 'top_campaigns',
      kpi: 'conversions',
      resultBucket: 'leads',
    });
    const meta = fetchPaidRanking.mock.calls.find(([call]) => call.platform === 'meta');
    expect(meta?.[0]).toMatchObject({ kpi: 'leads' });
    if (result.current.status !== 'ready') throw new Error('not ready');
    expect(result.current.data.map((row) => [row.id, row.adAccountId])).toEqual([
      ['meta-1', 'act_1'],
      ['google-1', '6619636193'],
    ]);
  });

  it('asks Google nothing for a goal it does not report', async () => {
    const { result } = renderHook(() => useTopCampaigns('brand-pink', [PINK], 'conversations', 0));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(fetchPaidRanking).not.toHaveBeenCalled();
    expect(result.current).toEqual({ status: 'ready', data: [] });
  });

  it('ranks no Google ad for Creative +: a Google ad has no image to show', async () => {
    const { result } = renderHook(() => useCreativeExtremes('brand-pink', [PINK], 'leads', 0));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(fetchPaidRanking).not.toHaveBeenCalled();
  });
});
