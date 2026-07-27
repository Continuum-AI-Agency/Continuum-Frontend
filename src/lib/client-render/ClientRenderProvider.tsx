'use client';

import type { ClientRenderJob } from '@continuum/contracts';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useActiveBrandContext } from '@/components/providers/ActiveBrandProvider';
import { useToast } from '@/components/ui/ToastProvider';
import {
  claimClientRenderJob,
  completeClientRenderJob,
  failClientRenderJob,
  listClientRenderJobs,
  releaseClientRenderJob,
  retryClientRenderJob,
  updateClientRenderJob,
} from '@/lib/api/clientRenderJobs.client';
import { useStudioRenderQueue } from '@/lib/studio-render/StudioRenderProvider';
import { probeClientRenderCapabilities } from './capabilities';
import { getClientRenderExecutor, hasClientRenderExecutor } from './executorRegistry';
import { registerDefaultClientRenderExecutors } from './registerDefaultExecutors';

const POLL_MS = 12_000;
const HEARTBEAT_MS = 20_000;
const CLIENT_ID_KEY = 'continuum:client-render:device';
const OPEN_INBOX_EVENT = 'continuum:client-render:open-inbox';

type ClientRenderContextValue = {
  jobs: ClientRenderJob[];
  readyCount: number;
  inboxOpen: boolean;
  setInboxOpen(open: boolean): void;
  run(job: ClientRenderJob): Promise<void>;
  retry(job: ClientRenderJob): Promise<void>;
  stop(job: ClientRenderJob): Promise<void>;
  refresh(): Promise<void>;
  canExecute(job: ClientRenderJob): boolean;
  isRunningLocally(job: ClientRenderJob): boolean;
};

const ClientRenderContext = createContext<ClientRenderContextValue | null>(null);

export function useClientRenderQueue(): ClientRenderContextValue {
  const value = useContext(ClientRenderContext);
  if (!value) throw new Error('useClientRenderQueue must be used within ClientRenderProvider');
  return value;
}

export function openClientRenderInbox(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(OPEN_INBOX_EVENT));
}

const getClientId = (): string => {
  try {
    const existing = window.localStorage.getItem(CLIENT_ID_KEY);
    if (existing) return existing;
    const created = `browser-${crypto.randomUUID()}`;
    window.localStorage.setItem(CLIENT_ID_KEY, created);
    return created;
  } catch {
    return `session-${crypto.randomUUID()}`;
  }
};

const isAbort = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError';

export function ClientRenderProvider({ children }: { children: ReactNode }) {
  registerDefaultClientRenderExecutors();
  const { activeBrandId } = useActiveBrandContext();
  const studioQueue = useStudioRenderQueue();
  const { show } = useToast();
  const [jobs, setJobs] = useState<ClientRenderJob[]>([]);
  const [inboxOpen, setInboxOpen] = useState(false);
  const localJobIds = useRef(new Map<string, string>());
  const leaseTokens = useRef(new Map<string, string>());
  const previousReadyCount = useRef(0);

  useEffect(() => {
    const openInbox = () => setInboxOpen(true);
    window.addEventListener(OPEN_INBOX_EVENT, openInbox);
    return () => window.removeEventListener(OPEN_INBOX_EVENT, openInbox);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const result = await listClientRenderJobs(activeBrandId);
      setJobs(result.jobs);
    } catch {
      // Viewers intentionally cannot inspect the operator queue. The route is
      // fail-closed; keeping the chrome quiet avoids presenting a broken bell.
      setJobs([]);
    }
  }, [activeBrandId]);

  useEffect(() => {
    if (!inboxOpen) return;
    void refresh();
    const interval = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(interval);
  }, [inboxOpen, refresh]);

  const readyCount = jobs.filter((job) => job.state === 'ready').length;
  useEffect(() => {
    if (readyCount > previousReadyCount.current && previousReadyCount.current >= 0) {
      show({
        title: `${readyCount} ready to render`,
        description: 'Open the render inbox to choose which jobs may use this device.',
        dedupeKey: `client-render-ready:${activeBrandId}:${readyCount}`,
        action: { label: 'Review jobs', onClick: () => setInboxOpen(true) },
      });
    }
    previousReadyCount.current = readyCount;
  }, [activeBrandId, readyCount, show]);

  const replaceJob = useCallback(
    (next: ClientRenderJob) => {
      if (next.brandId !== activeBrandId) return;
      setJobs((current) => {
        const exists = current.some((job) => job.id === next.id);
        return exists
          ? current.map((job) => (job.id === next.id ? next : job))
          : [...current, next];
      });
    },
    [activeBrandId],
  );

  const run = useCallback(
    async (job: ClientRenderJob) => {
      const executor = getClientRenderExecutor(job.kind);
      if (!executor) {
        show({
          title: 'Open the source to render',
          description: 'This render adapter is not available on the current surface yet.',
          variant: 'warning',
          action: {
            label: 'View source',
            onClick: () => window.location.assign(job.executionSpec.origin.viewHref),
          },
        });
        return;
      }

      const capabilities = await probeClientRenderCapabilities();
      if (!capabilities.webCodecs || !capabilities.avc) {
        show({
          title: "This browser can't render video",
          description: 'Use Chrome or Edge on a desktop with WebCodecs enabled.',
          variant: 'error',
        });
        return;
      }

      let claimed: Awaited<ReturnType<typeof claimClientRenderJob>>;
      try {
        claimed = await claimClientRenderJob({
          jobId: job.id,
          brandId: job.brandId,
          clientId: getClientId(),
          capabilities,
        });
      } catch {
        show({
          title: 'Job already claimed',
          description: 'Another operator started this render first.',
          variant: 'warning',
        });
        await refresh();
        return;
      }
      replaceJob(claimed.job);
      leaseTokens.current.set(job.id, claimed.leaseToken);

      const spec = claimed.job.executionSpec;
      const local = studioQueue.enqueue({
        origin: {
          brandProfileId: claimed.job.brandId,
          roomId: spec.kind === 'hyperframes_agent' ? spec.canvasId : claimed.job.sourceId,
          nodeId: spec.kind === 'hyperframes_agent' ? spec.nodeId : claimed.job.id,
          label: spec.origin.label,
          viewHref: spec.origin.viewHref,
        },
        execute: async ({ signal, setPhase, setProgress }) => {
          const heartbeat = window.setInterval(() => {
            void updateClientRenderJob(claimed.job.id, {
              leaseToken: claimed.leaseToken,
            }).catch(() => undefined);
          }, HEARTBEAT_MS);
          try {
            const result = await executor({
              job: claimed.job,
              leaseToken: claimed.leaseToken,
              capabilities,
              signal,
              update: async (patch) => {
                if (patch.state === 'rendering') setPhase('rendering');
                if (patch.state === 'saving') setPhase('saving');
                if (patch.progress !== undefined) setProgress(patch.progress);
                const updated = await updateClientRenderJob(claimed.job.id, {
                  leaseToken: claimed.leaseToken,
                  ...patch,
                });
                replaceJob(updated.job);
              },
            });
            const completed = await completeClientRenderJob(
              claimed.job.id,
              claimed.leaseToken,
              result.resultAssetIds,
            );
            replaceJob(completed.job);
            return {
              status: 'completed' as const,
              title: result.title,
              description: result.description,
            };
          } catch (error) {
            if (isAbort(error)) {
              const released = await releaseClientRenderJob(
                claimed.job.id,
                claimed.leaseToken,
              ).catch(() => null);
              if (released) replaceJob(released.job);
              return {
                status: 'stale' as const,
                title: 'Render stopped',
                description: 'The unfinished job returned to the queue.',
                silent: true,
              };
            }
            const message = error instanceof Error ? error.message : 'Render failed';
            const failed = await failClientRenderJob(
              claimed.job.id,
              claimed.leaseToken,
              message,
            ).catch(() => null);
            if (failed) replaceJob(failed.job);
            throw error;
          } finally {
            window.clearInterval(heartbeat);
            leaseTokens.current.delete(claimed.job.id);
            localJobIds.current.delete(claimed.job.id);
            void refresh();
          }
        },
      });
      if (!local.accepted) {
        leaseTokens.current.delete(job.id);
        await releaseClientRenderJob(job.id, claimed.leaseToken).catch(() => undefined);
        await refresh();
        return;
      }
      localJobIds.current.set(job.id, local.jobId);
    },
    [refresh, replaceJob, show, studioQueue],
  );

  const retry = useCallback(
    async (job: ClientRenderJob) => {
      const result = await retryClientRenderJob(job.id, job.brandId);
      replaceJob(result.job);
    },
    [replaceJob],
  );

  const stop = useCallback(
    async (job: ClientRenderJob) => {
      const localJobId = localJobIds.current.get(job.id);
      if (localJobId) studioQueue.cancel(localJobId);
      const leaseToken = leaseTokens.current.get(job.id);
      if (leaseToken && !localJobId) {
        const result = await releaseClientRenderJob(job.id, leaseToken).catch(() => null);
        if (result) replaceJob(result.job);
      }
    },
    [replaceJob, studioQueue],
  );

  const value = useMemo<ClientRenderContextValue>(
    () => ({
      jobs,
      readyCount,
      inboxOpen,
      setInboxOpen,
      run,
      retry,
      stop,
      refresh,
      canExecute: (job) => hasClientRenderExecutor(job.kind),
      isRunningLocally: (job) => localJobIds.current.has(job.id),
    }),
    [inboxOpen, jobs, readyCount, refresh, retry, run, stop],
  );

  return <ClientRenderContext.Provider value={value}>{children}</ClientRenderContext.Provider>;
}
