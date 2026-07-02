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
    expect(parsed.composite?.deep).toBeNull();
    expect(parsed.summary_markdown).toBeNull();
    expect(parsed.documents).toEqual([]);
    expect(parsed.brand_md).toBeNull();
    expect(parsed.brand_tokens).toBeNull();
    expect(parsed.brand_md_is_edited).toBe(false);
  });

  it("defaults the materialization envelope (assembling, not present, no composite)", () => {
    const parsed = brandBookResponseSchema.parse({ brand_id: "brand-mocky" });
    expect(parsed.status).toBe("assembling");
    expect(parsed.present).toBe(false);
    expect(parsed.refreshed_at).toBeNull();
    expect(parsed.stale).toBe(false);
    expect(parsed.assembled).toBeNull();
    // composite is nullable now: a book can exist with no brand report.
    expect(parsed.composite).toBeNull();
  });

  it("parses a materialized assembled composite of the three sources", () => {
    const parsed = brandBookResponseSchema.parse({
      brand_id: "brand-mocky",
      status: "ready",
      present: true,
      refreshed_at: "2026-07-01T12:00:00Z",
      assembled: {
        onboarding: { present: true, completed: true, completed_at: "2026-06-30T00:00:00Z", summary: { industry: "SaaS" } },
        guidelines: [{ purpose: "general", status: "draft", version: 1, notes: "Executive summary", colors: { primary: "#111" } }],
        documents: [{ id: "d1", name: "Personas.pdf", category: "audience_persona", status: "ready", created_at: "2026-06-22T00:00:00Z", excerpt: "Head of RevOps..." }],
        report: { composite: COMPOSITE, brand_md: "# Book", brand_md_is_edited: false },
      },
    });
    expect(parsed.status).toBe("ready");
    expect(parsed.present).toBe(true);
    expect(parsed.assembled?.onboarding?.completed).toBe(true);
    expect(parsed.assembled?.guidelines[0]?.notes).toBe("Executive summary");
    // structured guideline sections pass through untyped
    expect((parsed.assembled?.guidelines[0] as Record<string, unknown>).colors).toEqual({ primary: "#111" });
    expect(parsed.assembled?.documents[0]?.excerpt).toContain("RevOps");
    expect(parsed.assembled?.report?.composite?.deep).toBeNull();
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
