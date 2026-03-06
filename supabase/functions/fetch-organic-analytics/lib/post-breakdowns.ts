type DailyBreakdownPoint = {
  date: string;
  views: number;
  reach: number;
  engagement: number;
  comments: number;
};

type HourlyBreakdownPoint = {
  hour: number;
  views: number;
  reach: number;
  engagement: number;
  comments: number;
};

type LifetimeFallbackMetrics = {
  views?: number;
  reach?: number;
  engagement?: number;
  comments?: number;
};

export function buildPostBreakdown30d(params: {
  dayMap: Map<string, DailyBreakdownPoint>;
  postDate: string;
  untilDate: string;
  lifetimeFallback?: LifetimeFallbackMetrics;
}) {
  const { dayMap, postDate, untilDate, lifetimeFallback } = params;
  const dailyPoints = Array.from(dayMap.values())
    .filter((point) => point.date >= postDate && point.date <= untilDate)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 30);
  if (dailyPoints.length > 0) return dailyPoints;

  if (!lifetimeFallback) return [];
  const fallbackViews = lifetimeFallback.views ?? 0;
  const fallbackReach = lifetimeFallback.reach ?? 0;
  const fallbackEngagement = lifetimeFallback.engagement ?? 0;
  const fallbackComments = lifetimeFallback.comments ?? 0;
  if (
    fallbackViews === 0 &&
    fallbackReach === 0 &&
    fallbackEngagement === 0 &&
    fallbackComments === 0
  ) {
    return [];
  }

  return [
    {
      date: postDate,
      views: fallbackViews,
      reach: fallbackReach,
      engagement: fallbackEngagement,
      comments: fallbackComments,
    } satisfies DailyBreakdownPoint,
  ];
}

export function buildPostBreakdown7d(breakdown30d: DailyBreakdownPoint[]) {
  return breakdown30d.slice(0, 7);
}

export function buildPostBreakdown24h(params: {
  breakdown30d: DailyBreakdownPoint[];
  lifetimeFallback?: LifetimeFallbackMetrics;
}) {
  const firstDay = params.breakdown30d[0];
  if (firstDay) {
    return [
      {
        hour: 23,
        views: firstDay.views,
        reach: firstDay.reach,
        engagement: firstDay.engagement,
        comments: firstDay.comments,
      } satisfies HourlyBreakdownPoint,
    ];
  }

  const fallback = params.lifetimeFallback;
  if (!fallback) return [] as HourlyBreakdownPoint[];

  const views = fallback.views ?? 0;
  const reach = fallback.reach ?? 0;
  const engagement = fallback.engagement ?? 0;
  const comments = fallback.comments ?? 0;

  if (views === 0 && reach === 0 && engagement === 0 && comments === 0) {
    return [] as HourlyBreakdownPoint[];
  }

  return [
    {
      hour: 23,
      views,
      reach,
      engagement,
      comments,
    } satisfies HourlyBreakdownPoint,
  ];
}
