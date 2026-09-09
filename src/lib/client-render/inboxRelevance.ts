import type { ClientRenderJob } from '@continuum/contracts';

/**
 * Would this Realtime row change what the inbox endpoint returns?
 *
 * The subscription is a wake-up signal, not a data channel: every event that survives
 * this predicate costs one authenticated GET, and the endpoint stays the only thing that
 * knows the real visibility rules. So the job here is narrow — drop the events that
 * provably cannot change the answer, and let everything else through.
 *
 * It errs TOWARD the read. Every defect this queue has ever had was a browser that never
 * heard about a job (Airtable #296/#295); none was a browser that read once too often.
 */

/**
 * `media.client_render_jobs` is shared with the MediaStream url_ingest worker, which the
 * inbox hard-filters server-side (`ClientRenderJobStore.listInbox`) and which heartbeats
 * on its own service lease. Without this, every ingest tick reads as a job we have never
 * seen and refreshes every operator's browser.
 */
const SERVICE_ONLY_KINDS = new Set(['url_ingest']);

const stringField = (row: Record<string, unknown>, field: string): string | null => {
  const value = row[field];
  return typeof value === 'string' ? value : null;
};

export function shouldRefreshForRow(
  row: Record<string, unknown>,
  held: readonly ClientRenderJob[],
  inboxOpen: boolean,
): boolean {
  const kind = stringField(row, 'kind');
  if (kind && SERVICE_ONLY_KINDS.has(kind)) return false;

  // Someone is watching the panel, so another tab's progress bar has to tick. This is the
  // only case that pays for a progress-only write, and it ends when the panel closes.
  if (inboxOpen) return true;

  const id = stringField(row, 'id');
  if (!id) return true;

  const current = held.find((job) => job.id === id);
  // Unknown to us: a new job, or one that just became visible to this tab because its
  // address to another tab expired.
  if (!current) return true;

  return current.state !== stringField(row, 'state');
}
