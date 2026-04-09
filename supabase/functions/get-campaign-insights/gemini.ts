import type { BreakdownData, DailyDataPoint } from "../get-account-insights/breakdowns.ts";
import type { HeuristicInsight } from "../get-account-insights/compute.ts";
import type { Anomaly } from "../get-account-insights/anomalies.ts";

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

// --- Campaign-aware system instructions ---

function buildSystemInstructions(
  campaignName: string,
  campaignObjective: string
): Record<InsightCategory, string> {
  const objectiveCtx = campaignObjective
    ? ` This is a ${campaignObjective} campaign — weight your analysis toward metrics that matter for that objective.`
    : "";

  return {
    formats: `You analyze ad format performance for the campaign "${campaignName}".${objectiveCtx}
Identify which formats deliver best results within this campaign.
Compare format efficiency against the campaign's own averages — not external benchmarks.
Flag formats receiving disproportionate spend relative to their performance.
Each insight: single sentence under 140 chars, include specific numbers, with a concrete recommendation and estimated impact.`,

    placements: `You analyze platform and placement performance for the campaign "${campaignName}".${objectiveCtx}
Identify which platforms and positions (Feed, Stories, Reels, etc.) perform best within this campaign.
Detect period-over-period shifts in placement effectiveness.
Flag placements where spend allocation doesn't match conversion efficiency.
Each insight: single sentence under 140 chars, include specific numbers, with a concrete recommendation and estimated impact.`,

    audiences: `You analyze demographic audience segments for the campaign "${campaignName}".${objectiveCtx}
Identify which age/gender segments convert most efficiently within this campaign.
Detect demographic shifts vs the prior period — which segments are growing or declining.
Flag audience segments receiving spend but underdelivering on the campaign's primary metric.
Each insight: single sentence under 140 chars, include specific numbers, with a concrete recommendation and estimated impact.`,

    creative: `You analyze creative signals from device usage and daily trends for the campaign "${campaignName}".${objectiveCtx}
Identify device-format correlations (e.g., mobile outperforms desktop for this campaign).
Detect trend inflection points — is this campaign accelerating, plateauing, or declining?
Flag creative fatigue signals: declining CTR, rising CPC, engagement drops over the period.
Each insight: single sentence under 140 chars, include specific numbers, with a concrete recommendation and estimated impact.`,
  };
}

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

// --- Context builders ---

function buildFormatsContext(data: BreakdownData, anomalies: Anomaly[]): string {
  const lines: string[] = [];
  if (data.formats.length > 0) {
    lines.push("## Format Performance");
    for (const f of data.formats) {
      lines.push(`- ${f.format}: $${f.spend.toFixed(0)} spend, ${f.ctr.toFixed(2)}% CTR, ${f.roas.toFixed(2)}x ROAS, ${f.conversions} conv`);
    }
  }
  appendAnomalies(lines, anomalies);
  return lines.join("\n") || "No format data available for this campaign.";
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
  return lines.join("\n") || "No placement data available for this campaign.";
}

function buildAudiencesContext(data: BreakdownData, anomalies?: Anomaly[]): string {
  const lines: string[] = [];
  if (data.demographics.length > 0) {
    lines.push("## Audience Demographics");
    for (const d of data.demographics) {
      lines.push(`- ${d.age} ${d.gender}: $${d.spend.toFixed(0)} spend, ${d.conversions} conv, $${d.conversion_value.toFixed(0)} value`);
    }
  }
  appendAnomalies(lines, anomalies);
  return lines.join("\n") || "No demographic data available for this campaign.";
}

function buildCreativeContext(
  data: BreakdownData,
  timeSeries?: DailyDataPoint[],
  anomalies?: Anomaly[]
): string {
  const lines: string[] = [];
  if (data.devices.length > 0) {
    lines.push("## Device Distribution");
    for (const d of data.devices) {
      lines.push(`- ${d.device_platform}: $${d.spend.toFixed(0)} spend, ${d.clicks} clicks, ${d.conversions} conv`);
    }
  }
  if (data.formats.length > 0) {
    lines.push("\n## Format Performance (cross-reference)");
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
  return lines.join("\n") || "No creative signal data available for this campaign.";
}

function appendAnomalies(lines: string[], anomalies?: Anomaly[]) {
  if (!anomalies || anomalies.length === 0) return;
  lines.push("\n## Detected Anomalies (investigate these)");
  for (const a of anomalies) {
    lines.push(`- [${a.metric}] ${a.signal}`);
  }
}

// --- Sub-agent caller ---

const VALID_SEVERITIES = new Set<InsightSeverity>(["positive", "negative", "neutral"]);

async function callSubAgent(args: {
  category: InsightCategory;
  systemInstruction: string;
  context: string;
  computed: HeuristicInsight[];
  apiKey: string;
  baseUrl: string;
  model: string;
  log: (msg: string, extra?: unknown) => void;
}): Promise<LlmInsight[]> {
  const { category, systemInstruction, context, computed, apiKey, baseUrl, model, log } = args;

  const alreadySurfaced = computed
    .filter((i) => i.category === category)
    .map((i) => `- ${i.text}`)
    .join("\n");

  const userMessage = `Generate exactly 2 ${category} insights for this campaign.

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
        system_instruction: { parts: [{ text: systemInstruction }] },
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
      log(`[${category}] Could not parse JSON`, text.slice(0, 300));
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

export async function generateCampaignInsights(args: {
  campaignName: string;
  campaignObjective: string;
  data: BreakdownData;
  previousData?: BreakdownData;
  timeSeries?: DailyDataPoint[];
  anomalies: Anomaly[];
  computedInsights: HeuristicInsight[];
  log: (msg: string, extra?: unknown) => void;
}): Promise<LlmInsight[]> {
  const apiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
  if (!apiKey) {
    args.log("GEMINI_API_KEY not configured, skipping LLM insights");
    return [];
  }

  const model = Deno.env.get("GEMINI_MODEL")?.trim() || "gemini-3-flash-preview";
  const baseUrl = Deno.env.get("GEMINI_BASE_URL")?.trim() || "https://generativelanguage.googleapis.com";

  const instructions = buildSystemInstructions(args.campaignName, args.campaignObjective);
  const byCategory = (cat: InsightCategory) => args.anomalies.filter((a) => a.category === cat);

  const shared = { apiKey, baseUrl, model, computed: args.computedInsights, log: args.log };

  const [formatInsights, placementInsights, audienceInsights, creativeInsights] =
    await Promise.all([
      callSubAgent({
        ...shared,
        category: "formats",
        systemInstruction: instructions.formats,
        context: buildFormatsContext(args.data, byCategory("formats")),
      }),
      callSubAgent({
        ...shared,
        category: "placements",
        systemInstruction: instructions.placements,
        context: buildPlacementsContext(args.data, args.previousData, byCategory("placements")),
      }),
      callSubAgent({
        ...shared,
        category: "audiences",
        systemInstruction: instructions.audiences,
        context: buildAudiencesContext(args.data, byCategory("audiences")),
      }),
      callSubAgent({
        ...shared,
        category: "creative",
        systemInstruction: instructions.creative,
        context: buildCreativeContext(args.data, args.timeSeries, byCategory("creative")),
      }),
    ]);

  return [...formatInsights, ...placementInsights, ...audienceInsights, ...creativeInsights];
}
