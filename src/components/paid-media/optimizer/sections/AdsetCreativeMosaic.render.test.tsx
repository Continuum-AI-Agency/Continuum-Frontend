import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { AdDailyTrend, AdsetAd, PaidAdAngle } from '@continuum/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import * as realData from '../useOptimizerData';

// Mutable hook returns so each test drives the load state without re-mocking the
// process-wide module.
let adsReturn: { data: AdsetAd[]; isLoading: boolean; isError: boolean } = {
  data: [],
  isLoading: false,
  isError: false,
};
let trendsReturn: { data: AdDailyTrend[] } = { data: [] };
let anglesReturn: { data: PaidAdAngle[] } = { data: [] };

mock.module('../useOptimizerData', () => ({
  ...realData,
  useOptimizerAdsetAds: () => adsReturn,
  useOptimizerAdDailyTrends: () => trendsReturn,
  useOptimizerAdAngles: () => anglesReturn,
}));

mock.module('@/hooks/usePaidCreativeRecovery', () => ({
  usePaidCreativeRecovery: () => ({ freshUrlById: {}, recover: () => {} }),
}));

// The hover card and the media thumb are exercised by their own suites; here they
// would only drag next/image + Radix into the mosaic's unit. Stub to their contract.
mock.module('../charts/CreativeHoverCard', () => ({
  CreativeHoverCard: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
mock.module('@/components/chat/media/ChatMedia', () => ({
  ChatMediaThumb: ({ media }: { media: { name?: string; url: string } }) => (
    <span data-testid="thumb" data-url={media.url} />
  ),
}));

const { AdsetCreativeMosaic } = await import('./AdsetCreativeMosaic');

function ad(id: string, name: string): AdsetAd {
  return { id, name, status: 'ACTIVE', thumbnailUrl: `https://cdn.test/${id}.jpg` };
}

function trend(adId: string, spend: number, impressions: number): AdDailyTrend {
  return {
    ad_id: adId,
    ad_name: adId,
    series: [
      {
        date: '2026-07-20',
        spend,
        impressions,
        clicks: 0,
        ctr: 0,
        cpc: 0,
        cpa: null,
        roas: null,
        purchases: 0,
        purchase_value: 0,
      },
    ],
  };
}

afterEach(() => {
  cleanup();
  adsReturn = { data: [], isLoading: false, isError: false };
  trendsReturn = { data: [] };
  anglesReturn = { data: [] };
});

describe('AdsetCreativeMosaic', () => {
  it('prompts to select an ad set when none is focused', () => {
    render(<AdsetCreativeMosaic accountId="act_1" adsetId={null} brandId="b1" currency="USD" />);
    expect(document.body.textContent).toContain('Select an ad set');
  });

  it('shows skeleton tiles while the ads load', () => {
    adsReturn = { data: [], isLoading: true, isError: false };
    const { container } = render(
      <AdsetCreativeMosaic accountId="act_1" adsetId="as-1" brandId="b1" currency="USD" />,
    );
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBe(6);
  });

  it('surfaces a load error', () => {
    adsReturn = { data: [], isLoading: false, isError: true };
    render(<AdsetCreativeMosaic accountId="act_1" adsetId="as-1" brandId="b1" currency="USD" />);
    expect(document.body.textContent).toContain('Couldn’t load the ads');
  });

  it('says so when the ad set has no ads', () => {
    adsReturn = { data: [], isLoading: false, isError: false };
    render(<AdsetCreativeMosaic accountId="act_1" adsetId="as-1" brandId="b1" currency="USD" />);
    expect(document.body.textContent).toContain('No ads in this ad set');
  });

  it('renders one tile per ad with a spend·CPM line derived from the daily trend', () => {
    adsReturn = {
      data: [ad('ad-1', 'Hook A'), ad('ad-2', 'Hook B')],
      isLoading: false,
      isError: false,
    };
    // ad-1: $250 over 25,000 impressions → CPM = 250/25000*1000 = $10.
    trendsReturn = { data: [trend('ad-1', 250, 25000)] };
    anglesReturn = {
      data: [
        {
          ad_id: 'ad-1',
          adset_id: 'as-1',
          angle: 'scarcity',
          themes: [],
          analyzed_from_image: false,
        } as PaidAdAngle,
      ],
    };

    render(<AdsetCreativeMosaic accountId="act_1" adsetId="as-1" brandId="b1" currency="USD" />);

    expect(screen.getByText('Hook A')).toBeTruthy();
    expect(screen.getByText('Hook B')).toBeTruthy();
    expect(screen.getAllByTestId('thumb').length).toBe(2);
    // The derived CPM for ad-1, and its angle chip.
    expect(document.body.textContent).toContain('$250 · CPM $10');
    expect(document.body.textContent).toContain('Scarcity');
  });
});
