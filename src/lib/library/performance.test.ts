import { afterEach, describe, expect, it } from 'bun:test';
import type { AssetVersionRollup } from '@continuum/contracts';
import {
  fetchAssetPerformance,
  formatCount,
  formatMoney,
  formatMultiple,
  formatRate,
  leadingRollup,
  NOT_MEASURED,
} from './performance';

const rollup = (overrides: Partial<AssetVersionRollup>): AssetVersionRollup => ({
  versionNumber: 1,
  adCount: 1,
  postCount: 0,
  spend: 100,
  impressions: 5000,
  clicks: 100,
  ctr: 0.02,
  purchases: 2,
  leads: 0,
  revenue: 200,
  roas: 2,
  costPerPurchase: 50,
  costPerLead: null,
  organicReach: 0,
  organicInteractions: 0,
  verdictMix: {},
  trustFlags: [],
  ...overrides,
});

describe('performance formatters — null is not zero', () => {
  it('renders an unmeasured metric as an em dash, never as 0', () => {
    expect(formatCount(null)).toBe(NOT_MEASURED);
    expect(formatMoney(null)).toBe(NOT_MEASURED);
    expect(formatRate(null)).toBe(NOT_MEASURED);
    expect(formatMultiple(null)).toBe(NOT_MEASURED);

    expect(formatCount(undefined)).toBe(NOT_MEASURED);
    expect(formatMoney(undefined)).toBe(NOT_MEASURED);
    expect(formatRate(undefined)).toBe(NOT_MEASURED);
    expect(formatMultiple(undefined)).toBe(NOT_MEASURED);

    expect(formatMultiple(Number.NaN)).toBe(NOT_MEASURED);
  });

  it('renders a measured zero as zero — "earned nothing" is an answer', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatMoney(0)).toBe('$0.00');
    expect(formatRate(0)).toBe('0.00%');
    expect(formatMultiple(0)).toBe('0.00×');
  });

  it('formats counts, money, ratios and multiples', () => {
    expect(formatCount(2700)).toBe('2,700');
    expect(formatMoney(1234.5)).toBe('$1,234.50');
    expect(formatRate(0.0123)).toBe('1.23%');
    expect(formatMultiple(2.4142)).toBe('2.41×');
  });
});

describe('leadingRollup', () => {
  it('names the highest measured ROAS as the leader', () => {
    const winner = rollup({ versionNumber: 2, roas: 3.1 });
    const leader = leadingRollup([rollup({ versionNumber: 1, roas: 1.4 }), winner]);
    expect(leader?.versionNumber).toBe(2);
  });

  it('crowns nobody when only one version has a measurable ROAS', () => {
    expect(
      leadingRollup([
        rollup({ versionNumber: 1, roas: 2.2 }),
        rollup({ versionNumber: 2, roas: null }),
      ]),
    ).toBeNull();
  });

  it('crowns nobody when no version has a measurable ROAS', () => {
    expect(
      leadingRollup([
        rollup({ versionNumber: 1, roas: null }),
        rollup({ versionNumber: 2, roas: null }),
      ]),
    ).toBeNull();
  });

  it('crowns nobody on a tie', () => {
    expect(
      leadingRollup([rollup({ versionNumber: 1, roas: 2 }), rollup({ versionNumber: 2, roas: 2 })]),
    ).toBeNull();
  });
});

describe('fetchAssetPerformance', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('requests the window and parses the response against the contract', async () => {
    let requested = '';
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      requested = String(input);
      return new Response(
        JSON.stringify({
          performance: {
            assetId: 'a1',
            window: 'd7',
            deployments: [],
            versionRollups: [],
          },
          usage: { derivedAssets: [] },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;

    const result = await fetchAssetPerformance({
      brandId: 'b1',
      assetId: 'a1',
      window: 'd7',
    });

    expect(requested).toContain('/api/library/performance?');
    expect(requested).toContain('window=d7');
    expect(result.performance.window).toBe('d7');
    expect(result.usage.derivedAssets).toEqual([]);
  });

  it('throws on a failed request rather than returning an empty panel', async () => {
    globalThis.fetch = (async () => new Response('nope', { status: 500 })) as typeof fetch;

    await expect(
      fetchAssetPerformance({ brandId: 'b1', assetId: 'a1', window: 'd30' }),
    ).rejects.toThrow('Performance request failed (500)');
  });
});
