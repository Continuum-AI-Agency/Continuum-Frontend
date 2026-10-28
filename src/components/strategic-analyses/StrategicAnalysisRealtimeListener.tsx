'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';

import { useToast } from '@/components/ui/ToastProvider';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { subscribeToRowBroadcasts } from '@/lib/supabase/realtime';
import { usePersistentState } from '@/lib/usePersistentState';
import { registerStrategicRunsCatchUp } from './realtimeBus';
import { planCatchUp } from './strategicCatchUp';

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
      // With no stamp the query is bounded to the newest row: enough to learn where "now" is,
      // and nothing to announce (planCatchUp). With one, everything completed since.
      const since = lastCompletedAtRef.current;
      let query = supabase
        .schema('brand_trends' as never)
        .from('strategic_analysis_runs')
        .select('id, completed_at')
        .eq('brand_id', brandId)
        .eq('status', 'completed');
      query = since ? query.gt('completed_at', since) : query.limit(1);
      const { data, error } = await query.order('completed_at', {
        ascending: since ? true : false,
      });

      if (error || !data || !isActive) return;

      const rows = (data as Array<{ id: string | null; completed_at: string | null }>).flatMap(
        (row) => (row.id ? [{ id: row.id, completedAt: row.completed_at }] : []),
      );
      const plan = planCatchUp(rows, since, seenRunIdsRef.current);
      for (const run of plan.announce) handleCompletion(run.id, run.completedAt);
      if (plan.announce.length === 0 && plan.lastCompletedAt !== since && plan.lastCompletedAt) {
        setLastCompletedAt(plan.lastCompletedAt);
        lastCompletedAtRef.current = plan.lastCompletedAt;
      }
    };

    const unregister = registerStrategicRunsCatchUp(brandId, catchUpMissed);

    const unsubscribe = subscribeToRowBroadcasts({
      topic: `strategic_analysis_runs:${brandId}`,
      bindings: [
        {
          event: 'UPDATE',
          // `meta.old` is the reason the helper carries it at all: this is an EDGE
          // detector, not a state read. Splitting the binding per event cannot express
          // "was not completed a moment ago and is now", which is what keeps a run from
          // announcing itself again on every later touch of the row. The trigger sends
          // OLD.status for exactly this (strategic_analysis_runs_broadcast).
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
