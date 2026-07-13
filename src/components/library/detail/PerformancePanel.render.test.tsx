import { afterEach, describe, expect, it } from 'bun:test';
import type { AssetPerformance, AssetUsage } from '@continuum/contracts';
import { cleanup, render } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

import { PerformanceView } from './PerformancePanel';

afterEach(cleanup);

const EMPTY_USAGE: AssetUsage = { derivedAssets: [] };

// A creative whose measurements are deliberately incomplete: revenue was never
// captured (roas null), the ad was matched by visual similarity, and the version
// it ran as is unknown. Every honesty rule this panel guarantees is visible here.
const UNTRUSTWORTHY: AssetPerformance = {
  assetId: 'asset-1',
  window: 'd30',
  deployments: [
    {
      deploymentId: 'dep-1',
      surface: 'meta_ad',
      versionNumber: null,
      linkMethod: 'visual_embedding',
      confidence: 0.78,
      linkedAt: '2026-07-01T00:00:00Z',
      ad: {
        adId: 'ad-1',
        adName: 'Hero cut — broad',
        campaignName: 'Prospecting',
        adsetName: 'Broad 25-54',
        status: 'ACTIVE',
        objective: 'OUTCOME_SALES',
        verdict: 'kill',
        verdictReason: 'Spend without conversions.',
        verdictFlags: [],
        funnelStage: 'tof',
        hookArchetype: 'problem_agitate',
        window: 'd30',
        metrics: {
          spend: 412.5,
          impressions: 120000,
          clicks: 2700,
          ctr: 0.0225,
          purchases: 0,
          leads: 0,
          revenue: null,
          roas: null,
          costPerPurchase: null,
          costPerLead: null,
          hookRate: 0.31,
          holdRate: null,
        },
      },
    },
  ],
  versionRollups: [
    {
      versionNumber: null,
      adCount: 1,
      postCount: 0,
      spend: 412.5,
      impressions: 120000,
      clicks: 2700,
      ctr: 0.0225,
      purchases: 0,
      leads: 0,
      revenue: 0,
      roas: null,
      costPerPurchase: null,
      costPerLead: null,
      organicReach: 0,
      organicInteractions: 0,
      verdictMix: { kill: 1 },
      trustFlags: ['low_evidence', 'inferred_link', 'unknown_version'],
    },
  ],
};

const OBSERVED_POST: AssetPerformance = {
  assetId: 'asset-2',
  window: 'd30',
  deployments: [
    {
      deploymentId: 'dep-2',
      surface: 'organic_post',
      versionNumber: 2,
      linkMethod: 'declared',
      confidence: 1,
      linkedAt: '2026-07-01T00:00:00Z',
      post: {
        platformPostId: 'ig-1',
        platform: 'instagram',
        postType: 'REELS',
        permalink: 'https://instagram.com/p/abc',
        publishedAt: '2026-07-02T00:00:00Z',
        metrics: {
          reach: 18400,
          views: 22100,
          likes: 610,
          comments: 24,
          shares: 51,
          saved: 88,
          totalInteractions: 773,
          engagementRate: 0.042,
          capturedDate: '2026-07-10',
        },
      },
    },
  ],
  versionRollups: [],
};

function renderView(performance: AssetPerformance | null, usage: AssetUsage | null = EMPTY_USAGE) {
  return render(
    <PerformanceView
      performance={performance}
      usage={usage}
      loading={false}
      error={null}
      window="d30"
      onWindowChange={() => {}}
    />,
  );
}

describe('PerformanceView — display rules', () => {
  it('renders an unmeasured ROAS as an em dash, never as 0.00×', () => {
    const { container } = renderView(UNTRUSTWORTHY);
    expect(container.textContent).toContain('—');
    expect(container.textContent).not.toContain('0.00×');
    // A measured zero still reads as zero: 2,700 clicks, zero purchases.
    expect(container.textContent).toContain('2,700');
    expect(container.textContent).toContain('Purchases');
  });

  it('renders the trust flags next to the numbers they qualify', () => {
    const { getAllByText } = renderView(UNTRUSTWORTHY);
    expect(getAllByText('inferred link').length).toBeGreaterThan(0);
    expect(getAllByText('low evidence').length).toBeGreaterThan(0);
    expect(getAllByText('unknown version').length).toBeGreaterThan(0);
  });

  it('visually distinguishes a deployment linked by visual-embedding guess', () => {
    const { container, getAllByText } = renderView(UNTRUSTWORTHY);
    expect(getAllByText(/matched by similarity/).length).toBeGreaterThan(0);
    expect(container.innerHTML).toContain('border-destructive');
    expect(container.textContent).toContain('78% confident');
  });

  it('carries the Meta attribution note whenever paid figures are shown', () => {
    const { container } = renderView(UNTRUSTWORTHY);
    expect(container.textContent).toContain('Meta');
  });

  it('renders an observed organic post with a link out to the live post', () => {
    const { container, getByText } = renderView(OBSERVED_POST);
    const link = getByText('View post').closest('a');
    expect(link?.getAttribute('href')).toBe('https://instagram.com/p/abc');
    expect(container.textContent).toContain('18,400');
    expect(container.textContent).toContain('4.20%');
    expect(container.textContent).toContain('linked at publish');
    expect(container.innerHTML).not.toContain('border-destructive');
  });

  it('tells the truth when the creative has never run', () => {
    const { container } = renderView({
      assetId: 'asset-3',
      window: 'd30',
      deployments: [],
      versionRollups: [],
    });
    expect(container.textContent).toContain("This creative hasn't run anywhere yet.");
  });

  it('lists the assets generated from this one', () => {
    const { getByText } = renderView(
      { assetId: 'asset-4', window: 'd30', deployments: [], versionRollups: [] },
      {
        derivedAssets: [
          {
            assetId: 'derived-1',
            fileName: 'hero-cut-9x16.mp4',
            title: null,
            kind: 'video',
            source: 'canvas',
            createdAt: '2026-07-03T00:00:00Z',
          },
        ],
      },
    );
    expect(getByText('hero-cut-9x16.mp4')).toBeTruthy();
    expect(getByText('Used in')).toBeTruthy();
  });

  it('renders an honest inline message on error, not an empty panel', () => {
    const { getByText } = render(
      <PerformanceView
        performance={null}
        usage={null}
        loading={false}
        error="Performance request failed (500)"
        window="d30"
        onWindowChange={() => {}}
      />,
    );
    expect(getByText('Performance request failed (500)')).toBeTruthy();
  });
});

// Real shape from a live account: 3,719 "clicks" but only 2,181 that actually left
// for the site, and Meta grading the creative BELOW_AVERAGE_35 while our own verdict
// said `scale`.
const LIVE_AD: AssetPerformance = {
  assetId: 'asset-2',
  window: 'd30',
  deployments: [
    {
      deploymentId: 'd1',
      surface: 'meta_ad',
      versionNumber: 1,
      linkMethod: 'declared',
      confidence: 1,
      linkedAt: '2026-07-11T00:00:00Z',
      ad: {
        adId: 'ad_1',
        adName: 'Vivo47 Video',
        verdict: 'scale',
        verdictFlags: [],
        window: 'd30',
        metrics: {
          spend: 13310.82,
          impressions: 198692,
          clicks: 3719,
          linkClicks: 2181,
          cpc: 3.579,
          costPerLinkClick: 6.103,
          cpm: 66.99,
          frequency: 2.22,
          linkCtr: 0.011,
          qualityRanking: 'BELOW_AVERAGE_35',
          engagementRateRanking: 'AVERAGE',
        },
      },
    },
  ],
  versionRollups: [],
};

describe('the two click numbers, and Meta own grade', () => {
  // Meta's `clicks` counts likes, comments and shares. Showing only it — and only
  // its CPC — understates the cost of an actual visit by ~70% and flatters an ad
  // nobody ever visited from. Both numbers must be on screen.
  it('shows the cost of a click AND the cost of a visit', () => {
    const { container } = render(<PerformanceView performance={LIVE_AD} usage={EMPTY_USAGE} />);
    expect(container.textContent).toContain('3,719');
    expect(container.textContent).toContain('2,181');
    expect(container.textContent).toContain('$3.58');
    expect(container.textContent).toContain('$6.10');
  });

  // Meta can disagree with our verdict — cheap per lead AND a weak creative in the
  // auction. Making that disagreement visible is the whole point of showing it.
  it('surfaces Meta ranking and marks a below-average creative', () => {
    const { container } = render(<PerformanceView performance={LIVE_AD} usage={EMPTY_USAGE} />);
    expect(container.textContent).toContain('Meta ranks this creative');
    expect(container.textContent).toContain('below average 35');
    expect(container.querySelector('.text-destructive')).toBeTruthy();
  });

  it('omits the ranking row entirely when Meta reported none', () => {
    const noRanking: AssetPerformance = {
      ...LIVE_AD,
      deployments: [
        {
          ...LIVE_AD.deployments[0],
          ad: {
            ...LIVE_AD.deployments[0].ad!,
            metrics: { ...LIVE_AD.deployments[0].ad!.metrics, qualityRanking: null, engagementRateRanking: null },
          },
        },
      ],
    };
    const { container } = render(<PerformanceView performance={noRanking} usage={EMPTY_USAGE} />);
    expect(container.textContent).not.toContain('Meta ranks this creative');
  });
});
