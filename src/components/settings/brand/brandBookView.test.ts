import { describe, expect, it } from "bun:test";
import { brandReportResultSchema, type BrandReportResult } from "@continuum/contracts";

import { buildBrandBookView } from "./brandBookView";

const FULL_STRATEGY = {
  positioning: {
    target_customer: "RevOps leads",
    market_category: "revenue reporting",
    key_differentiator: "board-ready brief in 10 minutes",
    reason_to_believe: "deterministic pipeline math",
    statement: "The report engine for ops leaders.",
  },
  personality: { traits: ["decisive", "operator-grade", "plainspoken"], archetype: "the Sage", descriptors: ["dry"] },
  promise: { headline: "Ship the report, not the meeting.", rationale: "Measured on cadence." },
  value_proposition: "Cut report assembly from 4 hours to 10 minutes.",
  message_pillars: [
    { pillar: "accuracy", description: "CRM truth to board narrative.", proof_points: ["deterministic math"] },
    { pillar: "operator trust", description: "Built by ops people.", proof_points: ["SOC-2"] },
  ],
  taglines: { primary: "Ship the report.", alternates: ["Monday, handled."] },
};

const READINESS = {
  overall_score: 78,
  dimensions: {
    value_proposition: { score: 82, rationale: "Sharp claim." },
    icp_clarity: { score: 80, rationale: "Named buyer." },
    customer_pains: { score: 70, rationale: "Implied." },
    success_metrics: { score: 65, rationale: "No KPI." },
    positioning: { score: 85, rationale: "Clear contrast." },
    messaging_coherence: { score: 79, rationale: "Aligned." },
    brand_identity: { score: 72, rationale: "Palette set." },
  },
  findings: [],
  generated_at: "2026-06-22T00:00:00Z",
};

function buildResult(overrides?: Partial<BrandReportResult>): BrandReportResult {
  return brandReportResultSchema.parse({
    brand_profile: { id: "brand-mocky", brand_name: "Mocky", website_url: "https://mocky.example" },
    structured: {
      connected_accounts: [],
      website: { website_url: "https://mocky.example", palette: { primary: "#111" }, typography: { primary: "Inter" } },
      documents: {},
      target_audience: { summary: "Ops leaders." },
      business: null,
      strategy: FULL_STRATEGY,
      guidelines: null,
    },
    understanding: {
      positioning_thesis: "Mocky drafts the brief.",
      hypothesis_icp: "Head of RevOps",
      brand_pillars: ["fast reporting"],
      tonal_signal: "operator confidence",
      notable_evidence: [],
    },
    audits: { strategy: { score: 74, severity: "medium", findings: [] } },
    readiness: READINESS,
    ...overrides,
  });
}

describe("buildBrandBookView", () => {
  it("groups sections into Identity / Signals / Deep analysis tiers", () => {
    const view = buildBrandBookView(buildResult());
    const labels = view.groups.map((g) => g.label);
    expect(labels).toEqual(["Identity", "Signals", "Deep analysis"]);
  });

  it("surfaces readiness in the Signals (T1) tier when present", () => {
    const view = buildBrandBookView(buildResult());
    const signals = view.groups.find((g) => g.tier === "T1");
    expect(signals?.sections.some((s) => s.id === "readiness")).toBe(true);
  });

  it("marks T2 deep sections pending (no body) when deep is null", () => {
    const view = buildBrandBookView(buildResult());
    const deep = view.groups.find((g) => g.tier === "T2");
    expect(deep).toBeDefined();
    expect(deep?.sections.every((s) => s.pending && s.lines.length === 0)).toBe(true);
  });

  it("renders T2 content (not pending) when deep is populated", () => {
    const view = buildBrandBookView(
      buildResult({
        deep: {
          strategic_narrative: { mission: ["Make reporting effortless"], vision: [], core_values: [] },
          messaging_system: null,
          product: null,
          deep_personas: null,
          competitive_frame: null,
          generated_at: "2026-06-22T00:00:00Z",
          model: null,
        },
      }),
    );
    const deep = view.groups.find((g) => g.tier === "T2");
    const narrative = deep?.sections.find((s) => s.id === "deep_narrative");
    expect(narrative?.pending).toBe(false);
    expect(narrative?.lines.join(" ")).toContain("Make reporting effortless");
  });
});
