// Column sorting for the Library's List layout. A column the server can order by
// (librarySortSchema) sorts the whole library through the URL; any other column,
// or direction, sorts only the rows already loaded.

import type { LibrarySort, MediaAsset } from '@continuum/contracts';

export type SortDirection = 'asc' | 'desc';
export type ListSort = { key: string; direction: SortDirection };
export type SortValue = string | number | null;

export const BUILT_IN_LIST_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'kind', label: 'Kind' },
  { key: 'size', label: 'Size' },
  { key: 'duration', label: 'Duration' },
  { key: 'dimensions', label: 'Dimensions' },
  { key: 'review', label: 'Review' },
  { key: 'created', label: 'Created' },
  { key: 'updated', label: 'Updated' },
] as const;

const SERVER_SORTS: Record<string, Partial<Record<SortDirection, LibrarySort>>> = {
  name: { asc: 'name_asc', desc: 'name_desc' },
  size: { desc: 'size_desc' },
  duration: { desc: 'duration_desc' },
  created: { desc: 'created_desc' },
  updated: { desc: 'updated_desc' },
};

// Text reads naturally A→Z first; numbers and dates read biggest/newest first.
const ASCENDING_FIRST = new Set(['name', 'kind', 'review']);

export function serverSortFor(sort: ListSort): LibrarySort | null {
  return SERVER_SORTS[sort.key]?.[sort.direction] ?? null;
}

export function listSortFromServer(sort: LibrarySort): ListSort | null {
  for (const [key, directions] of Object.entries(SERVER_SORTS)) {
    for (const [direction, value] of Object.entries(directions)) {
      if (value === sort) return { key, direction: direction as SortDirection };
    }
  }
  return null;
}

export function nextListSort(current: ListSort | null, key: string): ListSort {
  if (current?.key === key) {
    return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  }
  return { key, direction: ASCENDING_FIRST.has(key) ? 'asc' : 'desc' };
}

export function builtInSortValue(asset: MediaAsset, key: string): SortValue {
  switch (key) {
    case 'name':
      return (asset.title ?? asset.fileName).toLocaleLowerCase();
    case 'kind':
      return asset.kind;
    case 'size':
      return asset.sizeBytes ?? null;
    case 'duration':
      return asset.durationMs ?? null;
    case 'dimensions':
      return asset.width && asset.height ? asset.width * asset.height : null;
    case 'review':
      return asset.reviewStatus ?? null;
    case 'created':
      return asset.createdAt;
    case 'updated':
      return asset.updatedAt;
    default:
      return null;
  }
}

/** Stable sort; an empty value sorts last in either direction. */
export function sortRows<T>(
  rows: readonly T[],
  valueOf: (row: T) => SortValue,
  direction: SortDirection,
): T[] {
  const sign = direction === 'asc' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: valueOf(row) }))
    .sort((a, b) => {
      const aEmpty = a.value === null || a.value === '';
      const bEmpty = b.value === null || b.value === '';
      if (aEmpty || bEmpty) return aEmpty === bEmpty ? a.index - b.index : aEmpty ? 1 : -1;
      const delta =
        typeof a.value === 'number' && typeof b.value === 'number'
          ? a.value - b.value
          : String(a.value).localeCompare(String(b.value), undefined, { numeric: true });
      return delta === 0 ? a.index - b.index : sign * delta;
    })
    .map(({ row }) => row);
}
