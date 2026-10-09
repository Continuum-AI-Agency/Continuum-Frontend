import { afterEach, describe, expect, it, mock } from 'bun:test';
import type { PaidCreativeVerdict } from '@continuum/contracts';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

(globalThis as unknown as { window: { SyntaxError: typeof SyntaxError } }).window.SyntaxError =
  SyntaxError;

import type { AdsetAngleRow } from '@/components/paid-media/optimizer/charts/angleStanding';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CreativeInsightsView, type CreativeInsightsViewProps } from './CreativeInsightsView';
import type { AccountAngleRow } from './creativeInsightsModel';

afterEach(cleanup);

const ANGLE_ROWS: AccountAngleRow[] = [
  {
    angleId: 'social_proof_peer',
    label: 'Proof by someone like you',
    exampleAdName: 'Testimonial Ana',
    ads: 6,
    spend: 300,
    spendShare: 0.24,
    comparedAds: 6,
    winners: 5,
    winRate: 5 / 6,
    adsetsCompared: 2,
    adsetsLosing: 0,
    verdict: 'double_down',
  },
  {
    angleId: 'offer_discount',
    label: 'Discount offer',
    exampleAdName: null,
    ads: 7,
    spend: 900,
    spendShare: 0.72,
    comparedAds: 7,
    winners: 2,
    winRate: 2 / 7,
    adsetsCompared: 2,
    adsetsLosing: 2,
    verdict: 'behind',
  },
  {
    angleId: 'mechanism_how_it_works',
    label: 'How it works',
    exampleAdName: null,
    ads: 2,
    spend: 50,
    spendShare: 0.04,
    comparedAds: 0,
    winners: 0,
    winRate: null,
    adsetsCompared: 0,
    adsetsLosing: 0,
    verdict: 'insufficient',
  },
];

const NEXT_ROWS: AdsetAngleRow[] = [
  {
    adsetId: 'A1',
    adsetName: 'Monterrey Centro',
    currentAngle: {
      value: 'offer_discount',
      winRate: 0.25,
      eligibleAds: 4,
      spendShare: 0.75,
      spend: 600,
    },
    recommendedAngle: {
      value: 'social_proof_peer',
      winRate: 0.75,
      eligibleAds: 4,
      spendShare: 0.25,
      spend: 200,
    },
    verdict: 'double_down',
    action: 'Build the next ads around "Proof by someone like you".',
    confidence: 'proven',
    adsetMedianCpa: 61,
    kpi: 'leads',
  },
];

function verdict(over: Partial<PaidCreativeVerdict> & { adId: string }): PaidCreativeVerdict {
  return {
    adsetId: 'A1',
    campaignId: null,
    adName: null,
    funnelStage: 'tof',
    verdict: 'scale',
    reason: 'reason',
    flags: [],
    spend: 100,
    cpa: 58.2,
    cpaVsCohortMedian: null,
    window: 'd30',
    optimizerRecommendationId: null,
    thumbnailUrl: null,
    permalinkUrl: null,
    ...over,
  };
}

function props(over: Partial<CreativeInsightsViewProps> = {}): CreativeInsightsViewProps {
  return {
    lookback: 'd7',
    onLookbackChange: () => {},
    funnel: 'all',
    onFunnelChange: () => {},
    scope: 'account',
    anglesLoading: false,
    anglesError: false,
    angleRows: ANGLE_ROWS,
    neverTested: [
      { angleId: 'risk_reversal_trial', label: 'Try before you commit' },
      { angleId: 'convenience_time', label: 'Saves time' },
    ],
    nextRows: NEXT_ROWS,
    read: [
      '“Proof by someone like you” wins most often.',
      '“Discount offer” carries the most spend.',
    ],
    currency: 'MXN',
    ads: {
      status: 'ready',
      verdictsByKind: {
        scale: [verdict({ adId: 'ad-1', adName: 'Testimonial Ana', cpa: 58.2 })],
        iterate: [],
        kill: [verdict({ adId: 'ad-2', adName: 'Special price', verdict: 'kill', cpa: 142 })],
      },
      synopsis: null,
      freshUrlById: {},
      onRecover: () => {},
      angleLabelByAd: new Map([['ad-1', 'Proof by someone like you']]),
    },
    ...over,
  };
}

function renderView(over: Partial<CreativeInsightsViewProps> = {}) {
  return render(
    <TooltipProvider>
      <CreativeInsightsView {...props(over)} />
    </TooltipProvider>,
  );
}

describe('CreativeInsightsView', () => {
  it('renders the header with both segmented controls', () => {
    renderView();
    expect(screen.getByRole('heading', { name: 'Creative Insights' })).toBeTruthy();
    expect(screen.getByRole('tablist', { name: 'Window' })).toBeTruthy();
    expect(screen.getByRole('tablist', { name: 'Funnel stage' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Bottom' })).toBeTruthy();
  });

  it('switches the window and the funnel through their callbacks', () => {
    const onLookbackChange = mock((_value: string) => {});
    const onFunnelChange = mock((_value: string) => {});
    renderView({ onLookbackChange, onFunnelChange });
    fireEvent.click(screen.getByRole('tab', { name: '30 days' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Mid' }));
    expect(onLookbackChange).toHaveBeenCalledWith('d30');
    expect(onFunnelChange).toHaveBeenCalledWith('mof');
  });

  it('labels the composed read honestly, never as Jaina', () => {
    renderView();
    const read = screen.getByTestId('creative-insights-read');
    expect(read.textContent).toContain("This week's read");
    expect(read.textContent).toContain('15 ads with enough delivery');
    expect(read.textContent).not.toContain('Jaina');
    expect(within(read).getByText('“Discount offer” carries the most spend.')).toBeTruthy();
  });

  it('renders no read at all when nothing was computable', () => {
    renderView({ read: [] });
    expect(screen.queryByTestId('creative-insights-read')).toBeNull();
  });

  it('renders one angle row per angle with its figures and verdict', () => {
    renderView();
    const rows = screen.getAllByTestId('creative-insights-angle-row');
    expect(rows).toHaveLength(3);
    const first = rows[0].textContent ?? '';
    expect(first).toContain('Proof by someone like you');
    expect(first).toContain('Testimonial Ana');
    expect(first).toContain('24%');
    expect(first).toContain('83%');
    expect(first).toContain('5/6');
    expect(first).toContain('Double down');
    expect(rows[1].textContent).toContain('Losing in its ad sets');
    expect(rows[2].textContent).toContain('Not enough ads');
    expect(rows[2].textContent).toContain('—');
  });

  it('says plainly that cost per result by angle is not available', () => {
    renderView();
    expect(screen.getByTestId('creative-insights-angles').textContent).toContain(
      'Cost per result by angle is not shown',
    );
  });

  it('lists the angles never tested in this account', () => {
    renderView();
    const never = screen.getByTestId('creative-insights-never-tested');
    expect(never.textContent).toContain('Never tested in this account');
    expect(never.textContent).toContain('Try before you commit');
    expect(never.textContent).toContain('Saves time');
  });

  it('notes the brand-wide fallback and the funnel caveat', () => {
    renderView({ scope: 'brand', funnel: 'tof' });
    const angles = screen.getByTestId('creative-insights-angles').textContent ?? '';
    expect(angles).toContain('every ad account on this brand');
    expect(angles).toContain('angles cover every funnel stage');
  });

  it('renders the empty angle state for the selected window', () => {
    renderView({ angleRows: [], neverTested: [], lookback: 'd30' });
    expect(screen.getByTestId('creative-insights-angles').textContent).toContain(
      'enough delivery in the last 30 days',
    );
  });

  it('shows the next angle per ad set: now, arrow, recommended, action', () => {
    renderView();
    const next = screen.getByTestId('creative-insights-next');
    const row = within(next).getByTestId('adset-angle-row');
    expect(row.textContent).toContain('Monterrey Centro');
    expect(row.textContent).toContain('now: Discount offer');
    expect(row.textContent).toContain('Proof by someone like you');
    expect(row.textContent).toContain('Build the next ads around');
    // The ad set's median cost is in the account currency.
    expect(row.textContent).toContain('61.00 MXN');
  });

  it('renders Scale, Iterate and Kill in that order with the ad angle and account currency', () => {
    renderView();
    const ads = screen.getByTestId('creative-insights-ads');
    const headings = within(ads)
      .getAllByRole('heading', { level: 4 })
      .map((heading) => heading.textContent);
    expect(headings).toEqual(['scale · 1', 'iterate · 0', 'kill · 1']);
    const scale = within(ads).getByTestId('verdict-column-scale');
    expect(scale.textContent).toContain('Testimonial Ana');
    expect(scale.textContent).toContain('Proof by someone like you');
    expect(scale.textContent).toContain('58.20 MXN');
    expect(scale.textContent).not.toContain('$');
    expect(within(ads).getByTestId('verdict-column-kill').textContent).toContain('142 MXN');
    expect(within(ads).getByTestId('verdict-column-iterate').textContent).toContain(
      'None right now.',
    );
  });

  it('renders the ads states before the report is ready', () => {
    renderView({ ads: { status: 'assembling' } });
    expect(screen.getByTestId('creative-insights-ads').textContent).toContain(
      'verdicts appear after the first sync completes',
    );
  });

  it('holds the angle sections while the reads load', () => {
    renderView({ anglesLoading: true });
    expect(screen.queryByTestId('creative-insights-read')).toBeNull();
    expect(screen.getByText('Loading angles…')).toBeTruthy();
    expect(screen.getByText('Loading ad sets…')).toBeTruthy();
  });
});
