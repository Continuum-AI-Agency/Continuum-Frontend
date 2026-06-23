import { describe, expect, it } from "bun:test";

import {
  brandUnderstandingSchema,
  onboardingReportStructuredSchema,
  sectionAuditSchema,
} from "./brand-report";
import { businessSummarySchema } from "./business-summary";

describe("onboarding brand report competitor snapshot", () => {
  it("defaults competitors for older structured report payloads", () => {
    const parsed = onboardingReportStructuredSchema.parse({
      connected_accounts: [],
      website: { website_url: "https://acme.example" },
      documents: {},
      target_audience: {},
      business: null,
    });

    expect(parsed.competitors).toEqual([]);
  });

  it("carries competitor names from the initial business section", () => {
    const business = businessSummarySchema.parse({
      business_name: "Acme",
      business_description: "Analytics for growth teams.",
      business_features: ["Realtime alerts"],
      business_benefits: ["Catch spend waste before Monday"],
      competitor_names: ["Triple Whale", "Northbeam"],
      differentiators: ["Unlike Triple Whale, Acme ships Slack-native alerts."],
      business_cta: "Book a 20-min demo",
    });

    expect(business.competitor_names).toEqual(["Triple Whale", "Northbeam"]);
  });
});

describe("brandUnderstandingSchema (hoisted to contracts — shared FE/BE)", () => {
  it("parses a valid understanding and defaults notable_evidence", () => {
    const parsed = brandUnderstandingSchema.parse({
      positioning_thesis: "We make board-ready reports for ops leaders.",
      hypothesis_icp: "Ops leaders at mid-market SaaS.",
      brand_pillars: ["speed", "trust"],
      tonal_signal: "confident, plainspoken",
    });
    expect(parsed.notable_evidence).toEqual([]);
    expect(parsed.content_pillars ?? null).toBeNull();
  });

  it("rejects missing positioning_thesis", () => {
    expect(() =>
      brandUnderstandingSchema.parse({
        hypothesis_icp: "i",
        brand_pillars: ["a"],
        tonal_signal: "t",
      }),
    ).toThrow();
  });

  it("requires at least one brand pillar", () => {
    expect(() =>
      brandUnderstandingSchema.parse({
        positioning_thesis: "p",
        hypothesis_icp: "i",
        brand_pillars: [],
        tonal_signal: "t",
      }),
    ).toThrow();
  });
});

describe("sectionAuditSchema (hoisted to contracts — carries the per-section score)", () => {
  it("parses a valid audit with a 0-100 score", () => {
    const parsed = sectionAuditSchema.parse({
      score: 82,
      severity: "low",
      findings: [{ headline: "h", detail: "d", recommendation: "r" }],
    });
    expect(parsed.score).toBe(82);
    expect(parsed.severity).toBe("low");
  });

  it("rejects an out-of-range score", () => {
    expect(() => sectionAuditSchema.parse({ score: 142, severity: "low", findings: [] })).toThrow();
  });

  it("rejects a non-integer score", () => {
    expect(() =>
      sectionAuditSchema.parse({ score: 80.5, severity: "low", findings: [] }),
    ).toThrow();
  });

  it("defaults findings to []", () => {
    const parsed = sectionAuditSchema.parse({ score: 50, severity: "medium" });
    expect(parsed.findings).toEqual([]);
  });
});
