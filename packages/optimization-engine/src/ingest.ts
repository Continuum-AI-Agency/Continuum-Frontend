// ---------------------------------------------------------------------------
// Ingest mapping — Meta Ads Manager / Marketing API column names to the
// engine's WindowMetrics fields. The engine never sees Meta's column names;
// callers map a raw export row to WindowMetrics at the boundary.
// ---------------------------------------------------------------------------

import type {
  AdSetSnapshot,
  CreativeAdSeries,
  RetentionMetrics,
  RetentionRates,
  WindowMetrics,
} from './types';

/** A raw row from a Meta export / API response, keyed by Meta's field names. */
export type MetaMetricRow = Record<string, number | string | null | undefined>;

/** Meta export / API field name -> WindowMetrics field. */
export const META_FIELD_MAP: Record<string, keyof WindowMetrics> = {
  'Amount spent': 'spend',
  Purchases: 'purchases',
  Leads: 'leads',
  'App installs': 'appInstalls',
  'Checkouts initiated': 'signups',
  'Landing page views': 'landingPageViews',
  'Adds to cart': 'addToCarts',
  'Link clicks': 'clicks',
  Impressions: 'impressions',
  Reach: 'reach',
};

const toNumber = (value: number | string | null | undefined): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    // Meta exports money/counts with thousands separators and currency symbols.
    const parsed = Number(value.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

/**
 * Map one Meta export / API row to WindowMetrics. Unmapped columns are ignored;
 * the required base fields default to 0 so a partial row is always valid.
 */
export function mapMetaRowToWindowMetrics(row: MetaMetricRow): WindowMetrics {
  const metrics: WindowMetrics = {
    spend: 0,
    purchases: 0,
    addToCarts: 0,
    clicks: 0,
    impressions: 0,
  };
  for (const [metaField, target] of Object.entries(META_FIELD_MAP)) {
    if (row[metaField] !== undefined) {
      metrics[target] = toNumber(row[metaField]);
    }
  }
  return metrics;
}

// ---------------------------------------------------------------------------
// AD-level daily rows -> WindowMetrics.
//
// `mapMetaRowToWindowMetrics` above keys off Meta's EXPORT column names ("Amount spent").
// The ad-attribution path speaks a different dialect: `paid_media.ad_breakdown_daily` rows
// carry spend/impressions/clicks as numbers and every conversion inside a flat
// `actions` map keyed by Meta `action_type`. Same destination, different vocabulary.
//
// The buckets below MIRROR supabase/functions/paid-media-metrics/meta/snapshot-shared.ts,
// which is the same taxonomy the AD-SET snapshots are built from. It is duplicated rather
// than imported for the reason that file already states: the edge function is a Deno
// deployment and cannot resolve workspace packages. This is the workspace-side copy, and
// the two must move together — a bucket added there and not here means an ad set scores a
// conversion its own creatives do not.
// ---------------------------------------------------------------------------

const ADD_TO_CART_ACTIONS = [
  'add_to_cart',
  'omni_add_to_cart',
  'offsite_conversion.fb_pixel_add_to_cart',
];
const LEAD_ACTIONS = [
  'lead',
  'leadgen_grouped',
  'offsite_conversion.fb_pixel_lead',
  'onsite_conversion.lead_grouped',
];
const APP_INSTALL_ACTIONS = ['app_install', 'omni_app_install', 'mobile_app_install'];
const SIGNUP_ACTIONS = [
  'complete_registration',
  'omni_complete_registration',
  'offsite_conversion.fb_pixel_complete_registration',
];
const LANDING_PAGE_VIEW_ACTIONS = ['landing_page_view', 'omni_landing_page_view'];
const LINK_CLICK_ACTIONS = ['link_click'];
/** Only the canonical "conversation started". Summing replied/first_reply alongside it
 *  would multiply one messaging thread into several. */
const CONVERSATION_ACTIONS = ['onsite_conversion.messaging_conversation_started_7d'];
/** `page_engagement` is a near-duplicate superset of `post_engagement`; counting both
 *  double-counts. */
const POST_ENGAGEMENT_ACTIONS = ['post_engagement'];

/** `omni_purchase` is Meta's DEDUP aggregate across pixel/app/web and is authoritative when
 *  present; only when it is absent do the component buckets get summed. A blanket /purchase/
 *  match would count omni AND its parts. Custom conversions
 *  (offsite_conversion.custom.<id>) are account-specific and are deliberately not counted. */
const PURCHASE_OMNI = 'omni_purchase';
const PURCHASE_COMPONENT_ACTIONS = [
  'purchase',
  'offsite_conversion.fb_pixel_purchase',
  'onsite_web_purchase',
  'web_in_store_purchase',
];

/** One day of one AD, as `paid_media.ad_breakdown_daily` stores it. Structural on purpose:
 *  the engine stays dependency-free and does not import the contracts row type. */
export type AdDailyRow = {
  spend: number;
  impressions: number;
  clicks: number;
  link_clicks: number;
  actions: Record<string, number>;
  video_thruplays?: number | null;
  /** Quartile view counts. Meta returns these top-level, never inside actions[].
   *  They are persisted by paid_media_upsert_ad_breakdown_daily and were, until now,
   *  fetched every cycle and dropped at this exact boundary. */
  video_p25?: number | null;
  video_p50?: number | null;
  video_p75?: number | null;
};

const sumActions = (actions: Record<string, number>, keys: readonly string[]): number =>
  keys.reduce((total, key) => total + (actions[key] ?? 0), 0);

/** Map one ad-day to WindowMetrics. Absent buckets stay 0 — an action Meta did not report
 *  is an action that did not happen, unlike an absent SERIES, which is unknown. */
export function mapAdDailyRowToWindowMetrics(row: AdDailyRow): WindowMetrics {
  const actions = row.actions ?? {};
  const omni = actions[PURCHASE_OMNI];
  return {
    spend: row.spend ?? 0,
    purchases: omni != null ? omni : sumActions(actions, PURCHASE_COMPONENT_ACTIONS),
    addToCarts: sumActions(actions, ADD_TO_CART_ACTIONS),
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    leads: sumActions(actions, LEAD_ACTIONS),
    appInstalls: sumActions(actions, APP_INSTALL_ACTIONS),
    signups: sumActions(actions, SIGNUP_ACTIONS),
    landingPageViews: sumActions(actions, LANDING_PAGE_VIEW_ACTIONS),
    conversations: sumActions(actions, CONVERSATION_ACTIONS),
    // The row's own column is authoritative; `link_click` in actions[] is the fallback.
    linkClicks: row.link_clicks ?? sumActions(actions, LINK_CLICK_ACTIONS),
    // THRUPLAY is never inside actions[] — Meta returns it in its own top-level field.
    thruplays: row.video_thruplays ?? 0,
    postEngagement: sumActions(actions, POST_ENGAGEMENT_ACTIONS),
  };
}

/** Add two WindowMetrics. Used to roll a run of ad-days into a trailing window. */
export function addWindowMetrics(a: WindowMetrics, b: WindowMetrics): WindowMetrics {
  return {
    spend: a.spend + b.spend,
    purchases: a.purchases + b.purchases,
    addToCarts: a.addToCarts + b.addToCarts,
    clicks: a.clicks + b.clicks,
    impressions: a.impressions + b.impressions,
    leads: (a.leads ?? 0) + (b.leads ?? 0),
    appInstalls: (a.appInstalls ?? 0) + (b.appInstalls ?? 0),
    signups: (a.signups ?? 0) + (b.signups ?? 0),
    landingPageViews: (a.landingPageViews ?? 0) + (b.landingPageViews ?? 0),
    reach: (a.reach ?? 0) + (b.reach ?? 0),
    conversations: (a.conversations ?? 0) + (b.conversations ?? 0),
    linkClicks: (a.linkClicks ?? 0) + (b.linkClicks ?? 0),
    thruplays: (a.thruplays ?? 0) + (b.thruplays ?? 0),
    postEngagement: (a.postEngagement ?? 0) + (b.postEngagement ?? 0),
  };
}

/** Map one ad-day to its retention counts. Absent quartiles stay 0; an ad that ran no
 *  video reports nothing, which `foldRetention` turns into "no retention" rather than
 *  a curve of zeroes that would read as "nobody watched". */
export function mapAdDailyRowToRetention(row: AdDailyRow): RetentionMetrics {
  return {
    impressions: row.impressions ?? 0,
    videoP25: row.video_p25 ?? 0,
    videoP50: row.video_p50 ?? 0,
    videoP75: row.video_p75 ?? 0,
    thruplays: row.video_thruplays ?? 0,
  };
}

/** Add two RetentionMetrics. Counts are summable; the RATES are not, which is why
 *  retentionRates() is derived from a summed window and never averaged per-day. */
export function addRetentionMetrics(a: RetentionMetrics, b: RetentionMetrics): RetentionMetrics {
  return {
    impressions: a.impressions + b.impressions,
    videoP25: a.videoP25 + b.videoP25,
    videoP50: a.videoP50 + b.videoP50,
    videoP75: a.videoP75 + b.videoP75,
    thruplays: a.thruplays + b.thruplays,
  };
}

/** Derive the three actionable ratios. A zero denominator yields null — unknown,
 *  never zero: an ad with no impressions has an UNKNOWN hook, not a bad one. */
export function retentionRates(m: RetentionMetrics): RetentionRates {
  return {
    hook: m.impressions > 0 ? m.videoP25 / m.impressions : null,
    hold: m.videoP25 > 0 ? m.videoP50 / m.videoP25 : null,
    finish: m.videoP50 > 0 ? m.videoP75 / m.videoP50 : null,
  };
}

/** One ad-day with its identity — a `paid_media.ad_breakdown_daily` row, structurally. */
export type AdAttributionDay = AdDailyRow & {
  ad_id: string;
  adset_id: string;
  date: string;
  ad_name?: string | null;
};

/** Trailing window sizes, matching AdSetSnapshot.windows (d3 ⊆ d7 ⊆ d14). */
const CREATIVE_WINDOW_DAYS = { d3: 3, d7: 7, d14: 14 } as const;

const ZERO_WINDOW: WindowMetrics = {
  spend: 0,
  purchases: 0,
  addToCarts: 0,
  clicks: 0,
  impressions: 0,
};

const ZERO_RETENTION: RetentionMetrics = {
  impressions: 0,
  videoP25: 0,
  videoP50: 0,
  videoP75: 0,
  thruplays: 0,
};

/**
 * Roll a run of ad-days into d3/d7/d14.
 *
 * The window is the N most recent DISTINCT dates present, not a date-arithmetic range off
 * an as-of. Meta backfills and occasionally skips a day; counting dates makes a gap shrink
 * the window's coverage rather than silently zero out a third of it, and it needs no
 * timezone reasoning about what "3 days ago" means for an account reporting in its own.
 */
function rollAdWindows(
  days: Array<{ date: string; metrics: WindowMetrics }>,
): CreativeAdSeries['windows'] {
  const ordered = [...days].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const take = (n: number): WindowMetrics =>
    ordered.slice(0, n).reduce((acc, d) => addWindowMetrics(acc, d.metrics), ZERO_WINDOW);
  return {
    d3: take(CREATIVE_WINDOW_DAYS.d3),
    d7: take(CREATIVE_WINDOW_DAYS.d7),
    d14: take(CREATIVE_WINDOW_DAYS.d14),
  };
}

/** Same trailing-window fold as rollAdWindows, over retention counts.
 *  Returns undefined when the ad reported no quartile views at all across every day —
 *  which is what a static/carousel ad looks like, and must stay UNKNOWN rather than
 *  becoming a curve of zeroes that reads as "watched by nobody". */
function rollAdRetention(
  days: Array<{ date: string; retention: RetentionMetrics }>,
): NonNullable<CreativeAdSeries['retention']> | undefined {
  const anyVideo = days.some(
    (d) => d.retention.videoP25 > 0 || d.retention.videoP50 > 0 || d.retention.videoP75 > 0,
  );
  if (!anyVideo) return undefined;
  const ordered = [...days].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const take = (n: number): RetentionMetrics =>
    ordered.slice(0, n).reduce((acc, d) => addRetentionMetrics(acc, d.retention), ZERO_RETENTION);
  return {
    d3: take(CREATIVE_WINDOW_DAYS.d3),
    d7: take(CREATIVE_WINDOW_DAYS.d7),
    d14: take(CREATIVE_WINDOW_DAYS.d14),
  };
}

/**
 * Group ad-level attribution rows by ad and attach the per-ad trends to their ad sets.
 *
 * This is the fold that turns rows the optimizer ALREADY fetches every cycle into something
 * the engine can read. Before it, `createPaidMediaAdAttributionIngest` pulled 29 days of
 * per-ad dailies, persisted them, graded outcomes against them, and dropped them — so the
 * engine could rank creatives and never say one was decaying.
 *
 * Returns NEW snapshot objects; the input is not mutated. An ad set with no rows comes back
 * untouched and therefore carries no `creativeSeries`, which the engine reads as UNKNOWN —
 * never as "these creatives held steady".
 */
export function attachCreativeSeries<T extends AdSetSnapshot>(
  snapshots: T[],
  rows: readonly AdAttributionDay[],
): T[] {
  if (rows.length === 0) return snapshots;

  const byAdset = new Map<
    string,
    Map<
      string,
      {
        adName?: string;
        days: Array<{ date: string; metrics: WindowMetrics; retention: RetentionMetrics }>;
      }
    >
  >();
  for (const row of rows) {
    if (!row.adset_id || !row.ad_id) continue;
    let ads = byAdset.get(row.adset_id);
    if (!ads) {
      ads = new Map();
      byAdset.set(row.adset_id, ads);
    }
    let ad = ads.get(row.ad_id);
    if (!ad) {
      ad = { ...(row.ad_name ? { adName: row.ad_name } : {}), days: [] };
      ads.set(row.ad_id, ad);
    }
    ad.days.push({
      date: row.date,
      metrics: mapAdDailyRowToWindowMetrics(row),
      retention: mapAdDailyRowToRetention(row),
    });
  }

  return snapshots.map((snapshot) => {
    const ads = byAdset.get(snapshot.id);
    if (!ads || ads.size === 0) return snapshot;
    const creativeSeries: CreativeAdSeries[] = [];
    for (const [adId, ad] of ads) {
      const retention = rollAdRetention(ad.days);
      creativeSeries.push({
        adId,
        ...(ad.adName ? { adName: ad.adName } : {}),
        windows: rollAdWindows(ad.days),
        ...(retention ? { retention } : {}),
      });
    }
    return { ...snapshot, creativeSeries };
  });
}
