'use client';

import { create } from 'zustand';

export type StudioRenderJobStatus =
  | 'queued'
  | 'preparing'
  | 'rendering'
  | 'saving'
  | 'completed'
  | 'stale'
  | 'failed';

export type StudioRenderOrigin = {
  brandProfileId: string;
  roomId: string;
  nodeId: string;
  label: string;
  viewHref: string;
};

export type StudioRenderJob = {
  id: string;
  originKey: string;
  origin: StudioRenderOrigin;
  status: StudioRenderJobStatus;
  progress: number;
  createdAt: number;
  error?: string;
};

export const isTerminalStudioRenderStatus = (status: StudioRenderJobStatus): boolean =>
  status === 'completed' || status === 'stale' || status === 'failed';

type StudioRenderState = {
  jobs: Record<string, StudioRenderJob>;
  addJob(job: StudioRenderJob): void;
  patchJob(jobId: string, patch: Partial<StudioRenderJob>): void;
  findActiveByOrigin(originKey: string): StudioRenderJob | undefined;
  reset(): void;
};

export const useStudioRenderStore = create<StudioRenderState>((set, get) => ({
  jobs: {},
  addJob: (job) => set((state) => ({ jobs: { ...state.jobs, [job.id]: job } })),
  patchJob: (jobId, patch) =>
    set((state) => {
      const current = state.jobs[jobId];
      if (!current) return state;
      return { jobs: { ...state.jobs, [jobId]: { ...current, ...patch } } };
    }),
  findActiveByOrigin: (originKey) =>
    Object.values(get().jobs).find(
      (job) => job.originKey === originKey && !isTerminalStudioRenderStatus(job.status),
    ),
  reset: () => set({ jobs: {} }),
}));

export function studioRenderOriginKey(
  origin: Pick<StudioRenderOrigin, 'brandProfileId' | 'roomId' | 'nodeId'>,
) {
  return `${origin.brandProfileId}:${origin.roomId}:${origin.nodeId}`;
}
