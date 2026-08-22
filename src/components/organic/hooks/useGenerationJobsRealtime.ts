'use client';

import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { generationSummariesQueryKey } from '@/lib/organic/generationSummaries';
import { subscribeToPostgresChanges } from '@/lib/supabase/realtime';

/**
 * Keeps the live generations ticker authoritative with the server: subscribes to
 * Supabase Realtime postgres_changes on organic.post_generation_jobs for the
 * active brand and invalidates the useGenerationSummaries query whenever a job
 * row is written by ANY path (enqueue, stage transitions, completion, failure,
 * cancel). Mirrors useCalendarRealtimeSync — it does not carry the payload, it
 * just nudges a refetch so the canonical brand-scoped summaries win.
 *
 * Bursts (queued -> running -> stage updates -> completed on one job, or several
 * jobs from one bulk run) are coalesced by a short debounce.
 */
export function useGenerationJobsRealtime(brandId?: string | null) {
  const queryClient = useQueryClient();

  React.useEffect(() => {
    if (!brandId) return;

    let debounce: ReturnType<typeof setTimeout> | null = null;
    const handleChange = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: generationSummariesQueryKey(brandId) });
      }, 400);
    };

    const unsubscribe = subscribeToPostgresChanges({
      label: `organic-post-generation-jobs-${brandId}`,
      bindings: [
        {
          event: '*',
          schema: 'organic',
          table: 'post_generation_jobs',
          filter: `brand_id=eq.${brandId}`,
          onRow: handleChange,
        },
      ],
    });

    return () => {
      if (debounce) clearTimeout(debounce);
      unsubscribe();
    };
  }, [brandId, queryClient]);
}
