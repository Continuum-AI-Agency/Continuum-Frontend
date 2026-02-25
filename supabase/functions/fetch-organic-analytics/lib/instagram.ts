import { addDays, toYmd } from "./date.ts";
import {
  asNumber,
  assignComparison,
  buildContentTypePerformanceFromPosts,
  dayBefore,
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
  META_API_VERSION,
  type AnalyticsScope,
  type DateRange,
  type IntegrationAccountRow,
  type PlatformAnalyticsResult,
} from "./types.ts";

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

  const breakdown30d = Array.from(dayMap.values())
    .filter((point) => point.date >= postDate && point.date <= dailyUntil)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 30);

  const breakdown7d = breakdown30d.slice(0, 7);
  const breakdown24h: Array<{
    hour: number;
    views: number;
    reach: number;
    engagement: number;
    comments: number;
  }> = [];

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
  const comparisonSince = dayBefore(range.since);
  const emptyPayload = Promise.resolve({ data: [] as Array<Record<string, unknown>> });

  const [
    coreTotals,
    followerTotals,
    viewsBreakdown,
    reachBreakdown,
    timeSeriesCore,
    timeSeriesComments,
    followerComparisonTotals,
    viewsBreakdownSeries,
    reachBreakdownSeries,
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
      metric: "follower_count,profile_views",
      period: "day",
      breakdown: "follow_type",
      metric_type: "total_value",
      since: range.since,
      until: range.untilExclusive,
      access_token: token,
    }).catch(() => null)
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
    }).catch(() => null)
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
    }).catch(() => null)
      : Promise.resolve(null),
    includeAccount
      ? metaFetchJson(`https://graph.facebook.com/${META_API_VERSION}/${account.external_account_id}/insights`, {
      metric: "reach,views,accounts_engaged",
      period: "day",
      since: comparisonSince,
      until: range.untilExclusive,
      access_token: token,
    }).catch(() => null)
      : Promise.resolve(null),
    includeAccount
      ? metaFetchJson(`https://graph.facebook.com/${META_API_VERSION}/${account.external_account_id}/insights`, {
      metric: "comments",
      period: "day",
      since: comparisonSince,
      until: range.untilExclusive,
      access_token: token,
    }).catch(() => null)
      : Promise.resolve(null),
    includeAccount
      ? metaFetchJson(`https://graph.facebook.com/${META_API_VERSION}/${account.external_account_id}/insights`, {
      metric: "follower_count,profile_views",
      period: "day",
      breakdown: "follow_type",
      metric_type: "total_value",
      since: comparisonSince,
      until: range.untilExclusive,
      access_token: token,
    }).catch(() => null)
      : Promise.resolve(null),
    includeAccount
      ? metaFetchJson(`https://graph.facebook.com/${META_API_VERSION}/${account.external_account_id}/insights`, {
      metric: "views",
      breakdown: "media_product_type",
      period: "day",
      since: comparisonSince,
      until: range.untilExclusive,
      access_token: token,
    }).catch(() => null)
      : Promise.resolve(null),
    includeAccount
      ? metaFetchJson(`https://graph.facebook.com/${META_API_VERSION}/${account.external_account_id}/insights`, {
      metric: "reach",
      breakdown: "follow_type",
      period: "day",
      since: comparisonSince,
      until: range.untilExclusive,
      access_token: token,
    }).catch(() => null)
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
  const profileViewsMetric = extractMetricByName(followerTotals ?? undefined, "profile_views");
  const followerValues = (followerMetric?.values as Array<{ value?: unknown }> | undefined) ?? [];
  const profileViewsValues = (profileViewsMetric?.values as Array<{ value?: unknown }> | undefined) ?? [];
  const newFollowers = sumMetricValues(followerValues);
  const profileVisits24h = profileViewsValues.length > 0
    ? asNumber(profileViewsValues[profileViewsValues.length - 1]?.value)
    : metricTotal(profileViewsMetric);
  const followerComparisonMetric = extractMetricByName(
    followerComparisonTotals ?? undefined,
    "follower_count"
  );
  const profileViewsComparisonMetric = extractMetricByName(
    followerComparisonTotals ?? undefined,
    "profile_views"
  );

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

  const reachSeries = parseInsightsSeries(timeSeriesCore ?? undefined, "reach");
  const viewsSeries = parseInsightsSeries(timeSeriesCore ?? undefined, "views");
  const engagedSeries = parseInsightsSeries(timeSeriesCore ?? undefined, "accounts_engaged");
  const commentsSeries = parseInsightsSeries(timeSeriesComments ?? undefined, "comments");
  const followerSeries = parseInsightsSeries(followerComparisonTotals ?? undefined, "follower_count");
  const profileViewsSeries = parseInsightsSeries(followerComparisonTotals ?? undefined, "profile_views");
  const viewsBreakdownDaily = parseBreakdownDailySeries(viewsBreakdownSeries ?? undefined, "views");
  const reachBreakdownDaily = parseBreakdownDailySeries(reachBreakdownSeries ?? undefined, "reach");

  const trendMap = new Map<string, Record<string, string | number | boolean | undefined>>();
  [reachSeries, viewsSeries, engagedSeries, commentsSeries].forEach((series, index) => {
    series.forEach((point) => {
      if (point.date > range.until) return;
      const current =
        trendMap.get(point.date) ?? {
          date: point.date,
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
      if (index === 0) current.reach = point.value;
      if (index === 1) current.views = point.value;
      if (index === 2) current.accountsEngaged = point.value;
      if (index === 3) current.comments = point.value;
      trendMap.set(point.date, current);
    });
  });

  followerSeries.forEach((point) => {
    if (point.date > range.until) return;
    const current =
      trendMap.get(point.date) ?? {
        date: point.date,
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
    current.newFollowers = point.value;
    trendMap.set(point.date, current);
  });

  profileViewsSeries.forEach((point) => {
    if (point.date > range.until) return;
    const current =
      trendMap.get(point.date) ?? {
        date: point.date,
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
    current.profileVisits24h = point.value;
    trendMap.set(point.date, current);
  });

  viewsBreakdownDaily.forEach((point) => {
    if (point.date > range.until) return;
    const current =
      trendMap.get(point.date) ?? {
        date: point.date,
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
    const type = point.dimension.toUpperCase();
    if (type === "REEL" || type === "REELS") current.reelsViews = asNumber(current.reelsViews) + point.value;
    else if (type === "STORY" || type === "STORIES") current.storiesViews = asNumber(current.storiesViews) + point.value;
    else current.postViews = asNumber(current.postViews) + point.value;
    trendMap.set(point.date, current);
  });

  reachBreakdownDaily.forEach((point) => {
    if (point.date > range.until) return;
    const current =
      trendMap.get(point.date) ?? {
        date: point.date,
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
    const type = point.dimension.toUpperCase();
    if (type === "FOLLOWER") current.followerReach = point.value;
    if (type === "NON_FOLLOWER" || type === "NONFOLLOWER") current.nonFollowerReach = point.value;
    trendMap.set(point.date, current);
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
  const posts = media.map((post) => {
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
    lastTwoMetricValuesUntil(followerComparisonMetric ?? undefined, range.until)
  );
  assignComparison(
    comparison,
    "profileVisits24h",
    lastTwoMetricValuesUntil(profileViewsComparisonMetric ?? undefined, range.until)
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
        profileVisitsYesterday: profileVisits24h,
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
    contentTypePerformance: includePosts ? contentTypePerformance : undefined,
    posts: includePosts ? posts : undefined,
    recentComments: includePosts ? recentComments : undefined,
    comparison: includeAccount ? comparison : null,
  };
}
