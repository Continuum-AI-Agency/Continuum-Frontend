'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { getGoalEvents, getGoalSnapshot } from '@/lib/api/goals.client';
import { projectGoalWorkspace } from '@/lib/goals/projection';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export function useGoalWorkspace(goalId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`goal:${goalId}`, { config: { private: true } })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'agent_workspace',
          table: 'events',
          filter: `goal_id=eq.${goalId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['goal-workspace', goalId] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [goalId, queryClient]);

  return useQuery({
    queryKey: ['goal-workspace', goalId],
    queryFn: async ({ signal }) => {
      const [snapshot, eventPage] = await Promise.all([
        getGoalSnapshot(goalId, signal),
        getGoalEvents({ goalId, signal }),
      ]);
      return { snapshot, events: eventPage.events };
    },
    select: ({ snapshot, events }) => ({
      snapshot,
      view: projectGoalWorkspace(snapshot, events),
    }),
    staleTime: 5_000,
    refetchInterval: 15_000,
  });
}
