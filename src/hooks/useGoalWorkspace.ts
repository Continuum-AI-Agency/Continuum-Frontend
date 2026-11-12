'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { UiLocale } from '@/i18n/config';
import { getGoalEvents, getGoalSnapshot } from '@/lib/api/goals.client';
import type { GoalDisplayTranslator } from '@/lib/goals/displayCopy';
import { projectGoalWorkspace } from '@/lib/goals/projection';
import { subscribeToRowBroadcasts } from '@/lib/supabase/realtime';

export function useGoalWorkspace(
  goalId: string,
  t?: GoalDisplayTranslator,
  locale: UiLocale = 'en',
) {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Private by construction: the topic is admitted only to the goal's readers
    // (agent_workspace.can_read_goal), and the trigger sends only that something happened.
    return subscribeToRowBroadcasts({
      topic: `events:${goalId}`,
      bindings: [
        {
          event: 'INSERT',
          onRow: () => {
            void queryClient.invalidateQueries({
              queryKey: ['goal-workspace', goalId],
            });
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
      view: projectGoalWorkspace(snapshot, events, t, locale),
    }),
    staleTime: 5_000,
    refetchInterval: 15_000,
  });
}
