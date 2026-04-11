import type { BreakdownData, DailyDataPoint, ObjectiveBreakdown } from "./breakdowns.ts";
import type { AdCreativeBreakdown } from "./creative.ts";
import type { HeuristicInsight } from "./compute.ts";
import type { Anomaly } from "./anomalies.ts";

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

// --- Sub-agent system instructions (category-specialized) ---

const SYSTEM_INSTRUCTIONS: Record<InsightCategory, string> = {
  formats: `You analyze ad format and campaign objective performance for a Meta Ads account.
Identify which formats and objectives outperform others within this account.
Cross-reference format performance with objective type when data is available.
Flag budget misallocations where spend doesn't match performance.
The account's own data is the benchmark — do NOT compare to industry averages.
Each insight: single sentence under 140 chars, include specific numbers, with a concrete recommendation and estimated impact.`,

  placements: `You analyze platform and placement position performance for a Meta Ads account.
Identify which platforms (Facebook, Instagram, etc.) and positions (Feed, Stories, Reels) outperform.
Detect period-over-period shifts in platform effectiveness.
Flag placement budget misallocations where spend doesn't match ROAS or conversion efficiency.
The account's own data is the benchmark — do NOT compare to industry averages.
Each insight: single sentence under 140 chars, include specific numbers, with a concrete recommendation and estimated impact.`,

  audiences: `You analyze demographic audience segment performance for a Meta Ads account.
Identify which age/gender segments convert most efficiently within this account.
Detect demographic shifts vs the prior period — which segments are growing or declining.
Cross-reference audience performance with campaign objectives when available.
The account's own data is the benchmark — do NOT compare to industry averages.
Each insight: single sentence under 140 chars, include specific numbers, with a concrete recommendation and estimated impact.`,

  creative: `You analyze creative signals from device usage, format effectiveness, and daily trends for a Meta Ads account.
Identify device-format correlations (e.g., mobile + video outperforms desktop + image).
Detect trend inflection points — accelerating or decelerating metrics over the period.
Flag creative fatigue signals: declining CTR over time, engagement drops on specific days.
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

function buildFormatsContext(
  data: BreakdownData,
  objectives?: ObjectiveBreakdown[],
  anomalies?: Anomaly[]
): string {
  const lines: string[] = [];

  if (data.formats.length > 0) {
    lines.push("## Format Performance");
    for (const f of data.formats) {
      lines.push(`- ${f.format}: $${f.spend.toFixed(0)} spend, ${f.ctr.toFixed(2)}% CTR, ${f.roas.toFixed(2)}x ROAS, ${f.conversions} conv`);
    }
  }

  if (objectives && objectives.length > 0) {
    lines.push("\n## Campaign Objective Performance");
    for (const o of objectives) {
      lines.push(`- ${o.objective} (${o.campaign_count} campaigns): $${o.spend.toFixed(0)} spend, ${o.ctr.toFixed(2)}% CTR, ${o.roas.toFixed(2)}x ROAS, ${o.conversions} conv`);
    }
  }

  appendAnomalies(lines, anomalies);
  return lines.join("\n");
}

function buildPlacementsContext(
  data: BreakdownData,
  previousData?: BreakdownData,
  anomalies?: Anomaly[]
): string {
  const lines: string[] = [];

  if (data.placements.length > 0) {
    lines.push("## Placement Performance");
    for (const p of data.placements) {
      lines.push(`- ${p.publisher_platform}/${p.platform_position}: $${p.spend.toFixed(0)} spend, ${p.ctr.toFixed(2)}% CTR, ${p.roas.toFixed(2)}x ROAS, ${p.conversions} conv`);
    }
  }

  if (previousData && previousData.placements.length > 0) {
    const curSpend = data.placements.reduce((s, p) => s + p.spend, 0);
    const prevSpend = previousData.placements.reduce((s, p) => s + p.spend, 0);
    const curConvValue = data.placements.reduce((s, p) => s + p.conversion_value, 0);
    const prevConvValue = previousData.placements.reduce((s, p) => s + p.conversion_value, 0);
    const curRoas = curSpend > 0 ? curConvValue / curSpend : 0;
    const prevRoas = prevSpend > 0 ? prevConvValue / prevSpend : 0;
    const curConv = data.placements.reduce((s, p) => s + p.conversions, 0);
    const prevConv = previousData.placements.reduce((s, p) => s + p.conversions, 0);
    lines.push("\n## Prior Period Comparison");
    lines.push(`- Spend: $${prevSpend.toFixed(0)} → $${curSpend.toFixed(0)}`);
    lines.push(`- ROAS: ${prevRoas.toFixed(2)}x → ${curRoas.toFixed(2)}x`);
    lines.push(`- Conversions: ${prevConv} → ${curConv}`);
  }

  appendAnomalies(lines, anomalies);
  return lines.join("\n");
}

function buildAudiencesContext(
  data: BreakdownData,
  objectives?: ObjectiveBreakdown[],
  anomalies?: Anomaly[]
): string {
  const lines: string[] = [];

  if (data.demographics.length > 0) {
    lines.push("## Audience Demographics");
    for (const d of data.demographics) {
      lines.push(`- ${d.age} ${d.gender}: $${d.spend.toFixed(0)} spend, ${d.conversions} conv, $${d.conversion_value.toFixed(0)} value`);
    }
  }

  if (objectives && objectives.length > 0) {
    lines.push("\n## Campaign Objectives (for cross-reference)");
    for (const o of objectives) {
      lines.push(`- ${o.objective}: ${o.conversions} conv, ${o.roas.toFixed(2)}x ROAS`);
    }
  }

  appendAnomalies(lines, anomalies);
  return lines.join("\n");
}

function buildCreativeContext(
  data: BreakdownData,
  timeSeries?: DailyDataPoint[],
  anomalies?: Anomaly[],
  adCreatives?: AdCreativeBreakdown[]
): string {
  const lines: string[] = [];

  if (adCreatives && adCreatives.length > 0) {
    const top10 = [...adCreatives]
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 10);
    lines.push("## Ad Performance (top 10 by spend)");
    for (const ad of top10) {
      lines.push(
        `- ${ad.ad_name}: $${ad.spend.toFixed(0)} spend, ${ad.ctr.toFixed(2)}% CTR, ${ad.roas.toFixed(2)}x ROAS, ${ad.frequency.toFixed(1)}x freq, ${ad.conversions} conv`
      );
    }
  }

  if (data.devices.length > 0) {
    lines.push("\n## Device Distribution");
    for (const d of data.devices) {
      lines.push(`- ${d.device_platform}: $${d.spend.toFixed(0)} spend, ${d.clicks} clicks, ${d.conversions} conv`);
    }
  }

  if (data.formats.length > 0) {
    lines.push("\n## Format Performance (for cross-reference)");
    for (const f of data.formats) {
      lines.push(`- ${f.format}: ${f.ctr.toFixed(2)}% CTR, ${f.roas.toFixed(2)}x ROAS`);
    }
  }

  if (timeSeries && timeSeries.length > 0) {
    lines.push("\n## Daily Trend");
    for (const day of timeSeries) {
      lines.push(`- ${day.date}: $${day.spend.toFixed(0)} spend, ${day.ctr.toFixed(2)}% CTR, ${day.roas.toFixed(2)}x ROAS, ${day.conversions} conv`);
    }
  }

  appendAnomalies(lines, anomalies);
  return lines.join("\n");
}

function appendAnomalies(lines: string[], anomalies?: Anomaly[]) {
  if (!anomalies || anomalies.length === 0) return;
  lines.push("\n## Detected Anomalies (pre-identified signals — investigate these)");
  for (const a of anomalies) {
    lines.push(`- [${a.metric}] ${a.signal}`);
  }
}

// --- Sub-agent caller ---

const VALID_SEVERITIES = new Set<InsightSeverity>(["positive", "negative", "neutral"]);

async function callSubAgent(args: {
  category: InsightCategory;
  context: string;
  computed: HeuristicInsight[];
  apiKey: string;
  baseUrl: string;
  model: string;
  log: (msg: string, extra?: unknown) => void;
}): Promise<LlmInsight[]> {
  const { category, context, computed, apiKey, baseUrl, model, log } = args;

  const alreadySurfaced = computed
    .filter((i) => i.category === category)
    .map((i) => `- ${i.text}`)
    .join("\n");

  const userMessage = `Generate exactly 2 ${category} insights.

${alreadySurfaced ? `Do NOT repeat these already-computed insights:\n${alreadySurfaced}\n` : ""}
DATA:
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
          maxOutputTokens: 1024,
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

    const validated: LlmInsight[] = insights
      .filter(
        (i: Record<string, unknown>) =>
          typeof i.text === "string" &&
          i.text.length > 0 &&
          VALID_SEVERITIES.has(i.severity as InsightSeverity)
      )
      .slice(0, 2)
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

export async function generateParallelInsights(args: {
  data: BreakdownData;
  previousData?: BreakdownData;
  timeSeries?: DailyDataPoint[];
  objectives?: ObjectiveBreakdown[];
  anomalies: Anomaly[];
  computedInsights: HeuristicInsight[];
  adCreatives?: AdCreativeBreakdown[];
  log: (msg: string, extra?: unknown) => void;
}): Promise<LlmInsight[]> {
  const apiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
  if (!apiKey) {
    args.log("GEMINI_API_KEY not configured, skipping LLM insights");
    return [];
  }

  const model = Deno.env.get("GEMINI_MODEL")?.trim() || "gemini-3-flash-preview";
  const baseUrl = Deno.env.get("GEMINI_BASE_URL")?.trim() || "https://generativelanguage.googleapis.com";

  const byCategory = (cat: InsightCategory) =>
    args.anomalies.filter((a) => a.category === cat);

  const shared = { apiKey, baseUrl, model, computed: args.computedInsights, log: args.log };

  const [formatInsights, placementInsights, audienceInsights, creativeInsights] =
    await Promise.all([
      callSubAgent({
        ...shared,
        category: "formats",
        context: buildFormatsContext(args.data, args.objectives, byCategory("formats")),
      }),
      callSubAgent({
        ...shared,
        category: "placements",
        context: buildPlacementsContext(args.data, args.previousData, byCategory("placements")),
      }),
      callSubAgent({
        ...shared,
        category: "audiences",
        context: buildAudiencesContext(args.data, args.objectives, byCategory("audiences")),
      }),
      callSubAgent({
        ...shared,
        category: "creative",
        context: buildCreativeContext(args.data, args.timeSeries, byCategory("creative"), args.adCreatives),
      }),
    ]);

  return [
    ...formatInsights,
    ...placementInsights,
    ...audienceInsights,
    ...creativeInsights,
  ];
}
