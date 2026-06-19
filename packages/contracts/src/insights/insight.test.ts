import { describe, expect, it } from "bun:test";

import {
  computeMediaInsightFingerprint,
  insightSchema,
  organicInsightToCanonical,
  organicSeverityToCanonical,
  paidInsightToCanonical,
} from "./insight";
import type { GeneratedCampaignInsight } from "../paid/insight-model";
import type { OrganicComputedInsight } from "../organic/insights";

const ctx = { platform: "meta", generatedAt: "2026-06-18T00:00:00.000Z" };

describe("computeMediaInsightFingerprint", () => {
  it("matches the SQL generated-column formula", () => {
    expect(
      computeMediaInsightFingerprint({ entityId: "camp-1", primaryMetric: "roas", status: "risk" }),
    ).toBe("camp-1:roas:risk");
    expect(
      computeMediaInsightFingerprint({ entityId: null, primaryMetric: "cpa", status: "strong" }),
    ).toBe("account:cpa:strong");
  });
});

describe("paidInsightToCanonical", () => {
  const paid: GeneratedCampaignInsight = {
    id: "campaign-b:risk:cpa",
    scope: "campaign",
    severity: "critical",
    title: "B needs review",
    summary: "CPA is under relative threshold for the selected peer set.",
    recommendation: "Inspect the row.",
    evidence: [
      {
        campaignId: "campaign-b",
        campaignName: "B",
        metric: "cpa",
        currentValue: 60,
        percentileRank: 0.1,
        direction: "lower_is_better",
        status: "risk",
        evidenceWindow: "last_14d",
      },
    ],
    source: "matrix",
  };

  it("maps a paid risk insight into a canonical Insight that validates", () => {
    const canonical = paidInsightToCanonical(paid, ctx);
    const parsed = insightSchema.safeParse(canonical);
    expect(parsed.success).toBe(true);
    expect(canonical.channel).toBe("paid");
    expect(canonical.severity).toBe("critical");
    expect(canonical.status).toBe("risk");
    expect(canonical.primaryMetric).toBe("cpa");
    expect(canonical.fingerprint).toBe("campaign-b:cpa:risk");
    expect(canonical.entityRef).toEqual({ id: "campaign-b", name: "B" });
    expect(canonical.actionState).toBe("open");
    expect(canonical.evidence[0]?.metric).toBe("cpa");
  });
});

describe("organicSeverityToCanonical", () => {
  const base: OrganicComputedInsight = {
    category: "growth",
    text: "Reach fell sharply week over week.",
    severity: "negative",
    source: "computed",
  };

  it("maps positive → opportunity/strong", () => {
    expect(organicSeverityToCanonical({ ...base, severity: "positive" })).toEqual({
      severity: "opportunity",
      status: "strong",
    });
  });

  it("maps neutral → info/unknown", () => {
    expect(organicSeverityToCanonical({ ...base, severity: "neutral" })).toEqual({
      severity: "info",
      status: "unknown",
    });
  });

  it("escalates a large negative delta to critical", () => {
    expect(organicSeverityToCanonical({ ...base, delta: -40 })).toEqual({
      severity: "critical",
      status: "risk",
    });
  });

  it("keeps a small negative delta at warning", () => {
    expect(organicSeverityToCanonical({ ...base, delta: -10 })).toEqual({
      severity: "warning",
      status: "risk",
    });
  });
});

describe("organicInsightToCanonical", () => {
  it("maps a per-post organic insight into a canonical post-scope Insight", () => {
    const organic: OrganicComputedInsight = {
      category: "content",
      text: "This reel's hook rate leads the account.",
      severity: "positive",
      source: "computed",
      metric: "hook_rate",
      value: 0.42,
      delta: 18,
      recommendation: "Reuse this opening.",
      post_id: "post-123",
    };
    const canonical = organicInsightToCanonical(organic, { ...ctx, platform: "instagram" });
    const parsed = insightSchema.safeParse(canonical);
    expect(parsed.success).toBe(true);
    expect(canonical.channel).toBe("organic");
    expect(canonical.scope).toBe("post");
    expect(canonical.category).toBe("content");
    expect(canonical.entityRef).toEqual({ id: "post-123" });
    expect(canonical.fingerprint).toBe("post-123:hook_rate:strong");
    expect(canonical.evidence[0]).toMatchObject({ metric: "hook_rate", currentValue: 0.42 });
  });

  it("falls back to account scope and category-keyed fingerprint for LLM insights", () => {
    const organic: OrganicComputedInsight = {
      category: "audience",
      text: "Non-follower reach is climbing.",
      severity: "neutral",
      source: "llm",
    };
    const canonical = organicInsightToCanonical(organic, { ...ctx, platform: "instagram" });
    expect(canonical.scope).toBe("account");
    expect(canonical.evidence).toEqual([]);
    expect(canonical.fingerprint).toBe("account:audience:unknown");
    expect(insightSchema.safeParse(canonical).success).toBe(true);
  });
});
