import { describe, expect, it } from "bun:test";

import { brandBookResponseSchema } from "./brand-book";

const COMPOSITE = {
  brand_profile: { id: "brand-mocky", brand_name: "Mocky", website_url: "https://mocky.example" },
  structured: {
    connected_accounts: [],
    website: { website_url: "https://mocky.example" },
    documents: {},
    target_audience: {},
    business: null,
  },
  understanding: {
    positioning_thesis: "For ops leaders, Mocky drafts the brief.",
    hypothesis_icp: "Head of RevOps",
    brand_pillars: ["fast reporting"],
    tonal_signal: "operator confidence",
    notable_evidence: [],
  },
};

describe("brandBookResponseSchema", () => {
  it("parses a full envelope and defaults documents/summary/brand_md", () => {
    const parsed = brandBookResponseSchema.parse({
      brand_id: "brand-mocky",
      composite: COMPOSITE,
    });
    expect(parsed.brand_id).toBe("brand-mocky");
    expect(parsed.composite.deep).toBeNull();
    expect(parsed.summary_markdown).toBeNull();
    expect(parsed.documents).toEqual([]);
    expect(parsed.brand_md).toBeNull();
    expect(parsed.brand_tokens).toBeNull();
    expect(parsed.brand_md_is_edited).toBe(false);
  });

  it("carries the effective brand.md, its parsed tokens, and the edited flag", () => {
    const parsed = brandBookResponseSchema.parse({
      brand_id: "brand-mocky",
      composite: COMPOSITE,
      brand_md: '---\nschema_version: 1\nbrand_name: Mocky\n---\n# Mocky — Brand Book',
      brand_tokens: { schema_version: 1, brand_name: "Mocky", colors: [{ value: "#111111", role: "primary" }] },
      brand_md_is_edited: true,
    });
    expect(parsed.brand_md).toContain("Brand Book");
    expect(parsed.brand_tokens?.colors[0]?.value).toBe("#111111");
    expect(parsed.brand_md_is_edited).toBe(true);
  });

  it("parses documents with their concept category", () => {
    const parsed = brandBookResponseSchema.parse({
      brand_id: "brand-mocky",
      composite: COMPOSITE,
      summary_markdown: "# Mocky — Brand Book",
      documents: [
        { id: "d1", name: "Brand guidelines.pdf", category: "brand_guidelines", status: "ready", created_at: "2026-06-22T00:00:00Z" },
      ],
    });
    expect(parsed.documents[0]?.category).toBe("brand_guidelines");
    expect(parsed.summary_markdown).toContain("Brand Book");
  });

  it("coerces an unknown document category to misc", () => {
    const parsed = brandBookResponseSchema.parse({
      brand_id: "brand-mocky",
      composite: COMPOSITE,
      documents: [{ id: "d1", name: "x", category: "nonsense", status: "ready", created_at: "2026-06-22T00:00:00Z" }],
    });
    expect(parsed.documents[0]?.category).toBe("misc");
  });
});
