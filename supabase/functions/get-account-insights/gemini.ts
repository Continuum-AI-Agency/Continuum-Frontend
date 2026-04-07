import type { BreakdownData, DailyDataPoint, ObjectiveBreakdown } from "./breakdowns.ts";
import type { HeuristicInsight } from "./compute.ts";

type InsightCategory = "formats" | "placements" | "audiences" | "creative";
type InsightSeverity = "positive" | "negative" | "neutral";

export type LlmInsight = {
  category: InsightCategory;
  text: string;
  severity: InsightSeverity;
  source: "llm";
  recommendation?: string;
  estimated_impact?: string;
};

function condenseSummary(
  data: BreakdownData,
  previousData?: BreakdownData,
  timeSeries?: DailyDataPoint[],
  objectives?: ObjectiveBreakdown[]
): string {
  const lines: string[] = [];

  if (data.placements.length > 0) {
    lines.push("## Placement Performance");
    for (const p of data.placements) {
      lines.push(
        `- ${p.publisher_platform}/${p.platform_position}: $${p.spend.toFixed(0)} spend, ${p.ctr.toFixed(2)}% CTR, ${p.roas.toFixed(2)}x ROAS, ${p.conversions} conv`
      );
    }
  }

  if (data.formats.length > 0) {
    lines.push("\n## Format Performance");
    for (const f of data.formats) {
      lines.push(
        `- ${f.format}: $${f.spend.toFixed(0)} spend, ${f.ctr.toFixed(2)}% CTR, ${f.roas.toFixed(2)}x ROAS, ${f.conversions} conv`
      );
    }
  }

  if (data.demographics.length > 0) {
    lines.push("\n## Audience Demographics");
    for (const d of data.demographics) {
      lines.push(
        `- ${d.age} ${d.gender}: $${d.spend.toFixed(0)} spend, ${d.conversions} conv, $${d.conversion_value.toFixed(0)} value`
      );
    }
  }

  if (data.devices.length > 0) {
    lines.push("\n## Device Distribution");
    for (const d of data.devices) {
      lines.push(
        `- ${d.device_platform}: $${d.spend.toFixed(0)} spend, ${d.clicks} clicks, ${d.conversions} conv`
      );
    }
  }

  if (objectives && objectives.length > 0) {
    lines.push("\n## Campaign Objective Performance");
    for (const o of objectives) {
      lines.push(
        `- ${o.objective} (${o.campaign_count} campaigns): $${o.spend.toFixed(0)} spend, ${o.ctr.toFixed(2)}% CTR, ${o.roas.toFixed(2)}x ROAS, ${o.conversions} conv`
      );
    }
  }

  if (previousData) {
    const curSpend = data.placements.reduce((s, p) => s + p.spend, 0);
    const prevSpend = previousData.placements.reduce((s, p) => s + p.spend, 0);
    const curConvValue = data.placements.reduce((s, p) => s + p.conversion_value, 0);
    const prevConvValue = previousData.placements.reduce((s, p) => s + p.conversion_value, 0);
    const curRoas = curSpend > 0 ? curConvValue / curSpend : 0;
    const prevRoas = prevSpend > 0 ? prevConvValue / prevSpend : 0;
    const curConv = data.placements.reduce((s, p) => s + p.conversions, 0);
    const prevConv = previousData.placements.reduce((s, p) => s + p.conversions, 0);
    const curClicks = data.placements.reduce((s, p) => s + p.clicks, 0);
    const prevClicks = previousData.placements.reduce((s, p) => s + p.clicks, 0);
    const curImpressions = data.placements.reduce((s, p) => s + p.impressions, 0);
    const prevImpressions = previousData.placements.reduce((s, p) => s + p.impressions, 0);
    const curCtr = curImpressions > 0 ? (curClicks / curImpressions) * 100 : 0;
    const prevCtr = prevImpressions > 0 ? (prevClicks / prevImpressions) * 100 : 0;

    lines.push("\n## Prior Period Comparison");
    lines.push(`- Spend: $${prevSpend.toFixed(0)} → $${curSpend.toFixed(0)}`);
    lines.push(`- ROAS: ${prevRoas.toFixed(2)}x → ${curRoas.toFixed(2)}x`);
    lines.push(`- CTR: ${prevCtr.toFixed(2)}% → ${curCtr.toFixed(2)}%`);
    lines.push(`- Conversions: ${prevConv} → ${curConv}`);
  }

  if (timeSeries && timeSeries.length > 0) {
    lines.push("\n## Daily Trend (last days)");
    for (const day of timeSeries.slice(-7)) {
      lines.push(
        `- ${day.date}: $${day.spend.toFixed(0)} spend, ${day.ctr.toFixed(2)}% CTR, ${day.roas.toFixed(2)}x ROAS`
      );
    }
  }

  return lines.join("\n");
}

function buildPrompt(
  data: BreakdownData,
  computed: HeuristicInsight[],
  opts: {
    previousData?: BreakdownData;
    timeSeries?: DailyDataPoint[];
    objectives?: ObjectiveBreakdown[];
  }
): string {
  const summary = condenseSummary(data, opts.previousData, opts.timeSeries, opts.objectives);

  const alreadySurfaced = computed
    .map((i) => `- [${i.category}] ${i.text}`)
    .join("\n");

  return `You are a senior paid media analyst reviewing a Meta Ads account. The account's own data is your benchmark — do NOT compare to industry averages. Generate exactly 8 high-impact insights (2 per category).

CATEGORIES: formats, placements, audiences, creative

ANALYSIS APPROACH:
- The account's own performance is the baseline. Compare dimensions against each other within the account.
- Look for CROSS-DIMENSIONAL patterns: format x placement, audience x format, device x placement, objective x audience, objective x placement.
- Identify the account's relative winners and losers — which dimension outperforms vs underperforms the account's own averages.
- When prior-period data exists, frame as acceleration or deceleration within the account (e.g., "Instagram ROAS improved 40% while Facebook declined 15%").
- When daily trend data exists, identify inflection points, momentum shifts, or anomalies.
- Flag spend allocation mismatches: high spend on the account's own low-performing dimensions.
- When campaign objective data is available, analyze which objectives are most efficient and whether budget allocation across objectives matches performance.

RULES:
- Each insight MUST be a single sentence, under 140 characters
- Include specific numbers from the data
- Provide strategic, actionable observations — not just restating what the data shows
- For each insight, provide a concrete recommendation and estimated dollar or percentage impact
- Do NOT repeat or rephrase these already-computed insights:
${alreadySurfaced}
- Rate each as: positive (opportunity to exploit), negative (risk to address), or neutral (noteworthy observation)

ACCOUNT BREAKDOWN DATA:
${summary}

Respond ONLY with valid JSON matching this schema:
{
  "insights": [
    { "category": "formats", "text": "...", "severity": "positive", "recommendation": "...", "estimated_impact": "..." },
    { "category": "formats", "text": "...", "severity": "neutral", "recommendation": "...", "estimated_impact": "..." },
    { "category": "placements", "text": "...", "severity": "positive", "recommendation": "...", "estimated_impact": "..." },
    { "category": "placements", "text": "...", "severity": "negative", "recommendation": "...", "estimated_impact": "..." },
    { "category": "audiences", "text": "...", "severity": "positive", "recommendation": "...", "estimated_impact": "..." },
    { "category": "audiences", "text": "...", "severity": "neutral", "recommendation": "...", "estimated_impact": "..." },
    { "category": "creative", "text": "...", "severity": "positive", "recommendation": "...", "estimated_impact": "..." },
    { "category": "creative", "text": "...", "severity": "negative", "recommendation": "...", "estimated_impact": "..." }
  ]
}`;
}

const VALID_CATEGORIES = new Set<InsightCategory>([
  "formats",
  "placements",
  "audiences",
  "creative",
]);
const VALID_SEVERITIES = new Set<InsightSeverity>([
  "positive",
  "negative",
  "neutral",
]);

function parseGeminiResponse(raw: string): LlmInsight[] {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];

  const parsed = JSON.parse(jsonMatch[0]);
  const insights = Array.isArray(parsed?.insights) ? parsed.insights : [];

  return insights
    .filter(
      (i: Record<string, unknown>) =>
        typeof i.text === "string" &&
        i.text.length > 0 &&
        VALID_CATEGORIES.has(i.category as InsightCategory) &&
        VALID_SEVERITIES.has(i.severity as InsightSeverity)
    )
    .map((i: Record<string, unknown>) => ({
      category: i.category as InsightCategory,
      text: String(i.text).slice(0, 200),
      severity: i.severity as InsightSeverity,
      source: "llm" as const,
      recommendation: typeof i.recommendation === "string" ? String(i.recommendation).slice(0, 300) : undefined,
      estimated_impact: typeof i.estimated_impact === "string" ? String(i.estimated_impact).slice(0, 200) : undefined,
    }));
}

export async function generateLlmInsights(args: {
  data: BreakdownData;
  previousData?: BreakdownData;
  timeSeries?: DailyDataPoint[];
  objectives?: ObjectiveBreakdown[];
  computedInsights: HeuristicInsight[];
  log: (msg: string, extra?: unknown) => void;
}): Promise<LlmInsight[]> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    args.log("GEMINI_API_KEY not configured, skipping LLM insights");
    return [];
  }

  const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-3-flash-preview";
  const prompt = buildPrompt(args.data, args.computedInsights, {
    previousData: args.previousData,
    timeSeries: args.timeSeries,
    objectives: args.objectives,
  });

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.4,
            maxOutputTokens: 1024,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      args.log(`Gemini API error: ${response.status}`, errorBody);
      return [];
    }

    const result = await response.json();
    const text =
      result?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    if (!text) {
      args.log("Gemini returned empty response");
      return [];
    }

    const insights = parseGeminiResponse(text);
    args.log(`Gemini generated ${insights.length} insights`);

    const perCategory = new Map<string, LlmInsight[]>();
    for (const insight of insights) {
      const group = perCategory.get(insight.category) ?? [];
      group.push(insight);
      perCategory.set(insight.category, group);
    }

    const capped: LlmInsight[] = [];
    for (const cat of VALID_CATEGORIES) {
      const group = perCategory.get(cat) ?? [];
      capped.push(...group.slice(0, 2));
    }

    return capped;
  } catch (error) {
    args.log("Gemini call failed", error);
    return [];
  }
}
