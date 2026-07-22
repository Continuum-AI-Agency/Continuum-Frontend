'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

export type JobStatus = 'idle' | 'running' | 'done' | 'error';

export type JobState<T> = {
  status: JobStatus;
  data: T | null;
  error: string | null;
  startedAt: number | null;
};

export type JobKey =
  | 'scrape'
  | 'agentPreview'
  | 'trendsPrewarm'
  | 'strategicPrewarm'
  | 'creativePrewarm';

type JobsState = Record<JobKey, JobState<unknown>>;

const initialJob = <T,>(): JobState<T> => ({
  status: 'idle',
  data: null,
  error: null,
  startedAt: null,
});

const initialState: JobsState = {
  scrape: initialJob(),
  agentPreview: initialJob(),
  trendsPrewarm: initialJob(),
  strategicPrewarm: initialJob(),
  creativePrewarm: initialJob(),
};

type JobRunner<T> = (signal: AbortSignal) => Promise<T>;

type ContextValue = {
  jobs: JobsState;
  start: <T>(key: JobKey, runner: JobRunner<T>) => Promise<T | null>;
  patch: (key: JobKey, data: unknown) => void;
  reset: () => void;
};

const BackgroundJobsContext = createContext<ContextValue | null>(null);

export function BackgroundJobsProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<JobsState>(initialState);
  const controllers = useRef<Partial<Record<JobKey, AbortController>>>({});

  const start = useCallback(async <T,>(key: JobKey, runner: JobRunner<T>): Promise<T | null> => {
    controllers.current[key]?.abort();
    const ctrl = new AbortController();
    controllers.current[key] = ctrl;
    setJobs((prev) => ({
      ...prev,
      [key]: { status: 'running', data: null, error: null, startedAt: Date.now() },
    }));
    try {
      const data = await runner(ctrl.signal);
      setJobs((prev) => ({
        ...prev,
        [key]: { status: 'done', data, error: null, startedAt: prev[key].startedAt },
      }));
      return data;
    } catch (error) {
      if (ctrl.signal.aborted) return null;
      const message = error instanceof Error ? error.message : 'Unknown error';
      setJobs((prev) => ({
        ...prev,
        [key]: { status: 'error', data: null, error: message, startedAt: prev[key].startedAt },
      }));
      return null;
    }
  }, []);

  const patch = useCallback((key: JobKey, data: unknown) => {
    setJobs((prev) => ({ ...prev, [key]: { ...prev[key], data } }));
  }, []);

  const reset = useCallback(() => {
    Object.values(controllers.current).forEach((c) => c?.abort());
    controllers.current = {};
    setJobs(initialState);
  }, []);

  const value = useMemo(() => ({ jobs, start, patch, reset }), [jobs, start, patch, reset]);

  return <BackgroundJobsContext.Provider value={value}>{children}</BackgroundJobsContext.Provider>;
}

export function useBackgroundJobs() {
  const ctx = useContext(BackgroundJobsContext);
  if (!ctx) throw new Error('useBackgroundJobs must be used within BackgroundJobsProvider');
  return ctx;
}
