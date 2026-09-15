'use client';

import type { ApiRenderJob } from '@continuum/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRendersApi } from './apiRendersApi';

/**
 * Whether this job still has something coming.
 *
 * The render itself is the obvious half. The second clause is the automatic check: the placement
 * verdict frozen at preflight said this frame needed a judge, the judge runs server-side AFTER
 * the job is marked finished, and polling that stopped at `finished` would leave the card
 * reading "Checking the frame…" until somebody pressed refresh — which is precisely the human
 * interaction the automatic check exists to remove.
 *
 * Bounded on both sides: it only holds for jobs whose own `fit.escalate` is true, and it ends
 * the moment a verdict lands, whatever that verdict says. A frame that measured cleanly is never
 * judged and never polls past `finished`.
 */
const isInFlight = (job: ApiRenderJob) =>
  job.status === 'submitting' ||
  job.status === 'queued' ||
  job.status === 'rendering' ||
  (job.status === 'finished' && job.fit?.escalate === true && job.judge === null);

/**
 * Two reads of the same list as one. `incoming` is the later read, so it wins a tie on
 * `updatedAt` — an approval decision changes a job without bumping `ad_render_jobs.updated_at`,
 * and a stale copy must not outlive it. A strictly fresher copy already held (a poll that landed
 * after the list was read) is kept. A re-read list leads in its own order, so a new job lands on
 * top; an older page or a poll fills in behind what is held.
 */
function mergePage(
  current: ApiRenderJob[],
  incoming: ApiRenderJob[],
  { incomingFirst = false }: { incomingFirst?: boolean } = {},
): ApiRenderJob[] {
  const byId = new Map(current.map((job) => [job.id, job]));
  for (const job of incoming) {
    const previous = byId.get(job.id);
    if (!previous || Date.parse(job.updatedAt) >= Date.parse(previous.updatedAt)) {
      byId.set(job.id, job);
    }
  }
  if (!incomingFirst) return [...byId.values()];
  const leading = new Set(incoming.map((job) => job.id));
  return [
    ...[...leading].map((id) => byId.get(id)!),
    ...[...byId.values()].filter((job) => !leading.has(job.id)),
  ];
}

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
  /** How many recent rows the list read returns. The node wants a handful; a grid wants the cap. */
  limit?: number;
  renderSetId?: string;
  /** A connected push consumer disables per-job polling; other consumers retain recovery. */
  pollIntervalMs?: number | false;
}) {
  const { brandId } = args;
  const [jobs, setJobs] = useState<ApiRenderJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const scope = `${brandId ?? ''}:${args.renderSetId ?? ''}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const paging = useRef(false);
  const paged = useRef(false);
  const sequence = useRef(0);

  useEffect(() => {
    setJobs([]);
    setError(null);
    setNextCursor(null);
    paged.current = false;
    paging.current = false;
  }, [scope]);

  // The tracked list is persisted node data and changes identity on every save; keying
  // effects off the array itself would refetch on each keystroke elsewhere in the node.
  const trackedKey = args.trackedIds.join(',');

  const mergeJob = useCallback(
    (fresh: ApiRenderJob) => {
      if (fresh.brandId !== brandId || (args.renderSetId && fresh.renderSetId !== args.renderSetId))
        return;
      setJobs((current) => {
        const index = current.findIndex((item) => item.id === fresh.id);
        if (index === -1) return [fresh, ...current];
        const next = [...current];
        if (Date.parse(fresh.updatedAt) >= Date.parse(next[index]!.updatedAt)) next[index] = fresh;
        return next;
      });
    },
    [brandId, args.renderSetId],
  );

  const refreshJobs = useCallback(async () => {
    if (!brandId) return;
    const requestSequence = ++sequence.current;
    const response = await apiRendersApi.listJobs(brandId, args.limit ?? 8, {
      renderSetId: args.renderSetId,
    });
    const listed = new Set(response.items.map((item) => item.id));
    const missing = trackedKey ? trackedKey.split(',').filter((id) => id && !listed.has(id)) : [];
    // A tracked id the list did not return is fetched directly rather than dropped.
    const recovered = await Promise.all(
      missing.map((id) => apiRendersApi.getJob(brandId, id).catch(() => null)),
    );
    if (scopeRef.current !== scope || sequence.current !== requestSequence) return;
    const fresh = [
      ...response.items,
      ...recovered.filter(
        (job): job is ApiRenderJob =>
          job !== null && (!args.renderSetId || job.renderSetId === args.renderSetId),
      ),
    ];
    setJobs((current) => mergePage(current, fresh, { incomingFirst: true }));
    if (!paged.current) setNextCursor(response.nextCursor);
  }, [brandId, trackedKey, args.limit, args.renderSetId, scope]);

  const loadMore = useCallback(async () => {
    if (!brandId || !nextCursor || paging.current) return;
    paging.current = true;
    try {
      const response = await apiRendersApi.listJobs(brandId, args.limit ?? 8, {
        cursor: nextCursor,
        renderSetId: args.renderSetId,
      });
      if (scopeRef.current !== scope) return;
      setJobs((current) => mergePage(current, response.items));
      setNextCursor(response.nextCursor);
      paged.current = true;
    } finally {
      if (scopeRef.current === scope) paging.current = false;
    }
  }, [brandId, nextCursor, args.limit, args.renderSetId, scope]);

  const refreshOne = useCallback(
    async (jobId: string) => {
      if (!brandId) return;
      const fresh = await apiRendersApi.getJob(brandId, jobId);
      if (scopeRef.current === scope) mergeJob(fresh);
    },
    [brandId, mergeJob, scope],
  );

  const jobsRef = useRef<ApiRenderJob[]>(jobs);
  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  const inFlight = jobs.some(isInFlight);
  useEffect(() => {
    if (!inFlight || !brandId || args.pollIntervalMs === false) return;
    let offset = 0;
    let pending = false;
    const timer = setInterval(() => {
      // Three at a time keeps a burst of confirms — a batch confirm is exactly that —
      // from turning the poll into a fan-out; the rest advance on later ticks.
      if (pending || document.visibilityState !== 'visible') return;
      const all = jobsRef.current.filter(isInFlight);
      if (!all.length) return;
      const active = Array.from(
        { length: Math.min(3, all.length) },
        (_, index) => all[(offset + index) % all.length]!,
      );
      offset = (offset + active.length) % all.length;
      pending = true;
      void Promise.all(active.map((job) => apiRendersApi.getJob(brandId, job.id)))
        .then((fresh) => {
          if (scopeRef.current === scope) setJobs((current) => mergePage(current, fresh));
        })
        .catch(() => {
          // A dropped poll is not a render failure; the next tick retries.
        })
        .finally(() => {
          pending = false;
        });
    }, args.pollIntervalMs ?? 30_000);
    return () => clearInterval(timer);
  }, [brandId, inFlight, scope, args.pollIntervalMs]);

  return {
    jobs,
    setJobs,
    error,
    setError,
    refreshJobs,
    refreshOne,
    mergeJob,
    nextCursor,
    hasMore: nextCursor !== null,
    loadMore,
  };
}

/** Test seam: the polling predicate is the whole cost/latency rule, so it is asserted directly. */
export const __test__ = { isInFlight, mergePage };
