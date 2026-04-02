import type { BreakdownData } from "./breakdowns.ts";
import type { HeuristicInsight } from "./compute.ts";

type InsightCategory = "formats" | "placements" | "audiences" | "creative";
type InsightSeverity = "positive" | "negative" | "neutral";

export type LlmInsight = {
  category: InsightCategory;
  text: string;
  severity: InsightSeverity;
  source: "llm";
};

function condenseSummary(data: BreakdownData): string {
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

  return lines.join("\n");
}

function buildPrompt(
  data: BreakdownData,
  computed: HeuristicInsight[]
): string {
  const summary = condenseSummary(data);

  const alreadySurfaced = computed
    .map((i) => `- [${i.category}] ${i.text}`)
    .join("\n");

  return `You are a senior paid media analyst reviewing a Meta Ads account. Given the performance breakdown data below, generate exactly 8 high-impact insights (2 per category).

CATEGORIES: formats, placements, audiences, creative

RULES:
- Each insight MUST be a single sentence, under 140 characters
- Focus on CROSS-DIMENSIONAL patterns that combine data from multiple breakdowns (e.g., audience + placement, format + device, demographics + format)
- Include specific numbers from the data
- Provide strategic, actionable observations — not just restating what the data shows
- Do NOT repeat or rephrase these already-computed insights:
${alreadySurfaced}
- Rate each as: positive (opportunity to exploit), negative (risk to address), or neutral (noteworthy observation)

ACCOUNT BREAKDOWN DATA:
${summary}

Respond ONLY with valid JSON matching this schema:
{
  "insights": [
    { "category": "formats", "text": "...", "severity": "positive" },
    { "category": "formats", "text": "...", "severity": "neutral" },
    { "category": "placements", "text": "...", "severity": "positive" },
    { "category": "placements", "text": "...", "severity": "negative" },
    { "category": "audiences", "text": "...", "severity": "positive" },
    { "category": "audiences", "text": "...", "severity": "neutral" },
    { "category": "creative", "text": "...", "severity": "positive" },
    { "category": "creative", "text": "...", "severity": "negative" }
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
    }));
}

export async function generateLlmInsights(args: {
  data: BreakdownData;
  computedInsights: HeuristicInsight[];
  log: (msg: string, extra?: unknown) => void;
}): Promise<LlmInsight[]> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    args.log("GEMINI_API_KEY not configured, skipping LLM insights");
    return [];
  }

  const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash-preview-05-20";
  const prompt = buildPrompt(args.data, args.computedInsights);

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
