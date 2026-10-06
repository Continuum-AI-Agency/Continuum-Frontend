import { afterEach, describe, expect, it } from 'bun:test';
import type { AdAccount } from '@continuum/contracts';
import { cleanup, render } from '@testing-library/react';
import recorded from './__fixtures__/google-vivo47-paid-media-metrics.json';
import { GoogleAdsTabView, GoogleCampaignTypeBreakdown } from './GoogleAdsTab';
import {
  buildGoogleOverview,
  GoogleAccountOverviewSchema,
  GoogleTopCampaignsSchema,
} from './googleAdsOverviewModel';

afterEach(cleanup);

// Vivo 47's real Google Ads rows (September 2026), run through the paid-media-metrics google
// handler's own compute — the payloads the edge returns for account_overview and top_campaigns.
const VIVO_47: AdAccount = {
  platform: 'google_ads',
  account_id: '3710693645',
  name: 'Vivo 47',
  status: null,
  currency: 'MXN',
};
const overview = buildGoogleOverview(
  GoogleAccountOverviewSchema.parse(recorded.account_overview),
  GoogleTopCampaignsSchema.parse(recorded.top_campaigns),
);

const tileText = (tile: Element) => ({
  label: tile.querySelector('span')?.textContent,
  value: tile.querySelector('[data-testid="figure"]')?.textContent,
  sub: tile.querySelector('p.mt-1')?.textContent,
});

describe('GoogleAdsTabView — from a recorded real response', () => {
  it('opens with a sentence naming spend and what each campaign type bought, at what cost', () => {
    const { getByTestId } = render(
      <GoogleAdsTabView state={{ status: 'ready', account: VIVO_47, overview }} />,
    );
    expect(getByTestId('google-headline').textContent).toBe(
      'Google spent 55,205 MXN: Search bought 34 conversions at 1,315 MXN and Display bought 88 conversions at 119 MXN.',
    );
    expect(getByTestId('google-subline').textContent).toBe(
      'Sep 1 – Sep 30·Vivo 47 (3710693645)·attribution: what Google reports',
    );
  });

  it('renders four to six tiles: spend, conversions, then one per campaign type', () => {
    const { getByTestId } = render(
      <GoogleAdsTabView state={{ status: 'ready', account: VIVO_47, overview }} />,
    );
    const tiles = [...getByTestId('google-tiles').children];
    expect(tiles.length).toBeGreaterThanOrEqual(4);
    expect(tiles.length).toBeLessThanOrEqual(6);
    expect(tiles.map(tileText)).toEqual([
      { label: 'Spend', value: '55,205 MXN', sub: 'no prior period to compare' },
      {
        label: 'Conversions',
        value: '122',
        sub: '453 MXN each · as Google attributes them',
      },
      {
        label: 'Search · 3 campaigns',
        value: '34 conv.',
        sub: "1,315 MXN each · 190% above Google's 453 MXN · 81% of spend",
      },
      {
        label: 'Display · 4 campaigns',
        value: '88 conv.',
        sub: "119 MXN each · 74% below Google's 453 MXN · 19% of spend",
      },
    ]);
  });

  it('keeps figures in neutral or state colours, never a platform colour, and draws no chart', () => {
    const { container } = render(
      <GoogleAdsTabView state={{ status: 'ready', account: VIVO_47, overview }} />,
    );
    for (const figure of container.querySelectorAll('[data-testid="figure"]')) {
      expect(figure.className).not.toContain('platform');
    }
    expect(container.querySelector('svg, canvas')).toBeNull();
  });

  it('carries each figure with its provenance in major units — no division by 100', () => {
    const { container } = render(
      <GoogleAdsTabView state={{ status: 'ready', account: VIVO_47, overview }} />,
    );
    const spend = container.querySelector('[data-figure="google.tiles.spend"]');
    expect(spend?.getAttribute('data-figure-raw')).toBe('55205.2636');
    expect(spend?.getAttribute('data-figure-currency')).toBe('MXN');
    expect(spend?.getAttribute('data-figure-window')).toBe('d30');
  });
});

describe('GoogleAdsTabView — when it cannot read', () => {
  it('says there is no Google connection, and offers Connect', () => {
    const { getByTestId, queryByTestId } = render(
      <GoogleAdsTabView state={{ status: 'no-connection' }} />,
    );
    const empty = getByTestId('google-empty-no-connection');
    expect(empty.textContent).toContain('No Google connection');
    expect(empty.querySelector('a')?.textContent).toBe('Connect Google Ads');
    expect(queryByTestId('google-tiles')).toBeNull();
  });

  it('says the login is connected but nothing is granted to this brand', () => {
    const { getByTestId } = render(<GoogleAdsTabView state={{ status: 'no-grant' }} />);
    expect(getByTestId('google-empty-no-grant').textContent).toContain(
      'No Google Ads account granted to this brand',
    );
  });

  it("prints the API's own error and names the account it could not read", () => {
    const { getByTestId, queryAllByTestId } = render(
      <GoogleAdsTabView
        state={{
          status: 'error',
          account: VIVO_47,
          message: 'The caller does not have permission (USER_PERMISSION_DENIED).',
        }}
      />,
    );
    const empty = getByTestId('google-empty-error');
    expect(empty.textContent).toContain('Google Ads could not be read for Vivo 47');
    expect(empty.textContent).toContain('USER_PERMISSION_DENIED');
    expect(queryAllByTestId('figure')).toHaveLength(0);
  });
});

describe('GoogleCampaignTypeBreakdown — under the multi-platform frame', () => {
  it('adds only the split by campaign type, without a second headline', () => {
    const { getByTestId, getAllByTestId, queryByTestId } = render(
      <GoogleCampaignTypeBreakdown state={{ status: 'ready', account: VIVO_47, overview }} />,
    );
    expect(getByTestId('google-breakdown').textContent).toContain('By campaign type');
    expect(getAllByTestId('google-tile-group').length).toBe(Math.min(overview.groups.length, 4));
    expect(queryByTestId('google-headline')).toBeNull();
    expect(queryByTestId('google-tile-spend')).toBeNull();
  });

  it('says why the split is missing when the read fails, and nothing when there is no grant', () => {
    const failed = render(
      <GoogleCampaignTypeBreakdown
        state={{ status: 'error', account: VIVO_47, message: 'quota' }}
      />,
    );
    expect(failed.getByTestId('google-breakdown-error').textContent).toContain('quota');
    failed.unmount();
    const none = render(<GoogleCampaignTypeBreakdown state={{ status: 'no-grant' }} />);
    expect(none.container.textContent).toBe('');
  });
});
