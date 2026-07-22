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
