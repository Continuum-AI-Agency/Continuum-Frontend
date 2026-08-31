import type { ClientRenderJob } from '@continuum/contracts';

/**
 * The renders this TAB asked for.
 *
 * `media.client_render_jobs` is a shared queue — any operator with brand access may
 * claim a row — so the render inbox asks for consent before spending someone's CPU and
 * GPU on a job they did not start. That consent is already given for a run the person
 * kicked off HERE: the HyperFrames node says so in as many words, "you can leave AI
 * Studio; rendering continues in this tab".
 *
 * Nothing was reading that promise. Three `hyperframes_agent` jobs sat `ready` and
 * unclaimed from 2026-08-28 while their runs stayed non-terminal, and four
 * `planner_reel` jobs had been waiting since July — because the queue is only polled
 * once the inbox is open, and only a click ever starts a render (Airtable #296/#295).
 *
 * Deliberately in memory, not `localStorage`: a run stops being this tab's the moment
 * the tab is gone, and a persisted copy would have some other tab silently claiming a
 * render nobody is watching.
 */
const startedHere = new Set<string>();

export function markRenderStartedHere(runId: string): void {
  startedHere.add(runId);
}

/**
 * A job this tab may render without asking: it is waiting, and it belongs to a run
 * started from this tab. Every other job keeps the inbox's explicit consent step.
 */
export function shouldAutoRunClientRenderJob(job: ClientRenderJob): boolean {
  if (job.state !== 'ready') return false;
  const spec = job.executionSpec;
  return spec.kind === 'hyperframes_agent' && startedHere.has(spec.runId);
}

/** Test seam only — the set is process-wide and would otherwise leak between cases. */
export function resetRendersStartedHere(): void {
  startedHere.clear();
}
