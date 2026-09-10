'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchTemplateRun, type TemplateRunRow } from '@/lib/library/templateSources';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { subscribeToPostgresChanges } from '@/lib/supabase/realtime';

/**
 * Watch one template's forge run.
 *
 * The row is pushed by Realtime on `media.template_source_runs`, which is a small table on
 * purpose: the fat `parse` blob lives on `media.template_sources` and is not in the publication,
 * so a progress tick ships a counter rather than a few hundred KB of comps.
 */
export function useForgeRun(brandId: string, assetId: string | null) {
  const [run, setRun] = useState<TemplateRunRow | null>(null);
  const [pushed, setPushed] = useState(false);
  const [loading, setLoading] = useState(false);
  const assetRef = useRef(assetId);
  assetRef.current = assetId;

  const refresh = useCallback(async () => {
    if (!assetId) {
      setRun(null);
      return;
    }
    setLoading(true);
    try {
      const next = await fetchTemplateRun(brandId, assetId);
      // A late response for a template the user has already navigated away from must not
      // overwrite the one they are now looking at.
      if (assetRef.current === assetId) setRun(next);
    } catch {
      // A run that cannot be read is not a run that failed. Leave whatever is on screen.
    } finally {
      setLoading(false);
    }
  }, [brandId, assetId]);

  useEffect(() => {
    if (!assetId) return;
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    // Push the viewer's token onto the socket BEFORE joining. A subscription created without it
    // registers as `anon`, which the `to authenticated` policy never matches — the channel still
    // reports SUBSCRIBED and then delivers nothing until the next heartbeat repairs it. Measured
    // on the render queue, not theorised.
    void createSupabaseBrowserClient()
      .realtime.setAuth()
      .catch(() => undefined)
      .then(() => {
        if (cancelled) return;
        unsubscribe = subscribeToPostgresChanges({
          label: `forge-run-${assetId}`,
          // INSERT and UPDATE separately, never '*': Realtime broadcasts DELETE with a
          // primary-key-only payload and no RLS check, and the only DELETE here is the cascade
          // from a removed template source, which nothing on screen needs told about.
          bindings: (['INSERT', 'UPDATE'] as const).map((event) => ({
            event,
            schema: 'media',
            table: 'template_source_runs',
            filter: `asset_id=eq.${assetId}`,
            onRow: (row) => {
              if (assetRef.current === assetId) setRun(row as unknown as TemplateRunRow);
            },
          })),
          onSubscribed: refresh,
          onStatus: (status) => setPushed(status === 'SUBSCRIBED'),
        });
      });

    return () => {
      cancelled = true;
      setPushed(false);
      unsubscribe?.();
    };
  }, [assetId, refresh]);

  // Unconditional, not just in `onSubscribed`. A browser whose channel never joins — a blocked
  // WebSocket, a publication missing in some environment — would otherwise show an empty run
  // forever and read as "nothing is happening" rather than "we cannot see".
  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { run, pushed, loading, refresh };
}
