'use client';

import type { ApiRenderJob } from '@continuum/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRendersApi } from './apiRendersApi';

const isInFlight = (job: ApiRenderJob) =>
  job.status === 'submitting' || job.status === 'queued' || job.status === 'rendering';

/**
 * The node's view of its renders.
 *
 * Two things the previous inline version could not do:
 *
 * 1. **Tracked ids are reconciled with the list.** `GET /jobs` returns the brand's most
 *    recent N rows; a batch of five older jobs, or one pushed off the end by another
 *    canvas, simply vanished. The node persists the ids it launched and this hook fetches
 *    any the list did not return — which is the only way a batch survives a remount at
 *    all, since no batch id is stored server-side and `POST /batches` hands over its job
 *    list exactly once.
 * 2. **The poll reads the PER-JOB route.** `GET /jobs/:id` is the backend's live relay: it
 *    pulls fleet status, runs library ingest, reconciles delivery, and re-signs finished
 *    outputs to their Library copies. `GET /jobs` returns stored rows, so list-polling
 *    froze whenever the fleet's callback failed to arrive.
 */
export function useApiRenderJobs(args: {
  brandId: string | null | undefined;
  trackedIds: string[];
}) {
  const { brandId } = args;
  const [jobs, setJobs] = useState<ApiRenderJob[]>([]);
  const [error, setError] = useState<string | null>(null);

  // The tracked list is persisted node data and changes identity on every save; keying
  // effects off the array itself would refetch on each keystroke elsewhere in the node.
  const trackedKey = args.trackedIds.join(',');

  const mergeJob = useCallback((fresh: ApiRenderJob) => {
    setJobs((current) => {
      const index = current.findIndex((item) => item.id === fresh.id);
      if (index === -1) return [fresh, ...current];
      const next = [...current];
      next[index] = fresh;
      return next;
    });
  }, []);

  const refreshJobs = useCallback(async () => {
    if (!brandId) return;
    const response = await apiRendersApi.listJobs(brandId, 8);
    const listed = new Set(response.items.map((item) => item.id));
    const missing = trackedKey ? trackedKey.split(',').filter((id) => id && !listed.has(id)) : [];
    // A tracked id the list did not return is fetched directly rather than dropped.
    const recovered = await Promise.all(
      missing.map((id) => apiRendersApi.getJob(brandId, id).catch(() => null)),
    );
    setJobs([...response.items, ...recovered.filter((job): job is ApiRenderJob => job !== null)]);
  }, [brandId, trackedKey]);

  const refreshOne = useCallback(
    async (jobId: string) => {
      if (!brandId) return;
      mergeJob(await apiRendersApi.getJob(brandId, jobId));
    },
    [brandId, mergeJob],
  );

  const jobsRef = useRef<ApiRenderJob[]>(jobs);
  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  const inFlight = jobs.some(isInFlight);
  useEffect(() => {
    if (!inFlight || !brandId) return;
    const timer = setInterval(() => {
      // Three at a time keeps a burst of confirms — a batch confirm is exactly that —
      // from turning the poll into a fan-out; the rest advance on later ticks.
      const active = jobsRef.current.filter(isInFlight).slice(0, 3);
      void Promise.all(active.map((job) => apiRendersApi.getJob(brandId, job.id)))
        .then((fresh) => {
          setJobs((current) => current.map((item) => fresh.find((f) => f.id === item.id) ?? item));
        })
        .catch(() => {
          // A dropped poll is not a render failure; the next tick retries.
        });
    }, 5_000);
    return () => clearInterval(timer);
  }, [brandId, inFlight]);

  return { jobs, setJobs, error, setError, refreshJobs, refreshOne, mergeJob };
}
