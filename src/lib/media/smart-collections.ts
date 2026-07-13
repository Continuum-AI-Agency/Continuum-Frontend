// Smart-collection resolution. A media.collections row with kind="smart" stores
// a smart_query jsonb; instead of explicit collection_items membership, its
// assets are derived by filtering. Only the documented keys are honored
// (source, kind, fieldFilters); unknown keys are ignored so the format can grow
// without breaking older clients.
//
// A SAVED FILTER is a smart collection. Custom-field filters ride on this same
// seam rather than a second "saved filters" concept, because a saved filter and
// a smart collection are the same idea wearing two hats. A pre-existing
// smart_query that only carries source/kind keeps resolving exactly as before.

import {
  type CustomFieldFilter,
  type MediaKind,
  type MediaSource,
  mediaKindSchema,
  mediaSourceSchema,
  smartQueryFieldFiltersSchema,
} from '@continuum/contracts';

export type SmartCollectionFilter = {
  source?: MediaSource;
  kind?: MediaKind;
  fieldFilters?: CustomFieldFilter[];
};

export function resolveSmartQueryFilter(
  smartQuery: Record<string, unknown> | null | undefined,
): SmartCollectionFilter {
  const filter: SmartCollectionFilter = {};
  if (!smartQuery || typeof smartQuery !== 'object') return filter;

  const source = mediaSourceSchema.safeParse(smartQuery.source);
  if (source.success) filter.source = source.data;

  const kind = mediaKindSchema.safeParse(smartQuery.kind);
  if (kind.success) filter.kind = kind.data;

  // Stored data, not a request: a smart_query written by an older client cannot
  // be 422'd back at anyone, so an unreadable filter list is dropped and the
  // collection still opens on its source/kind — the same way an unknown `source`
  // value has always been ignored here.
  const saved = smartQueryFieldFiltersSchema.safeParse(smartQuery);
  const fieldFilters = saved.success ? (saved.data.fieldFilters ?? []) : [];
  if (fieldFilters.length > 0) filter.fieldFilters = fieldFilters;

  return filter;
}
