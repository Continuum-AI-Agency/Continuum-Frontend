'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';

import { useToast } from '@/components/ui/ToastProvider';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { subscribeToPostgresChanges } from '@/lib/supabase/realtime';
import { usePersistentState } from '@/lib/usePersistentState';
import { registerStrategicRunsCatchUp } from './realtimeBus';

type Props = {
  brandId: string;
};

export function StrategicAnalysisRealtimeListener({ brandId }: Props) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const queryClient = useQueryClient();
  const { show } = useToast();

  const [lastCompletedAt, setLastCompletedAt] = usePersistentState<string | null>(
    `strategic-analysis:last-completed:${brandId}`,
    null,
  );

  const lastCompletedAtRef = useRef<string | null>(lastCompletedAt);
  const seenRunIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    lastCompletedAtRef.current = lastCompletedAt;
  }, [lastCompletedAt]);

  useEffect(() => {
    seenRunIdsRef.current = new Set();
    lastCompletedAtRef.current = lastCompletedAt;
  }, [brandId, lastCompletedAt]);

  useEffect(() => {
    let isActive = true;

    const handleCompletion = (runId: string, completedAt?: string | null) => {
      if (!isActive) return;

      seenRunIdsRef.current.add(runId);

      if (completedAt) {
        setLastCompletedAt(completedAt);
        lastCompletedAtRef.current = completedAt;
      }

      show({
        title: 'Strategic analysis ready',
        description: 'Your latest run finished processing.',
        variant: 'success',
      });

      queryClient.invalidateQueries({ queryKey: ['strategic-analysis', brandId] });
      queryClient.invalidateQueries({ queryKey: ['strategic-analysis-runs', brandId] });
    };

    const catchUpMissed = async () => {
      const since = lastCompletedAtRef.current ?? '1970-01-01T00:00:00Z';
      const { data, error } = await supabase
        .schema('brand_trends' as never)
        .from('strategic_analysis_runs')
        .select('id, completed_at')
        .eq('brand_id', brandId)
        .eq('status', 'completed')
        .gt('completed_at', since)
        .order('completed_at', { ascending: true });

      if (error || !data) return;

      const rows = data as Array<{ id: string | null; completed_at: string | null }>;
      for (const row of rows) {
        const runId = row.id ?? undefined;
        if (!runId || seenRunIdsRef.current.has(runId)) continue;
        handleCompletion(runId, row.completed_at);
      }
    };

    const unregister = registerStrategicRunsCatchUp(brandId, catchUpMissed);

    const unsubscribe = subscribeToPostgresChanges({
      label: `strategic_runs_${brandId}`,
      bindings: [
        {
          event: 'UPDATE',
          schema: 'brand_trends',
          table: 'strategic_analysis_runs',
          filter: `brand_id=eq.${brandId}`,
          // `meta.old` is the reason the helper carries it at all: this is an EDGE
          // detector, not a state read. Splitting the binding per event cannot express
          // "was not completed a moment ago and is now", which is what keeps a run from
          // announcing itself again on every later touch of the row.
          onRow: (row, meta) => {
            const previous = meta.old.status;
            const next = row.status;
            const runId = typeof row.id === 'string' ? row.id : null;
            if (!runId) return;
            if (previous === 'completed' || next !== 'completed') return;
            if (seenRunIdsRef.current.has(runId)) return;

            const completedAt = typeof row.completed_at === 'string' ? row.completed_at : null;
            handleCompletion(runId, completedAt);
          },
        },
      ],
      onSubscribed: () => {
        void catchUpMissed();
      },
    });

    return () => {
      isActive = false;
      unsubscribe();
      unregister();
    };
  }, [brandId, queryClient, setLastCompletedAt, show]);

  return null;
}
