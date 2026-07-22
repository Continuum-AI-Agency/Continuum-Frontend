// Pure selection logic for the home Overview hero KPI. Keeps the hero contextual
// to the organic account the user is selected in on the dashboard (the same
// selection the insights list and creatives table already follow) instead of a
// fixed platform-first blend. Extracted from OrganicMetricStrip so the
// selection + fallback rules are unit-testable without a rendered component.

import type { OrganicMetricPlatform } from '@continuum/contracts';
import type {
  BrandOrganicSnapshot,
  SnapshotAccountResult,
} from '@/lib/organic/brandOrganicSnapshot';
import type { ResolvedOrganicAccount } from '@/lib/organic/resolve-organic-account';

// The snapshot row for the currently selected organic account, or null when
// there is no selection or its per-account data has not loaded — in which case
// the caller falls back to the first-ready platform hero.
export function selectHeroAccountRow(
  snapshot: BrandOrganicSnapshot | null,
  selected: ResolvedOrganicAccount | null,
): SnapshotAccountResult | null {
  if (!snapshot || !selected) return null;
  return (
    snapshot.accounts.find(
      (row) =>
        row.platform === selected.platform &&
        row.integrationAccountId === selected.account.integrationAccountId,
    ) ?? null
  );
}

// The muted strip should never repeat the platform already shown as the hero.
export function restKpisExcludingPlatform<T extends { platform: OrganicMetricPlatform }>(
  kpis: T[],
  platform: OrganicMetricPlatform | null,
): T[] {
  if (!platform) return kpis;
  return kpis.filter((kpi) => kpi.platform !== platform);
}
