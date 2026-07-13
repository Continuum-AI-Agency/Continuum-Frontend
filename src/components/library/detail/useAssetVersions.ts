'use client';

// The asset's version history, lifted out of the rail because it is no longer
// the rail's private business: the modal needs the list to render the strip, the
// head id to decide which comments are current, and the viewed version's signed
// URL to put older bytes on the stage. One fetch serves all three, and the head
// stays a single fact rather than two copies that can drift.

import type { MediaAssetVersion } from '@continuum/contracts';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { listAssetVersions } from '@/lib/library/versions';

export type UseAssetVersionsResult = {
  /** null while the first fetch is in flight; [] for an asset with no history yet. */
  versions: MediaAssetVersion[] | null;
  error: string | null;
  headVersionId: string | null;
  refresh: () => Promise<void>;
  /** Upload and rollback both answer with the fresh list — adopt it, don't refetch. */
  replaceVersions: (versions: MediaAssetVersion[]) => void;
};

export function useAssetVersions(brandId: string, assetId: string): UseAssetVersionsResult {
  const [versions, setVersions] = useState<MediaAssetVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      setVersions(await listAssetVersions({ brandId, assetId }));
    } catch (err: unknown) {
      // An empty list, not null: the rail must stop its skeleton and show the
      // failure instead of spinning forever.
      setVersions([]);
      setError(err instanceof Error ? err.message : 'Loading versions failed');
    }
  }, [brandId, assetId]);

  useEffect(() => {
    setVersions(null);
    void refresh();
  }, [refresh]);

  const headVersionId = useMemo(
    () => versions?.find((version) => version.isHead)?.id ?? null,
    [versions],
  );

  return useMemo(
    () => ({ versions, error, headVersionId, refresh, replaceVersions: setVersions }),
    [versions, error, headVersionId, refresh],
  );
}
