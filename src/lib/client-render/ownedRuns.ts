import type { ClientRenderJob } from '@continuum/contracts';

/**
 * The renders this TAB asked for, keyed by the job's `sourceId`.
 *
 * `media.client_render_jobs` is a shared queue — any operator with brand access may
 * claim a row — so the render inbox asks for consent before spending someone's CPU and
 * GPU on a job they did not start. That consent is already given for a render the person
 * kicked off HERE: the HyperFrames node says so in as many words, "you can leave AI
 * Studio; rendering continues in this tab".
 *
 * Nothing was reading that promise. Three `hyperframes_agent` jobs sat `ready` and
 * unclaimed from 2026-08-28 while their runs stayed non-terminal, and four
 * `planner_reel` jobs had been waiting since July — because the queue is only polled
 * once the inbox is open, and only a click ever starts a render (Airtable #296/#295).
 *
 * `sourceId` is the key rather than a per-kind field because it is the one thing every
 * enqueue path already writes: the HyperFrames orchestrator puts the run id there, and
 * every `planner_reel` caller puts the draft id there. Keying on it means a new render
 * kind inherits this without a carve-out — the first version tested
 * `spec.kind === 'hyperframes_agent'`, which left `planner_reel` with the same defect
 * the commit was fixing.
 *
 * Deliberately in memory, not `localStorage`: a render stops being this tab's the moment
 * the tab is gone, and a persisted copy would have some other tab silently claiming a
 * render nobody is watching. A tab that reloads therefore drops back to the explicit
 * step — which is why the node has to SHOW that it is waiting rather than keep promising.
 */
const startedHere = new Set<string>();

export function markRenderStartedHere(sourceId: string): void {
  startedHere.add(sourceId);
}

/**
 * A job this tab may render without asking.
 *
 * Two signals, and the second is the durable one. `startedHere` covers the render the
 * person kicked off in THIS tab and dies with it, which is why a reload used to strand
 * the job forever — six of them sat `ready` for weeks with nothing left that remembered
 * consent. `createdBy` is the same consent written down: the person who enqueued the
 * render is the person now looking at the queue, and the row says so.
 *
 * This is not the `localStorage` copy the comment above rejects. That would have let a
 * DIFFERENT person's tab adopt a render nobody is watching; this only ever matches the
 * viewer's own jobs, and the claim is atomic, so two of their tabs cannot both run it.
 */
export function shouldAutoRunClientRenderJob(job: ClientRenderJob, viewerId?: string): boolean {
  if (job.state !== 'ready') return false;
  return startedHere.has(job.sourceId) || (Boolean(viewerId) && job.createdBy === viewerId);
}

/** Test seam only — the set is process-wide and would otherwise leak between cases. */
export function resetRendersStartedHere(): void {
  startedHere.clear();
}
