import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import type { GeneratedCampaignInsight } from "../../lib/paid-media/insight-data-points";

const BRAND_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_BRAND_ID = "22222222-2222-4222-8222-222222222222";
const AD_ACCOUNT_ID = "act_123";

type SnapshotRow = {
  id: string;
  brand_id: string;
  ad_account_id: string;
  insight_count: number;
  source: string;
};

type InsightRow = { snapshot_id: string; campaign_id: string | null };

type FakeState = {
  snapshots: SnapshotRow[];
  insights: InsightRow[];
  failInsightInsert: boolean;
  brandContext: {
    user: { id: string } | null;
    permissions: Array<{ brand_profile_id: string; role: string | null }>;
  };
};

const state: FakeState = {
  snapshots: [],
  insights: [],
  failInsightInsert: false,
  brandContext: {
    user: { id: "user-1" },
    permissions: [{ brand_profile_id: BRAND_ID, role: "owner" }],
  },
};

function buildClient() {
  const builder = {
    _table: "",
    _pendingInsert: null as null | { row: SnapshotRow | InsightRow | InsightRow[]; returnsId: boolean },
    schema() {
      return builder;
    },
    from(table: string) {
      builder._table = table;
      builder._pendingInsert = null;
      return builder;
    },
    insert(row: unknown) {
      if (builder._table === "paid_media_insight_snapshots") {
        const r = row as Omit<SnapshotRow, "id">;
        const snapshot: SnapshotRow = { ...r, id: `snap-${state.snapshots.length + 1}` };
        builder._pendingInsert = { row: snapshot, returnsId: true };
        state.snapshots.push(snapshot);
        return builder;
      }
      if (builder._table === "paid_media_campaign_insights") {
        if (state.failInsightInsert) {
          return {
            select: () => ({ single: async () => ({ data: null, error: { message: "boom" } }) }),
            // for the bare insert() awaited form:
            then: (resolve: (v: { data: null; error: { message: string } }) => unknown) =>
              resolve({ data: null, error: { message: "boom" } }),
          };
        }
        const rows = row as InsightRow[];
        state.insights.push(...rows);
        return {
          then: (resolve: (v: { data: InsightRow[]; error: null }) => unknown) =>
            resolve({ data: rows, error: null }),
        };
      }
      return builder;
    },
    select() {
      return {
        single: async () => {
          if (builder._pendingInsert?.returnsId) {
            return { data: { id: (builder._pendingInsert.row as SnapshotRow).id }, error: null };
          }
          return { data: null, error: { message: "no pending insert" } };
        },
      };
    },
    delete() {
      return {
        eq(_column: string, value: string) {
          state.snapshots = state.snapshots.filter((s) => s.id !== value);
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  };
  return builder;
}

mock.module("@/lib/brands/active-brand-context", () => ({
  getActiveBrandContext: async () => state.brandContext,
}));

mock.module("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => buildClient(),
}));

const { persistCampaignInsightsSnapshot } = await import("./paidMediaInsights");

function makeInsight(overrides: Partial<GeneratedCampaignInsight> = {}): GeneratedCampaignInsight {
  return {
    id: "ins-1",
    scope: "campaign",
    severity: "warning",
    title: "Title",
    summary: "Summary",
    source: "matrix",
    evidence: [
      {
        campaignId: "camp-1",
        campaignName: "Camp",
        metric: "roas",
        currentValue: 1.2,
        percentileRank: 0.1,
        direction: "higher_is_better",
        status: "risk",
        evidenceWindow: "last_14d",
      },
    ],
    ...overrides,
  };
}

describe("persistCampaignInsightsSnapshot", () => {
  beforeEach(() => {
    state.snapshots = [];
    state.insights = [];
    state.failInsightInsert = false;
    state.brandContext = {
      user: { id: "user-1" },
      permissions: [{ brand_profile_id: BRAND_ID, role: "owner" }],
    };
  });

  afterEach(() => {
    state.snapshots = [];
    state.insights = [];
  });

  it("rejects empty insight arrays", async () => {
    const result = await persistCampaignInsightsSnapshot({
      brandId: BRAND_ID,
      adAccountId: AD_ACCOUNT_ID,
      rangePreset: "last_14d",
      peerSetSize: 0,
      insights: [],
    });
    expect(result.ok).toBe(false);
    expect(state.snapshots).toHaveLength(0);
  });

  it("rejects when caller has no brand access", async () => {
    const result = await persistCampaignInsightsSnapshot({
      brandId: OTHER_BRAND_ID,
      adAccountId: AD_ACCOUNT_ID,
      rangePreset: "last_14d",
      peerSetSize: 3,
      insights: [makeInsight()],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/No access to brand/);
    }
    expect(state.snapshots).toHaveLength(0);
  });

  it("rejects when no user is present", async () => {
    state.brandContext = { user: null, permissions: [] };
    const result = await persistCampaignInsightsSnapshot({
      brandId: BRAND_ID,
      adAccountId: AD_ACCOUNT_ID,
      rangePreset: "last_14d",
      peerSetSize: 3,
      insights: [makeInsight()],
    });
    expect(result.ok).toBe(false);
  });

  it("inserts snapshot + insight rows atomically on success", async () => {
    const result = await persistCampaignInsightsSnapshot({
      brandId: BRAND_ID,
      adAccountId: AD_ACCOUNT_ID,
      rangePreset: "last_14d",
      peerSetSize: 5,
      insights: [makeInsight(), makeInsight({ id: "ins-2" })],
    });
    expect(result.ok).toBe(true);
    expect(state.snapshots).toHaveLength(1);
    expect(state.snapshots[0].insight_count).toBe(2);
    expect(state.insights).toHaveLength(2);
    expect(state.insights.every((r) => r.snapshot_id === state.snapshots[0].id)).toBe(true);
  });

  it("rolls back the snapshot if insight insert fails", async () => {
    state.failInsightInsert = true;
    const result = await persistCampaignInsightsSnapshot({
      brandId: BRAND_ID,
      adAccountId: AD_ACCOUNT_ID,
      rangePreset: "last_14d",
      peerSetSize: 5,
      insights: [makeInsight()],
    });
    expect(result.ok).toBe(false);
    expect(state.snapshots).toHaveLength(0);
  });
});
