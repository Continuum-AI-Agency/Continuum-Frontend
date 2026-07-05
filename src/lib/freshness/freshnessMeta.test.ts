import { describe, expect, it } from "bun:test";

import { freshnessFromSyncedAt } from "./freshnessMeta";

const NOW = Date.parse("2026-07-02T12:00:00.000Z");

describe("freshnessFromSyncedAt", () => {
  it("maps a bare synced_at into a fresh view-model with computed age", () => {
    const meta = freshnessFromSyncedAt("2026-07-02T11:00:00.000Z", { now: NOW });
    expect(meta.status).toBe("fresh");
    expect(meta.last_synced_at).toBe("2026-07-02T11:00:00.000Z");
    expect(meta.cache_age_seconds).toBe(3600);
    expect(meta.next_sync_at).toBeNull();
  });

  it("reports 'never' for a surface that has never synced", () => {
    const meta = freshnessFromSyncedAt(null);
    expect(meta.status).toBe("never");
    expect(meta.last_synced_at).toBeNull();
  });

  it("forwards next_sync_at and an in-flight sync flag", () => {
    const meta = freshnessFromSyncedAt("2026-07-02T11:59:00.000Z", {
      nextSyncAt: "2026-07-02T13:00:00.000Z",
      syncing: true,
      now: NOW,
    });
    expect(meta.status).toBe("syncing");
    expect(meta.next_sync_at).toBe("2026-07-02T13:00:00.000Z");
  });
});
