'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchTemplateRun, type TemplateRunRow } from '@/lib/library/templateSources';
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
  const scope = `${brandId}:${assetId ?? ''}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const readSequence = useRef(0);

  const refresh = useCallback(async () => {
    if (!assetId) {
      setRun(null);
      return;
    }
    const sequence = ++readSequence.current;
    setLoading(true);
    try {
      const next = await fetchTemplateRun(brandId, assetId);
      // A late response for a template the user has already navigated away from must not
      // overwrite the one they are now looking at.
      if (scopeRef.current === scope && sequence === readSequence.current) setRun(next);
    } catch {
      // A run that cannot be read is not a run that failed. Leave whatever is on screen.
    } finally {
      if (scopeRef.current === scope && sequence === readSequence.current) setLoading(false);
    }
  }, [brandId, assetId, scope]);

  useEffect(() => {
    if (!assetId) return;
    let pending: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeToPostgresChanges({
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
          // Notifications are hints, not authoritative snapshots. This also prevents an
          // older source run's late event from replacing the current run after a rebind.
          if (row.asset_id !== assetId || row.brand_id !== brandId || pending) return;
          pending = setTimeout(() => {
            pending = undefined;
            void refresh();
          }, 150);
        },
      })),
      onSubscribed: refresh,
      onStatus: (status) => setPushed(status === 'SUBSCRIBED'),
    });

    return () => {
      clearTimeout(pending);
      setPushed(false);
      unsubscribe();
    };
  }, [assetId, brandId, refresh]);

  // Unconditional, not just in `onSubscribed`. A browser whose channel never joins — a blocked
  // WebSocket, a publication missing in some environment — would otherwise show an empty run
  // forever and read as "nothing is happening" rather than "we cannot see".
  useEffect(() => {
    setRun(null);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!assetId) return;
    const recover = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener('focus', recover);
    // Realtime is not a durable queue. A slow backfill covers missed events, with a
    // shorter fallback when the socket cannot connect. Neither drives server-side work.
    const timer = setInterval(recover, pushed ? 120_000 : 30_000);
    return () => {
      window.removeEventListener('focus', recover);
      clearInterval(timer);
    };
  }, [assetId, pushed, refresh]);

  return { run, pushed, loading, refresh };
}
