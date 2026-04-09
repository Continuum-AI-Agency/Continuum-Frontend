import type { OrganicInsightCategory, OrganicHeuristicInsight, OrganicDataBundle } from "./compute.ts";
import type { OrganicAnomaly } from "./anomalies.ts";

type InsightSeverity = "positive" | "negative" | "neutral";

export type OrganicLlmInsight = {
  category: OrganicInsightCategory;
  text: string;
  severity: InsightSeverity;
  source: "llm";
  recommendation?: string;
  estimated_impact?: string;
};

// --- Sub-agent system instructions (category-specialized) ---

const SYSTEM_INSTRUCTIONS: Record<OrganicInsightCategory, string> = {
  growth: `You analyze organic growth signals for a social media account.
Identify momentum in reach, follower growth, and profile visits.
Detect reach-to-follower conversion patterns and non-follower discovery trends.
The account's own historical data is the benchmark — do NOT compare to industry averages.
Each insight: single sentence under 140 chars, include specific numbers, with a concrete recommendation and estimated impact.`,

  content: `You analyze organic content performance for a social media account.
Identify which content types (reels, images, carousels) outperform.
Detect posting frequency patterns and their impact on reach and engagement.
Flag content type misallocations where effort doesn't match results.
The account's own data is the benchmark — do NOT compare to industry averages.
Each insight: single sentence under 140 chars, include specific numbers, with a concrete recommendation and estimated impact.`,

  engagement: `You analyze organic engagement patterns for a social media account.
Identify trends in comments, saves, shares, and overall engagement rate.
Detect engagement quality shifts — surface vs deep engagement (likes vs saves/shares).
Flag engagement fatigue signals: declining interactions despite stable or growing reach.
The account's own data is the benchmark — do NOT compare to industry averages.
Each insight: single sentence under 140 chars, include specific numbers, with a concrete recommendation and estimated impact.`,

  audience: `You analyze audience composition for a social media account.
Identify demographic patterns in age, gender, geography.
Detect follower vs non-follower reach shifts and what they signal about algorithm distribution.
Flag audience concentration risks or untapped demographic opportunities.
The account's own data is the benchmark — do NOT compare to industry averages.
Each insight: single sentence under 140 chars, include specific numbers, with a concrete recommendation and estimated impact.`,
};

const INSIGHT_SCHEMA = {
  type: "object",
  properties: {
    insights: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          severity: { type: "string", enum: ["positive", "negative", "neutral"] },
          recommendation: { type: "string" },
          estimated_impact: { type: "string" },
        },
        required: ["text", "severity", "recommendation", "estimated_impact"],
      },
    },
  },
  required: ["insights"],
};

// --- Category-specific context builders ---

function buildGrowthContext(data: OrganicDataBundle, anomalies: OrganicAnomaly[]): string {
  const lines: string[] = [];
  const { metrics, comparison, trends, audienceBreakdown } = data;

  lines.push("## Growth Metrics");
  const reach = metrics.reach ?? 0;
  const newFollowers = metrics.newFollowers ?? 0;
  const profileVisits = metrics.profileVisits24h ?? 0;

  lines.push(`- Reach: ${reach.toLocaleString("en-US")}`);
  lines.push(`- New Followers: ${newFollowers.toLocaleString("en-US")}`);
  lines.push(`- Profile Visits: ${profileVisits.toLocaleString("en-US")}`);

  if (comparison) {
    const reachComp = comparison["reach"];
    const followerComp = comparison["newFollowers"] ?? comparison["follower_count"];
    const profileComp = comparison["profileVisits24h"] ?? comparison["profile_views"];

    if (reachComp || followerComp || profileComp) {
      lines.push("\n## Period-over-Period Deltas");
      if (reachComp) lines.push(`- Reach: ${reachComp.percentageChange > 0 ? "+" : ""}${reachComp.percentageChange.toFixed(1)}%`);
      if (followerComp) lines.push(`- New Followers: ${followerComp.percentageChange > 0 ? "+" : ""}${followerComp.percentageChange.toFixed(1)}%`);
      if (profileComp) lines.push(`- Profile Visits: ${profileComp.percentageChange > 0 ? "+" : ""}${profileComp.percentageChange.toFixed(1)}%`);
    }
  }

  if (audienceBreakdown) {
    lines.push("\n## Audience Breakdown");
    const total = audienceBreakdown.followers + audienceBreakdown.nonFollowers;
    lines.push(`- Followers: ${audienceBreakdown.followers.toLocaleString("en-US")}`);
    lines.push(`- Non-Followers: ${audienceBreakdown.nonFollowers.toLocaleString("en-US")}`);
    if (total > 0) {
      const nonFollowerRatio = ((audienceBreakdown.nonFollowers / total) * 100).toFixed(1);
      lines.push(`- Non-Follower Reach Ratio: ${nonFollowerRatio}%`);
    }
  }

  if (trends && trends.length > 0) {
    const recent = trends.slice(-7);
    lines.push("\n## Last 7 Trend Points (Reach + New Followers)");
    for (const point of recent) {
      const date = point["date"] ?? point["end_time"] ?? "";
      const trendReach = point["reach"] ?? point["impressions"] ?? "";
      const trendFollowers = point["follower_count"] ?? point["newFollowers"] ?? "";
      lines.push(`- ${date}: reach=${trendReach}, newFollowers=${trendFollowers}`);
    }
  }

  appendAnomalies(lines, anomalies);
  return lines.join("\n");
}

function buildContentContext(data: OrganicDataBundle, anomalies: OrganicAnomaly[]): string {
  const lines: string[] = [];
  const { contentTypePerformance, posts, boostedEvents } = data;

  if (contentTypePerformance && contentTypePerformance.length > 0) {
    lines.push("## Content Type Performance");
    lines.push("type | posts | reach | views | engagement | comments");
    for (const ct of contentTypePerformance) {
      lines.push(
        `- ${ct.contentType}: ${ct.posts ?? 0} posts, reach=${ct.reach ?? 0}, views=${ct.views ?? 0}, engagement=${ct.engagement ?? 0}, comments=${ct.comments ?? 0}`
      );
    }
  }

  if (posts && posts.length > 0) {
    const mediaTypeCounts = new Map<string, number>();
    for (const post of posts) {
      const mediaType = String(post["media_type"] ?? post["contentType"] ?? "unknown");
      mediaTypeCounts.set(mediaType, (mediaTypeCounts.get(mediaType) ?? 0) + 1);
    }
    lines.push("\n## Post Count by Media Type");
    for (const [type, count] of mediaTypeCounts) {
      lines.push(`- ${type}: ${count} posts`);
    }
  }

  if (boostedEvents && boostedEvents.length > 0) {
    lines.push(`\n## Boosted Events: ${boostedEvents.length} total`);
  }

  appendAnomalies(lines, anomalies);
  return lines.join("\n") || "No content data available.";
}

function buildEngagementContext(data: OrganicDataBundle, anomalies: OrganicAnomaly[]): string {
  const lines: string[] = [];
  const { metrics, comparison, trends } = data;

  lines.push("## Engagement Metrics");
  const totalInteractions = metrics.totalInteractions ?? 0;
  const comments = metrics.comments ?? 0;
  const likes = metrics.likes ?? 0;
  const shares = metrics.shares ?? 0;
  const saved = metrics.saved ?? 0;

  lines.push(`- Total Interactions: ${totalInteractions.toLocaleString("en-US")}`);
  lines.push(`- Comments: ${comments.toLocaleString("en-US")}`);
  lines.push(`- Likes: ${likes.toLocaleString("en-US")}`);
  lines.push(`- Shares: ${shares.toLocaleString("en-US")}`);
  lines.push(`- Saved: ${saved.toLocaleString("en-US")}`);

  if (comparison) {
    const interactionsComp = comparison["totalInteractions"] ?? comparison["total_interactions"];
    const commentsComp = comparison["comments"];
    const savesComp = comparison["saved"] ?? comparison["saves"];

    if (interactionsComp || commentsComp || savesComp) {
      lines.push("\n## Period-over-Period Deltas");
      if (interactionsComp) lines.push(`- Total Interactions: ${interactionsComp.percentageChange > 0 ? "+" : ""}${interactionsComp.percentageChange.toFixed(1)}%`);
      if (commentsComp) lines.push(`- Comments: ${commentsComp.percentageChange > 0 ? "+" : ""}${commentsComp.percentageChange.toFixed(1)}%`);
      if (savesComp) lines.push(`- Saved: ${savesComp.percentageChange > 0 ? "+" : ""}${savesComp.percentageChange.toFixed(1)}%`);
    }
  }

  if (trends && trends.length > 0) {
    const recent = trends.slice(-7);
    lines.push("\n## Last 7 Trend Points (Engaged Accounts + Comments)");
    for (const point of recent) {
      const date = point["date"] ?? point["end_time"] ?? "";
      const engaged = point["accounts_engaged"] ?? point["accountsEngaged"] ?? point["reach"] ?? "";
      const trendComments = point["comments"] ?? "";
      lines.push(`- ${date}: accountsEngaged=${engaged}, comments=${trendComments}`);
    }
  }

  appendAnomalies(lines, anomalies);
  return lines.join("\n");
}

function buildAudienceContext(data: OrganicDataBundle, anomalies: OrganicAnomaly[]): string {
  const lines: string[] = [];
  const { audienceDemographics, audienceBreakdown, metrics } = data;

  if (audienceDemographics) {
    if (audienceDemographics.age && audienceDemographics.age.length > 0) {
      const topAge = [...audienceDemographics.age]
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);
      lines.push("## Top 5 Age Groups");
      for (const group of topAge) {
        lines.push(`- ${group.label}: ${group.value.toLocaleString("en-US")}`);
      }
    }

    if (audienceDemographics.gender && audienceDemographics.gender.length > 0) {
      const total = audienceDemographics.gender.reduce((s, g) => s + g.value, 0);
      lines.push("\n## Gender Split");
      for (const g of audienceDemographics.gender) {
        const pct = total > 0 ? ((g.value / total) * 100).toFixed(1) : "0.0";
        lines.push(`- ${g.label}: ${g.value.toLocaleString("en-US")} (${pct}%)`);
      }
    }

    if (audienceDemographics.country && audienceDemographics.country.length > 0) {
      const topCountries = [...audienceDemographics.country]
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);
      lines.push("\n## Top 5 Countries");
      for (const c of topCountries) {
        lines.push(`- ${c.label}: ${c.value.toLocaleString("en-US")}`);
      }
    }

    if (audienceDemographics.city && audienceDemographics.city.length > 0) {
      const topCities = [...audienceDemographics.city]
        .sort((a, b) => b.value - a.value)
        .slice(0, 5);
      lines.push("\n## Top 5 Cities");
      for (const c of topCities) {
        lines.push(`- ${c.label}: ${c.value.toLocaleString("en-US")}`);
      }
    }
  }

  if (audienceBreakdown) {
    const total = audienceBreakdown.followers + audienceBreakdown.nonFollowers;
    lines.push("\n## Audience Breakdown");
    lines.push(`- Followers: ${audienceBreakdown.followers.toLocaleString("en-US")}`);
    lines.push(`- Non-Followers: ${audienceBreakdown.nonFollowers.toLocaleString("en-US")}`);
    if (total > 0) {
      const nonFollowerRatio = ((audienceBreakdown.nonFollowers / total) * 100).toFixed(1);
      lines.push(`- Non-Follower Reach Ratio: ${nonFollowerRatio}%`);
    }
  } else {
    const followers = metrics.newFollowers ?? 0;
    const reach = metrics.reach ?? 0;
    if (followers > 0 || reach > 0) {
      lines.push("\n## Reach Signal");
      lines.push(`- Follower Count: ${followers.toLocaleString("en-US")}`);
      lines.push(`- Total Reach: ${reach.toLocaleString("en-US")}`);
    }
  }

  appendAnomalies(lines, anomalies);
  return lines.join("\n") || "No audience data available.";
}

function appendAnomalies(lines: string[], anomalies: OrganicAnomaly[]): void {
  if (anomalies.length === 0) return;
  lines.push("\n## Detected Anomalies (pre-identified signals — investigate these)");
  for (const a of anomalies) {
    lines.push(`- [${a.metric}] ${a.signal}`);
  }
}

// --- Sub-agent caller ---

const VALID_SEVERITIES = new Set<InsightSeverity>(["positive", "negative", "neutral"]);

async function callSubAgent(args: {
  category: OrganicInsightCategory;
  context: string;
  computed: OrganicHeuristicInsight[];
  apiKey: string;
  baseUrl: string;
  model: string;
  log: (msg: string, extra?: unknown) => void;
}): Promise<OrganicLlmInsight[]> {
  const { category, context, computed, apiKey, baseUrl, model, log } = args;

  const alreadySurfaced = computed
    .filter((i) => i.category === category)
    .map((i) => `- ${i.text}`)
    .join("\n");

  const userMessage = `Generate exactly 1 ${category} insight for this account.

${alreadySurfaced ? `Do NOT repeat these already-computed insights:\n${alreadySurfaced}\n` : ""}DATA:
${context}`;

  try {
    const url = new URL(`/v1beta/models/${model}:generateContent`, baseUrl);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_INSTRUCTIONS[category] }] },
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: INSIGHT_SCHEMA,
          temperature: 0.4,
          maxOutputTokens: 2048,
          thinkingConfig: { thinkingBudget: 1024 },
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      log(`[${category}] Gemini API error: ${response.status}`, errorBody);
      return [];
    }

    const result = await response.json();
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    if (!text) {
      log(`[${category}] Gemini returned empty response`);
      return [];
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      log(`[${category}] Could not parse JSON from response`, text.slice(0, 300));
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const insights = Array.isArray(parsed?.insights) ? parsed.insights : [];

    const validated: OrganicLlmInsight[] = insights
      .filter(
        (i: Record<string, unknown>) =>
          typeof i.text === "string" &&
          i.text.length > 0 &&
          VALID_SEVERITIES.has(i.severity as InsightSeverity)
      )
      .slice(0, 1)
      .map((i: Record<string, unknown>) => ({
        category,
        text: String(i.text).slice(0, 200),
        severity: i.severity as InsightSeverity,
        source: "llm" as const,
        recommendation: typeof i.recommendation === "string" ? String(i.recommendation).slice(0, 300) : undefined,
        estimated_impact: typeof i.estimated_impact === "string" ? String(i.estimated_impact).slice(0, 200) : undefined,
      }));

    log(`[${category}] Generated ${validated.length} insights`);
    return validated;
  } catch (error) {
    log(`[${category}] Sub-agent failed`, error);
    return [];
  }
}

// --- Public API ---

export async function generateOrganicParallelInsights(args: {
  organicData: OrganicDataBundle;
  anomalies: OrganicAnomaly[];
  computedInsights: OrganicHeuristicInsight[];
  log: (msg: string, extra?: unknown) => void;
}): Promise<OrganicLlmInsight[]> {
  const apiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
  if (!apiKey) {
    args.log("GEMINI_API_KEY not configured, skipping LLM insights");
    return [];
  }

  const model = Deno.env.get("GEMINI_MODEL")?.trim() || "gemini-3-flash-preview";
  const baseUrl = Deno.env.get("GEMINI_BASE_URL")?.trim() || "https://generativelanguage.googleapis.com";

  const byCategory = (cat: OrganicInsightCategory) =>
    args.anomalies.filter((a) => a.category === cat);

  const shared = {
    apiKey,
    baseUrl,
    model,
    computed: args.computedInsights,
    log: args.log,
  };

  const [growthInsights, contentInsights, engagementInsights, audienceInsights] =
    await Promise.all([
      callSubAgent({
        ...shared,
        category: "growth",
        context: buildGrowthContext(args.organicData, byCategory("growth")),
      }),
      callSubAgent({
        ...shared,
        category: "content",
        context: buildContentContext(args.organicData, byCategory("content")),
      }),
      callSubAgent({
        ...shared,
        category: "engagement",
        context: buildEngagementContext(args.organicData, byCategory("engagement")),
      }),
      callSubAgent({
        ...shared,
        category: "audience",
        context: buildAudienceContext(args.organicData, byCategory("audience")),
      }),
    ]);

  return [...growthInsights, ...contentInsights, ...engagementInsights, ...audienceInsights];
}
