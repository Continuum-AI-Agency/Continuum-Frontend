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
  parseInsightsSeries,
  trendComparison,
} from "./shared.ts";
import {
  META_API_VERSION,
  type AnalyticsScope,
  type DateRange,
  type IntegrationAccountRow,
  type PlatformAnalyticsResult,
} from "./types.ts";

async function fetchFacebookPostsForRange(params: {
  accountId: string;
  accessToken: string;
  range: DateRange;
  warnings: string[];
}): Promise<Array<Record<string, unknown>>> {
  const posts: Array<Record<string, unknown>> = [];
  let cursor: string | null = null;
  let pageCount = 0;

  while (pageCount < 20) {
    const payload = await metaFetchJson(
      `https://graph.facebook.com/${META_API_VERSION}/${params.accountId}/posts`,
      {
        fields: "id,message,created_time,permalink_url,full_picture,status_type",
        since: params.range.since,
        until: params.range.untilExclusive,
        limit: "50",
        ...(cursor ? { after: cursor } : {}),
        access_token: params.accessToken,
      }
    ).catch((error) => {
      params.warnings.push(
        `Facebook posts range fetch failed: ${error instanceof Error ? error.message : "Unknown"}`
      );
      return null;
    });

    if (!payload) break;
    pageCount += 1;

    const data = (payload.data as Array<Record<string, unknown>> | undefined) ?? [];
    if (data.length === 0) break;
    posts.push(...data);

    const nextCursor =
      (payload.paging as { cursors?: { after?: string } } | undefined)?.cursors?.after ?? null;
    if (!nextCursor) break;
    cursor = nextCursor;
  }

  return posts;
}

async function fetchFacebookPostDetails(params: {
  accessToken: string;
  post: Record<string, unknown>;
  commentsLimit: number;
  range: DateRange;
}) {
  const { accessToken, post, commentsLimit, range } = params;

  const postId = String(post.id ?? "");
  const createdTime = typeof post.created_time === "string" ? post.created_time : undefined;
  const createdDate = createdTime ? createdTime.slice(0, 10) : range.since;
  const postStartDate = new Date(`${createdDate}T00:00:00.000Z`);
  const postWindowUntilExclusive = addDays(postStartDate, 30);
  const rangeUntilExclusiveDate = new Date(`${range.untilExclusive}T00:00:00.000Z`);
  const dailyUntilExclusiveDate = postWindowUntilExclusive.getTime() < rangeUntilExclusiveDate.getTime()
    ? postWindowUntilExclusive
    : rangeUntilExclusiveDate;
  const dailyUntilDate = addDays(dailyUntilExclusiveDate, -1);
  const dailyUntil = toYmd(dailyUntilDate);

  const [insightsPayload, commentsPayload, dailyInsightsPayload] = await Promise.all([
    metaFetchJson(`https://graph.facebook.com/${META_API_VERSION}/${postId}/insights`, {
      metric:
        "post_impressions,post_impressions_unique,post_engaged_users,post_impressions_paid,post_impressions_fan,post_impressions_nonfans,post_video_views",
      period: "lifetime",
      access_token: accessToken,
    }).catch(() => null),
    metaFetchJson(`https://graph.facebook.com/${META_API_VERSION}/${postId}/comments`, {
      fields: "id,message,from{name},created_time,like_count",
      limit: String(commentsLimit),
      access_token: accessToken,
    }).catch(() => null),
    metaFetchJson(`https://graph.facebook.com/${META_API_VERSION}/${postId}/insights`, {
      metric:
        "post_impressions,post_impressions_unique,post_engaged_users,post_video_views",
      period: "day",
      since: createdDate,
      until: toYmd(dailyUntilExclusiveDate),
      access_token: accessToken,
    }).catch(() => null),
  ]);

  const reach = metricTotal(extractMetricByName(insightsPayload ?? undefined, "post_impressions_unique"));
  const impressions = metricTotal(extractMetricByName(insightsPayload ?? undefined, "post_impressions"));
  const engaged = metricTotal(extractMetricByName(insightsPayload ?? undefined, "post_engaged_users"));
  const paid = metricTotal(extractMetricByName(insightsPayload ?? undefined, "post_impressions_paid"));
  const fan = metricTotal(extractMetricByName(insightsPayload ?? undefined, "post_impressions_fan"));
  const nonFans = metricTotal(extractMetricByName(insightsPayload ?? undefined, "post_impressions_nonfans"));
  const videoViews = metricTotal(extractMetricByName(insightsPayload ?? undefined, "post_video_views"));

  const comments =
    (commentsPayload?.data as Array<Record<string, unknown>> | undefined)?.map((comment) => ({
      id: String(comment.id ?? ""),
      username: typeof (comment.from as Record<string, unknown> | undefined)?.name === "string"
        ? String((comment.from as Record<string, unknown>).name)
        : "",
      text: typeof comment.message === "string" ? comment.message : "",
      timestamp: typeof comment.created_time === "string" ? comment.created_time : undefined,
      likeCount: asNumber(comment.like_count),
      replies: [],
    })) ?? [];

  const dailyImpressions = parseInsightsSeries(dailyInsightsPayload ?? undefined, "post_impressions");
  const dailyReach = parseInsightsSeries(dailyInsightsPayload ?? undefined, "post_impressions_unique");
  const dailyEngagement = parseInsightsSeries(dailyInsightsPayload ?? undefined, "post_engaged_users");
  const dailyVideoViews = parseInsightsSeries(dailyInsightsPayload ?? undefined, "post_video_views");

  const dayMap = new Map<string, { date: string; views: number; reach: number; engagement: number; comments: number }>();
  [dailyImpressions, dailyReach, dailyEngagement, dailyVideoViews].forEach((series, index) => {
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
      if (index === 3) current.views = point.value > 0 ? point.value : current.views;
      dayMap.set(point.date, current);
    });
  });

  const breakdown30d = Array.from(dayMap.values())
    .filter((point) => point.date >= createdDate && point.date <= dailyUntil)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 30);
  const breakdown7d = breakdown30d.slice(-7);

  return {
    id: postId,
    title: typeof post.message === "string" ? post.message.slice(0, 60) : undefined,
    caption: typeof post.message === "string" ? post.message : "",
    permalink: typeof post.permalink_url === "string" ? post.permalink_url : undefined,
    timestamp: createdTime,
    mediaType: typeof post.status_type === "string" ? post.status_type : "POST",
    mediaProductType: typeof post.status_type === "string" ? post.status_type : "POST",
    mediaUrl: typeof post.full_picture === "string" ? post.full_picture : null,
    thumbnailUrl: typeof post.full_picture === "string" ? post.full_picture : null,
    carouselMedia: [],
    metrics: {
      reach,
      views: videoViews > 0 ? videoViews : impressions,
      comments: comments.length,
      totalInteractions: engaged,
      followerReach: fan,
      nonFollowerReach: nonFans,
      impressions,
      postViews: videoViews,
    },
    comments,
    breakdown24h: [],
    breakdown7d,
    breakdown30d,
    isBoosted: paid > 0,
    boostedAt: paid > 0 ? createdTime : undefined,
  };
}

export async function fetchFacebookAnalytics(params: {
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

  const [pageInsights, comparisonInsights, pagePosts] = await Promise.all([
    includeAccount
      ? metaFetchJson(`https://graph.facebook.com/${META_API_VERSION}/${account.external_account_id}/insights`, {
      metric:
        "page_impressions_unique,page_impressions,page_post_engagements,page_views_total,page_fan_adds,page_fan_removes",
      period: "day",
      since: range.since,
      until: range.untilExclusive,
      access_token: token,
    }).catch((error) => {
      warnings.push(`Facebook page insights failed: ${error instanceof Error ? error.message : "Unknown"}`);
      return { data: [] };
    })
      : Promise.resolve({ data: [] }),
    includeAccount
      ? metaFetchJson(`https://graph.facebook.com/${META_API_VERSION}/${account.external_account_id}/insights`, {
      metric:
        "page_impressions_unique,page_impressions,page_post_engagements,page_views_total,page_fan_adds,page_fan_removes",
      period: "day",
      since: comparisonSince,
      until: range.untilExclusive,
      access_token: token,
    }).catch((error) => {
      warnings.push(`Facebook comparison insights failed: ${error instanceof Error ? error.message : "Unknown"}`);
      return { data: [] };
    })
      : Promise.resolve({ data: [] }),
    includePosts
      ? (scope === "posts"
          ? selectedPostId
            ? Promise.resolve({ data: [] as Array<Record<string, unknown>> })
            : fetchFacebookPostsForRange({
                accountId: account.external_account_id,
                accessToken: token,
                range,
                warnings,
              }).then((data) => ({ data }))
          : metaFetchJson(`https://graph.facebook.com/${META_API_VERSION}/${account.external_account_id}/posts`, {
              fields: "id,message,created_time,permalink_url,full_picture,status_type",
              limit: String(postsLimit),
              access_token: token,
            }).catch((error) => {
              warnings.push(`Facebook posts fetch failed: ${error instanceof Error ? error.message : "Unknown"}`);
              return { data: [] };
            }))
      : Promise.resolve({ data: [] }),
  ]);

  const reachMetric = extractMetricByName(pageInsights, "page_impressions_unique");
  const impressionsMetric = extractMetricByName(pageInsights, "page_impressions");
  const engagedMetric = extractMetricByName(pageInsights, "page_post_engagements");
  const profileViewsMetric = extractMetricByName(pageInsights, "page_views_total");
  const fanAddsMetric = extractMetricByName(pageInsights, "page_fan_adds");
  const fanRemovesMetric = extractMetricByName(pageInsights, "page_fan_removes");
  const comparisonProfileViewsMetric = extractMetricByName(comparisonInsights, "page_views_total");
  const comparisonFanAddsMetric = extractMetricByName(comparisonInsights, "page_fan_adds");
  const comparisonFanRemovesMetric = extractMetricByName(comparisonInsights, "page_fan_removes");

  const reach = metricTotal(reachMetric);
  const views = metricTotal(impressionsMetric);
  const accountsEngaged = metricTotal(engagedMetric);
  const fanAdds = metricTotal(fanAddsMetric);
  const fanRemoves = metricTotal(fanRemovesMetric);
  const newFollowers = Math.max(0, fanAdds - fanRemoves);
  const profileViewsValues = (profileViewsMetric?.values as Array<{ value?: unknown }> | undefined) ?? [];
  const profileVisits24h = profileViewsValues.length > 0
    ? asNumber(profileViewsValues[profileViewsValues.length - 1]?.value)
    : metricTotal(profileViewsMetric);

  const reachSeries = parseInsightsSeries(comparisonInsights, "page_impressions_unique");
  const viewsSeries = parseInsightsSeries(comparisonInsights, "page_impressions");
  const engagedSeries = parseInsightsSeries(comparisonInsights, "page_post_engagements");
  const profileViewsSeries = parseInsightsSeries(comparisonInsights, "page_views_total");
  const fanAddsSeries = parseInsightsSeries(comparisonInsights, "page_fan_adds");
  const fanRemovesSeries = parseInsightsSeries(comparisonInsights, "page_fan_removes");
  const fanRemovesByDate = new Map(fanRemovesSeries.map((point) => [point.date, point.value] as const));

  const trendMap = new Map<string, Record<string, string | number | boolean | undefined>>();
  [reachSeries, viewsSeries, engagedSeries].forEach((series, index) => {
    series.forEach((point) => {
      if (point.date > range.until) return;
      const current =
        trendMap.get(point.date) ?? {
          date: point.date,
          reach: 0,
          views: 0,
          accountsEngaged: 0,
          comments: 0,
          newFollowers: 0,
          profileVisits24h: 0,
          boosted: false,
        };
      if (index === 0) current.reach = point.value;
      if (index === 1) current.views = point.value;
      if (index === 2) current.accountsEngaged = point.value;
      trendMap.set(point.date, current);
    });
  });

  profileViewsSeries.forEach((point) => {
    if (point.date > range.until) return;
    const current =
      trendMap.get(point.date) ?? {
        date: point.date,
        reach: 0,
        views: 0,
        accountsEngaged: 0,
        comments: 0,
        newFollowers: 0,
        profileVisits24h: 0,
        boosted: false,
      };
    current.profileVisits24h = point.value;
    trendMap.set(point.date, current);
  });

  fanAddsSeries.forEach((point) => {
    if (point.date > range.until) return;
    const current =
      trendMap.get(point.date) ?? {
        date: point.date,
        reach: 0,
        views: 0,
        accountsEngaged: 0,
        comments: 0,
        newFollowers: 0,
        profileVisits24h: 0,
        boosted: false,
      };
    current.newFollowers = Math.max(0, point.value - (fanRemovesByDate.get(point.date) ?? 0));
    trendMap.set(point.date, current);
  });

  const postRows = includePosts
    ? ((pagePosts.data as Array<Record<string, unknown>> | undefined) ?? [])
    : [];
  let detailedRows = includePostDetails
    ? postRows.filter((post) => !selectedPostId || String(post.id ?? "") === selectedPostId)
    : [];
  if (includePostDetails && selectedPostId && detailedRows.length === 0) {
    const postPayload = await metaFetchJson(
      `https://graph.facebook.com/${META_API_VERSION}/${selectedPostId}`,
      {
        fields: "id,message,created_time,permalink_url,full_picture,status_type",
        access_token: token,
      }
    ).catch((error) => {
      warnings.push(
        `Facebook selected post fetch failed: ${error instanceof Error ? error.message : "Unknown"}`
      );
      return null;
    });
    if (postPayload?.id) {
      detailedRows = [postPayload];
    }
  }
  const postDetails = includePostDetails
    ? await Promise.all(
        detailedRows.map((post) =>
          fetchFacebookPostDetails({
            accessToken: token,
            post,
            commentsLimit,
            range,
          }).catch((error) => {
            warnings.push(
              `Facebook post ${String(post.id)} failed: ${error instanceof Error ? error.message : "Unknown"}`
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
  const posts = postRows.map((post) => {
    const postId = String(post.id ?? "");
    const detail = detailById.get(postId);
    if (detail) return detail;

    const createdTime =
      typeof post.created_time === "string" ? post.created_time : undefined;
    return {
      id: postId,
      title: typeof post.message === "string" ? post.message.slice(0, 60) : undefined,
      caption: typeof post.message === "string" ? post.message : "",
      permalink: typeof post.permalink_url === "string" ? post.permalink_url : undefined,
      timestamp: createdTime,
      mediaType: typeof post.status_type === "string" ? post.status_type : "POST",
      mediaProductType: typeof post.status_type === "string" ? post.status_type : "POST",
      mediaUrl: typeof post.full_picture === "string" ? post.full_picture : null,
      thumbnailUrl: typeof post.full_picture === "string" ? post.full_picture : null,
      carouselMedia: [],
      comments: [],
    };
  });

  const boostedEvents = posts
    .filter((post) => Boolean(post.isBoosted))
    .map((post) => ({
      id: `boost-${post.id}`,
      date: typeof post.timestamp === "string" ? post.timestamp.slice(0, 10) : range.since,
      postId: post.id,
      label: "Boost started",
      boostedAt: typeof post.boostedAt === "string" ? post.boostedAt : undefined,
    }));

  boostedEvents.forEach((event) => {
    const trend = trendMap.get(event.date);
    if (trend) {
      trend.boosted = true;
      trend.boostedAt = event.boostedAt;
    }
  });

  const comments = posts.reduce((sum, post) => sum + asNumber((post.metrics as Record<string, unknown>)?.comments), 0);
  const followerReach = posts.reduce((sum, post) => sum + asNumber((post.metrics as Record<string, unknown>)?.followerReach), 0);
  const nonFollowerReach = posts.reduce((sum, post) => sum + asNumber((post.metrics as Record<string, unknown>)?.nonFollowerReach), 0);
  const postViews = posts.reduce((sum, post) => sum + asNumber((post.metrics as Record<string, unknown>)?.postViews), 0);
  const totalInteractions = posts.reduce((sum, post) => sum + asNumber((post.metrics as Record<string, unknown>)?.totalInteractions), 0);

  const comparisonTrends = Array.from(trendMap.values()).sort((a, b) =>
    String(a.date).localeCompare(String(b.date))
  );
  const trends = comparisonTrends.filter((trend) => String(trend.date) >= range.since);
  const contentTypePerformance = buildContentTypePerformanceFromPosts(posts as Array<Record<string, unknown>>);
  const comparison: Record<string, { current: number; previous: number; percentageChange: number }> = {};
  const fanAddsPair = lastTwoMetricValuesUntil(comparisonFanAddsMetric ?? undefined, range.until);
  const fanRemovesPair = lastTwoMetricValuesUntil(comparisonFanRemovesMetric ?? undefined, range.until);

  assignComparison(comparison, "reach", trendComparison(comparisonTrends, "reach"));
  assignComparison(comparison, "views", trendComparison(comparisonTrends, "views"));
  assignComparison(comparison, "accountsEngaged", trendComparison(comparisonTrends, "accountsEngaged"));
  assignComparison(
    comparison,
    "profileVisits24h",
    lastTwoMetricValuesUntil(comparisonProfileViewsMetric ?? undefined, range.until)
  );
  assignComparison(
    comparison,
    "newFollowers",
    fanAddsPair && fanRemovesPair
      ? {
          current: Math.max(0, fanAddsPair.current - fanRemovesPair.current),
          previous: Math.max(0, fanAddsPair.previous - fanRemovesPair.previous),
        }
      : null
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
        reelsViews: 0,
        postViews,
        storiesViews: 0,
        profileVisits24h,
        profileVisitsYesterday: profileVisits24h,
        nonFollowerReach,
        followerReach,
        comments,
        totalInteractions,
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
