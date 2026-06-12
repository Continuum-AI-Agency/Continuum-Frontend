import { describe, expect, it } from "bun:test";

import { onboardingReportStructuredSchema } from "./brand-report";
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
