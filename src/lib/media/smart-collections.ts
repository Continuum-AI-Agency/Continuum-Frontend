// Smart-collection resolution. A media.collections row with kind="smart" stores
// a smart_query jsonb; instead of explicit collection_items membership, its
// assets are derived by filtering. Only the documented keys are honored
// (source, kind); unknown keys are ignored so the format can grow without
// breaking older clients.

import { mediaKindSchema, mediaSourceSchema } from "@continuum/contracts";
import type { MediaKind, MediaSource } from "@continuum/contracts";

export type SmartCollectionFilter = { source?: MediaSource; kind?: MediaKind };

export function resolveSmartQueryFilter(
  smartQuery: Record<string, unknown> | null | undefined,
): SmartCollectionFilter {
  const filter: SmartCollectionFilter = {};
  if (!smartQuery || typeof smartQuery !== "object") return filter;

  const source = mediaSourceSchema.safeParse(smartQuery.source);
  if (source.success) filter.source = source.data;

  const kind = mediaKindSchema.safeParse(smartQuery.kind);
  if (kind.success) filter.kind = kind.data;

  return filter;
}
