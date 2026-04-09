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

const MIN_DELTA_PCT = 15;
const MIN_REACH_THRESHOLD = 100;

const fmtPct = (v: number) => `${Math.abs(v).toFixed(1)}%`;
const fmtNumber = (v: number) => new Intl.NumberFormat().format(Math.round(v));
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function computeGrowthInsights(data: OrganicDataBundle): OrganicHeuristicInsight[] {
  const insights: OrganicHeuristicInsight[] = [];
  const { metrics, comparison } = data;

  // Insight 1: Reach vs Follower Growth Divergence
  if (comparison) {
    const reachComp = comparison["reach"];
    const followersComp = comparison["newFollowers"];
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
          text: `Healthy growth: reach up ${fmtPct(reachDelta)} with followers tracking proportionally at ${fmtPct(followerDelta)}`,
          severity: "positive",
          source: "computed",
          metric: "newFollowers",
          value: followerDelta,
          delta: followerDelta,
        });
      }
    }
  }

  // Insight 2: Non-Follower Reach Ratio
  const reach = metrics.reach ?? 0;
  const nonFollowerReach = metrics.nonFollowerReach ?? 0;
  if (reach >= MIN_REACH_THRESHOLD && nonFollowerReach > 0) {
    const currentRatio = (nonFollowerReach / reach) * 100;

    if (comparison) {
      const reachComp = comparison["reach"];
      const nonFollowerComp = comparison["nonFollowerReach"];
      if (reachComp && nonFollowerComp && reachComp.previous > 0 && nonFollowerComp.previous > 0) {
        const previousRatio = (nonFollowerComp.previous / reachComp.previous) * 100;
        const ratioDelta = currentRatio - previousRatio;
        if (ratioDelta > 10) {
          insights.push({
            category: "growth",
            text: `Non-follower reach is ${fmtPct(currentRatio)} of total reach, up from ${fmtPct(previousRatio)} — expanding discovery`,
            severity: "positive",
            source: "computed",
            metric: "nonFollowerReach",
            value: currentRatio,
            delta: ratioDelta,
          });
        } else if (ratioDelta < -10) {
          insights.push({
            category: "growth",
            text: `Non-follower reach dropped from ${fmtPct(previousRatio)} to ${fmtPct(currentRatio)} of total reach — content is reaching fewer new accounts`,
            severity: "negative",
            source: "computed",
            metric: "nonFollowerReach",
            value: currentRatio,
            delta: ratioDelta,
          });
        }
        return insights.slice(0, 2);
      }
    }

    // No comparison available: neutral insight if ratio is notable
    if (currentRatio > 50) {
      insights.push({
        category: "growth",
        text: `${fmtPct(currentRatio)} of your reach comes from non-followers — strong discovery performance`,
        severity: "neutral",
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
  const { contentTypePerformance, posts, comparison } = data;

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

    if (top.viewsPerPost > 0 && second.viewsPerPost > 0) {
      const topPostShare = totalPosts > 0 ? ((top.posts ?? 0) / totalPosts) * 100 : 0;
      const ratio = top.viewsPerPost / second.viewsPerPost;

      if (ratio > 2 && topPostShare < 50) {
        insights.push({
          category: "content",
          text: `${capitalize(top.contentType)} generates ${ratio.toFixed(1)}x more views per post than ${capitalize(second.contentType)} but only ${fmtPct(topPostShare)} of your posts are ${capitalize(top.contentType)}`,
          severity: "negative",
          source: "computed",
          metric: "views",
          value: ratio,
          recommendation: `Shift content mix to include more ${capitalize(top.contentType)}`,
        });
      } else if (ratio > 1.5 && topPostShare >= 50) {
        insights.push({
          category: "content",
          text: `Content strategy is well-aligned: ${capitalize(top.contentType)} leads with ${ratio.toFixed(1)}x views per post and represents ${fmtPct(topPostShare)} of posts`,
          severity: "positive",
          source: "computed",
          metric: "views",
          value: ratio,
        });
      }
    }
  }

  // Insight 2: Posting Frequency vs Reach
  const postCount = contentTypePerformance
    ? contentTypePerformance.reduce((s, t) => s + (t.posts ?? 0), 0)
    : (posts?.length ?? 0);

  if (postCount > 0 && comparison) {
    const reachComp = comparison["reach"];
    if (reachComp) {
      const reachDelta = reachComp.percentageChange;
      if (postCount < 5 && reachDelta > 0) {
        insights.push({
          category: "content",
          text: `Strong reach (${fmtNumber(reachComp.current)}) from only ${postCount} post${postCount !== 1 ? "s" : ""} — quality over quantity is working`,
          severity: "positive",
          source: "computed",
          metric: "reach",
          value: reachComp.current,
        });
      } else if (postCount > 10 && reachDelta < -MIN_DELTA_PCT) {
        insights.push({
          category: "content",
          text: `Posted ${postCount} times but reach declined ${fmtPct(Math.abs(reachDelta))} — high volume isn't driving distribution`,
          severity: "negative",
          source: "computed",
          metric: "reach",
          value: reachComp.current,
          delta: reachDelta,
        });
      }
    }
  }

  return insights.slice(0, 2);
}

function computeEngagementInsights(data: OrganicDataBundle): OrganicHeuristicInsight[] {
  const insights: OrganicHeuristicInsight[] = [];
  const { metrics, comparison } = data;

  // Insight 1: Engagement Rate vs Reach Divergence
  if (comparison) {
    const reachComp = comparison["reach"];
    const engagementComp = comparison["totalInteractions"] ?? comparison["accountsEngaged"];
    if (reachComp && engagementComp) {
      const reachDelta = reachComp.percentageChange;
      const engDelta = engagementComp.percentageChange;
      if (reachDelta > MIN_DELTA_PCT && engDelta < -MIN_DELTA_PCT) {
        insights.push({
          category: "engagement",
          text: `Engagement dropped ${fmtPct(Math.abs(engDelta))} despite reach increasing ${fmtPct(reachDelta)} — possible content relevance shift`,
          severity: "negative",
          source: "computed",
          metric: "totalInteractions",
          value: engDelta,
          delta: engDelta - reachDelta,
          recommendation: "Review recent content for engagement triggers — questions, polls, and conversation starters",
        });
      } else if (reachDelta > MIN_DELTA_PCT && engDelta > MIN_DELTA_PCT) {
        insights.push({
          category: "engagement",
          text: `Both reach and engagement are growing — up ${fmtPct(reachDelta)} and ${fmtPct(engDelta)} respectively`,
          severity: "positive",
          source: "computed",
          metric: "totalInteractions",
          value: engDelta,
          delta: engDelta,
        });
      }
    }
  }

  // Insight 2: Save/Share Ratio
  const saved = metrics.saved ?? 0;
  const shares = metrics.shares ?? 0;
  if (saved > 0 || shares > 0) {
    if (comparison) {
      const savedComp = comparison["saved"];
      const sharesComp = comparison["shares"];
      const likesComp = comparison["likes"];
      if (savedComp && sharesComp && likesComp) {
        const highValueDelta = ((savedComp.percentageChange + sharesComp.percentageChange) / 2);
        const likesDelta = likesComp.percentageChange;
        if (highValueDelta > likesDelta + MIN_DELTA_PCT) {
          insights.push({
            category: "engagement",
            text: `Saves and shares grew ${fmtPct(highValueDelta)} while likes grew only ${fmtPct(likesDelta)} — content has increasing save-worthy value`,
            severity: "positive",
            source: "computed",
            metric: "saved",
            value: saved + shares,
            delta: highValueDelta - likesDelta,
          });
        } else if (highValueDelta < -MIN_DELTA_PCT && Math.abs(likesDelta) < MIN_DELTA_PCT) {
          insights.push({
            category: "engagement",
            text: `Saves and shares declined ${fmtPct(Math.abs(highValueDelta))} while likes stayed flat — content may be losing deeper value`,
            severity: "negative",
            source: "computed",
            metric: "saved",
            value: saved + shares,
            delta: highValueDelta,
          });
        }
      }
    }
  }

  return insights.slice(0, 2);
}

function computeAudienceInsights(data: OrganicDataBundle): OrganicHeuristicInsight[] {
  const insights: OrganicHeuristicInsight[] = [];
  const { audienceDemographics } = data;

  // Insight 1: Geographic Concentration
  const countries = audienceDemographics?.country ?? [];
  if (countries.length >= 2) {
    const total = countries.reduce((s, c) => s + c.value, 0);
    if (total > 0) {
      const sorted = [...countries].sort((a, b) => b.value - a.value);
      const top = sorted[0];
      const topPct = (top.value / total) * 100;
      if (topPct > 60) {
        insights.push({
          category: "audience",
          text: `${top.label} represents ${fmtPct(topPct)} of your audience`,
          severity: "neutral",
          source: "computed",
          metric: "country",
          value: topPct,
          recommendation: "Consider localized content or expanding to adjacent markets",
        });
      }
    }
  }

  // Insight 2: Age/Gender Skew
  const ages = audienceDemographics?.age ?? [];
  if (ages.length > 0) {
    const ageTotal = ages.reduce((s, a) => s + a.value, 0);
    if (ageTotal > 0) {
      const sorted = [...ages].sort((a, b) => b.value - a.value);
      const topAge = sorted[0];
      const topAgePct = (topAge.value / ageTotal) * 100;

      let text = `${topAge.label} accounts for ${fmtPct(topAgePct)} of your audience — tailor content to this demographic`;

      const genders = audienceDemographics?.gender ?? [];
      if (genders.length > 0) {
        const genderTotal = genders.reduce((s, g) => s + g.value, 0);
        if (genderTotal > 0) {
          const topGender = [...genders].sort((a, b) => b.value - a.value)[0];
          const topGenderPct = (topGender.value / genderTotal) * 100;
          if (topGenderPct > 70) {
            text = `${topAge.label} accounts for ${fmtPct(topAgePct)} of your audience, predominantly ${topGender.label.toLowerCase()} (${fmtPct(topGenderPct)})`;
          }
        }
      }

      if (topAgePct > 40) {
        insights.push({
          category: "audience",
          text,
          severity: "neutral",
          source: "computed",
          metric: "age",
          value: topAgePct,
        });
      }
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
