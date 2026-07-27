'use client';

import { useQuery } from '@tanstack/react-query';
import { listGoals } from '@/lib/api/goals.client';
import { projectGoalSummary } from '@/lib/goals/projection';

export function useGoals(brandId: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['goals', brandId],
    queryFn: ({ signal }) => listGoals(brandId, signal),
    select: (response) => response.goals.map(projectGoalSummary),
    staleTime: 15_000,
    enabled: options.enabled ?? true,
  });
}
