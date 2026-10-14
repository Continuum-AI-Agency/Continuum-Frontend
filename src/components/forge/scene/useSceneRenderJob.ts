'use client';

import type { SceneRenderRequest } from '@continuum/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { forgeQueryKeys } from '@/components/forge/queryKeys';
import {
  fetchSceneRender,
  isTerminalSceneRender,
  requestSceneRender,
} from '@/lib/library/sceneTemplates';

// "Render final": one POST, then the job read every 2 s until it ends. The history list is
// refreshed both when the job is accepted (so it appears) and when it ends (so it says how).

const POLL_MS = 2_000;

export type SceneRenderStart = Pick<SceneRenderRequest, 'versionId' | 'outputId' | 'values'>;

export function useSceneRenderJob(brandId: string, assetId: string) {
  const queryClient = useQueryClient();
  const [started, setStarted] = useState<{ jobId: string; outputId: string } | null>(null);
  const jobId = started?.jobId ?? null;
  const refreshHistory = () =>
    queryClient.invalidateQueries({ queryKey: forgeQueryKeys.sceneRenders(brandId, assetId) });

  const start = useMutation({
    mutationFn: (render: SceneRenderStart) =>
      // A fresh requestId per click: the same id would answer the previous job, by design.
      requestSceneRender(assetId, {
        brandId,
        ...render,
        scope: 'all',
        requestId: crypto.randomUUID(),
      }),
    onSuccess: ({ jobId: accepted }, render) => {
      setStarted({ jobId: accepted, outputId: render.outputId });
      void refreshHistory();
    },
  });

  const job = useQuery({
    queryKey: forgeQueryKeys.sceneRender(brandId, assetId, jobId ?? ''),
    queryFn: ({ signal }) => fetchSceneRender(brandId, assetId, jobId as string, signal),
    enabled: jobId !== null,
    refetchInterval: (query) =>
      query.state.data && isTerminalSceneRender(query.state.data.state) ? false : POLL_MS,
  });

  const ended = job.data && isTerminalSceneRender(job.data.state) ? job.data.jobId : null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per job that ends, not per render of the hook
  useEffect(() => {
    if (ended) void refreshHistory();
  }, [ended]);

  return {
    start: start.mutate,
    starting: start.isPending,
    job: job.data ?? null,
    jobOutputId: started?.outputId ?? null,
    error: start.error ?? job.error ?? null,
  };
}
