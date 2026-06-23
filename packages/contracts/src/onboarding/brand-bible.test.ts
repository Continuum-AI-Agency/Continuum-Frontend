import { describe, expect, it } from "bun:test";

import {
  BRAND_BIBLE_SECTIONS,
  renderBrandBibleMarkdown,
  renderBrandDnaMarkdown,
  toBrandDna,
} from "./brand-dna";
import { brandReportResultSchema, type BrandReportResult } from "./brand-report";

const FULL_STRATEGY = {
  positioning: {
    target_customer: "RevOps leads at Series-B SaaS",
    market_category: "revenue reporting software",
    key_differentiator: "drafts a board-ready brief in 10 minutes",
    reason_to_believe: "deterministic pipeline math, not a BI dashboard",
    statement: "The report engine for ops leaders who stopped chasing analysts.",
  },
  personality: { traits: ["decisive", "operator-grade", "plainspoken"], archetype: "the Sage", descriptors: ["dry", "precise"] },
  promise: { headline: "Ship the report, not the meeting.", rationale: "Ops leaders are measured on cadence, not slides." },
  value_proposition: "Cut Monday report-assembly from 4 hours to 10 minutes.",
  message_pillars: [
    { pillar: "pipeline forecasting accuracy", description: "We close the gap between CRM truth and the board narrative.", proof_points: ["deterministic math"] },
    { pillar: "operator trust", description: "Built by ops people, for ops people.", proof_points: ["SOC-2 type II"] },
  ],
  taglines: { primary: "Ship the report, not the meeting.", alternates: ["Monday, handled."] },
};

const FULL_GUIDELINES = {
  voice_rules: { dos: ["Name the segment"], donts: ["Use 'leverage'"] },
  tonal_rules: [{ dimension: "confidence", guidance: "Confident, never boastful." }],
  messaging_guardrails: { required_themes: ["time saved"], avoid_themes: ["AI magic"], banned_words: ["leverage"], preferred_terms: ["ship"] },
  content_pillars: [{ pillar: "remote sales rituals", description: "How distributed teams run cadence." }],
  formatting: { emoji_usage: "none", cta_style: "Book a 20-min demo", hashtag_policy: "none on LinkedIn" },
};

const READINESS = {
  overall_score: 78,
  dimensions: {
    value_proposition: { score: 82, rationale: "Sharp, quantified time-savings claim." },
    icp_clarity: { score: 80, rationale: "Named RevOps buyer." },
    customer_pains: { score: 70, rationale: "Pains implied, not verbatim." },
    success_metrics: { score: 65, rationale: "No explicit KPI." },
    positioning: { score: 85, rationale: "Clear category contrast vs BI." },
    messaging_coherence: { score: 79, rationale: "Pillars align to promise." },
    brand_identity: { score: 72, rationale: "Palette set; typography thin." },
  },
  findings: [],
  generated_at: "2026-06-21T00:00:00Z",
};

function buildResult(overrides?: Partial<BrandReportResult>): BrandReportResult {
  return brandReportResultSchema.parse({
    brand_profile: {
      id: "brand-mocky",
      brand_name: "Mocky",
      website_url: "https://mocky.example",
      brand_voice: { tone: "confident, not boastful", banned_words: ["leverage"] },
      target_audience: null,
    },
    structured: {
      connected_accounts: [],
      website: {
        website_url: "https://mocky.example",
        palette: { primary: "#111111", secondary: "#eeeeee", accent: "#22aa55" },
        typography: { primary: "Inter", secondary: "Georgia" },
      },
      documents: {},
      target_audience: { summary: "Ops + finance leaders who own weekly reporting.", segments: [{ name: "RevOps lead", jtbd: "Ship the weekly board brief without chasing analysts." }] },
      business: null,
      strategy: FULL_STRATEGY,
      guidelines: FULL_GUIDELINES,
    },
    understanding: {
      positioning_thesis: "For ops leaders, Mocky drafts the board brief in 10 minutes.",
      hypothesis_icp: "Head of RevOps at Series-B SaaS",
      brand_pillars: ["fast reporting", "operator trust"],
      tonal_signal: "crisp operator confidence",
      notable_evidence: [],
    },
    audits: {
      voice: { score: 88, severity: "low", findings: [] },
      strategy: { score: 74, severity: "medium", findings: [] },
    },
    readiness: READINESS,
    first_impression: null,
    prompt_version: 1,
    citations: {},
    ...overrides,
  });
}

describe("BRAND_BIBLE_SECTIONS registry", () => {
  it("has a stable, ordered section list", () => {
    const ids = BRAND_BIBLE_SECTIONS.map((s) => s.id);
    expect(ids).toEqual([
      "positioning",
      "brand_pillars",
      "voice",
      "audience",
      "promise",
      "visual_identity",
      "personas",
      "messaging",
      "readiness",
      "section_scores",
      "deep_narrative",
      "deep_messaging",
      "deep_product",
      "deep_personas",
      "deep_competition",
    ]);
  });

  it("marks exactly the lean grounding sections as includeInGrounding", () => {
    const grounding = BRAND_BIBLE_SECTIONS.filter((s) => s.includeInGrounding).map((s) => s.id);
    expect(grounding).toEqual(["positioning", "brand_pillars", "voice", "audience", "promise", "visual_identity"]);
  });

  it("tags every deep_* section as tier T2", () => {
    const deep = BRAND_BIBLE_SECTIONS.filter((s) => s.id.startsWith("deep_"));
    expect(deep.length).toBeGreaterThan(0);
    expect(deep.every((s) => s.tier === "T2")).toBe(true);
  });
});

describe("renderBrandDnaMarkdown (lean grounding block, registry-driven)", () => {
  it("emits only grounding-tier headings", () => {
    const md = renderBrandDnaMarkdown(toBrandDna(buildResult()));
    expect(md).toContain("# Mocky — Brand DNA");
    expect(md).toContain("## Positioning");
    expect(md).toContain("## Voice");
    expect(md).toContain("## Audience");
    // Non-grounding sections never appear in the lean block.
    expect(md).not.toContain("## Readiness");
    expect(md).not.toContain("## Personas");
    expect(md).not.toContain("Pending deep analysis");
  });
});

describe("renderBrandBibleMarkdown (full-fidelity brand.md)", () => {
  it("is a superset of the lean grounding block", () => {
    const result = buildResult();
    const lean = renderBrandDnaMarkdown(toBrandDna(result));
    const full = renderBrandBibleMarkdown(result);
    // Every non-empty grounding line survives into the full document.
    for (const line of lean.split("\n").filter((l) => l.trim() && !l.startsWith("# "))) {
      expect(full).toContain(line);
    }
  });

  it("renders the readiness scorecard with the overall score and dimensions", () => {
    const full = renderBrandBibleMarkdown(buildResult());
    expect(full).toContain("## Readiness");
    expect(full).toContain("78");
    expect(full).toContain("value_proposition");
  });

  it("renders T2 pending stubs when deep is null", () => {
    const full = renderBrandBibleMarkdown(buildResult());
    expect(full).toContain("Pending deep analysis");
  });

  it("renders T2 content when deep is populated", () => {
    const full = renderBrandBibleMarkdown(
      buildResult({
        deep: {
          strategic_narrative: { mission: ["Make weekly reporting effortless"], vision: [], core_values: [] },
          messaging_system: null,
          product: null,
          deep_personas: null,
          competitive_frame: {
            top_competitors: [{ name: "BI Co", strategy_summary: null, key_messaging: null, url: null }],
            insights: null,
            recommendations: null,
          },
          generated_at: "2026-06-21T00:00:00Z",
          model: null,
        },
      }),
    );
    expect(full).toContain("Make weekly reporting effortless");
    expect(full).toContain("BI Co");
  });

  it("includes a governance footer with the prompt version", () => {
    const full = renderBrandBibleMarkdown(buildResult());
    expect(full.toLowerCase()).toContain("prompt version");
  });
});
