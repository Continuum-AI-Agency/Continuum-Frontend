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
import { useToast } from '@/components/ui/ToastProvider';
import { useSession } from '@/hooks/useSession';
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
import { getClientId } from './clientId';
import { getClientRenderExecutor, hasClientRenderExecutor } from './executorRegistry';
import { shouldAutoRunClientRenderJob } from './ownedRuns';
import { registerDefaultClientRenderExecutors } from './registerDefaultExecutors';

const POLL_MS = 12_000;
/**
 * The queue is polled whether or not the inbox is open.
 *
 * It used to be polled ONLY while open, which made the bell badge unreachable: it is
 * derived from `jobs`, `jobs` stays empty until a poll runs, and a poll only ran once
 * someone had already opened the thing the badge exists to point at. Jobs waited for
 * weeks behind that (Airtable #296).
 */
const IDLE_POLL_MS = 60_000;
const HEARTBEAT_MS = 20_000;
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
  /** Whether this tab will claim the job on its own, without the inbox's consent step. */
  willAutoRun(job: ClientRenderJob): boolean;
};

/** Exported as the test seam for surfaces that read the queue, e.g. the HyperFrames node. */
export const ClientRenderContext = createContext<ClientRenderContextValue | null>(null);

/**
 * The queue when it is mounted, null when it is not. A canvas node also renders outside
 * the authenticated shell (tests, previews), and a node must not crash a whole canvas
 * because the render inbox happens not to be above it.
 */
export function useClientRenderQueueIfMounted(): ClientRenderContextValue | null {
  return useContext(ClientRenderContext);
}

export function useClientRenderQueue(): ClientRenderContextValue {
  const value = useClientRenderQueueIfMounted();
  if (!value) throw new Error('useClientRenderQueue must be used within ClientRenderProvider');
  return value;
}

export function openClientRenderInbox(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(OPEN_INBOX_EVENT));
}

const isAbort = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError';

export function ClientRenderProvider({ children }: { children: ReactNode }) {
  registerDefaultClientRenderExecutors();
  const { user } = useSession();
  const viewerId = user?.id;
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

  // Account-scoped on purpose: every stuck job in production was enqueued under a brand
  // that was not the selected one, so a queue filtered by the brand chip could neither
  // show them nor count them (Airtable #296).
  const refresh = useCallback(async () => {
    try {
      const result = await listClientRenderJobs(undefined, getClientId());
      setJobs(result.jobs);
    } catch {
      // Viewers intentionally cannot inspect the operator queue. The route is
      // fail-closed; keeping the chrome quiet avoids presenting a broken bell.
      setJobs([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), inboxOpen ? POLL_MS : IDLE_POLL_MS);
    return () => window.clearInterval(interval);
  }, [inboxOpen, refresh]);

  const readyCount = jobs.filter((job) => job.state === 'ready').length;
  useEffect(() => {
    if (readyCount > previousReadyCount.current && previousReadyCount.current >= 0) {
      show({
        title: `${readyCount} ready to render`,
        description: 'Open the render inbox to choose which jobs may use this device.',
        dedupeKey: `client-render-ready:${readyCount}`,
        action: { label: 'Review jobs', onClick: () => setInboxOpen(true) },
      });
    }
    previousReadyCount.current = readyCount;
  }, [readyCount, show]);

  // No brand filter: the queue spans every brand this person operates, and dropping an
  // update because it belongs to another brand would strand the job it describes.
  const replaceJob = useCallback((next: ClientRenderJob) => {
    setJobs((current) => {
      const exists = current.some((job) => job.id === next.id);
      return exists ? current.map((job) => (job.id === next.id ? next : job)) : [...current, next];
    });
  }, []);

  const run = useCallback(
    async (job: ClientRenderJob) => {
      // Both of these THROW rather than return. An auto-run job that returns quietly
      // stays in `autoRun` forever — never retried, and invisible on the canvas that
      // is still promising a render. Throwing releases it for the next poll, on a
      // device or surface that may well be able to take it (Airtable #296).
      const executor = getClientRenderExecutor(job.kind);
      if (!executor) {
        show({
          title: 'Open the source to render',
          description: 'This render adapter is not available on the current surface yet.',
          variant: 'warning',
          dedupeKey: `client-render-unsupported:${job.id}`,
          action: {
            label: 'View source',
            onClick: () => window.location.assign(job.executionSpec.origin.viewHref),
          },
        });
        throw new Error('No render adapter is available on this surface.');
      }

      const capabilities = await probeClientRenderCapabilities();
      if (!capabilities.webCodecs || !capabilities.avc) {
        show({
          title: "This browser can't render video",
          description: 'Use Chrome or Edge on a desktop with WebCodecs enabled.',
          variant: 'error',
          dedupeKey: `client-render-unsupported:${job.id}`,
        });
        throw new Error('This browser cannot encode video.');
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

  // A render this person asked for runs here without waiting for a click on an inbox they
  // have no reason to open — the node that started it already promised as much, and a
  // reload no longer forgets that. Everyone else's jobs keep the consent step: this is
  // still not a background worker for the whole brand's queue.
  const willAutoRun = useCallback(
    (job: ClientRenderJob) => shouldAutoRunClientRenderJob(job, viewerId, getClientId()),
    [viewerId],
  );
  const autoRun = useRef(new Set<string>());
  useEffect(() => {
    for (const job of jobs) {
      if (!willAutoRun(job) || autoRun.current.has(job.id)) continue;
      autoRun.current.add(job.id);
      void run(job).catch(() => autoRun.current.delete(job.id));
    }
  }, [jobs, run, willAutoRun]);

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
      willAutoRun,
    }),
    [inboxOpen, jobs, readyCount, refresh, retry, run, stop, willAutoRun],
  );

  return <ClientRenderContext.Provider value={value}>{children}</ClientRenderContext.Provider>;
}
