'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { getGoalEvents, getGoalSnapshot } from '@/lib/api/goals.client';
import { projectGoalWorkspace } from '@/lib/goals/projection';
import { subscribeToPostgresChanges } from '@/lib/supabase/realtime';

export function useGoalWorkspace(goalId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    return subscribeToPostgresChanges({
      label: `goal:${goalId}`,
      // `private: true` must survive the move. An authorized channel that loses this
      // option becomes an ordinary public one — Realtime stops enforcing the channel
      // policy, and nothing in the types or the tests would say so.
      channelOptions: { config: { private: true } },
      bindings: [
        {
          event: 'INSERT',
          schema: 'agent_workspace',
          table: 'events',
          filter: `goal_id=eq.${goalId}`,
          onRow: () => {
            void queryClient.invalidateQueries({ queryKey: ['goal-workspace', goalId] });
          },
        },
      ],
    });
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
