'use client';

// Custom-field values for the assets on screen, fetched only while a surface actually
// shows a custom field (a List column or a card field). Values already loaded are kept
// across pages; `revision` drops them after a write elsewhere.

import type { CustomFieldValue } from '@continuum/contracts';
import { useEffect, useState } from 'react';
import { listAssetFieldValues } from '@/lib/library/customFields';
import { valuesByFieldId } from '@/lib/library/customFieldValue';

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
