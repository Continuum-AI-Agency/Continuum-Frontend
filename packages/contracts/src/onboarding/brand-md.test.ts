import { describe, expect, it } from "bun:test";

import {
  assembleBrandMd,
  brandMdTokensSchema,
  extractBrandTokens,
  parseBrandMd,
  serializeBrandMd,
  type BrandMdTokens,
} from "./brand-md";
import { brandReportResultSchema, type BrandReportResult } from "./brand-report";

// Mirrors the fixture in brand-bible.test.ts so the two stay in lockstep about
// what a fully-populated report looks like.
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
  promise: { headline: "Ship the report, not the meeting.", rationale: "Ops leaders are measured on cadence." },
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
      target_audience: { summary: "Ops + finance leaders who own weekly reporting.", segments: [{ name: "RevOps lead", jtbd: "Ship the weekly board brief." }] },
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
    audits: { voice: { score: 88, severity: "low", findings: [] } },
    readiness: null,
    first_impression: null,
    prompt_version: 1,
    citations: {},
    ...overrides,
  });
}

function sampleTokens(overrides?: Partial<BrandMdTokens>): BrandMdTokens {
  return brandMdTokensSchema.parse({
    schema_version: 1,
    brand_name: "Mocky",
    colors: [
      { value: "#111111", role: "primary" },
      { value: "#22aa55", role: "accent", name: "Signal Green" },
    ],
    typography: [
      { family: "Inter", role: "display" },
      { family: "Georgia", role: "body" },
    ],
    logo: { storage_path: "brand/mocky/logo.png", treatment_default: "palette-only" },
    voice: { tone: "confident", style: "punchy", power_verbs: ["ship"], banned_words: ["leverage"] },
    personality: { archetype: "the Sage", traits: ["decisive", "precise", "plainspoken"], descriptors: ["dry"] },
    imagery: null,
    audience: { primary_summary: "Ops leaders", anchors: ["fast reporting"] },
    ...overrides,
  });
}

describe("serializeBrandMd / parseBrandMd round-trip", () => {
  it("round-trips tokens through YAML front matter", () => {
    const tokens = sampleTokens();
    const body = "# Mocky — Brand Book\n## Positioning\nbody line";
    const parsed = parseBrandMd(serializeBrandMd({ tokens, body }));
    expect(parsed.tokens).toEqual(tokens);
    expect(parsed.body).toBe(body);
  });

  it("emits front matter fenced by --- with valid, raw YAML", () => {
    const doc = serializeBrandMd({ tokens: sampleTokens(), body: "body" });
    expect(doc.startsWith("---\n")).toBe(true);
    expect(doc).toContain("brand_name: Mocky");
    expect(doc).toContain("#111111");
  });

  it("is string-idempotent: serialize(parse(serialize(x))) === serialize(x)", () => {
    const doc = serializeBrandMd({ tokens: sampleTokens(), body: "# B\n## S\nx" });
    const reparsed = parseBrandMd(doc);
    expect(serializeBrandMd({ tokens: reparsed.tokens!, body: reparsed.body })).toBe(doc);
  });
});

describe("parseBrandMd tolerance (never throws)", () => {
  it("returns tokens:null and whole input as body when there is no front matter", () => {
    const input = "# Just a title\nsome body";
    const parsed = parseBrandMd(input);
    expect(parsed.tokens).toBeNull();
    expect(parsed.body).toBe(input);
  });

  it("degrades invalid YAML front matter to tokens:null, preserving the whole input", () => {
    const input = "---\nfoo: [1, 2\n---\n# Body";
    const parsed = parseBrandMd(input);
    expect(parsed.tokens).toBeNull();
    expect(parsed.body).toBe(input);
  });

  it("degrades schema-invalid front matter (no brand_name) to tokens:null", () => {
    const input = "---\nnot_brand: x\n---\n# Body";
    const parsed = parseBrandMd(input);
    expect(parsed.tokens).toBeNull();
    expect(parsed.body).toBe(input);
  });

  it("strips unknown front-matter keys but still parses known tokens", () => {
    const doc = "---\nschema_version: 1\nbrand_name: Mocky\nunknown_key: whatever\n---\n# Body";
    expect(parseBrandMd(doc).tokens?.brand_name).toBe("Mocky");
  });

  it("reflects a user-edited hex (the 'fix a wrong scraped color' flow)", () => {
    const doc = serializeBrandMd({ tokens: sampleTokens(), body: "b" }).replace("#111111", "#000000");
    const parsed = parseBrandMd(doc);
    expect(parsed.tokens?.colors.find((c) => c.role === "primary")?.value).toBe("#000000");
  });
});

describe("extractBrandTokens (deterministic, no hallucination)", () => {
  it("pulls palette, typography, voice, personality, audience, logo from the report", () => {
    const tokens = extractBrandTokens(buildResult(), { colors: [], logoPath: "brand/mocky/logo.png" });
    expect(tokens.brand_name).toBe("Mocky");
    expect(tokens.colors.find((c) => c.role === "primary")?.value).toBe("#111111");
    expect(tokens.typography.find((t) => t.role === "display")?.family).toBe("Inter");
    expect(tokens.logo?.storage_path).toBe("brand/mocky/logo.png");
    expect(tokens.personality?.archetype).toBe("the Sage");
    expect(tokens.voice?.banned_words).toContain("leverage");
    expect(tokens.audience?.primary_summary).toContain("reporting");
    expect(tokens.audience?.anchors).toContain("fast reporting");
    // imagery is left for the async LLM prose pass (Phase B4).
    expect(tokens.imagery).toBeNull();
  });

  it("never invents colors: empty palette and empty kit yields no color tokens", () => {
    const base = buildResult();
    const noPalette = brandReportResultSchema.parse({
      ...base,
      structured: { ...base.structured, website: { website_url: base.structured.website.website_url } },
    });
    const tokens = extractBrandTokens(noPalette, { colors: [], logoPath: null });
    expect(tokens.colors).toEqual([]);
    expect(tokens.typography).toEqual([]);
    expect(tokens.logo).toBeNull();
  });

  it("canonicalizes hex colors to lowercase with a leading #", () => {
    const base = buildResult();
    const upper = brandReportResultSchema.parse({
      ...base,
      structured: { ...base.structured, website: { ...base.structured.website, palette: { primary: "#ABCDEF" } } },
    });
    expect(extractBrandTokens(upper, { colors: [], logoPath: null }).colors[0]?.value).toBe("#abcdef");
  });
});

describe("assembleBrandMd", () => {
  it("prepends token front matter above the full brand book body", () => {
    const result = buildResult();
    const tokens = extractBrandTokens(result, { colors: [], logoPath: null });
    const doc = assembleBrandMd({ tokens, result });
    expect(doc.startsWith("---\n")).toBe(true);
    expect(doc).toContain("brand_name: Mocky");
    expect(doc).toContain("## Positioning");
    const parsed = parseBrandMd(doc);
    expect(parsed.tokens?.brand_name).toBe("Mocky");
    expect(parsed.body).toContain("## Positioning");
  });
});
