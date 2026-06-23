import { describe, expect, it } from "bun:test";

import { brandStrategySchema } from "./brand-strategy";
import { brandGuidelinesSchema } from "./brand-guidelines";
import { brandDnaSchema, renderBrandDnaMarkdown, toBrandDna } from "./brand-dna";
import {
  brandReportEnrichSectionSchema,
  brandReportResultSchema,
  brandReportSectionSchema,
  onboardingReportStructuredSchema,
} from "./brand-report";
import type { BrandReportResult } from "./brand-report";

describe("brandReportSectionSchema (single-source section enum — FE+BE)", () => {
  it("includes the synthesis sections", () => {
    expect(brandReportSectionSchema.parse("strategy")).toBe("strategy");
    expect(brandReportSectionSchema.parse("guidelines")).toBe("guidelines");
  });
  it("rejects an unknown section", () => {
    expect(() => brandReportSectionSchema.parse("nope")).toThrow();
  });
  it("enrich enum carries audit.* for the synthesis sections", () => {
    expect(brandReportEnrichSectionSchema.parse("audit.strategy")).toBe("audit.strategy");
    expect(brandReportEnrichSectionSchema.parse("audit.guidelines")).toBe("audit.guidelines");
    expect(brandReportEnrichSectionSchema.parse("voice")).toBe("voice");
  });
});

const FULL_STRATEGY = {
  positioning: {
    target_customer: "RevOps leads at Series-B SaaS",
    market_category: "revenue reporting software",
    key_differentiator: "drafts a board-ready brief in 10 minutes",
    reason_to_believe: "deterministic pipeline math, not a BI dashboard",
    statement: "The report engine for ops leaders who stopped chasing analysts.",
  },
  personality: {
    traits: ["decisive", "operator-grade", "plainspoken"],
    archetype: "the Sage",
    descriptors: ["dry", "precise"],
  },
  promise: {
    headline: "Ship the report, not the meeting.",
    rationale: "Ops leaders are measured on cadence, not slides.",
  },
  value_proposition: "Cut Monday report-assembly from 4 hours to 10 minutes.",
  message_pillars: [
    {
      pillar: "pipeline forecasting accuracy",
      description: "We close the gap between CRM truth and the board narrative.",
      proof_points: ["deterministic math", "source-linked numbers"],
    },
    {
      pillar: "operator trust",
      description: "Built by ops people, for ops people.",
      proof_points: ["SOC-2 type II"],
    },
  ],
  taglines: {
    primary: "Ship the report, not the meeting.",
    alternates: ["Monday, handled."],
  },
};

const FULL_GUIDELINES = {
  voice_rules: {
    dos: ["Name the segment", "Quote customer pains verbatim"],
    donts: ["Use 'leverage'", "Hype without proof"],
  },
  tonal_rules: [{ dimension: "confidence", guidance: "Confident, never boastful." }],
  messaging_guardrails: {
    required_themes: ["time saved"],
    avoid_themes: ["AI magic"],
    banned_words: ["leverage", "unlock", "empower"],
    preferred_terms: ["ship", "compound"],
  },
  content_pillars: [{ pillar: "remote sales rituals", description: "How distributed teams run cadence." }],
  formatting: { emoji_usage: "none", cta_style: "Book a 20-min demo", hashtag_policy: "none on LinkedIn" },
};

describe("brandStrategySchema", () => {
  it("parses a full, valid strategy", () => {
    const parsed = brandStrategySchema.parse(FULL_STRATEGY);
    expect(parsed.message_pillars).toHaveLength(2);
    expect(parsed.positioning.target_customer).toContain("RevOps");
  });

  it("requires at least two message pillars", () => {
    expect(() =>
      brandStrategySchema.parse({ ...FULL_STRATEGY, message_pillars: [FULL_STRATEGY.message_pillars[0]] }),
    ).toThrow();
  });

  it("requires at least three personality traits", () => {
    expect(() =>
      brandStrategySchema.parse({ ...FULL_STRATEGY, personality: { ...FULL_STRATEGY.personality, traits: ["one", "two"] } }),
    ).toThrow();
  });

  it("strips unknown top-level keys (mirrors readiness rigor)", () => {
    const parsed = brandStrategySchema.parse({ ...FULL_STRATEGY, sneaky: "drop me" }) as Record<string, unknown>;
    expect(parsed.sneaky).toBeUndefined();
  });
});

describe("brandGuidelinesSchema", () => {
  it("parses full, valid guidelines", () => {
    const parsed = brandGuidelinesSchema.parse(FULL_GUIDELINES);
    expect(parsed.messaging_guardrails.banned_words).toContain("leverage");
  });

  it("defaults array fields when omitted", () => {
    const parsed = brandGuidelinesSchema.parse({
      voice_rules: {},
      messaging_guardrails: {},
    });
    expect(parsed.voice_rules.dos).toEqual([]);
    expect(parsed.tonal_rules).toEqual([]);
    expect(parsed.messaging_guardrails.banned_words).toEqual([]);
    expect(parsed.content_pillars).toEqual([]);
  });
});

describe("onboardingReportStructuredSchema: strategy + guidelines wiring", () => {
  it("defaults strategy and guidelines to null for legacy payloads", () => {
    const parsed = onboardingReportStructuredSchema.parse({
      connected_accounts: [],
      website: { website_url: "https://mocky.example" },
      documents: {},
      target_audience: {},
      business: null,
    });
    expect(parsed.strategy).toBeNull();
    expect(parsed.guidelines).toBeNull();
  });

  it("carries a populated strategy + guidelines", () => {
    const parsed = onboardingReportStructuredSchema.parse({
      connected_accounts: [],
      website: { website_url: "https://mocky.example" },
      documents: {},
      target_audience: {},
      business: null,
      strategy: FULL_STRATEGY,
      guidelines: FULL_GUIDELINES,
    });
    expect(parsed.strategy?.taglines.primary).toBe("Ship the report, not the meeting.");
    expect(parsed.guidelines?.tonal_rules).toHaveLength(1);
  });
});

function buildResult(overrides?: Partial<BrandReportResult>): BrandReportResult {
  return {
    brand_profile: {
      id: "brand-mocky",
      brand_name: "Mocky",
      website_url: "https://mocky.example",
      brand_voice: { tone: "confident, not boastful", banned_words: ["leverage"] },
      target_audience: null,
    },
    structured: onboardingReportStructuredSchema.parse({
      connected_accounts: [],
      website: {
        website_url: "https://mocky.example",
        palette: { primary: "#111111", secondary: "#eeeeee" },
        typography: { primary: "Inter", secondary: "Georgia" },
      },
      documents: {},
      target_audience: { summary: "Ops + finance leaders who own weekly reporting." },
      business: null,
      strategy: FULL_STRATEGY,
      guidelines: FULL_GUIDELINES,
    }),
    understanding: {
      positioning_thesis: "For ops leaders, Mocky drafts the board brief in 10 minutes.",
      hypothesis_icp: "Head of RevOps at Series-B SaaS",
      brand_pillars: ["fast reporting", "operator trust"],
      tonal_signal: "crisp operator confidence",
      notable_evidence: [],
    },
    audits: {},
    readiness: null,
    first_impression: null,
    prompt_version: 1,
    citations: {},
    ...overrides,
  };
}

describe("brandReportResultSchema (typed composite validator — C2 de-blob)", () => {
  it("parses a full, valid BrandReportResult", () => {
    expect(() => brandReportResultSchema.parse(buildResult())).not.toThrow();
  });

  it("accepts a legacy composite shape (readiness stripped, no prompt_version)", () => {
    const full = buildResult();
    const legacy = {
      brand_profile: full.brand_profile,
      structured: full.structured,
      understanding: full.understanding,
      audits: {},
      first_impression: null,
      citations: {},
    };
    const parsed = brandReportResultSchema.parse(legacy);
    expect(parsed.prompt_version).toBe(0);
    expect(parsed.readiness).toBeNull();
  });

  it("rejects a composite missing the required understanding", () => {
    const full = buildResult();
    expect(() =>
      brandReportResultSchema.parse({ brand_profile: full.brand_profile, structured: full.structured }),
    ).toThrow();
  });
});

describe("toBrandDna", () => {
  it("projects a BrandReportResult into a canonical BrandDna", () => {
    const dna = toBrandDna(buildResult());
    expect(dna.brand_name).toBe("Mocky");
    expect(dna.brand_id).toBe("brand-mocky");
    expect(dna.palette?.primary).toBe("#111111");
    expect(dna.typography?.primary).toBe("Inter");
    expect(dna.positioning_thesis).toContain("Mocky");
    expect(dna.brand_pillars).toEqual(["fast reporting", "operator trust"]);
    expect(dna.strategy?.promise.headline).toBe("Ship the report, not the meeting.");
    expect(dna.guidelines?.messaging_guardrails.banned_words).toContain("leverage");
    expect(dna.voice?.tone).toBe("confident, not boastful");
    expect(dna.audience?.summary).toContain("Ops");
  });

  it("validates against brandDnaSchema", () => {
    const dna = toBrandDna(buildResult());
    expect(() => brandDnaSchema.parse(dna)).not.toThrow();
  });
});

describe("renderBrandDnaMarkdown", () => {
  it("renders a single grounding block with the brand heading + populated sections", () => {
    const md = renderBrandDnaMarkdown(toBrandDna(buildResult()));
    expect(md).toContain("# Mocky — Brand DNA");
    expect(md).toContain("## Positioning");
    expect(md).toContain("## Voice");
    expect(md).toContain("## Audience");
    expect(md).toContain("Banned words:");
    expect(md).toContain("leverage");
  });

  it("omits sections with no data", () => {
    const bare = brandDnaSchema.parse({ brand_name: "Bare Co" });
    const md = renderBrandDnaMarkdown(bare);
    expect(md).toContain("# Bare Co — Brand DNA");
    expect(md).not.toContain("## Voice");
    expect(md).not.toContain("## Strategy");
    expect(md).not.toContain("## Audience");
  });
});
