'use client';

import { useRouter } from 'next/navigation';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { switchActiveBrandAction } from '@/app/(post-auth)/settings/actions';
import { useToast } from '@/components/ui/ToastProvider';
import {
  isTerminalStudioRenderStatus,
  type StudioRenderJobStatus,
  type StudioRenderOrigin,
  studioRenderOriginKey,
  useStudioRenderStore,
} from './renderStore';

export type StudioRenderTaskResult = {
  status: Extract<StudioRenderJobStatus, 'completed' | 'stale'>;
  title: string;
  description?: string;
  variant?: 'success' | 'warning';
};

export type StudioRenderTaskContext = {
  jobId: string;
  signal: AbortSignal;
  setPhase(status: Extract<StudioRenderJobStatus, 'preparing' | 'rendering' | 'saving'>): void;
  setProgress(progress: number): void;
};

export type StudioRenderTask = {
  origin: StudioRenderOrigin;
  execute(context: StudioRenderTaskContext): Promise<StudioRenderTaskResult>;
  onFailure?(error: Error): void;
};

type QueuedTask = { jobId: string; task: StudioRenderTask };

type StudioRenderContextValue = {
  enqueue(task: StudioRenderTask): { accepted: boolean; jobId: string };
};

const StudioRenderContext = createContext<StudioRenderContextValue | null>(null);

export function useStudioRenderQueue(): StudioRenderContextValue {
  const context = useContext(StudioRenderContext);
  if (!context) throw new Error('useStudioRenderQueue must be used within StudioRenderProvider');
  return context;
}

export function StudioRenderProvider({ children }: { children: ReactNode }) {
  const { show } = useToast();
  const router = useRouter();
  const queueRef = useRef<QueuedTask[]>([]);
  const runningRef = useRef(false);
  const activeControllerRef = useRef<AbortController | null>(null);
  const drainRef = useRef<() => Promise<void>>(async () => undefined);

  const openOrigin = useCallback(
    (origin: StudioRenderOrigin) => {
      void (async () => {
        await switchActiveBrandAction(origin.brandProfileId);
        router.push(origin.viewHref);
        router.refresh();
      })();
    },
    [router],
  );

  const drain = useCallback(async () => {
    if (runningRef.current) return;
    const next = queueRef.current.shift();
    if (!next) return;

    runningRef.current = true;
    const controller = new AbortController();
    activeControllerRef.current = controller;
    const patchJob = useStudioRenderStore.getState().patchJob;
    patchJob(next.jobId, { status: 'preparing', progress: 0, error: undefined });

    try {
      const result = await next.task.execute({
        jobId: next.jobId,
        signal: controller.signal,
        setPhase: (status) => patchJob(next.jobId, { status }),
        setProgress: (progress) =>
          patchJob(next.jobId, { progress: Math.max(0, Math.min(1, progress)) }),
      });
      patchJob(next.jobId, { status: result.status, progress: 1 });
      show({
        title: result.title,
        description: result.description,
        variant: result.variant ?? (result.status === 'completed' ? 'success' : 'warning'),
        durationMs: Infinity,
        dedupeKey: `studio-render:${next.jobId}`,
        action: { label: 'View', onClick: () => openOrigin(next.task.origin) },
      });
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error('Render failed');
      patchJob(next.jobId, { status: 'failed', error: error.message });
      next.task.onFailure?.(error);
      show({
        title: `${next.task.origin.label} render failed`,
        description: error.message,
        variant: 'error',
        durationMs: Infinity,
        dedupeKey: `studio-render:${next.jobId}`,
        action: { label: 'View', onClick: () => openOrigin(next.task.origin) },
      });
    } finally {
      activeControllerRef.current = null;
      runningRef.current = false;
      void drainRef.current();
    }
  }, [openOrigin, show]);
  drainRef.current = drain;

  const enqueue = useCallback((task: StudioRenderTask) => {
    const originKey = studioRenderOriginKey(task.origin);
    const store = useStudioRenderStore.getState();
    const existing = store.findActiveByOrigin(originKey);
    if (existing) return { accepted: false, jobId: existing.id };

    const jobId = crypto.randomUUID();
    store.addJob({
      id: jobId,
      originKey,
      origin: task.origin,
      status: 'queued',
      progress: 0,
      createdAt: Date.now(),
    });
    queueRef.current.push({ jobId, task });
    queueMicrotask(() => void drainRef.current());
    return { accepted: true, jobId };
  }, []);

  const jobs = useStudioRenderStore((state) => state.jobs);
  const hasPendingWork = Object.values(jobs).some(
    (job) => !isTerminalStudioRenderStatus(job.status),
  );
  useEffect(() => {
    if (!hasPendingWork) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [hasPendingWork]);

  useEffect(
    () => () => {
      activeControllerRef.current?.abort();
      queueRef.current = [];
      useStudioRenderStore.getState().reset();
    },
    [],
  );

  const contextValue = useMemo(() => ({ enqueue }), [enqueue]);
  return (
    <StudioRenderContext.Provider value={contextValue}>{children}</StudioRenderContext.Provider>
  );
}
