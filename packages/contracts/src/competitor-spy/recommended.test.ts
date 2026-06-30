import { describe, expect, it } from "bun:test";

import {
  recommendedCompetitorSchema,
  recommendedCompetitorsResponseSchema,
  dismissRecommendationRequestSchema,
  dismissRecommendationResponseSchema,
} from "./recommended";

describe("recommendedCompetitorSchema", () => {
  it("validates a fully populated recommendation", () => {
    const parsed = recommendedCompetitorSchema.parse({
      name: "Acme Co",
      slug: "acme-co",
      instagramHandle: "acme",
      instagramUrl: "https://www.instagram.com/acme",
      website: "https://acme.example",
      facebookUrl: "https://facebook.com/acme",
      tiktokUrl: null,
      insight: "Leads with community-driven UGC and sustainability messaging.",
      alreadyTracked: false,
    });
    expect(parsed.instagramHandle).toBe("acme");
    expect(parsed.alreadyTracked).toBe(false);
  });

  it("allows nullable identity fields for a name-only recommendation", () => {
    const parsed = recommendedCompetitorSchema.parse({
      name: "Mystery Brand",
      slug: "mystery-brand",
      instagramHandle: null,
      instagramUrl: null,
      website: null,
      facebookUrl: null,
      tiktokUrl: null,
      insight: null,
      alreadyTracked: true,
    });
    expect(parsed.alreadyTracked).toBe(true);
  });

  it("rejects unknown keys", () => {
    expect(() =>
      recommendedCompetitorSchema.parse({
        name: "Acme",
        slug: "acme",
        instagramHandle: null,
        instagramUrl: null,
        website: null,
        facebookUrl: null,
        tiktokUrl: null,
        insight: null,
        alreadyTracked: false,
        unexpected: "x",
      }),
    ).toThrow();
  });
});

describe("recommendedCompetitorsResponseSchema", () => {
  it("wraps an array of recommendations", () => {
    const parsed = recommendedCompetitorsResponseSchema.parse({
      recommended: [
        {
          name: "Acme",
          slug: "acme",
          instagramHandle: "acme",
          instagramUrl: "https://www.instagram.com/acme",
          website: null,
          facebookUrl: null,
          tiktokUrl: null,
          insight: null,
          alreadyTracked: false,
        },
      ],
    });
    expect(parsed.recommended).toHaveLength(1);
  });
});

describe("dismissRecommendationRequestSchema", () => {
  it("accepts a dismiss request and an optional restore flag", () => {
    const dismiss = dismissRecommendationRequestSchema.parse({
      brandId: "66666666-6666-4666-8666-666666666666",
      name: "Acme",
    });
    expect(dismiss.restore).toBeUndefined();

    const restore = dismissRecommendationRequestSchema.parse({
      brandId: "66666666-6666-4666-8666-666666666666",
      name: "Acme",
      restore: true,
    });
    expect(restore.restore).toBe(true);
  });

  it("requires a uuid brandId", () => {
    expect(() =>
      dismissRecommendationRequestSchema.parse({ brandId: "nope", name: "Acme" }),
    ).toThrow();
  });
});

describe("dismissRecommendationResponseSchema", () => {
  it("reports the resulting dismissed state", () => {
    const parsed = dismissRecommendationResponseSchema.parse({ dismissed: true, name: "Acme" });
    expect(parsed.dismissed).toBe(true);
  });
});
