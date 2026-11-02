// The campaign page (G11): one Google campaign read by its type. Its figures as tiles, its cost
// per result day by day against the portfolio goal with what changed on it marked, the auction
// it lost, and the tabs its type opens on (Search: keywords, search terms, Quality Score;
// Performance Max: asset groups and channels; everything else: channels). Pure, so a mark and
// the figure written beside it come from the same numbers, and a figure the reads did not carry
// is a "—" with its reason, never a zero.

import type { GoogleChange, PaidAccountOverview } from '@continuum/contracts';
import { formatCurrency } from '../../../format';
import { BOARD_COLOR } from '../../board/palette';
import {
  type CampaignView,
  changeLine,
  type Figure,
  type HistoryRead,
} from '../../google/campaignExplorerModel';
import { percentLabel } from '../../platformCards/platformCardModel';
import {
  CAMPAIGN_TYPE_LABELS,
  type CampaignTypeKey,
  campaignTypeOf,
  formatConversions,
  MIN_PRICED_RESULTS,
  NO_SINGLE_RESULT,
  ownResultsLabel,
} from '../../platforms/googleAdsOverviewModel';

export type CampaignKind = CampaignTypeKey;

export function campaignKind(channelType: string | null): CampaignKind {
  return campaignTypeOf(channelType ?? undefined) ?? 'other';
}

export function kindLabel(kind: CampaignKind): string {
  return kind === 'other' ? 'Other campaign' : CAMPAIGN_TYPE_LABELS[kind];
}

/** The board's channel colours: Search, Performance Max, YouTube / Demand Gen; the rest mid. */
export const KIND_COLOR: Record<CampaignKind, string> = {
  search: BOARD_COLOR.search,
  pmax: BOARD_COLOR.pmax,
  video: BOARD_COLOR.video,
  display: BOARD_COLOR.mid,
  shopping: BOARD_COLOR.mid,
  other: BOARD_COLOR.mid,
};

// ── The tiles ────────────────────────────────────────────────────────────────────────────────

export type KpiTile = { key: string; label: string; figure: Figure<string> };

const known = (value: string): Figure<string> => ({ value, reason: null });
const missing = (reason: string): Figure<string> => ({ value: null, reason });

const NO_IMPRESSIONS = 'No impressions in the window';
const NO_CLICKS = 'No clicks in the window';

type TileKey = 'spend' | 'clicks' | 'impressions' | 'ctr' | 'cpc' | 'cpm' | 'conversions' | 'cost';

/** The tiles each type leads with: Search is bought by the click, Performance Max by the
 *  conversion, YouTube / Demand Gen by the impression. */
const KIND_TILES: Record<CampaignKind, readonly TileKey[]> = {
  search: ['spend', 'clicks', 'ctr', 'cpc', 'conversions', 'cost'],
  pmax: ['spend', 'conversions', 'cost', 'ctr'],
  video: ['spend', 'impressions', 'cpm', 'conversions'],
  display: ['spend', 'clicks', 'ctr', 'conversions'],
  shopping: ['spend', 'clicks', 'conversions', 'cost'],
  other: ['spend', 'clicks', 'ctr', 'conversions'],
};

function tile(key: TileKey, campaign: CampaignView, currency: string | null): KpiTile {
  const { metrics } = campaign.row;
  switch (key) {
    case 'spend':
      return { key, label: 'Spend', figure: known(formatCurrency(campaign.spend, currency)) };
    case 'clicks':
      return { key, label: 'Clicks', figure: known(metrics.clicks.toLocaleString('en-US')) };
    case 'impressions':
      return {
        key,
        label: 'Impressions',
        figure: known(metrics.impressions.toLocaleString('en-US')),
      };
    case 'ctr':
      return {
        key,
        label: 'CTR',
        figure:
          metrics.impressions > 0
            ? known(`${((metrics.clicks / metrics.impressions) * 100).toFixed(2)}%`)
            : missing(NO_IMPRESSIONS),
      };
    case 'cpc':
      return {
        key,
        label: 'CPC',
        figure:
          metrics.clicks > 0
            ? known(formatCurrency(campaign.spend / metrics.clicks, currency))
            : missing(NO_CLICKS),
      };
    case 'cpm':
      return {
        key,
        label: 'CPM',
        figure:
          metrics.impressions > 0
            ? known(formatCurrency((campaign.spend / metrics.impressions) * 1000, currency))
            : missing(NO_IMPRESSIONS),
      };
    case 'conversions': {
      const apart = campaign.conversions == null ? ownResultsLabel(campaign.byResult) : null;
      return {
        key,
        label: 'Conversions',
        figure:
          campaign.conversions != null
            ? known(formatConversions(campaign.conversions))
            : apart
              ? known(apart)
              : missing(NO_SINGLE_RESULT),
      };
    }
    case 'cost':
      return {
        key,
        label: 'Cost / conv.',
        figure:
          campaign.cost != null
            ? known(formatCurrency(campaign.cost, currency))
            : missing(
                campaign.conversions == null
                  ? NO_SINGLE_RESULT
                  : 'No conversion in the window to price',
              ),
      };
  }
}

export function campaignKpis(campaign: CampaignView, currency: string | null): KpiTile[] {
  return KIND_TILES[campaignKind(campaign.channelType)].map((key) => tile(key, campaign, currency));
}

// ── The trend ────────────────────────────────────────────────────────────────────────────────

/** A day of the trend. `value` is null on a day with nothing to price: a gap in the line. */
export type CampaignDay = { day: string; value: number | null; dark: boolean };

export type CampaignTrend = {
  metric: 'cost_per_conversion' | 'cpc';
  /** "Cost per conversion, trailing 7 days" or "Cost per click". */
  label: string;
  days: CampaignDay[];
  /** The portfolio CPA goal, drawn only under a cost per conversion. */
  goal: number | null;
  last: { day: string; value: number } | null;
  /** Days that spent nothing: the campaign was dark. */
  darkDays: number;
};

/** A daily cost per conversion swings on one conversion more or less; seven days read steady. */
export const TRAILING_DAYS = 7;
const DAY_MS = 86_400_000;

function isoDays(since: string, until: string): string[] {
  const start = Date.parse(`${since}T00:00:00Z`);
  const end = Date.parse(`${until}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
  const days: string[] = [];
  for (let at = start; at <= end; at += DAY_MS) days.push(new Date(at).toISOString().slice(0, 10));
  return days;
}

/**
 * The campaign day by day over `window`. Where conversions are counted it is the cost per
 * conversion over the trailing seven days (priced only from MIN_PRICED_RESULTS conversions on),
 * against the goal; where they are not, the cost per click of the day. A day Google returned no
 * row for spent nothing, and reads dark.
 */
export function campaignTrend(
  read: PaidAccountOverview,
  window: { since: string; until: string },
  goal: number | null,
): CampaignTrend {
  const byDay = new Map((read.trends ?? []).flatMap((row) => (row.date ? [[row.date, row]] : [])));
  const days = isoDays(window.since, window.until).map((day) => {
    const row = byDay.get(day);
    return {
      day,
      spend: row?.spend ?? 0,
      clicks: row?.clicks ?? 0,
      conversions: row ? (row.conversions ?? null) : 0,
    };
  });
  const counted =
    read.result_basis?.unambiguous !== false && days.every((day) => day.conversions != null);
  const converted = days.reduce((sum, day) => sum + (day.conversions ?? 0), 0);
  const byConversion = counted && converted >= MIN_PRICED_RESULTS;
  const points: CampaignDay[] = days.map((day, index) => {
    const dark = day.spend <= 0;
    if (!byConversion) {
      return { day: day.day, value: day.clicks > 0 ? day.spend / day.clicks : null, dark };
    }
    const span = days.slice(Math.max(0, index - TRAILING_DAYS + 1), index + 1);
    const spend = span.reduce((sum, d) => sum + d.spend, 0);
    const conversions = span.reduce((sum, d) => sum + (d.conversions ?? 0), 0);
    return {
      day: day.day,
      value: conversions >= MIN_PRICED_RESULTS ? spend / conversions : null,
      dark,
    };
  });
  const lastPriced = [...points].reverse().find((point) => point.value != null);
  return {
    metric: byConversion ? 'cost_per_conversion' : 'cpc',
    label: byConversion ? `Cost per conversion, trailing ${TRAILING_DAYS} days` : 'Cost per click',
    days: points,
    goal: byConversion && goal != null && goal > 0 ? goal : null,
    last: lastPriced?.value != null ? { day: lastPriced.day, value: lastPriced.value } : null,
    darkDays: points.filter((point) => point.dark).length,
  };
}

// ── What changed on it ───────────────────────────────────────────────────────────────────────

/** Who made a change, by Google's channel: the API is where Continuum's writes land. */
export type ChangeActor = 'api' | 'person' | 'google';

const PERSON_CHANNELS = new Set([
  'GOOGLE_ADS_WEB_CLIENT',
  'GOOGLE_ADS_EDITOR',
  'GOOGLE_ADS_MOBILE_APP',
  'GOOGLE_ADS_BULK_UPLOAD',
]);

export function changeActor(change: Pick<GoogleChange, 'clientType'>): ChangeActor {
  if (change.clientType === 'GOOGLE_ADS_API') return 'api';
  return PERSON_CHANNELS.has(change.clientType) ? 'person' : 'google';
}

export const ACTOR_WORDS: Record<ChangeActor, string> = {
  api: 'Through the API',
  person: 'In Google Ads',
  google: "Google's automation",
};

export const ACTOR_COLOR: Record<ChangeActor, string> = {
  api: BOARD_COLOR.search,
  person: BOARD_COLOR.pmax,
  google: BOARD_COLOR.video,
};

/** The changes of one day by one channel, as one mark on the trend. */
export type ChangeMark = {
  day: string;
  actor: ChangeActor;
  /** "Budget changed", or "Budget changed +2 more". */
  label: string;
  count: number;
};

/** The campaign's changes inside the window, one mark per day and channel, oldest first. */
export function changeMarks(
  history: HistoryRead,
  campaignId: string,
  window: { since: string; until: string },
): ChangeMark[] {
  if (history.status !== 'ready') return [];
  const marks = new Map<string, { day: string; actor: ChangeActor; whats: string[] }>();
  for (const change of history.history.changes) {
    if (change.campaignId !== campaignId) continue;
    const day = change.at.slice(0, 10);
    if (day < window.since || day > window.until) continue;
    const actor = changeActor(change);
    const key = `${day}:${actor}`;
    const mark = marks.get(key) ?? { day, actor, whats: [] };
    mark.whats.push(changeLine(change).what);
    marks.set(key, mark);
  }
  return [...marks.values()]
    .map((mark) => ({
      day: mark.day,
      actor: mark.actor,
      count: mark.whats.length,
      label:
        mark.whats.length > 1
          ? `${mark.whats[mark.whats.length - 1]} +${mark.whats.length - 1} more`
          : (mark.whats[0] ?? ''),
    }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

// ── The auction ──────────────────────────────────────────────────────────────────────────────

export type AuctionSlice = {
  key: 'shown' | 'budget' | 'rank' | 'unread';
  label: string;
  /** Of the auctions the campaign was eligible for, 0–1. */
  share: number;
  color: string;
};

/**
 * Where the campaign's Search auctions went: shown, lost to budget, lost to rank, and what the
 * read does not split. Null when Google reported no impression share for it.
 */
export function auctionSlices(campaign: CampaignView): AuctionSlice[] | null {
  const shown = campaign.impressionShare.value;
  if (shown == null) return null;
  const slices: AuctionSlice[] = [
    { key: 'shown', label: 'Shown', share: shown, color: BOARD_COLOR.search },
  ];
  if (campaign.budgetLost.value != null) {
    slices.push({
      key: 'budget',
      label: 'Lost to budget',
      share: campaign.budgetLost.value,
      color: BOARD_COLOR.pmax,
    });
  }
  if (campaign.rankLost.value != null) {
    slices.push({
      key: 'rank',
      label: 'Lost to rank',
      share: campaign.rankLost.value,
      color: BOARD_COLOR.video,
    });
  }
  const rest = 1 - slices.reduce((sum, slice) => sum + slice.share, 0);
  if (rest > 0.005) {
    slices.push({ key: 'unread', label: 'Not split', share: rest, color: BOARD_COLOR.mid });
  }
  return slices;
}

export function shareText(share: number): string {
  return percentLabel(share);
}

// ── The tabs ─────────────────────────────────────────────────────────────────────────────────

export type CampaignTabKey = 'keywords' | 'terms' | 'quality' | 'groups' | 'channels';

export const TAB_LABEL: Record<CampaignTabKey, string> = {
  keywords: 'Keywords',
  terms: 'Search terms',
  quality: 'Quality Score',
  groups: 'Asset groups',
  channels: 'Channels',
};

/** The tabs a campaign's page opens on, by its type. */
export function campaignTabs(kind: CampaignKind): CampaignTabKey[] {
  switch (kind) {
    case 'search':
      return ['keywords', 'terms', 'quality'];
    case 'pmax':
      return ['groups', 'channels'];
    default:
      return ['channels'];
  }
}

/** About ten rows per tab in a sheet; the rest is counted, not listed. */
export const TAB_ROWS = 10;
