// Browser API + React Query hook for the live generation ticker. Calls the
// agents-ts backend directly (http.request attaches base URL + bearer) per the
// FE API-layer rule — no Next.js proxy route. The post_generation_jobs rows
// returned here are THE single source of truth for the GenerationsPopover counts
// and rows, replacing the ephemeral useCalendarStore.generations projection.

'use client';

import {
  type OrganicGenerationSummary,
  type OrganicGenerationWindowStats,
  organicGenerationSummarySchema,
  organicGenerationWindowStatsSchema,
} from '@continuum/contracts';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { http } from '@/lib/api/http';

// Rolling window the ticker reports over ("made/completed in the last hour").
export const GENERATION_WINDOW_MINUTES = 60;

// HTTP envelope for GET /api/organic/agent/generations. The two members are the
// canonical contract schemas; the envelope is composed here because the contracts
// source is owned elsewhere — narrowing on read with the canonical schemas keeps
// the boundary honest without hand-rolling any status union.
const generationSummariesResponseSchema = z.object({
  summaries: z.array(organicGenerationSummarySchema),
  window: organicGenerationWindowStatsSchema,
});
export type GenerationSummariesResponse = z.infer<typeof generationSummariesResponseSchema>;

const emptyWindow = (): OrganicGenerationWindowStats => ({
  windowMinutes: GENERATION_WINDOW_MINUTES,
  made: 0,
  completed: 0,
  failed: 0,
  running: 0,
});

export const generationSummariesQueryKey = (brandId?: string | null) =>
  ['organic-generation-summaries', brandId ?? null] as const;

async function fetchGenerationSummaries(brandId: string): Promise<GenerationSummariesResponse> {
  // brandId is also sent explicitly: a bearer token identifies the user (who may
  // own several brands), and every other organic endpoint is brand-scoped by an
  // explicit param. windowMinutes drives the rolling-window header stats.
  return http.request<GenerationSummariesResponse>({
    path: `/api/organic/agent/generations?windowMinutes=${GENERATION_WINDOW_MINUTES}&brandId=${encodeURIComponent(brandId)}`,
    method: 'GET',
    schema: generationSummariesResponseSchema,
  });
}

/**
 * Live generation summaries + rolling-window stats for the active brand. React
 * Query owns the cache so the counts survive tab-away (the popover never holds
 * the numbers in component state). Realtime invalidation
 * (useGenerationJobsRealtime) keeps it fresh; a slow background poll while jobs
 * are in flight is a safety net for any missed Realtime event.
 */
export function useGenerationSummaries(brandId?: string | null) {
  const query = useQuery({
    queryKey: generationSummariesQueryKey(brandId),
    queryFn: () =>
      brandId
        ? fetchGenerationSummaries(brandId)
        : Promise.resolve({ summaries: [], window: emptyWindow() } satisfies GenerationSummariesResponse),
    enabled: Boolean(brandId),
    staleTime: 5_000,
    refetchInterval: (q) => ((q.state.data?.window.running ?? 0) > 0 ? 15_000 : false),
  });

  const summaries: OrganicGenerationSummary[] = query.data?.summaries ?? [];
  const windowStats: OrganicGenerationWindowStats | null = query.data?.window ?? null;

  return {
    summaries,
    windowStats,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
