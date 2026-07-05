import { describe, expect, it } from "bun:test";

import type { DiagnosticsMeta } from "./diagnostics";
import {
  deriveFreshnessMeta,
  freshnessFromDiagnosticsMeta,
  freshnessMetaSchema,
} from "./freshness";

const NOW = Date.parse("2026-07-02T12:00:00.000Z");

describe("deriveFreshnessMeta", () => {
  it("reports 'never' when there is no sync and no usable source", () => {
    const meta = deriveFreshnessMeta({ source: "miss", now: NOW });
    expect(meta.status).toBe("never");
    expect(meta.last_synced_at).toBeNull();
    expect(meta.cache_age_seconds).toBeNull();
    expect(freshnessMetaSchema.safeParse(meta).success).toBe(true);
  });

  it("computes cache_age_seconds from last_synced_at against the injected clock", () => {
    const meta = deriveFreshnessMeta({
      source: "cache",
      lastSyncedAt: "2026-07-02T11:00:00.000Z",
      now: NOW,
    });
    expect(meta.status).toBe("fresh");
    expect(meta.cache_age_seconds).toBe(3600);
  });

  it("marks stale when the surface flags stale", () => {
    const meta = deriveFreshnessMeta({
      source: "cache",
      lastSyncedAt: "2026-07-01T00:00:00.000Z",
      stale: true,
      now: NOW,
    });
    expect(meta.status).toBe("stale");
    expect(meta.stale).toBe(true);
  });

  it("prefers 'syncing' over stale/fresh when a sync is in flight", () => {
    const meta = deriveFreshnessMeta({
      source: "cache",
      lastSyncedAt: "2026-07-01T00:00:00.000Z",
      stale: true,
      syncing: true,
      now: NOW,
    });
    expect(meta.status).toBe("syncing");
  });

  it("reports 'error' above every other signal and passes the message through", () => {
    const meta = deriveFreshnessMeta({
      source: "cache",
      lastSyncedAt: "2026-07-02T11:00:00.000Z",
      syncing: true,
      error: "sync failed",
      now: NOW,
    });
    expect(meta.status).toBe("error");
    expect(meta.error).toBe("sync failed");
  });

  it("carries next_sync_at through for surfaces that schedule the next run", () => {
    const meta = deriveFreshnessMeta({
      source: "live",
      lastSyncedAt: "2026-07-02T11:59:00.000Z",
      nextSyncAt: "2026-07-02T13:00:00.000Z",
      now: NOW,
    });
    expect(meta.next_sync_at).toBe("2026-07-02T13:00:00.000Z");
    expect(meta.status).toBe("fresh");
  });
});

describe("freshnessFromDiagnosticsMeta", () => {
  it("maps a diagnostics/ToolMeta envelope into the freshness view-model", () => {
    const diagnostics: DiagnosticsMeta = {
      source: "cache",
      cached_at: "2026-07-02T11:00:00.000Z",
      cache_age_seconds: 3600,
      stale: false,
    };
    const meta = freshnessFromDiagnosticsMeta(diagnostics, {
      nextSyncAt: "2026-07-02T13:00:00.000Z",
    });
    expect(meta).toEqual({
      status: "fresh",
      source: "cache",
      last_synced_at: "2026-07-02T11:00:00.000Z",
      next_sync_at: "2026-07-02T13:00:00.000Z",
      cache_age_seconds: 3600,
      stale: false,
      error: null,
    });
    expect(freshnessMetaSchema.safeParse(meta).success).toBe(true);
  });
});
