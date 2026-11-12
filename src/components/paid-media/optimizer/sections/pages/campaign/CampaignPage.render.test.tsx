import { afterEach, describe, expect, it, mock } from 'bun:test';
import {
  GoogleBreakdownReadSchema,
  GoogleKeywordQualityReadSchema,
  GoogleSignalsReadSchema,
  type GoogleTopCampaigns,
  paidAccountOverviewSchema,
} from '@continuum/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { render } from '@/i18n/__tests__/render';
import { EKATAR, GOALS, HISTORY, WITH_E1 } from '../../google/__fixtures__/googleTab';
import { campaignViews, type HistoryRead } from '../../google/campaignExplorerModel';

// The edge is the boundary: every scope answers its fixture, and each ask is recorded. Shaped by
// the contracts and parsed through them, so a payload the edge could not send fails here.
// EKATAR's keywords and terms are the design page's Oct 31 reads (Vivo 47, 3710693645); their
// spends and the days are test figures, never shown as a real account's.
const WEEK = { since: '2026-10-20', until: '2026-10-26' };
const DAILY = paidAccountOverviewSchema.parse({
  metrics: { spend: 7_000, roas: 0, ctr: 2.8 },
  result_basis: {
    rule: 'google_conversion_rule_v1',
    bucket: 'leads',
    unambiguous: true,
  },
  trends: [
    { date: '2026-10-20', spend: 1200, clicks: 140, conversions: 1 },
    { date: '2026-10-21', spend: 1100, clicks: 130, conversions: 1 },
    { date: '2026-10-22', spend: 1300, clicks: 150, conversions: 2 },
    { date: '2026-10-23', spend: 1250, clicks: 145, conversions: 1 },
    { date: '2026-10-25', spend: 1150, clicks: 135, conversions: 1 },
    { date: '2026-10-26', spend: 1000, clicks: 120, conversions: 1 },
  ],
});
const totals = (spend: number, conversions: number) => ({
  spend,
  impressions: 0,
  clicks: 0,
  conversions,
});
const signals = (google: Record<string, unknown>, blocks: string[]) =>
  GoogleSignalsReadSchema.parse({
    scope: 'google_signals',
    accountId: '3710693645',
    timezone: 'America/Mexico_City',
    fetched_at: '2026-11-01T06:00:00Z',
    blocks,
    signals: {
      account_id: '3710693645',
      currency: 'MXN',
      window: { since: '2026-10-01', until: '2026-10-30' },
      google,
    },
    skipped: {},
    rejected: [],
  });
const keyword = (id: string, text: string, qs: number, spend: number) => ({
  criterion_id: id,
  ad_group_id: 'ag-1',
  campaign_id: EKATAR,
  text,
  match_type: 'PHRASE',
  status: 'ENABLED',
  negative: false,
  quality_score: qs,
  totals: totals(spend, 1),
});
const term = (text: string, campaignId: string, spend: number, conversions: number) => ({
  term: text,
  campaign_id: campaignId,
  ad_group_id: 'ag-1',
  status: 'NONE',
  matched_keyword: null,
  totals: totals(spend, conversions),
});
const KEYWORDS = signals(
  {
    keywords: [
      keyword('k1', 'entrenamiento funcional', 1, 2100),
      keyword('k2', 'gym cerca de mi', 2, 1800),
      { ...keyword('k3', 'vivo 47 gratis', 5, 300), negative: true },
    ],
  },
  ['keywords'],
);
const TERMS = signals(
  {
    search_terms: [
      term('vivo 47', EKATAR, 5639, 651),
      term('vivo 47 naciones unidas', EKATAR, 1554, 178),
      term('vivo 47 valle real', EKATAR, 779, 132),
      term('another campaign term', 'other', 9000, 2),
    ],
  },
  ['search_terms'],
);
const QUALITY = GoogleKeywordQualityReadSchema.parse({
  scope: 'keyword_quality',
  range: { since: '2026-10-20', until: '2026-10-26' },
  total_keywords: 2,
  scored_keywords: 2,
  average_quality_score: 1.5,
  keywords: [
    {
      criterion_id: 'k1',
      keyword: 'entrenamiento funcional',
      match_type: 'PHRASE',
      campaign: 'VIVO 47-EKATAR',
      ad_group: 'Funcional',
      quality_score: 1,
      ad_relevance: 'BELOW_AVERAGE',
      landing_page_experience: 'AVERAGE',
      expected_ctr: 'BELOW_AVERAGE',
      metrics: { spend: 2100, impressions: 0, clicks: 0, conversions: 0 },
    },
    {
      criterion_id: 'k2',
      keyword: 'gym cerca de mi',
      match_type: 'PHRASE',
      campaign: 'VIVO 47-EKATAR',
      ad_group: 'Gym',
      quality_score: 2,
      ad_relevance: 'AVERAGE',
      landing_page_experience: 'AVERAGE',
      expected_ctr: 'AVERAGE',
      metrics: { spend: 1800, impressions: 0, clicks: 0, conversions: 3 },
    },
  ],
  currency: 'MXN',
});
const PMAX = signals(
  {
    search_terms: [],
    keywords: [],
    bid_targets: [],
    asset_groups: [
      {
        asset_group_id: 'g1',
        campaign_id: EKATAR,
        name: 'Leads | Todas',
        ad_strength: 'POOR',
        primary_status: 'ELIGIBLE',
        missing: ['Add 2 more headlines'],
      },
    ],
    pmax_assets: [],
  },
  ['asset_groups', 'pmax_assets'],
);
const NETWORKS = GoogleBreakdownReadSchema.parse({
  scope: 'breakdown',
  rows: [
    {
      id: 'n1',
      dimension: 'network',
      name: 'SEARCH',
      campaign_id: EKATAR,
      metrics: {
        spend: 3000,
        clicks: 0,
        impressions: 0,
        conversions: 6,
        cpa: 500,
        ctr: null,
        cpm: null,
        cvr: null,
      },
    },
    {
      id: 'n2',
      dimension: 'network',
      name: 'YOUTUBE_WATCH',
      campaign_id: EKATAR,
      metrics: {
        spend: 1000,
        clicks: 0,
        impressions: 0,
        conversions: 0,
        cpa: null,
        ctr: null,
        cpm: null,
        cvr: null,
      },
    },
  ],
  result_basis: {
    rule: 'google_conversion_rule_v1',
    bucket: 'leads',
    unambiguous: true,
  },
  range: { since: '2026-10-20', until: '2026-10-26' },
  currency: 'MXN',
});

const asked: Record<string, unknown>[] = [];
mock.module('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    functions: {
      invoke: async (_name: string, options: { body: Record<string, unknown> }) => {
        const body = options.body;
        asked.push(body);
        const blocks = Array.isArray(body.blocks) ? body.blocks.join(',') : '';
        const data =
          body.scope === 'campaign'
            ? DAILY
            : body.scope === 'keyword_quality'
              ? QUALITY
              : body.scope === 'breakdown'
                ? NETWORKS
                : blocks === 'keywords'
                  ? KEYWORDS
                  : blocks === 'search_terms'
                    ? TERMS
                    : blocks === 'asset_groups,pmax_assets'
                      ? PMAX
                      : null;
        return { data, error: null };
      },
    },
  }),
}));
mock.module('next/navigation', () => ({
  usePathname: () => '/scale',
  useSearchParams: () => new URLSearchParams(`googleCampaign=${EKATAR}`),
}));

const { GoogleCampaignDetail, GoogleCampaignDetailBody } = await import(
  '../../google/GoogleCampaignDetail'
);

afterEach(() => {
  cleanup();
  asked.length = 0;
});

const READY: HistoryRead = { status: 'ready', history: HISTORY };
const TARGET = {
  brandId: '61b80f51-709a-4408-9f11-04142a286baa',
  customerId: '3710693645',
};

function campaignOf(read: GoogleTopCampaigns = WITH_E1) {
  const found = campaignViews(read, GOALS, 'MXN').find((row) => row.id === EKATAR);
  if (!found) throw new Error('no EKATAR');
  return found;
}

const asPmax: GoogleTopCampaigns = {
  ...WITH_E1,
  rows: WITH_E1.rows.map((row) =>
    row.id === EKATAR ? { ...row, labels: { channel_type: 'PERFORMANCE_MAX' } } : row,
  ),
};

function body(props: Partial<Parameters<typeof GoogleCampaignDetailBody>[0]> = {}) {
  return render(
    <GoogleCampaignDetailBody
      bidding={null}
      campaign={campaignOf()}
      currency="MXN"
      history={READY}
      window={WEEK}
      {...props}
    />,
  );
}

function sheet(read: GoogleTopCampaigns = WITH_E1) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <GoogleCampaignDetail
        bidding={null}
        campaign={campaignOf(read)}
        campaignId={EKATAR}
        currency="MXN"
        history={READY}
        onClose={() => {}}
        target={TARGET}
        window={WEEK}
      />
    </QueryClientProvider>,
  );
}

describe('the campaign page header', () => {
  it('says what kind of campaign it is, whether it serves, its budget and its portfolio', () => {
    body();
    const header = screen.getByTestId('campaign-header');
    expect(within(header).getByTestId('campaign-type-chip').textContent).toBe('Search');
    expect(within(header).getByTestId('campaign-status').textContent).toBe('Active');
    expect(header.textContent).toContain('$1,179 MXN / day');
    expect(within(header).getByTestId('campaign-portfolio').textContent).toBe(
      'Vivo 47 // Search leads',
    );
    expect(header.textContent).toContain('58% over goal');
  });

  it('writes every tile it draws', () => {
    body();
    const tiles = within(screen.getByTestId('campaign-kpis'));
    expect(tiles.getAllByRole('term').map((term) => term.textContent)).toEqual([
      'Spend',
      'Clicks',
      'CTR',
      'CPC',
      'Conversions',
      'Cost / conv.',
    ]);
    expect(tiles.getAllByRole('definition').map((value) => value.textContent)).toEqual([
      '$36,997 MXN',
      '4,816',
      '2.98%',
      '$7.68 MXN',
      '26',
      '$1,422 MXN',
    ]);
  });

  it('splits the Search auctions with every share written', () => {
    body();
    expect(screen.getByTestId('campaign-auction').textContent).toContain(
      'Shown 42%Lost to budget 28%Lost to rank 30%',
    );
  });

  it('draws no trend and no tabs when its host reads neither', () => {
    body();
    expect(screen.queryByTestId('campaign-trend')).toBeNull();
    expect(screen.queryByTestId('campaign-tabs')).toBeNull();
    // Every figure against the goal is still on the page, behind its disclosure.
    expect(screen.getByTestId('google-campaign-figures')).toBeTruthy();
  });
});

describe('the campaign trend', () => {
  it('draws the cost per conversion against the goal, the dark day and the change on its day', () => {
    body({ daily: { status: 'ready', data: DAILY } });
    const trend = screen.getByTestId('campaign-trend');
    expect(trend.textContent).toContain('Cost per conversion, trailing 7 days');
    expect(screen.getByTestId('campaign-trend-last').textContent).toBe('$1,000 MXN · Oct 26');
    expect(screen.getByTestId('campaign-trend-goal')).toBeTruthy();
    expect(trend.textContent).toContain('goal $900 MXN');
    expect(screen.getByTestId('campaign-trend-dark-days').textContent).toBe('1 day without ads');
    const marks = screen.getAllByTestId('campaign-trend-mark');
    expect(marks.map((mark) => mark.getAttribute('data-actor'))).toEqual(['api']);
    expect(marks[0]?.getAttribute('title')).toBe('Oct 23 · Through the API: Campaign changed');
    expect(screen.getByTestId('campaign-trend-line').getAttribute('stroke')).toBe(
      'var(--board-search)',
    );
  });

  it('holds its place while reading and names a read that failed', () => {
    const view = body({ daily: { status: 'loading' } });
    expect(screen.queryByTestId('campaign-trend')).toBeNull();
    view.unmount();
    body({
      daily: {
        status: 'error',
        message: 'The Google Ads read did not answer.',
      },
    });
    expect(document.body.textContent).toContain(
      "The campaign's days could not be read: The Google Ads read did not answer.",
    );
  });
});

describe('the campaign page in its sheet, with the brand Google customer', () => {
  it("reads the campaign's days and opens a Search campaign on its keywords", async () => {
    sheet();
    await waitFor(() => expect(screen.getByTestId('campaign-trend')).toBeTruthy());
    expect(asked.find((ask) => ask.scope === 'campaign')).toMatchObject({
      accountId: '3710693645',
      campaignId: EKATAR,
      range: { preset: 'custom', since: '2026-10-20', until: '2026-10-26' },
    });
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Keywords',
      'Search terms',
      'Quality Score',
    ]);
    const keywords = within(screen.getByTestId('campaign-tab-keywords'));
    await waitFor(() => expect(keywords.getByTestId('campaign-tab-rows')).toBeTruthy());
    const rows = keywords.getByTestId('campaign-tab-rows').textContent ?? '';
    expect(rows).toContain('entrenamiento funcional · phrase$2,100 MXNQS 1 · 1 conv.');
    expect(rows).toContain('gym cerca de mi · phrase$1,800 MXNQS 2 · 1 conv.');
    // A negative keyword is not one the campaign buys.
    expect(rows).not.toContain('vivo 47 gratis');
  });

  it("lists the campaign's own search terms and its Quality Score, each read once opened", async () => {
    sheet();
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Search terms' })).toBeTruthy());
    expect(asked.some((ask) => ask.scope === 'keyword_quality')).toBe(false);
    fireEvent.click(screen.getByRole('tab', { name: 'Search terms' }));
    const terms = await screen.findByTestId('campaign-tab-terms');
    await waitFor(() => expect(within(terms).getByTestId('campaign-tab-rows')).toBeTruthy());
    const text = within(terms).getByTestId('campaign-tab-rows').textContent ?? '';
    expect(text).toContain('vivo 47$5,639 MXN651 conv.');
    expect(text).not.toContain('another campaign term');

    fireEvent.click(screen.getByRole('tab', { name: 'Quality Score' }));
    await waitFor(() => expect(screen.getByTestId('campaign-quality')).toBeTruthy());
    expect(asked.find((ask) => ask.scope === 'keyword_quality')).toMatchObject({
      campaignId: EKATAR,
    });
    expect(screen.getByTestId('campaign-quality').textContent).toContain(
      '100% of their spend at QS 3 or less',
    );
    expect(screen.getByTestId('campaign-quality').textContent).toContain(
      '$2,100 MXN on 1 keyword at QS 3 or less with no conversion.',
    );
  });

  it('opens Performance Max on its asset groups and the channels it spent on', async () => {
    sheet(asPmax);
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Asset groups' })).toBeTruthy());
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Asset groups',
      'Channels',
    ]);
    const groups = await screen.findByTestId('campaign-asset-groups');
    expect(groups.textContent).toContain('Leads | TodasAd strength Poor');
    expect(groups.textContent).toContain('Add 2 more headlines');
    fireEvent.click(screen.getByRole('tab', { name: 'Channels' }));
    const channels = await screen.findByTestId('campaign-tab-channels');
    await waitFor(() => expect(within(channels).getByTestId('campaign-tab-rows')).toBeTruthy());
    expect(within(channels).getByTestId('campaign-tab-rows').textContent).toContain(
      'Search75% · $3,000 MXN$500 MXN / conv.',
    );
    // A Performance Max campaign still shows where its Search auctions went.
    expect(screen.getByTestId('campaign-auction')).toBeTruthy();
  });
});
