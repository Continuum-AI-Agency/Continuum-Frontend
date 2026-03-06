import { addDays, toYmd } from "./date.ts";
import {
  asNumber,
  assignComparison,
  buildContentTypePerformanceFromPosts,
  extractMetricByName,
  lastTwoMetricValuesUntil,
  metaFetchJson,
  metricTotal,
  normalizePermalink,
  parseBreakdownDailySeries,
  parseInsightsSeries,
  sumMetricValues,
  trendComparison,
} from "./shared.ts";
import {
  buildPostBreakdown24h,
  buildPostBreakdown30d,
  buildPostBreakdown7d,
} from "./post-breakdowns.ts";
import {
  META_API_VERSION,
  type AnalyticsScope,
  type DateRange,
  type IntegrationAccountRow,
  type PlatformAnalyticsResult,
} from "./types.ts";

type AudienceDemographicEntry = {
  key: string;
  label: string;
  value: number;
};

type AudienceDemographicDimension = "age" | "gender" | "country" | "city";
type DemographicTimeframe = "this_week" | "this_month" | "prev_month";
type TrendPoint = Record<string, string | number | boolean | undefined>;
type InstagramDailyAccountSnapshot = {
  date: string;
  reach: number;
  views: number;
  accountsEngaged: number;
  comments: number;
  newFollowers: number;
  profileVisits24h: number;
};

function demographicTimeframeForRange(range: DateRange): DemographicTimeframe {
  if (range.preset === "last_month") return "prev_month";
  if (range.preset === "yesterday" || range.preset === "previous_day" || range.preset === "last_7d") {
    return "this_week";
  }
  if (range.preset === "custom") {
    const sinceTs = Date.parse(`${range.since}T00:00:00.000Z`);
    const untilTs = Date.parse(`${range.until}T00:00:00.000Z`);
    if (!Number.isNaN(sinceTs) && !Number.isNaN(untilTs)) {
      const days = Math.max(1, Math.floor((untilTs - sinceTs) / 86_400_000) + 1);
      return days <= 7 ? "this_week" : "this_month";
    }
  }
  return "this_month";
}

function normalizeDemographicLabel(kind: AudienceDemographicDimension, rawValue: string) {
  if (kind === "gender") {
    const normalized = rawValue.trim().toUpperCase();
    if (normalized === "F" || normalized === "FEMALE") return "Female";
    if (normalized === "M" || normalized === "MALE") return "Male";
    if (normalized === "U" || normalized === "UNKNOWN") return "Unknown";
    return rawValue;
  }
  if (kind === "country") {
    return rawValue.trim().toUpperCase();
  }
  return rawValue;
}

function parseDemographicBreakdown(params: {
  payload: Record<string, unknown> | null;
  metricName: string;
  dimension: AudienceDemographicDimension;
}): AudienceDemographicEntry[] {
  const { payload, metricName, dimension } = params;
  const metric = extractMetricByName(payload ?? undefined, metricName);
  if (!metric) return [];

  const totalValue = metric.total_value as Record<string, unknown> | undefined;
  const breakdowns = (totalValue?.breakdowns as Array<Record<string, unknown>> | undefined) ?? [];
  const map = new Map<string, number>();

  breakdowns.forEach((breakdown) => {
    const dimensionKeys = (breakdown.dimension_keys as Array<string> | undefined) ?? [];
    const targetIndex = dimensionKeys.findIndex((key) => key.toLowerCase() === dimension);
    if (targetIndex < 0) return;

    const results = (breakdown.results as Array<Record<string, unknown>> | undefined) ?? [];
    results.forEach((result) => {
      const dimensionValues = (result.dimension_values as Array<string> | undefined) ?? [];
      const key = dimensionValues[targetIndex];
      if (!key || key.length === 0) return;

      const current = map.get(key) ?? 0;
      map.set(key, current + asNumber(result.value));
    });
  });

  const entries = Array.from(map.entries()).map(([key, value]) => ({
    key,
    label: normalizeDemographicLabel(dimension, key),
    value,
  }));

  if (dimension === "age") {
    return entries.sort((a, b) => {
      const aStart = Number.parseInt(a.key, 10);
      const bStart = Number.parseInt(b.key, 10);
      if (!Number.isNaN(aStart) && !Number.isNaN(bStart)) return aStart - bStart;
      return a.key.localeCompare(b.key);
    });
  }

  if (dimension === "gender") {
    const order = new Map([
      ["Female", 0],
      ["Male", 1],
      ["Unknown", 2],
    ]);
    return entries.sort((a, b) => {
      const aOrder = order.get(a.label) ?? 99;
      const bOrder = order.get(b.label) ?? 99;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return b.value - a.value;
    });
  }

  return entries.sort((a, b) => b.value - a.value);
}

function createTrendSeed(date: string): TrendPoint {
  return {
    date,
    reach: 0,
    views: 0,
    accountsEngaged: 0,
    reelsViews: 0,
    postViews: 0,
    storiesViews: 0,
    followerReach: 0,
    nonFollowerReach: 0,
    comments: 0,
    newFollowers: 0,
    profileVisits24h: 0,
    boosted: false,
  };
}

function getOrCreateTrendPoint(
  trendMap: Map<string, TrendPoint>,
  date: string
): TrendPoint {
  const existing = trendMap.get(date);
  if (existing) return existing;
  const next = createTrendSeed(date);
  trendMap.set(date, next);
  return next;
}

function pairFromSnapshots(
  snapshots: InstagramDailyAccountSnapshot[],
  key: keyof InstagramDailyAccountSnapshot
) {
  if (snapshots.length === 0) return null;
  const latest = snapshots[snapshots.length - 1];
  const previous = snapshots[Math.max(0, snapshots.length - 2)] ?? latest;
  return {
    current: asNumber(latest?.[key]),
    previous: asNumber(previous?.[key]),
  };
}

export async function fetchInstagramAccountDailySnapshots(params: {
  accountId: string;
  accessToken: string;
  until: string;
  days?: number;
  warnings: string[];
}): Promise<InstagramDailyAccountSnapshot[]> {
  const days = Math.max(1, Math.min(14, params.days ?? 7));
  const untilDate = new Date(`${params.until}T00:00:00.000Z`);
  const startDate = addDays(untilDate, -(days - 1));
  const snapshots: InstagramDailyAccountSnapshot[] = [];

  for (let offset = 0; offset < days; offset += 1) {
    const dayStart = addDays(startDate, offset);
    const daySince = toYmd(dayStart);
    const dayUntil = toYmd(addDays(dayStart, 1));

    const coreDailyPayload = await metaFetchJson(
      `https://graph.facebook.com/${META_API_VERSION}/${params.accountId}/insights`,
      {
        metric: "reach,views,accounts_engaged,comments",
        period: "day",
        metric_type: "total_value",
        since: daySince,
        until: dayUntil,
        access_token: params.accessToken,
      }
    ).catch((error) => {
      params.warnings.push(
        `Instagram daily snapshot fetch failed for ${daySince}: ${error instanceof Error ? error.message : "Unknown"}`
      );
      return null;
    });

    const profileViewsDailyPayload = await metaFetchJson(
      `https://graph.facebook.com/${META_API_VERSION}/${params.accountId}/insights`,
      {
        metric: "profile_views",
        period: "day",
        metric_type: "total_value",
        since: daySince,
        until: dayUntil,
        access_token: params.accessToken,
      }
    ).catch((error) => {
      params.warnings.push(
        `Instagram daily profile views fetch failed for ${daySince}: ${error instanceof Error ? error.message : "Unknown"}`
      );
      return null;
    });

    const followerDailyPayload = await metaFetchJson(
      `https://graph.facebook.com/${META_API_VERSION}/${params.accountId}/insights`,
      {
        metric: "follower_count",
        period: "day",
        since: daySince,
        until: dayUntil,
        access_token: params.accessToken,
      }
    ).catch((error) => {
      params.warnings.push(
        `Instagram daily follower fetch failed for ${daySince}: ${error instanceof Error ? error.message : "Unknown"}`
      );
      return null;
    });

    if (!coreDailyPayload) continue;

    snapshots.push({
      date: daySince,
      reach: metricTotal(extractMetricByName(coreDailyPayload, "reach")),
      views: metricTotal(extractMetricByName(coreDailyPayload, "views")),
      accountsEngaged: metricTotal(
        extractMetricByName(coreDailyPayload, "accounts_engaged")
      ),
      comments: metricTotal(extractMetricByName(coreDailyPayload, "comments")),
      newFollowers: metricTotal(
        extractMetricByName(followerDailyPayload ?? undefined, "follower_count")
      ),
      profileVisits24h: metricTotal(
        extractMetricByName(profileViewsDailyPayload ?? undefined, "profile_views")
      ),
    });
  }

  return snapshots.sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchInstagramBoostedSignals(
  adAccountId: string | null,
  accessToken: string,
  warnings: string[]
) {
  const byPermalink = new Map<string, string>();
  const byPostId = new Map<string, string>();

  if (!adAccountId) {
    return { byPermalink, byPostId };
  }

  try {
    const payload = await metaFetchJson(`https://graph.facebook.com/${META_API_VERSION}/act_${adAccountId}/ads`, {
      fields: "id,created_time,creative{effective_object_story_id,object_story_id,instagram_permalink_url}",
      limit: "200",
      access_token: accessToken,
    });

    const ads = (payload.data as Array<Record<string, unknown>> | undefined) ?? [];
    ads.forEach((ad) => {
      const createdTime = typeof ad.created_time === "string" ? ad.created_time : undefined;
      const creative = ad.creative as Record<string, unknown> | undefined;
      const permalink = normalizePermalink(
        typeof creative?.instagram_permalink_url === "string"
          ? creative.instagram_permalink_url
          : null
      );
      const storyId = typeof creative?.effective_object_story_id === "string"
        ? creative.effective_object_story_id
        : typeof creative?.object_story_id === "string"
          ? creative.object_story_id
          : null;

      if (permalink && createdTime && !byPermalink.has(permalink)) {
        byPermalink.set(permalink, createdTime);
      }

      if (storyId && createdTime) {
        const postId = storyId.includes("_") ? storyId.split("_").pop() ?? "" : storyId;
        if (postId.length > 0 && !byPostId.has(postId)) {
          byPostId.set(postId, createdTime);
        }
      }
    });
  } catch (error) {
    warnings.push(
      `Boosted signal lookup failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }

  return { byPermalink, byPostId };
}

async function fetchInstagramPostDetails(params: {
  accessToken: string;
  post: Record<string, unknown>;
  commentsLimit: number;
  range: DateRange;
}) {
  const { accessToken, post, commentsLimit, range } = params;

  const postId = String(post.id ?? "");
  const postTimestamp = typeof post.timestamp === "string" ? post.timestamp : undefined;
  const postDate = postTimestamp ? postTimestamp.slice(0, 10) : range.since;
  const postStartDate = new Date(`${postDate}T00:00:00.000Z`);
  const postWindowUntilExclusive = addDays(postStartDate, 30);
  const rangeUntilExclusiveDate = new Date(`${range.untilExclusive}T00:00:00.000Z`);
  const dailyUntilExclusiveDate = postWindowUntilExclusive.getTime() < rangeUntilExclusiveDate.getTime()
    ? postWindowUntilExclusive
    : rangeUntilExclusiveDate;
  const dailyUntilDate = addDays(dailyUntilExclusiveDate, -1);
  const dailyUntil = toYmd(dailyUntilDate);

  const [insightsPayload, commentsPayload, dailyPayload] = await Promise.all([
    metaFetchJson(`https://graph.facebook.com/${META_API_VERSION}/${postId}/insights`, {
      metric: "reach,views,likes,comments,shares,saved,total_interactions",
      period: "lifetime",
      access_token: accessToken,
    }).catch(() => null),
    metaFetchJson(`https://graph.facebook.com/${META_API_VERSION}/${postId}/comments`, {
      fields: "id,text,username,timestamp,like_count,replies{id,text,username,timestamp,like_count}",
      limit: String(commentsLimit),
      access_token: accessToken,
    }).catch(() => null),
    metaFetchJson(`https://graph.facebook.com/${META_API_VERSION}/${postId}/insights`, {
      metric: "views,reach,total_interactions,comments",
      period: "day",
      since: postDate,
      until: toYmd(dailyUntilExclusiveDate),
      access_token: accessToken,
    }).catch(() => null),
  ]);

  const metrics = {
    reach: metricTotal(extractMetricByName(insightsPayload ?? undefined, "reach")),
    views: metricTotal(extractMetricByName(insightsPayload ?? undefined, "views")),
    likes: metricTotal(extractMetricByName(insightsPayload ?? undefined, "likes")),
    comments: metricTotal(extractMetricByName(insightsPayload ?? undefined, "comments")),
    shares: metricTotal(extractMetricByName(insightsPayload ?? undefined, "shares")),
    saved: metricTotal(extractMetricByName(insightsPayload ?? undefined, "saved")),
    totalInteractions: metricTotal(extractMetricByName(insightsPayload ?? undefined, "total_interactions")),
  };

  const dailyViews = parseInsightsSeries(dailyPayload ?? undefined, "views");
  const dailyReach = parseInsightsSeries(dailyPayload ?? undefined, "reach");
  const dailyEngagement = parseInsightsSeries(dailyPayload ?? undefined, "total_interactions");
  const dailyComments = parseInsightsSeries(dailyPayload ?? undefined, "comments");

  const dayMap = new Map<string, { date: string; views: number; reach: number; engagement: number; comments: number }>();
  [dailyViews, dailyReach, dailyEngagement, dailyComments].forEach((series, index) => {
    series.forEach((point) => {
      const current = dayMap.get(point.date) ?? {
        date: point.date,
        views: 0,
        reach: 0,
        engagement: 0,
        comments: 0,
      };
      if (index === 0) current.views = point.value;
      if (index === 1) current.reach = point.value;
      if (index === 2) current.engagement = point.value;
      if (index === 3) current.comments = point.value;
      dayMap.set(point.date, current);
    });
  });

  const breakdown30d = buildPostBreakdown30d({
    dayMap,
    postDate,
    untilDate: dailyUntil,
    lifetimeFallback: {
      views: metrics.views,
      reach: metrics.reach,
      engagement: metrics.totalInteractions,
      comments: metrics.comments,
    },
  });
  const breakdown7d = buildPostBreakdown7d(breakdown30d);
  const breakdown24h = buildPostBreakdown24h({
    breakdown30d,
    lifetimeFallback: {
      views: metrics.views,
      reach: metrics.reach,
      engagement: metrics.totalInteractions,
      comments: metrics.comments,
    },
  });

  const carouselChildren =
    (post.children as { data?: Array<Record<string, unknown>> } | undefined)?.data ?? [];

  const comments =
    (commentsPayload?.data as Array<Record<string, unknown>> | undefined)?.map((comment) => ({
      id: String(comment.id ?? ""),
      username: typeof comment.username === "string" ? comment.username : "",
      text: typeof comment.text === "string" ? comment.text : "",
      timestamp: typeof comment.timestamp === "string" ? comment.timestamp : undefined,
      likeCount: asNumber(comment.like_count),
      replies:
        (comment.replies as { data?: Array<Record<string, unknown>> } | undefined)?.data?.map((reply) => ({
          id: String(reply.id ?? ""),
          username: typeof reply.username === "string" ? reply.username : "",
          text: typeof reply.text === "string" ? reply.text : "",
          timestamp: typeof reply.timestamp === "string" ? reply.timestamp : undefined,
          likeCount: asNumber(reply.like_count),
        })) ?? [],
    })) ?? [];

  return {
    id: postId,
    title: typeof post.caption === "string" ? post.caption.slice(0, 60) : undefined,
    caption: typeof post.caption === "string" ? post.caption : "",
    permalink: typeof post.permalink === "string" ? post.permalink : undefined,
    timestamp: postTimestamp,
    mediaType: typeof post.media_type === "string" ? post.media_type : undefined,
    mediaProductType: typeof post.media_product_type === "string" ? post.media_product_type : undefined,
    mediaUrl: typeof post.media_url === "string" ? post.media_url : null,
    thumbnailUrl: typeof post.thumbnail_url === "string" ? post.thumbnail_url : null,
    carouselMedia: carouselChildren.map((child) => ({
      id: String(child.id ?? ""),
      mediaType: typeof child.media_type === "string" ? child.media_type : undefined,
      mediaUrl: typeof child.media_url === "string" ? child.media_url : null,
      thumbnailUrl: typeof child.thumbnail_url === "string" ? child.thumbnail_url : null,
    })),
    metrics,
    comments,
    breakdown24h,
    breakdown7d,
    breakdown30d,
  };
}

function toTimestamp(value: unknown) {
  if (typeof value !== "string") return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

function inRange(timestamp: number, range: DateRange) {
  const since = Date.parse(`${range.since}T00:00:00.000Z`);
  const untilExclusive = Date.parse(`${range.untilExclusive}T00:00:00.000Z`);
  return timestamp >= since && timestamp < untilExclusive;
}

async function fetchInstagramMediaForRange(params: {
  accountId: string;
  accessToken: string;
  range: DateRange;
  warnings: string[];
}): Promise<Array<Record<string, unknown>>> {
  const mediaInRange: Array<Record<string, unknown>> = [];
  let cursor: string | null = null;
  let hasMore = true;
  let pageCount = 0;
  let consecutivePagesBeforeRange = 0;
  const rangeSinceTimestamp = Date.parse(`${params.range.since}T00:00:00.000Z`);

  while (hasMore && pageCount < 20) {
    const payload = await metaFetchJson(
      `https://graph.facebook.com/${META_API_VERSION}/${params.accountId}/media`,
      {
        fields:
          "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count,children{id,media_type,media_url,thumbnail_url}",
        limit: "50",
        ...(cursor ? { after: cursor } : {}),
        access_token: params.accessToken,
      }
    ).catch((error) => {
      params.warnings.push(
        `Instagram media range fetch failed: ${error instanceof Error ? error.message : "Unknown"}`
      );
      return null;
    });

    if (!payload) break;
    pageCount += 1;

    const posts = (payload.data as Array<Record<string, unknown>> | undefined) ?? [];
    if (posts.length === 0) break;

    let pageHasInRange = false;
    let pageNewestTimestamp = Number.NEGATIVE_INFINITY;
    let pageOldestTimestamp = Number.POSITIVE_INFINITY;
    for (const post of posts) {
      const timestamp = toTimestamp(post.timestamp);
      if (timestamp === null) continue;
      if (timestamp > pageNewestTimestamp) pageNewestTimestamp = timestamp;
      if (timestamp < pageOldestTimestamp) pageOldestTimestamp = timestamp;
      if (inRange(timestamp, params.range)) {
        mediaInRange.push(post);
        pageHasInRange = true;
      }
    }

    const pageEntirelyBeforeRange =
      Number.isFinite(pageOldestTimestamp) &&
      Number.isFinite(pageNewestTimestamp) &&
      pageNewestTimestamp < rangeSinceTimestamp;

    if (pageEntirelyBeforeRange && !pageHasInRange) {
      consecutivePagesBeforeRange += 1;
    } else {
      consecutivePagesBeforeRange = 0;
    }

    if (consecutivePagesBeforeRange >= 2) break;

    const nextCursor =
      (payload.paging as { cursors?: { after?: string } } | undefined)?.cursors?.after ?? null;
    if (!nextCursor) {
      hasMore = false;
    } else {
      cursor = nextCursor;
    }
  }

  return mediaInRange;
}

export async function fetchInstagramAnalytics(params: {
  account: IntegrationAccountRow;
  token: string;
  range: DateRange;
  scope: AnalyticsScope;
  selectedPostId?: string;
  postsLimit: number;
  commentsLimit: number;
  warnings: string[];
}): Promise<PlatformAnalyticsResult> {
  const { account, token, range, scope, selectedPostId, postsLimit, commentsLimit, warnings } = params;
  const includeAccount = scope !== "posts";
  const includePosts = scope !== "account";
  const includePostDetails = scope === "all" || (scope === "posts" && Boolean(selectedPostId));
  const demographicTimeframe = demographicTimeframeForRange(range);
  const emptyPayload = Promise.resolve({ data: [] as Array<Record<string, unknown>> });

  const [
    coreTotals,
    followerTotals,
    profileViewsTotals,
    viewsBreakdown,
    reachBreakdown,
    timeSeriesCore,
    timeSeriesComments,
    followerComparisonTotals,
    viewsBreakdownSeries,
    reachBreakdownSeries,
    followerDemographicsAge,
    followerDemographicsGender,
    followerDemographicsCountry,
    followerDemographicsCity,
    mediaPayload,
  ] = await Promise.all([
    includeAccount
      ? metaFetchJson(`https://graph.facebook.com/${META_API_VERSION}/${account.external_account_id}/insights`, {
      metric: "reach,views,accounts_engaged,likes,comments,shares,saves,total_interactions",
      period: "day",
      metric_type: "total_value",
      since: range.since,
      until: range.untilExclusive,
      access_token: token,
    }).catch((error) => {
      warnings.push(`Instagram core insights failed: ${error instanceof Error ? error.message : "Unknown"}`);
      return { data: [] };
    })
      : emptyPayload,
    includeAccount
      ? metaFetchJson(`https://graph.facebook.com/${META_API_VERSION}/${account.external_account_id}/insights`, {
      metric: "follower_count",
      period: "day",
      since: range.since,
      until: range.untilExclusive,
      access_token: token,
    }).catch((error) => {
      warnings.push(`Instagram follower totals failed: ${error instanceof Error ? error.message : "Unknown"}`);
      return null;
    })
      : Promise.resolve(null),
    includeAccount
      ? metaFetchJson(`https://graph.facebook.com/${META_API_VERSION}/${account.external_account_id}/insights`, {
      metric: "profile_views",
      metric_type: "total_value",
      period: "day",
      since: range.since,
      until: range.untilExclusive,
      access_token: token,
    }).catch((error) => {
      warnings.push(`Instagram profile views totals failed: ${error instanceof Error ? error.message : "Unknown"}`);
      return null;
    })
      : Promise.resolve(null),
    includeAccount
      ? metaFetchJson(`https://graph.facebook.com/${META_API_VERSION}/${account.external_account_id}/insights`, {
      metric: "views",
      metric_type: "total_value",
      breakdown: "media_product_type",
      period: "day",
      since: range.since,
      until: range.untilExclusive,
      access_token: token,
    }).catch((error) => {
      warnings.push(`Instagram views breakdown failed: ${error instanceof Error ? error.message : "Unknown"}`);
      return null;
    })
      : Promise.resolve(null),
    includeAccount
      ? metaFetchJson(`https://graph.facebook.com/${META_API_VERSION}/${account.external_account_id}/insights`, {
      metric: "reach",
      metric_type: "total_value",
      breakdown: "follow_type",
      period: "day",
      since: range.since,
      until: range.untilExclusive,
      access_token: token,
    }).catch((error) => {
      warnings.push(`Instagram reach breakdown failed: ${error instanceof Error ? error.message : "Unknown"}`);
      return null;
    })
      : Promise.resolve(null),
    Promise.resolve(null),
    Promise.resolve(null),
    Promise.resolve(null),
    Promise.resolve(null),
    Promise.resolve(null),
    includeAccount
      ? metaFetchJson(`https://graph.facebook.com/${META_API_VERSION}/${account.external_account_id}/insights`, {
      metric: "follower_demographics",
      period: "lifetime",
      metric_type: "total_value",
      timeframe: demographicTimeframe,
      breakdown: "age",
      access_token: token,
    }).catch((error) => {
      warnings.push(`Instagram follower demographics age failed: ${error instanceof Error ? error.message : "Unknown"}`);
      return null;
    })
      : Promise.resolve(null),
    includeAccount
      ? metaFetchJson(`https://graph.facebook.com/${META_API_VERSION}/${account.external_account_id}/insights`, {
      metric: "follower_demographics",
      period: "lifetime",
      metric_type: "total_value",
      timeframe: demographicTimeframe,
      breakdown: "gender",
      access_token: token,
    }).catch((error) => {
      warnings.push(`Instagram follower demographics gender failed: ${error instanceof Error ? error.message : "Unknown"}`);
      return null;
    })
      : Promise.resolve(null),
    includeAccount
      ? metaFetchJson(`https://graph.facebook.com/${META_API_VERSION}/${account.external_account_id}/insights`, {
      metric: "follower_demographics",
      period: "lifetime",
      metric_type: "total_value",
      timeframe: demographicTimeframe,
      breakdown: "country",
      access_token: token,
    }).catch((error) => {
      warnings.push(`Instagram follower demographics country failed: ${error instanceof Error ? error.message : "Unknown"}`);
      return null;
    })
      : Promise.resolve(null),
    includeAccount
      ? metaFetchJson(`https://graph.facebook.com/${META_API_VERSION}/${account.external_account_id}/insights`, {
      metric: "follower_demographics",
      period: "lifetime",
      metric_type: "total_value",
      timeframe: demographicTimeframe,
      breakdown: "city",
      access_token: token,
    }).catch((error) => {
      warnings.push(`Instagram follower demographics city failed: ${error instanceof Error ? error.message : "Unknown"}`);
      return null;
    })
      : Promise.resolve(null),
    includePosts
      ? (scope === "posts"
          ? selectedPostId
            ? emptyPayload
            : fetchInstagramMediaForRange({
                accountId: account.external_account_id,
                accessToken: token,
                range,
                warnings,
              }).then((data) => ({ data }))
          : metaFetchJson(`https://graph.facebook.com/${META_API_VERSION}/${account.external_account_id}/media`, {
              fields:
                "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count,children{id,media_type,media_url,thumbnail_url}",
              limit: String(postsLimit),
              access_token: token,
            }).catch((error) => {
              warnings.push(
                `Instagram media list fetch failed: ${error instanceof Error ? error.message : "Unknown"}`
              );
              return { data: [] };
            }))
      : emptyPayload,
  ]);

  const reach = metricTotal(extractMetricByName(coreTotals ?? undefined, "reach"));
  const views = metricTotal(extractMetricByName(coreTotals ?? undefined, "views"));
  const accountsEngaged = metricTotal(extractMetricByName(coreTotals ?? undefined, "accounts_engaged"));
  const likes = metricTotal(extractMetricByName(coreTotals ?? undefined, "likes"));
  const comments = metricTotal(extractMetricByName(coreTotals ?? undefined, "comments"));
  const shares = metricTotal(extractMetricByName(coreTotals ?? undefined, "shares"));
  const saved = metricTotal(extractMetricByName(coreTotals ?? undefined, "saves"));
  const totalInteractions = metricTotal(extractMetricByName(coreTotals ?? undefined, "total_interactions"));

  const followerMetric = extractMetricByName(followerTotals ?? undefined, "follower_count");
  const profileViewsMetric = extractMetricByName(profileViewsTotals ?? undefined, "profile_views");
  const followerValues = (followerMetric?.values as Array<{ value?: unknown }> | undefined) ?? [];
  const profileViewsValues = (profileViewsMetric?.values as Array<{ value?: unknown }> | undefined) ?? [];
  const newFollowers = sumMetricValues(followerValues);
  let profileVisits24h = profileViewsValues.length > 0
    ? asNumber(profileViewsValues[profileViewsValues.length - 1]?.value)
    : metricTotal(profileViewsMetric);
  let profileVisitsYesterday = profileVisits24h;
  const followerComparisonMetric = extractMetricByName(followerComparisonTotals ?? undefined, "follower_count");
  const profileViewsComparisonMetric = extractMetricByName(followerComparisonTotals ?? undefined, "profile_views");

  const viewBreakdownResults =
    ((viewsBreakdown?.data as Array<Record<string, unknown>> | undefined)?.[0]?.total_value as Record<string, unknown> | undefined)
      ?.breakdowns as Array<Record<string, unknown>> | undefined;
  const reachBreakdownResults =
    ((reachBreakdown?.data as Array<Record<string, unknown>> | undefined)?.[0]?.total_value as Record<string, unknown> | undefined)
      ?.breakdowns as Array<Record<string, unknown>> | undefined;

  let reelsViews = 0;
  let postViews = 0;
  let storiesViews = 0;
  const viewResults = (viewBreakdownResults?.[0]?.results as Array<Record<string, unknown>> | undefined) ?? [];
  viewResults.forEach((entry) => {
    const type = String(((entry.dimension_values as Array<string> | undefined) ?? [""])[0] ?? "").toUpperCase();
    const value = asNumber(entry.value);
    if (type === "REEL" || type === "REELS") reelsViews += value;
    else if (type === "STORY" || type === "STORIES") storiesViews += value;
    else postViews += value;
  });

  let followerReach = 0;
  let nonFollowerReach = 0;
  const followerResults = (reachBreakdownResults?.[0]?.results as Array<Record<string, unknown>> | undefined) ?? [];
  followerResults.forEach((entry) => {
    const type = String(((entry.dimension_values as Array<string> | undefined) ?? [""])[0] ?? "").toUpperCase();
    const value = asNumber(entry.value);
    if (type === "FOLLOWER") followerReach += value;
    if (type === "NON_FOLLOWER" || type === "NONFOLLOWER") nonFollowerReach += value;
  });

  const reachSeries = (() => {
    const primary = parseInsightsSeries(timeSeriesCore ?? undefined, "reach");
    return primary.length > 0 ? primary : parseInsightsSeries(coreTotals ?? undefined, "reach");
  })();
  const viewsSeries = (() => {
    const primary = parseInsightsSeries(timeSeriesCore ?? undefined, "views");
    return primary.length > 0 ? primary : parseInsightsSeries(coreTotals ?? undefined, "views");
  })();
  const engagedSeries = (() => {
    const primary = parseInsightsSeries(timeSeriesCore ?? undefined, "accounts_engaged");
    return primary.length > 0 ? primary : parseInsightsSeries(coreTotals ?? undefined, "accounts_engaged");
  })();
  const commentsSeries = (() => {
    const primary = parseInsightsSeries(timeSeriesComments ?? undefined, "comments");
    return primary.length > 0 ? primary : parseInsightsSeries(coreTotals ?? undefined, "comments");
  })();
  const followerSeries = (() => {
    const primary = parseInsightsSeries(followerComparisonTotals ?? undefined, "follower_count");
    return primary.length > 0 ? primary : parseInsightsSeries(followerTotals ?? undefined, "follower_count");
  })();
  const profileViewsSeries = (() => {
    const primary = parseInsightsSeries(followerComparisonTotals ?? undefined, "profile_views");
    return primary.length > 0 ? primary : parseInsightsSeries(profileViewsTotals ?? undefined, "profile_views");
  })();
  const viewsBreakdownDaily = parseBreakdownDailySeries(viewsBreakdownSeries ?? undefined, "views");
  const reachBreakdownDaily = parseBreakdownDailySeries(reachBreakdownSeries ?? undefined, "reach");
  const genderDemographics = parseDemographicBreakdown({
    payload: followerDemographicsGender,
    metricName: "follower_demographics",
    dimension: "gender",
  });
  const ageDemographics = parseDemographicBreakdown({
    payload: followerDemographicsAge,
    metricName: "follower_demographics",
    dimension: "age",
  });
  const countryDemographics = parseDemographicBreakdown({
    payload: followerDemographicsCountry,
    metricName: "follower_demographics",
    dimension: "country",
  });
  const cityDemographics = parseDemographicBreakdown({
    payload: followerDemographicsCity,
    metricName: "follower_demographics",
    dimension: "city",
  });
  const dailySnapshots = includeAccount
    ? await fetchInstagramAccountDailySnapshots({
      accountId: account.external_account_id,
      accessToken: token,
      until: range.until,
      days: 7,
      warnings,
    })
    : [];
  if (dailySnapshots.length > 0) {
    const latestSnapshot = dailySnapshots[dailySnapshots.length - 1];
    const previousSnapshot = dailySnapshots[Math.max(0, dailySnapshots.length - 2)] ?? latestSnapshot;
    profileVisits24h = latestSnapshot.profileVisits24h;
    profileVisitsYesterday = previousSnapshot.profileVisits24h;
  }

  const trendMap = new Map<string, TrendPoint>();
  [reachSeries, viewsSeries, engagedSeries, commentsSeries].forEach((series, index) => {
    series.forEach((point) => {
      if (point.date > range.until) return;
      const current = getOrCreateTrendPoint(trendMap, point.date);
      if (index === 0) current.reach = point.value;
      if (index === 1) current.views = point.value;
      if (index === 2) current.accountsEngaged = point.value;
      if (index === 3) current.comments = point.value;
      trendMap.set(point.date, current);
    });
  });

  followerSeries.forEach((point) => {
    if (point.date > range.until) return;
    const current = getOrCreateTrendPoint(trendMap, point.date);
    current.newFollowers = point.value;
    trendMap.set(point.date, current);
  });

  profileViewsSeries.forEach((point) => {
    if (point.date > range.until) return;
    const current = getOrCreateTrendPoint(trendMap, point.date);
    current.profileVisits24h = point.value;
    trendMap.set(point.date, current);
  });

  viewsBreakdownDaily.forEach((point) => {
    if (point.date > range.until) return;
    const current = getOrCreateTrendPoint(trendMap, point.date);
    const type = point.dimension.toUpperCase();
    if (type === "REEL" || type === "REELS") current.reelsViews = asNumber(current.reelsViews) + point.value;
    else if (type === "STORY" || type === "STORIES") current.storiesViews = asNumber(current.storiesViews) + point.value;
    else current.postViews = asNumber(current.postViews) + point.value;
    trendMap.set(point.date, current);
  });

  reachBreakdownDaily.forEach((point) => {
    if (point.date > range.until) return;
    const current = getOrCreateTrendPoint(trendMap, point.date);
    const type = point.dimension.toUpperCase();
    if (type === "FOLLOWER") current.followerReach = point.value;
    if (type === "NON_FOLLOWER" || type === "NONFOLLOWER") current.nonFollowerReach = point.value;
    trendMap.set(point.date, current);
  });

  dailySnapshots.forEach((snapshot) => {
    if (snapshot.date > range.until) return;
    const current = getOrCreateTrendPoint(trendMap, snapshot.date);
    current.reach = snapshot.reach;
    current.views = snapshot.views;
    current.accountsEngaged = snapshot.accountsEngaged;
    current.comments = snapshot.comments;
    current.newFollowers = snapshot.newFollowers;
    current.profileVisits24h = snapshot.profileVisits24h;
    trendMap.set(snapshot.date, current);
  });

  const media = includePosts
    ? ((mediaPayload.data as Array<Record<string, unknown>> | undefined) ?? [])
    : [];
  let detailedMedia = includePostDetails
    ? media.filter((post) => !selectedPostId || String(post.id ?? "") === selectedPostId)
    : [];
  if (includePostDetails && selectedPostId && detailedMedia.length === 0) {
    const postPayload = await metaFetchJson(
      `https://graph.facebook.com/${META_API_VERSION}/${selectedPostId}`,
      {
        fields:
          "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count,children{id,media_type,media_url,thumbnail_url}",
        access_token: token,
      }
    ).catch((error) => {
      warnings.push(
        `Instagram selected post fetch failed: ${error instanceof Error ? error.message : "Unknown"}`
      );
      return null;
    });
    if (postPayload?.id) {
      detailedMedia = [postPayload];
    }
  }
  const postDetails = includePostDetails
    ? await Promise.all(
        detailedMedia.map((post) =>
          fetchInstagramPostDetails({
            accessToken: token,
            post,
            commentsLimit,
            range,
          }).catch((error) => {
            warnings.push(
              `Instagram post ${String(post.id)} failed: ${error instanceof Error ? error.message : "Unknown"}`
            );
            return null;
          })
        )
      )
    : [];
  const detailById = new Map(
    postDetails
      .filter((post): post is NonNullable<typeof post> => post !== null)
      .map((post) => [post.id, post] as const)
  );
  const allMedia = media.length > 0 ? media : detailedMedia;
  const posts = allMedia.map((post) => {
    const postId = String(post.id ?? "");
    const detail = detailById.get(postId);
    if (detail) return detail;

    const carouselChildren =
      (post.children as { data?: Array<Record<string, unknown>> } | undefined)?.data ?? [];
    return {
      id: postId,
      title: typeof post.caption === "string" ? post.caption.slice(0, 60) : undefined,
      caption: typeof post.caption === "string" ? post.caption : "",
      permalink: typeof post.permalink === "string" ? post.permalink : undefined,
      timestamp: typeof post.timestamp === "string" ? post.timestamp : undefined,
      mediaType: typeof post.media_type === "string" ? post.media_type : undefined,
      mediaProductType:
        typeof post.media_product_type === "string" ? post.media_product_type : undefined,
      mediaUrl: typeof post.media_url === "string" ? post.media_url : null,
      thumbnailUrl: typeof post.thumbnail_url === "string" ? post.thumbnail_url : null,
      carouselMedia: carouselChildren.map((child) => ({
        id: String(child.id ?? ""),
        mediaType: typeof child.media_type === "string" ? child.media_type : undefined,
        mediaUrl: typeof child.media_url === "string" ? child.media_url : null,
        thumbnailUrl:
          typeof child.thumbnail_url === "string" ? child.thumbnail_url : null,
      })),
    };
  });

  const boostedSignals = includePosts
    ? await fetchInstagramBoostedSignals(account.ad_account_id, token, warnings)
    : { byPermalink: new Map<string, string>(), byPostId: new Map<string, string>() };
  const boostedEvents: Array<{ id: string; date: string; postId?: string; label?: string; boostedAt?: string }> = [];

  posts.forEach((post) => {
    const permalink = normalizePermalink(post.permalink as string | undefined);
    const boostedAt =
      (permalink ? boostedSignals.byPermalink.get(permalink) : undefined) ??
      boostedSignals.byPostId.get(post.id);

    if (boostedAt) {
      post.isBoosted = true;
      post.boostedAt = boostedAt;
      boostedEvents.push({
        id: `boost-${post.id}`,
        date: boostedAt.slice(0, 10),
        postId: post.id,
        label: "Boost started",
        boostedAt,
      });
    }
  });

  boostedEvents.forEach((event) => {
    const trend = trendMap.get(event.date);
    if (trend) {
      trend.boosted = true;
      trend.boostedAt = event.boostedAt;
    }
  });

  const comparisonTrends = Array.from(trendMap.values()).sort((a, b) =>
    String(a.date).localeCompare(String(b.date))
  );
  const trends = comparisonTrends.filter((trend) => String(trend.date) >= range.since);
  if (includeAccount && trends.length === 0) {
    warnings.push("Instagram trends are empty for the selected range.");
  }
  if (
    includeAccount &&
    genderDemographics.length === 0 &&
    ageDemographics.length === 0 &&
    countryDemographics.length === 0 &&
    cityDemographics.length === 0
  ) {
    warnings.push("Instagram demographics unavailable for this account and timeframe.");
  }
  const contentTypePerformance = buildContentTypePerformanceFromPosts(posts as Array<Record<string, unknown>>);
  const comparison: Record<string, { current: number; previous: number; percentageChange: number }> = {};

  assignComparison(comparison, "reach", trendComparison(comparisonTrends, "reach"));
  assignComparison(comparison, "views", trendComparison(comparisonTrends, "views"));
  assignComparison(comparison, "accountsEngaged", trendComparison(comparisonTrends, "accountsEngaged"));
  assignComparison(comparison, "reelsViews", trendComparison(comparisonTrends, "reelsViews"));
  assignComparison(comparison, "postViews", trendComparison(comparisonTrends, "postViews"));
  assignComparison(comparison, "storiesViews", trendComparison(comparisonTrends, "storiesViews"));
  assignComparison(comparison, "followerReach", trendComparison(comparisonTrends, "followerReach"));
  assignComparison(comparison, "nonFollowerReach", trendComparison(comparisonTrends, "nonFollowerReach"));
  assignComparison(comparison, "comments", trendComparison(comparisonTrends, "comments"));
  assignComparison(
    comparison,
    "newFollowers",
    lastTwoMetricValuesUntil(followerComparisonMetric ?? followerMetric ?? undefined, range.until)
  );
  assignComparison(
    comparison,
    "profileVisits24h",
    lastTwoMetricValuesUntil(profileViewsComparisonMetric ?? profileViewsMetric ?? undefined, range.until)
  );
  assignComparison(comparison, "reach", pairFromSnapshots(dailySnapshots, "reach"));
  assignComparison(comparison, "views", pairFromSnapshots(dailySnapshots, "views"));
  assignComparison(
    comparison,
    "accountsEngaged",
    pairFromSnapshots(dailySnapshots, "accountsEngaged")
  );
  assignComparison(comparison, "comments", pairFromSnapshots(dailySnapshots, "comments"));
  assignComparison(
    comparison,
    "newFollowers",
    pairFromSnapshots(dailySnapshots, "newFollowers")
  );
  assignComparison(
    comparison,
    "profileVisits24h",
    pairFromSnapshots(dailySnapshots, "profileVisits24h")
  );

  const recentComments = posts
    .flatMap((post) => (post.comments as Array<Record<string, unknown>> | undefined) ?? [])
    .sort((a, b) => {
      const aDate = typeof a.timestamp === "string" ? new Date(a.timestamp).getTime() : 0;
      const bDate = typeof b.timestamp === "string" ? new Date(b.timestamp).getTime() : 0;
      return bDate - aDate;
    })
    .slice(0, 10);

  const metrics = includeAccount
    ? {
        newFollowers,
        reach,
        views,
        accountsEngaged,
        reelsViews,
        postViews,
        storiesViews,
        profileVisits24h,
        profileVisitsYesterday,
        nonFollowerReach,
        followerReach,
        comments,
        totalInteractions,
        likes,
        shares,
        saved,
        impressions: views,
      }
    : {};

  return {
    metrics,
    trends: includeAccount ? trends : undefined,
    boostedEvents: includePosts ? boostedEvents : undefined,
    audienceBreakdown: includeAccount
      ? {
          followers: followerReach,
          nonFollowers: nonFollowerReach,
        }
      : undefined,
    audienceDemographics: includeAccount
      ? {
          gender: genderDemographics,
          age: ageDemographics,
          country: countryDemographics,
          city: cityDemographics,
          timeframe: demographicTimeframe,
        }
      : undefined,
    contentTypePerformance: includePosts ? contentTypePerformance : undefined,
    posts: includePosts ? posts : undefined,
    recentComments: includePosts ? recentComments : undefined,
    comparison: includeAccount ? comparison : null,
  };
}
