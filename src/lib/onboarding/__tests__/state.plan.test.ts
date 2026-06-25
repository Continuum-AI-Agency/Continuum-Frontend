import { describe, expect, it } from "bun:test";

import {
  createDefaultOnboardingState,
  mergeOnboardingState,
  normalizeOnboardingState,
} from "../state";

describe("onboarding plan selection", () => {
  it("defaults to an empty plan selection", () => {
    const state = createDefaultOnboardingState();
    expect(state.plan.interestArea).toBeNull();
    expect(state.plan.products).toEqual([]);
    expect(state.plan.checkoutCompleted).toBe(false);
  });

  it("backfills a missing plan on a legacy persisted state", () => {
    const legacy = createDefaultOnboardingState() as Record<string, unknown>;
    delete legacy.plan;
    const parsed = normalizeOnboardingState(legacy);
    expect(parsed.plan.products).toEqual([]);
  });

  it("merges a partial plan patch without clobbering untouched fields", () => {
    const base = createDefaultOnboardingState();
    const afterProducts = mergeOnboardingState(base, {
      plan: { interestArea: "both", products: ["studio", "organic_agent"] },
    });
    expect(afterProducts.plan.interestArea).toBe("both");
    expect(afterProducts.plan.products).toEqual(["studio", "organic_agent"]);

    const afterTrends = mergeOnboardingState(afterProducts, {
      plan: { addons: ["provider_exa"], trendsTier: "base", planCode: "organic_studio" },
    });
    // products/interestArea preserved through the second patch
    expect(afterTrends.plan.products).toEqual(["studio", "organic_agent"]);
    expect(afterTrends.plan.addons).toEqual(["provider_exa"]);
    expect(afterTrends.plan.trendsTier).toBe("base");
    expect(afterTrends.plan.planCode).toBe("organic_studio");
  });

  it("rejects an unknown product in the plan", () => {
    const base = createDefaultOnboardingState();
    expect(() =>
      mergeOnboardingState(base, { plan: { products: ["bogus" as never] } }),
    ).toThrow();
  });
});
