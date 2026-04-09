export type OrganicInsightCategory = "growth" | "content" | "engagement" | "audience";
type InsightSeverity = "positive" | "negative" | "neutral";

export type OrganicHeuristicInsight = {
  category: OrganicInsightCategory;
  text: string;
  severity: InsightSeverity;
  source: "computed";
  metric?: string;
  value?: number;
  delta?: number;
  recommendation?: string;
  estimated_impact?: string;
};

export type OrganicDataBundle = {
  metrics: {
    reach?: number;
    views?: number;
    newFollowers?: number;
    accountsEngaged?: number;
    reelsViews?: number;
    postViews?: number;
    nonFollowerReach?: number;
    followerReach?: number;
    profileVisits24h?: number;
    comments?: number;
    likes?: number;
    shares?: number;
    saved?: number;
    totalInteractions?: number;
  };
  comparison?: Record<string, { current: number; previous: number; percentageChange: number }> | null;
  trends?: Array<{
    date: string;
    reach?: number;
    views?: number;
    accountsEngaged?: number;
    newFollowers?: number;
    comments?: number;
    nonFollowerReach?: number;
    followerReach?: number;
  }>;
  audienceBreakdown?: { followers: number; nonFollowers: number };
  audienceDemographics?: {
    gender?: Array<{ key: string; label: string; value: number }>;
    age?: Array<{ key: string; label: string; value: number }>;
    country?: Array<{ key: string; label: string; value: number }>;
    city?: Array<{ key: string; label: string; value: number }>;
  };
  contentTypePerformance?: Array<{
    contentType: string;
    posts?: number;
    reach?: number;
    views?: number;
    engagement?: number;
    comments?: number;
  }>;
  posts?: Array<{ id: string; mediaType?: string; mediaProductType?: string; isBoosted?: boolean }>;
  boostedEvents?: Array<{ id: string; date: string }>;
};

const MIN_DELTA_PCT = 5;

const fmtPct = (v: number) => `${Math.abs(v).toFixed(1)}%`;
const fmtNumber = (v: number) => new Intl.NumberFormat().format(Math.round(v));
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type Comparison = { current: number; previous: number; percentageChange: number };

function getComp(comparison: OrganicDataBundle["comparison"], key: string): Comparison | undefined {
  if (!comparison) return undefined;
  return comparison[key] ?? undefined;
}

// Derive a comparison from trends if the comparison map is missing a key
function deriveFromTrends(trends: OrganicDataBundle["trends"], key: string): Comparison | undefined {
  if (!trends || trends.length < 2) return undefined;
  const sorted = [...trends].sort((a, b) => a.date.localeCompare(b.date));
  const values = sorted
    .map((t) => (t as Record<string, unknown>)[key])
    .filter((v): v is number => typeof v === "number");
  if (values.length < 2) return undefined;
  const half = Math.floor(values.length / 2);
  const firstHalf = values.slice(0, half);
  const secondHalf = values.slice(half);
  const prevAvg = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
  const curAvg = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;
  const pct = prevAvg > 0 ? ((curAvg - prevAvg) / prevAvg) * 100 : 0;
  return { current: curAvg, previous: prevAvg, percentageChange: pct };
}

function resolveComp(data: OrganicDataBundle, key: string): Comparison | undefined {
  return getComp(data.comparison, key) ?? deriveFromTrends(data.trends, key);
}

function computeGrowthInsights(data: OrganicDataBundle): OrganicHeuristicInsight[] {
  const insights: OrganicHeuristicInsight[] = [];
  const { metrics } = data;

  // Insight 1: Reach vs Follower Growth
  const reachComp = resolveComp(data, "reach");
  const followersComp = resolveComp(data, "newFollowers");
  if (reachComp && followersComp) {
    const reachDelta = reachComp.percentageChange;
    const followerDelta = followersComp.percentageChange;
    if (reachDelta > MIN_DELTA_PCT && followerDelta < reachDelta * 0.3) {
      insights.push({
        category: "growth",
        text: `Reach grew ${fmtPct(reachDelta)} while followers grew only ${fmtPct(followerDelta)} — content reaches new audiences but isn't converting to follows`,
        severity: "negative",
        source: "computed",
        metric: "newFollowers",
        value: followerDelta,
        delta: followerDelta - reachDelta,
        recommendation: "Add stronger CTAs and optimize bio to convert viewers to followers",
      });
    } else if (reachDelta > MIN_DELTA_PCT && followerDelta > reachDelta * 0.5) {
      insights.push({
        category: "growth",
        text: `Healthy growth: reach up ${fmtPct(reachDelta)} with followers tracking at ${fmtPct(followerDelta)}`,
        severity: "positive",
        source: "computed",
        metric: "newFollowers",
        value: followerDelta,
        delta: followerDelta,
      });
    } else if (reachDelta < -MIN_DELTA_PCT) {
      insights.push({
        category: "growth",
        text: `Reach declined ${fmtPct(Math.abs(reachDelta))} period-over-period`,
        severity: "negative",
        source: "computed",
        metric: "reach",
        value: reachComp.current,
        delta: reachDelta,
        recommendation: "Review content distribution — experiment with posting times or formats",
      });
    }
  } else if (reachComp) {
    const d = reachComp.percentageChange;
    insights.push({
      category: "growth",
      text: d >= 0
        ? `Reach is up ${fmtPct(d)} to ${fmtNumber(reachComp.current)}`
        : `Reach declined ${fmtPct(Math.abs(d))} to ${fmtNumber(reachComp.current)}`,
      severity: d > MIN_DELTA_PCT ? "positive" : d < -MIN_DELTA_PCT ? "negative" : "neutral",
      source: "computed",
      metric: "reach",
      value: reachComp.current,
      delta: d,
    });
  } else if ((metrics.reach ?? 0) > 0) {
    insights.push({
      category: "growth",
      text: `Reach this period: ${fmtNumber(metrics.reach ?? 0)}`,
      severity: "neutral",
      source: "computed",
      metric: "reach",
      value: metrics.reach,
    });
  }

  // Insight 2: Non-Follower Reach Ratio
  const reach = metrics.reach ?? 0;
  const nonFollowerReach = metrics.nonFollowerReach ?? 0;
  if (reach > 0 && nonFollowerReach > 0) {
    const currentRatio = (nonFollowerReach / reach) * 100;
    const nfComp = resolveComp(data, "nonFollowerReach");
    const rComp = resolveComp(data, "reach");

    if (nfComp && rComp && rComp.previous > 0 && nfComp.previous > 0) {
      const previousRatio = (nfComp.previous / rComp.previous) * 100;
      const ratioDelta = currentRatio - previousRatio;
      if (Math.abs(ratioDelta) > 3) {
        insights.push({
          category: "growth",
          text: ratioDelta > 0
            ? `Non-follower reach is ${fmtPct(currentRatio)} of total, up from ${fmtPct(previousRatio)} — expanding discovery`
            : `Non-follower reach dropped from ${fmtPct(previousRatio)} to ${fmtPct(currentRatio)} — reaching fewer new accounts`,
          severity: ratioDelta > 5 ? "positive" : ratioDelta < -5 ? "negative" : "neutral",
          source: "computed",
          metric: "nonFollowerReach",
          value: currentRatio,
          delta: ratioDelta,
        });
      } else {
        insights.push({
          category: "growth",
          text: `${fmtPct(currentRatio)} of reach comes from non-followers — stable discovery`,
          severity: "neutral",
          source: "computed",
          metric: "nonFollowerReach",
          value: currentRatio,
        });
      }
    } else {
      insights.push({
        category: "growth",
        text: currentRatio > 50
          ? `${fmtPct(currentRatio)} of reach comes from non-followers — strong discovery`
          : `${fmtPct(currentRatio)} of reach comes from non-followers`,
        severity: currentRatio > 50 ? "positive" : "neutral",
        source: "computed",
        metric: "nonFollowerReach",
        value: currentRatio,
      });
    }
  }

  return insights.slice(0, 2);
}

function computeContentInsights(data: OrganicDataBundle): OrganicHeuristicInsight[] {
  const insights: OrganicHeuristicInsight[] = [];
  const { contentTypePerformance, posts } = data;

  // Insight 1: Content Type Efficiency
  const typesWithPosts = (contentTypePerformance ?? []).filter(
    (t) => (t.posts ?? 0) > 0
  );
  if (typesWithPosts.length >= 2) {
    const withVpp = typesWithPosts.map((t) => ({
      ...t,
      viewsPerPost: (t.views ?? 0) / (t.posts ?? 1),
    }));
    withVpp.sort((a, b) => b.viewsPerPost - a.viewsPerPost);
    const top = withVpp[0];
    const second = withVpp[1];
    const totalPosts = typesWithPosts.reduce((s, t) => s + (t.posts ?? 0), 0);
    const topPostShare = totalPosts > 0 ? ((top.posts ?? 0) / totalPosts) * 100 : 0;
    const ratio = second.viewsPerPost > 0 ? top.viewsPerPost / second.viewsPerPost : 0;

    if (ratio > 1.5 && topPostShare < 50) {
      insights.push({
        category: "content",
        text: `${capitalize(top.contentType)} gets ${ratio.toFixed(1)}x more views per post than ${capitalize(second.contentType)} but only ${fmtPct(topPostShare)} of posts`,
        severity: "negative",
        source: "computed",
        metric: "views",
        value: ratio,
        recommendation: `Shift content mix to include more ${capitalize(top.contentType)}`,
      });
    } else if (ratio > 1.2) {
      insights.push({
        category: "content",
        text: `${capitalize(top.contentType)} leads with ${ratio.toFixed(1)}x views per post — ${fmtPct(topPostShare)} of your content mix`,
        severity: topPostShare >= 40 ? "positive" : "neutral",
        source: "computed",
        metric: "views",
        value: ratio,
      });
    }
  } else if (typesWithPosts.length === 1) {
    const only = typesWithPosts[0];
    insights.push({
      category: "content",
      text: `All ${only.posts ?? 0} posts are ${capitalize(only.contentType)} — consider diversifying formats`,
      severity: "neutral",
      source: "computed",
      metric: "views",
      value: only.posts,
      recommendation: "Experiment with reels, carousels, or stories to reach different audience segments",
    });
  }

  // Insight 2: Posting Frequency vs Reach
  const postCount = contentTypePerformance
    ? contentTypePerformance.reduce((s, t) => s + (t.posts ?? 0), 0)
    : (posts?.length ?? 0);

  const reachComp = resolveComp(data, "reach");
  if (postCount > 0 && reachComp) {
    const reachDelta = reachComp.percentageChange;
    if (postCount <= 5 && reachDelta > 0) {
      insights.push({
        category: "content",
        text: `Strong reach (${fmtNumber(reachComp.current)}) from only ${postCount} post${postCount !== 1 ? "s" : ""} — quality over quantity`,
        severity: "positive",
        source: "computed",
        metric: "reach",
        value: reachComp.current,
      });
    } else if (postCount > 7 && reachDelta < -MIN_DELTA_PCT) {
      insights.push({
        category: "content",
        text: `Posted ${postCount} times but reach declined ${fmtPct(Math.abs(reachDelta))} — volume isn't driving distribution`,
        severity: "negative",
        source: "computed",
        metric: "reach",
        value: reachComp.current,
        delta: reachDelta,
      });
    } else if (postCount > 0) {
      const reachPerPost = Math.round(reachComp.current / postCount);
      insights.push({
        category: "content",
        text: `${postCount} posts averaging ${fmtNumber(reachPerPost)} reach each`,
        severity: "neutral",
        source: "computed",
        metric: "reach",
        value: reachPerPost,
      });
    }
  } else if (postCount > 0) {
    insights.push({
      category: "content",
      text: `${postCount} post${postCount !== 1 ? "s" : ""} published this period`,
      severity: "neutral",
      source: "computed",
      metric: "views",
      value: postCount,
    });
  }

  return insights.slice(0, 2);
}

function computeEngagementInsights(data: OrganicDataBundle): OrganicHeuristicInsight[] {
  const insights: OrganicHeuristicInsight[] = [];
  const { metrics } = data;

  // Insight 1: Engagement vs Reach
  const reachComp = resolveComp(data, "reach");
  const engComp = resolveComp(data, "accountsEngaged") ?? resolveComp(data, "totalInteractions");

  if (reachComp && engComp) {
    const reachDelta = reachComp.percentageChange;
    const engDelta = engComp.percentageChange;
    if (reachDelta > MIN_DELTA_PCT && engDelta < -MIN_DELTA_PCT) {
      insights.push({
        category: "engagement",
        text: `Engagement dropped ${fmtPct(Math.abs(engDelta))} despite reach increasing ${fmtPct(reachDelta)} — possible relevance shift`,
        severity: "negative",
        source: "computed",
        metric: "accountsEngaged",
        value: engDelta,
        delta: engDelta - reachDelta,
        recommendation: "Review content for engagement triggers — questions, polls, conversation starters",
      });
    } else if (engDelta > MIN_DELTA_PCT && reachDelta > MIN_DELTA_PCT) {
      insights.push({
        category: "engagement",
        text: `Both reach and engagement growing — up ${fmtPct(reachDelta)} and ${fmtPct(engDelta)}`,
        severity: "positive",
        source: "computed",
        metric: "accountsEngaged",
        value: engDelta,
        delta: engDelta,
      });
    } else {
      insights.push({
        category: "engagement",
        text: `Engagement ${engDelta >= 0 ? "up" : "down"} ${fmtPct(Math.abs(engDelta))} with reach ${reachDelta >= 0 ? "up" : "down"} ${fmtPct(Math.abs(reachDelta))}`,
        severity: engDelta > MIN_DELTA_PCT ? "positive" : engDelta < -MIN_DELTA_PCT ? "negative" : "neutral",
        source: "computed",
        metric: "accountsEngaged",
        value: engComp.current,
        delta: engDelta,
      });
    }
  } else if ((metrics.accountsEngaged ?? 0) > 0) {
    insights.push({
      category: "engagement",
      text: `${fmtNumber(metrics.accountsEngaged ?? 0)} accounts engaged this period`,
      severity: "neutral",
      source: "computed",
      metric: "accountsEngaged",
      value: metrics.accountsEngaged,
    });
  }

  // Insight 2: Save/Share ratio or comments
  const saved = metrics.saved ?? 0;
  const shares = metrics.shares ?? 0;
  const comments = metrics.comments ?? 0;
  const totalInteractions = metrics.totalInteractions ?? 0;

  if ((saved + shares) > 0 && totalInteractions > 0) {
    const highValuePct = ((saved + shares) / totalInteractions) * 100;
    const savedComp = resolveComp(data, "saved");
    const likesComp = resolveComp(data, "likes");

    if (savedComp && likesComp) {
      const saveDelta = savedComp.percentageChange;
      const likesDelta = likesComp.percentageChange;
      if (saveDelta > likesDelta + MIN_DELTA_PCT) {
        insights.push({
          category: "engagement",
          text: `Saves grew ${fmtPct(saveDelta)} while likes grew ${fmtPct(likesDelta)} — content has increasing save-worthy value`,
          severity: "positive",
          source: "computed",
          metric: "accountsEngaged",
          value: saved + shares,
          delta: saveDelta - likesDelta,
        });
      } else {
        insights.push({
          category: "engagement",
          text: `${fmtPct(highValuePct)} of interactions are saves or shares — ${highValuePct > 10 ? "strong deep engagement" : "room to grow deeper engagement"}`,
          severity: highValuePct > 10 ? "positive" : "neutral",
          source: "computed",
          metric: "accountsEngaged",
          value: highValuePct,
        });
      }
    } else {
      insights.push({
        category: "engagement",
        text: `${fmtPct(highValuePct)} of interactions are saves or shares (${fmtNumber(saved + shares)} total)`,
        severity: highValuePct > 10 ? "positive" : "neutral",
        source: "computed",
        metric: "accountsEngaged",
        value: highValuePct,
      });
    }
  } else if (comments > 0) {
    const commentsComp = resolveComp(data, "comments");
    if (commentsComp) {
      const d = commentsComp.percentageChange;
      insights.push({
        category: "engagement",
        text: `Comments ${d >= 0 ? "up" : "down"} ${fmtPct(Math.abs(d))} to ${fmtNumber(commentsComp.current)}`,
        severity: d > MIN_DELTA_PCT ? "positive" : d < -MIN_DELTA_PCT ? "negative" : "neutral",
        source: "computed",
        metric: "comments",
        value: commentsComp.current,
        delta: d,
      });
    } else {
      insights.push({
        category: "engagement",
        text: `${fmtNumber(comments)} comments this period`,
        severity: "neutral",
        source: "computed",
        metric: "comments",
        value: comments,
      });
    }
  }

  return insights.slice(0, 2);
}

function computeAudienceInsights(data: OrganicDataBundle): OrganicHeuristicInsight[] {
  const insights: OrganicHeuristicInsight[] = [];
  const { audienceDemographics, audienceBreakdown } = data;

  // Insight 1: Geographic concentration or top country
  const countries = audienceDemographics?.country ?? [];
  if (countries.length > 0) {
    const total = countries.reduce((s, c) => s + c.value, 0);
    if (total > 0) {
      const sorted = [...countries].sort((a, b) => b.value - a.value);
      const top = sorted[0];
      const topPct = (top.value / total) * 100;
      if (topPct > 50 && sorted.length >= 2) {
        const second = sorted[1];
        const secondPct = (second.value / total) * 100;
        insights.push({
          category: "audience",
          text: `${top.label} leads with ${fmtPct(topPct)} of your audience, followed by ${second.label} (${fmtPct(secondPct)})`,
          severity: topPct > 75 ? "neutral" : "positive",
          source: "computed",
          metric: "followerReach",
          value: topPct,
          recommendation: topPct > 75 ? "Consider localized content or expanding to adjacent markets" : undefined,
        });
      } else {
        insights.push({
          category: "audience",
          text: `Top market: ${top.label} at ${fmtPct(topPct)} of audience across ${sorted.length} countries`,
          severity: "neutral",
          source: "computed",
          metric: "followerReach",
          value: topPct,
        });
      }
    }
  } else if (audienceBreakdown) {
    const total = audienceBreakdown.followers + audienceBreakdown.nonFollowers;
    if (total > 0) {
      const followerPct = (audienceBreakdown.followers / total) * 100;
      insights.push({
        category: "audience",
        text: `${fmtPct(followerPct)} of your reach audience are followers (${fmtNumber(audienceBreakdown.followers)})`,
        severity: "neutral",
        source: "computed",
        metric: "followerReach",
        value: followerPct,
      });
    }
  }

  // Insight 2: Age/Gender demographics
  const ages = audienceDemographics?.age ?? [];
  if (ages.length > 0) {
    const ageTotal = ages.reduce((s, a) => s + a.value, 0);
    if (ageTotal > 0) {
      const sorted = [...ages].sort((a, b) => b.value - a.value);
      const topAge = sorted[0];
      const topAgePct = (topAge.value / ageTotal) * 100;

      let text = `${topAge.label} is your largest segment at ${fmtPct(topAgePct)} of audience`;
      let severity: InsightSeverity = "neutral";

      const genders = audienceDemographics?.gender ?? [];
      if (genders.length > 0) {
        const genderTotal = genders.reduce((s, g) => s + g.value, 0);
        if (genderTotal > 0) {
          const topGender = [...genders].sort((a, b) => b.value - a.value)[0];
          const topGenderPct = (topGender.value / genderTotal) * 100;
          if (topGenderPct > 60) {
            text = `${topAge.label} ${topGender.label.toLowerCase()} is your core segment — ${fmtPct(topAgePct)} of audience, ${fmtPct(topGenderPct)} ${topGender.label.toLowerCase()}`;
          }
        }
      }

      if (sorted.length >= 2) {
        const second = sorted[1];
        const secondPct = (second.value / ageTotal) * 100;
        if (topAgePct - secondPct < 10) {
          text = `${topAge.label} and ${second.label} are nearly equal — ${fmtPct(topAgePct)} vs ${fmtPct(secondPct)}`;
          severity = "positive";
        }
      }

      insights.push({
        category: "audience",
        text,
        severity,
        source: "computed",
        metric: "followerReach",
        value: topAgePct,
      });
    }
  }

  return insights.slice(0, 2);
}

export function computeOrganicHeuristics(data: OrganicDataBundle): OrganicHeuristicInsight[] {
  return [
    ...computeGrowthInsights(data),
    ...computeContentInsights(data),
    ...computeEngagementInsights(data),
    ...computeAudienceInsights(data),
  ];
}
