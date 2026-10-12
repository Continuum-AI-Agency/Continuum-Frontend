// Builders that turn the wave-8 recordings into PlatformSignals (escenarios 31–40): Vivo 47's
// search terms, keywords and bidding (REAL GAQL), Tangassi's PMax asset coverage (REAL GAQL),
// Easy Fit's organic TikTok posts (REAL organic.tiktok_videos) and the TikTok creatives
// (DOC_SHAPED). Every result goes through PlatformSignalsSchema.parse, so a builder that
// drifts from the contract fails here, not in a scenario.

import {
  type MultiPlatformSnapshot,
  MultiPlatformSnapshotSchema,
  type PlatformSignals,
  PlatformSignalsSchema,
} from '@continuum/contracts';
import { googleCampaigns, loadFixture, tiktokAdGroups } from './fixtures';

type Recorded<T> = { _source: { query?: string; recordedAt?: string }; data: T };

const micros = (v: string | undefined): number => Number(v ?? 0) / 1_000_000;

/** The BETWEEN window a recorded GAQL query read. */
function gaqlWindow(file: string): { since: string; until: string } {
  const source = loadFixture(file)._source as Recorded<unknown>['_source'];
  const m = source.query?.match(/BETWEEN '(\d{4}-\d{2}-\d{2})' AND '(\d{4}-\d{2}-\d{2})'/);
  if (!m) throw new Error(`${file} has no BETWEEN window`);
  return { since: m[1]!, until: m[2]! };
}

type Metrics = { costMicros?: string; impressions?: string; clicks?: string; conversions?: number };
const totals = (m: Metrics) => ({
  spend: micros(m.costMicros),
  impressions: Number(m.impressions ?? 0),
  clicks: Number(m.clicks ?? 0),
  conversions: m.conversions ?? 0,
});

type SearchTermRow = {
  campaign: { id: string };
  adGroup: { id: string };
  searchTermView: { searchTerm: string; status: 'ADDED' | 'EXCLUDED' | 'ADDED_EXCLUDED' | 'NONE' };
  segments?: { keyword?: { info?: { text?: string } } };
  metrics: Metrics;
};
type KeywordRow = {
  campaign: { id: string };
  adGroup: { id: string };
  adGroupCriterion: {
    criterionId: string;
    negative?: boolean;
    status: 'ENABLED' | 'PAUSED' | 'REMOVED';
    keyword: { text: string; matchType: 'EXACT' | 'PHRASE' | 'BROAD' };
    qualityInfo?: { qualityScore?: number };
  };
  metrics: Metrics;
};
type BiddingRow = {
  campaign: {
    id: string;
    biddingStrategyType: string;
    biddingStrategySystemStatus?: string;
    maximizeConversions?: { targetCpaMicros?: string };
    targetCpa?: { targetCpaMicros?: string };
  };
  metrics: Metrics & { searchRankLostImpressionShare?: number };
};

const STRATEGY: Record<string, string> = {
  TARGET_CPA: 'target_cpa',
  MAXIMIZE_CONVERSIONS: 'maximize_conversions',
  TARGET_ROAS: 'target_roas',
  MAXIMIZE_CONVERSION_VALUE: 'maximize_conversion_value',
  MANUAL_CPC: 'manual',
};

/** Vivo 47 (3710693645): the REAL 14-day search terms, keywords and bidding. */
export function vivo47Signals(): PlatformSignals {
  const terms = loadFixture<SearchTermRow[]>('google-vivo47-searchTerms14d.json').data;
  const keywords = loadFixture<KeywordRow[]>('google-vivo47-keywordsQs14d.json').data;
  const bidding = loadFixture<BiddingRow[]>('google-vivo47-bidding14d.json').data;
  return PlatformSignalsSchema.parse({
    account_id: '3710693645',
    currency: 'MXN',
    window: gaqlWindow('google-vivo47-searchTerms14d.json'),
    google: {
      search_terms: terms.map((r) => ({
        term: r.searchTermView.searchTerm,
        campaign_id: r.campaign.id,
        ad_group_id: r.adGroup.id,
        status: r.searchTermView.status,
        matched_keyword: r.segments?.keyword?.info?.text ?? null,
        totals: totals(r.metrics),
      })),
      keywords: keywords.map((r) => ({
        criterion_id: r.adGroupCriterion.criterionId,
        ad_group_id: r.adGroup.id,
        campaign_id: r.campaign.id,
        text: r.adGroupCriterion.keyword.text,
        match_type: r.adGroupCriterion.keyword.matchType,
        status: r.adGroupCriterion.status,
        negative: r.adGroupCriterion.negative === true,
        quality_score: r.adGroupCriterion.qualityInfo?.qualityScore ?? null,
        totals: totals(r.metrics),
      })),
      bid_targets: bidding.map((r) => {
        const cpa =
          r.campaign.targetCpa?.targetCpaMicros ?? r.campaign.maximizeConversions?.targetCpaMicros;
        return {
          campaign_id: r.campaign.id,
          strategy: STRATEGY[r.campaign.biddingStrategyType] ?? 'other',
          target_cpa: cpa ? micros(cpa) : null,
          target_roas: null,
          system_status: r.campaign.biddingStrategySystemStatus ?? null,
          // change_event names no bid field in the 30 days read (google-vivo47-bidChanges30d).
          last_changed_at: null,
        };
      }),
      asset_groups: [],
    },
    tiktok: null,
  });
}

/** Vivo 47's campaigns as the cycle reads them, with each campaign's d14 taken from the
 *  same 14-day bidding read the signals come from (spend, conversions, rank-lost share). */
export function vivo47Snapshots(): MultiPlatformSnapshot[] {
  const bidding = new Map(
    loadFixture<BiddingRow[]>('google-vivo47-bidding14d.json').data.map((r) => [r.campaign.id, r]),
  );
  return googleCampaigns('vivo47').map(({ snapshot }) => {
    const row = bidding.get(snapshot.id);
    if (!row) return snapshot;
    const rankLost = row.metrics.searchRankLostImpressionShare;
    return MultiPlatformSnapshotSchema.parse({
      ...snapshot,
      windows: {
        ...snapshot.windows,
        d14: {
          ...snapshot.windows.d14,
          spend: micros(row.metrics.costMicros),
          leads: row.metrics.conversions ?? 0,
          delivery: {
            ...snapshot.windows.d14.delivery,
            ...(rankLost === undefined ? {} : { rankLostImpressionShare: rankLost }),
          },
        },
      },
    });
  });
}

type AssetCoverageRow = {
  campaign: { id: string };
  assetGroup: {
    id: string;
    name: string;
    adStrength?: 'POOR' | 'AVERAGE' | 'GOOD' | 'EXCELLENT' | 'PENDING' | 'UNSPECIFIED';
    primaryStatus?: string;
    assetCoverage?: {
      adStrengthActionItems?: {
        addAssetDetails?: {
          assetFieldType: string;
          assetCount: number;
          videoAspectRatioRequirement?: string;
        };
      }[];
    };
  };
};

const ASSET_WORDS: Record<string, [string, string]> = {
  MARKETING_IMAGE: ['landscape image', 'landscape images'],
  SQUARE_MARKETING_IMAGE: ['square image', 'square images'],
  PORTRAIT_MARKETING_IMAGE: ['vertical image', 'vertical images'],
  LANDSCAPE_LOGO: ['landscape logo', 'landscape logos'],
  LOGO: ['logo', 'logos'],
  YOUTUBE_VIDEO: ['video', 'videos'],
  HEADLINE: ['headline', 'headlines'],
  LONG_HEADLINE: ['long headline', 'long headlines'],
  DESCRIPTION: ['description', 'descriptions'],
  SITELINK: ['sitelink', 'sitelinks'],
};

/** Google's ADD_ASSET action item in a person's words: "3 square images", "1 vertical video". */
export function assetActionWords(d: {
  assetFieldType: string;
  assetCount: number;
  videoAspectRatioRequirement?: string;
}): string {
  const [one, many] = ASSET_WORDS[d.assetFieldType] ?? [
    d.assetFieldType.toLowerCase().replace(/_/g, ' '),
    `${d.assetFieldType.toLowerCase().replace(/_/g, ' ')}s`,
  ];
  const aspect = d.videoAspectRatioRequirement
    ? `${d.videoAspectRatioRequirement.toLowerCase()} `
    : '';
  return `${d.assetCount} ${aspect}${d.assetCount === 1 ? one : many}`;
}

/** Grupo Tangassi (9343596627): the REAL PMax asset-group coverage. */
export function tangassiSignals(): PlatformSignals {
  const rows = loadFixture<AssetCoverageRow[]>('google-tangassi-assetCoverage.json').data;
  return PlatformSignalsSchema.parse({
    account_id: '9343596627',
    currency: 'MXN',
    window: { since: '2026-09-06', until: '2026-10-05' },
    google: {
      search_terms: [],
      keywords: [],
      bid_targets: [],
      asset_groups: rows.map((r) => ({
        asset_group_id: r.assetGroup.id,
        campaign_id: r.campaign.id,
        name: r.assetGroup.name,
        ad_strength: r.assetGroup.adStrength ?? null,
        primary_status: r.assetGroup.primaryStatus ?? null,
        missing: (r.assetGroup.assetCoverage?.adStrengthActionItems ?? [])
          .map((i) => i.addAssetDetails)
          .filter((d): d is NonNullable<typeof d> => !!d)
          .map(assetActionWords),
      })),
    },
    tiktok: null,
  });
}

export function tangassiSnapshots(): MultiPlatformSnapshot[] {
  return googleCampaigns('tangassi').map((c) => c.snapshot);
}

type TikTokList<T> = { data: { list: T[] } };
type AdGetRow = {
  ad_id: string;
  adgroup_id: string;
  ad_name: string;
  identity_type: string;
  tiktok_item_id: string | null;
  dark_post_status: 'ON' | 'OFF';
  create_time: string;
};
type AdDayRow = {
  dimensions: { ad_id: string; stat_time_day: string };
  metrics: Record<
    | 'spend'
    | 'impressions'
    | 'clicks'
    | 'conversion'
    | 'video_watched_2s'
    | 'video_watched_6s'
    | 'frequency',
    string
  >;
};
type AdGroupGetRow = {
  adgroup_id: string;
  optimization_goal: string;
  bid_type: string;
  click_attribution_window: string;
  view_attribution_window: string;
};
type OrganicRow = {
  video_id: string;
  title: string;
  create_time: string;
  view_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
};

const WINDOW_DAYS: Record<string, number> = {
  OFF: 0,
  ONE_DAY: 1,
  SEVEN_DAYS: 7,
  FOURTEEN_DAYS: 14,
  TWENTY_EIGHT_DAYS: 28,
};
const tiktokInstant = (t: string): string => `${t.replace(' ', 'T')}-06:00`;

/** Easy Fit's TikTok: DOC_SHAPED creatives and ad groups, REAL organic posts. */
export function easyFitTikTokSignals(): PlatformSignals {
  const ads = loadFixture<TikTokList<AdGetRow>>('tiktok-ad-get.json').data.data.list;
  const days = loadFixture<TikTokList<AdDayRow>>('tiktok-report-ad-daily-14d.json').data.data.list;
  const groups = loadFixture<TikTokList<AdGroupGetRow>>('tiktok-adgroup-get.json').data.data.list;
  const posts = loadFixture<OrganicRow[]>('tiktok-easyfit-organic-posts.json').data;
  return PlatformSignalsSchema.parse({
    account_id: '7000000000000000001',
    currency: 'MXN',
    window: { since: '2026-09-17', until: '2026-09-30' },
    google: null,
    tiktok: {
      creatives: ads.map((ad) => ({
        ad_id: ad.ad_id,
        ad_group_id: ad.adgroup_id,
        name: ad.ad_name,
        identity_type: ad.identity_type,
        tiktok_item_id: ad.tiktok_item_id,
        dark_post: ad.dark_post_status === 'ON',
        created_at: tiktokInstant(ad.create_time),
        days: days
          .filter((d) => d.dimensions.ad_id === ad.ad_id)
          .map((d) => ({
            date: d.dimensions.stat_time_day.slice(0, 10),
            impressions: Number(d.metrics.impressions),
            clicks: Number(d.metrics.clicks),
            spend: Number(d.metrics.spend),
            results: Number(d.metrics.conversion),
            video_watched_2s: Number(d.metrics.video_watched_2s),
            video_watched_6s: Number(d.metrics.video_watched_6s),
            frequency: Number(d.metrics.frequency) > 0 ? Number(d.metrics.frequency) : null,
          })),
      })),
      ad_groups: groups.map((g) => ({
        ad_group_id: g.adgroup_id,
        optimization_goal: g.optimization_goal,
        click_attribution_window_days: WINDOW_DAYS[g.click_attribution_window] ?? null,
        view_attribution_window_days: WINDOW_DAYS[g.view_attribution_window] ?? null,
        bid_type: g.bid_type,
      })),
      organic_posts: posts.map((p) => ({
        post_id: p.video_id,
        caption: p.title,
        posted_at: p.create_time,
        views: p.view_count,
        engagement_rate:
          p.view_count > 0
            ? Math.min(1, (p.like_count + p.comment_count + p.share_count) / p.view_count)
            : null,
        promoted: false,
      })),
    },
  });
}

export function easyFitTikTokSnapshots(): MultiPlatformSnapshot[] {
  return tiktokAdGroups().map((g) => g.snapshot);
}
