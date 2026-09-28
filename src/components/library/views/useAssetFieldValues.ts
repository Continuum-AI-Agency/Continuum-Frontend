'use client';

// Per-asset facts that do not ride on the asset row, for the assets on screen: custom-field
// values and comment counts, each fetched only while a surface actually shows one (a List
// column or a card field). Field values already loaded are kept across pages; `revision`
// drops them after a write elsewhere.

import type { CustomFieldValue } from '@continuum/contracts';
import { useCallback, useEffect, useState } from 'react';
import { listAssetFieldValues } from '@/lib/library/customFields';
import { valuesByFieldId } from '@/lib/library/customFieldValue';
import { mediaSchema } from '@/lib/media/supabase-media';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export type FieldValuesByAsset = ReadonlyMap<string, ReadonlyMap<string, CustomFieldValue>>;

export function useAssetFieldValues(
  brandId: string,
  assetIds: readonly string[],
  enabled: boolean,
  revision = 0,
): FieldValuesByAsset {
  const [values, setValues] = useState<Map<string, Map<string, CustomFieldValue>>>(new Map());

  // biome-ignore lint/correctness/useExhaustiveDependencies: revision resets the cache after a write
  useEffect(() => {
    setValues(new Map());
  }, [brandId, revision]);

  const idKey = assetIds.join(',');
  // biome-ignore lint/correctness/useExhaustiveDependencies: idKey serializes assetIds
  useEffect(() => {
    if (!enabled) return;
    const missing = assetIds.filter((id) => !values.has(id));
    if (missing.length === 0) return;
    let cancelled = false;
    // ponytail: one GET per asset (the only values read the app has); a batched
    // `assetIds=` read on /api/library/asset-fields if 48-row pages feel slow.
    Promise.all(
      missing.map((assetId) =>
        listAssetFieldValues({ brandId, assetId })
          .then((rows) => [assetId, valuesByFieldId(rows)] as const)
          .catch(() => [assetId, new Map<string, CustomFieldValue>()] as const),
      ),
    ).then((loaded) => {
      if (cancelled) return;
      setValues((current) => {
        const next = new Map(current);
        for (const [assetId, byField] of loaded) next.set(assetId, byField);
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [brandId, idKey, enabled, values]);

  return values;
}

// ponytail: one embedded-count read per page of assets; a comment_count column kept by a
// trigger if the List ever needs to sort the whole library by it (fmt-search's C6).
async function loadCommentCounts(assetIds: readonly string[]): Promise<Map<string, number>> {
  const { data, error } = await mediaSchema(createSupabaseBrowserClient())
    .from('assets')
    .select('id, comments(count)')
    .in('id', [...assetIds])
    .is('comments.deleted_at', null);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as { id: string; comments: { count: number }[] }[];
  return new Map(rows.map((row) => [row.id, row.comments[0]?.count ?? 0]));
}

/**
 * Live comment counts for the assets on screen (deleted comments excluded), fetched only
 * while a surface shows the Comment count field. Undefined for an asset not read yet.
 */
export function useAssetCommentCounts(
  assetIds: readonly string[],
  enabled: boolean,
): (assetId: string) => number | undefined {
  const [counts, setCounts] = useState<ReadonlyMap<string, number>>(new Map());
  const idKey = assetIds.join(',');
  // biome-ignore lint/correctness/useExhaustiveDependencies: idKey serializes assetIds
  useEffect(() => {
    if (!enabled || assetIds.length === 0) return;
    let cancelled = false;
    loadCommentCounts(assetIds)
      .then((next) => {
        if (!cancelled) setCounts(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [idKey, enabled]);
  return useCallback((assetId: string) => counts.get(assetId), [counts]);
}
