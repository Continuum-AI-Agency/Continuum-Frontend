// Adapted from Brigade apps/web/lib/inbox.ts at c5100df20b3a7ef335dac03ccc6745e5caba4274.
// Copyright (c) 2026 Georges Petrov. MIT; see THIRD_PARTY_NOTICES.md.
const KEPT_FILTERS = ['role', 'status'] as const;
export type WatchmanFilters = Partial<Record<(typeof KEPT_FILTERS)[number], string>>;
export const filtersKey = (brandId: string) => `continuum.watchman.filters.${brandId}`;

export function filtersToRestore(
  params: URLSearchParams,
  saved: string | null,
): WatchmanFilters | null {
  if ([...KEPT_FILTERS, 'q', 'item', 'conversation'].some((name) => params.has(name)) || !saved)
    return null;
  let value: unknown;
  try {
    value = JSON.parse(saved);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const kept: WatchmanFilters = {};
  for (const name of KEPT_FILTERS) {
    const candidate = (value as Record<string, unknown>)[name];
    if (typeof candidate === 'string' && candidate && candidate.length <= 200)
      kept[name] = candidate;
  }
  return Object.keys(kept).length ? kept : null;
}
