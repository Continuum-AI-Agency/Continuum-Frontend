import { describe, expect, it } from "bun:test";

import {
  competitorHealthChipSchema,
  deriveCompetitorHealthChip,
} from "./health-chip";

describe("deriveCompetitorHealthChip", () => {
  it("returns a schema-valid chip carrying last_synced_at through", () => {
    const chip = deriveCompetitorHealthChip({
      organicStatus: "ready",
      paidStatus: "ready",
      metaPageResolutionStatus: "resolved",
      postsFound: 12,
      adsFound: 4,
      lastSyncedAt: "2026-07-02T00:00:00.000Z",
    });
    expect(chip).toEqual({
      state: "healthy",
      label: "Healthy",
      tone: "positive",
      last_synced_at: "2026-07-02T00:00:00.000Z",
    });
    expect(competitorHealthChipSchema.safeParse(chip).success).toBe(true);
  });

  it("reports sync_error above all else when a sync error is present", () => {
    const chip = deriveCompetitorHealthChip({
      organicStatus: "needs_instagram",
      paidStatus: "resolving",
      lastSyncError: "graph 500",
      lastSyncedAt: null,
    });
    expect(chip.state).toBe("sync_error");
    expect(chip.tone).toBe("danger");
  });

  it("treats an errored paid/meta-page status as sync_error", () => {
    expect(deriveCompetitorHealthChip({ paidStatus: "error" }).state).toBe("sync_error");
    expect(deriveCompetitorHealthChip({ metaPageResolutionStatus: "error" }).state).toBe(
      "sync_error",
    );
  });

  it("flags needs_handle when organic needs an Instagram handle", () => {
    const chip = deriveCompetitorHealthChip({ organicStatus: "needs_instagram" });
    expect(chip.state).toBe("needs_handle");
    expect(chip.label).toBe("Needs handle");
    expect(chip.tone).toBe("warning");
  });

  it("flags page_unresolved for an unresolved meta page or paid status", () => {
    expect(deriveCompetitorHealthChip({ metaPageResolutionStatus: "unresolved" }).state).toBe(
      "page_unresolved",
    );
    expect(deriveCompetitorHealthChip({ paidStatus: "unresolved" }).state).toBe("page_unresolved");
  });

  it("flags needs_review when resolution needs manual review", () => {
    expect(deriveCompetitorHealthChip({ paidStatus: "needs_review" }).state).toBe("needs_review");
    expect(deriveCompetitorHealthChip({ metaPageResolutionStatus: "needs_review" }).state).toBe(
      "needs_review",
    );
  });

  it("reports collecting while resolving or before the first sync", () => {
    expect(deriveCompetitorHealthChip({ paidStatus: "resolving" }).state).toBe("collecting");
    expect(deriveCompetitorHealthChip({ metaPageResolutionStatus: "resolving" }).state).toBe(
      "collecting",
    );
    expect(
      deriveCompetitorHealthChip({
        organicStatus: "ready",
        metaPageResolutionStatus: "resolved",
        lastSyncedAt: null,
      }).state,
    ).toBe("collecting");
  });

  it("reports no_posts_found once resolved and synced but empty", () => {
    const chip = deriveCompetitorHealthChip({
      organicStatus: "ready",
      metaPageResolutionStatus: "resolved",
      postsFound: 0,
      adsFound: 0,
      lastSyncedAt: "2026-07-02T00:00:00.000Z",
    });
    expect(chip.state).toBe("no_posts_found");
    expect(chip.tone).toBe("warning");
  });
});
