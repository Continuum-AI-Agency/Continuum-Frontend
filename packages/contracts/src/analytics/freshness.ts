// Data-freshness view-model shared by every data-dependent surface (IMP-016 /
// BUG-017): "last sync / next sync / source status" cards on the dashboard,
// analytics, and Brand Spy. It re-uses the diagnostics/ToolMeta fields
// (source / cached_at / cache_age_seconds / stale) rather than inventing a
// parallel envelope, and adds the two things a freshness CARD needs on top of a
// tool-result meta: an explicit next_sync_at and a derived UI `status` so a
// surface can tell "missing vs stale vs syncing vs failed" apart at a glance.

import { z } from "zod";

import { diagnosticsMetaSchema, type DiagnosticsMeta } from "./diagnostics";

export const freshnessStatusSchema = z.enum([
  "fresh",
  "stale",
  "syncing",
  "never",
  "error",
]);
export type FreshnessStatus = z.infer<typeof freshnessStatusSchema>;

export const freshnessMetaSchema = z.object({
  status: freshnessStatusSchema,
  // Reuses the diagnostics source enum (live | cache | db | miss); null when a
  // surface only knows its own synced_at and has no source signal.
  source: diagnosticsMetaSchema.shape.source.nullable(),
  last_synced_at: z.string().nullable(),
  next_sync_at: z.string().nullable(),
  cache_age_seconds: z.number().int().nullable(),
  stale: z.boolean(),
  error: z.string().nullable(),
});
export type FreshnessMeta = z.infer<typeof freshnessMetaSchema>;

// camelCase because callers hold camelCase view state; the projection emits the
// snake_case wire/view-model shape above. All optional so a surface can pass as
// little as a single synced_at.
export interface FreshnessInput {
  source?: DiagnosticsMeta["source"] | null;
  lastSyncedAt?: string | null;
  nextSyncAt?: string | null;
  cacheAgeSeconds?: number | null;
  stale?: boolean | null;
  // An in-flight sync the surface knows about (e.g. a job is running). Distinct
  // from `stale`, which means "last-good is older than its TTL".
  syncing?: boolean | null;
  error?: string | null;
  // Injectable clock for deterministic tests.
  now?: number;
}

function ageSeconds(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return null;
  return Math.max(0, Math.floor((now - ts) / 1000));
}

function deriveFreshnessStatus(
  input: FreshnessInput,
  lastSyncedAt: string | null,
): FreshnessStatus {
  if (input.error) return "error";
  if (input.syncing) return "syncing";
  if (lastSyncedAt === null && (input.source == null || input.source === "miss")) {
    return "never";
  }
  return input.stale ? "stale" : "fresh";
}

export function deriveFreshnessMeta(input: FreshnessInput = {}): FreshnessMeta {
  const now = input.now ?? Date.now();
  const lastSyncedAt = input.lastSyncedAt ?? null;
  return {
    status: deriveFreshnessStatus(input, lastSyncedAt),
    source: input.source ?? null,
    last_synced_at: lastSyncedAt,
    next_sync_at: input.nextSyncAt ?? null,
    cache_age_seconds: input.cacheAgeSeconds ?? ageSeconds(lastSyncedAt, now),
    stale: input.stale ?? false,
    error: input.error ?? null,
  };
}

// Adapter from a tool-result meta (diagnostics / ToolMeta) into the freshness
// view-model, so an analytics card backed by a diagnostics job doesn't re-map
// snake_case fields by hand.
export function freshnessFromDiagnosticsMeta(
  meta: DiagnosticsMeta,
  extra: Pick<FreshnessInput, "nextSyncAt" | "syncing" | "error" | "now"> = {},
): FreshnessMeta {
  return deriveFreshnessMeta({
    source: meta.source,
    lastSyncedAt: meta.cached_at,
    cacheAgeSeconds: meta.cache_age_seconds,
    stale: meta.stale,
    nextSyncAt: extra.nextSyncAt,
    syncing: extra.syncing,
    error: extra.error,
    now: extra.now,
  });
}
