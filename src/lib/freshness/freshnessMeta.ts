// FE read adapter for data-freshness cards (IMP-016 / BUG-017). Maps any
// surface's own sync signal into the shared FreshnessMeta view-model so the
// dashboard, analytics, and Brand Spy render "last sync / next sync / source
// status" consistently. The projection lives in @continuum/contracts; this is
// the thin surface-facing entry the apply lanes call.

import {
  deriveFreshnessMeta,
  type FreshnessInput,
  type FreshnessMeta,
  freshnessFromDiagnosticsMeta,
} from '@continuum/contracts';

export type { FreshnessMeta, FreshnessStatus } from '@continuum/contracts';
export { deriveFreshnessMeta, freshnessFromDiagnosticsMeta } from '@continuum/contracts';

// The common surface case: a card knows only its own last-synced timestamp
// (e.g. a competitor row's last_resolved_at, a dashboard module's synced_at).
// Extra freshness signals (next_sync_at, an in-flight sync, an error) are
// optional so the same helper covers the richer surfaces too.
export function freshnessFromSyncedAt(
  lastSyncedAt: string | null | undefined,
  extra: Omit<FreshnessInput, 'lastSyncedAt'> = {},
): FreshnessMeta {
  return deriveFreshnessMeta({ ...extra, lastSyncedAt: lastSyncedAt ?? null });
}

// Human-readable "how long ago" for a cache age in seconds. Shared so every
// freshness surface renders the same phrasing ("just now", "5m ago", "3h ago",
// "2d ago") instead of re-deriving it per card. Returns null when the age is
// unknown so callers can hide the label rather than print a placeholder.
export function formatFreshnessAge(cacheAgeSeconds: number | null): string | null {
  if (cacheAgeSeconds === null) return null;
  if (cacheAgeSeconds < 60) return 'just now';
  const minutes = Math.floor(cacheAgeSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
