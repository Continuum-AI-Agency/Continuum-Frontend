import type { CreativeAd, CreativeGalleryFilters, CreativeMetricKey } from './types';

const KNOWN_ASPECTS: ReadonlyArray<{ label: string; ratio: number }> = [
  { label: '9:16', ratio: 9 / 16 },
  { label: '4:5', ratio: 4 / 5 },
  { label: '1:1', ratio: 1 },
  { label: '4:3', ratio: 4 / 3 },
  { label: '16:9', ratio: 16 / 9 },
];

// Snap a loaded image's natural dimensions to the closest common ad aspect ratio.
// Compared in log-space so e.g. 1.91 reads as 16:9 rather than 4:3.
export function nearestAspectLabel(width: number, height: number): string | null {
  if (!(width > 0) || !(height > 0)) return null;
  const ratio = width / height;
  let best = KNOWN_ASPECTS[0];
  let bestDelta = Math.abs(Math.log(ratio / best.ratio));
  for (const candidate of KNOWN_ASPECTS) {
    const delta = Math.abs(Math.log(ratio / candidate.ratio));
    if (delta < bestDelta) {
      best = candidate;
      bestDelta = delta;
    }
  }
  return best.label;
}

function matchesQuery(ad: CreativeAd, query: string): boolean {
  if (!query) return true;
  const haystack = [ad.name, ad.creative?.title, ad.creative?.body]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

function matchesStatus(
  ad: CreativeAd,
  statusFilter: CreativeGalleryFilters['statusFilter'],
): boolean {
  if (statusFilter === 'all') return true;
  const isActive = (ad.effectiveStatus ?? ad.status ?? '').toUpperCase() === 'ACTIVE';
  return statusFilter === 'active' ? isActive : !isActive;
}

export function filterAndSortCreatives(
  ads: readonly CreativeAd[],
  filters: CreativeGalleryFilters,
): CreativeAd[] {
  const query = filters.query.trim().toLowerCase();

  const filtered = ads.filter((ad) => {
    if (!matchesQuery(ad, query)) return false;
    if (!matchesStatus(ad, filters.statusFilter)) return false;
    if (filters.selectedOnly && !filters.selectedIds.has(ad.id)) return false;
    return true;
  });

  const sorted = [...filtered];
  if (filters.sortKey === 'name') {
    sorted.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    const key: CreativeMetricKey = filters.sortKey;
    sorted.sort((a, b) => (b.metrics?.[key] ?? 0) - (a.metrics?.[key] ?? 0));
  }
  return sorted;
}
