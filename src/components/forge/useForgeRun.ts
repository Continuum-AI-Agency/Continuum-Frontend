'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FORGE_STALE_MS, forgeQueryKeys } from '@/components/forge/queryKeys';
import { fetchTemplateRun, type TemplateRunRow } from '@/lib/library/templateSources';
import { subscribeToRowBroadcasts } from '@/lib/supabase/realtime';

/**
 * Watch one template's forge run.
 *
 * A change to the run row (`media.template_source_runs`) is pushed on the brand's row-broadcast
 * topic as a hint carrying only its ids; the fat `parse` blob lives on `media.template_sources`
 * and is re-read through the API.
 */
export function useForgeRun(brandId: string, assetId: string | null) {
  const [pushed, setPushed] = useState(false);
  const queryClient = useQueryClient();
  const runKey = useMemo(() => forgeQueryKeys.run(brandId, assetId ?? 'none'), [assetId, brandId]);
  const runQuery = useQuery({
    queryKey: runKey,
    queryFn: () => fetchTemplateRun(brandId, assetId!),
    enabled: Boolean(assetId),
    staleTime: FORGE_STALE_MS.active,
    refetchInterval: assetId ? (pushed ? 120_000 : 30_000) : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: false,
  });
  const refresh = useCallback(async () => {
    if (assetId) await runQuery.refetch();
  }, [assetId, runQuery.refetch]);

  useEffect(() => {
    if (!assetId) return;
    let pending: ReturnType<typeof setTimeout> | undefined;
    // The brand's topic; this asset's runs are picked out below. INSERT and UPDATE only: the
    // one DELETE is the cascade from a removed template source, and the trigger sends none.
    const unsubscribe = subscribeToRowBroadcasts({
      topic: `template_source_runs:${brandId}`,
      bindings: (['INSERT', 'UPDATE'] as const).map((event) => ({
        event,
        onRow: (row) => {
          // Notifications are hints, not authoritative snapshots. This also prevents an
          // older source run's late event from replacing the current run after a rebind.
          if (row.asset_id !== assetId || row.brand_id !== brandId || pending) return;
          pending = setTimeout(() => {
            pending = undefined;
            void queryClient.invalidateQueries({ queryKey: runKey, exact: true });
          }, 150);
        },
      })),
      onSubscribed: () => void queryClient.invalidateQueries({ queryKey: runKey, exact: true }),
      onStatus: (status) => setPushed(status === 'SUBSCRIBED'),
    });

    return () => {
      clearTimeout(pending);
      setPushed(false);
      unsubscribe();
    };
  }, [assetId, brandId, queryClient, runKey]);

  return {
    run: assetId ? ((runQuery.data ?? null) as TemplateRunRow | null) : null,
    pushed,
    loading: runQuery.isFetching,
    refresh,
  };
}
