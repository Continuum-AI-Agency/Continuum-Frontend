import type { ApiRenderJob } from '@continuum/contracts';

// One Render click is one batch: every job createBatch made shares its `batchId`. A job with
// none (a row from before batches were stored) is a batch of one. Grouped over the pages the
// ledger has loaded, so the oldest batch on screen can be short until "Load older renders" —
// opening a batch reads the whole of it from the server.
// ponytail: client-side grouping; move to server-side batch summaries when a brand's ledger
// outgrows a few pages.

export interface RenderBatch {
  id: string;
  /** In the order the ledger loaded them — newest first. */
  jobs: ApiRenderJob[];
  /** When the click happened: its earliest job. */
  createdAt: string;
  createdByEmail: string | null;
  /** The render whose first file stands for the batch. */
  preview: ApiRenderJob;
  finished: number;
  inFlight: number;
  failed: number;
  /** Files of finished renders — what the batch zip holds. */
  files: number;
}

export function groupJobsIntoBatches(jobs: readonly ApiRenderJob[]): RenderBatch[] {
  const byId = new Map<string, ApiRenderJob[]>();
  for (const job of jobs) {
    const id = job.batchId ?? job.id;
    byId.set(id, [...(byId.get(id) ?? []), job]);
  }
  const batches = [...byId].map(([id, members]): RenderBatch => {
    const count = (status: ApiRenderJob['status']) =>
      members.filter((job) => job.status === status).length;
    const finishedJobs = members.filter((job) => job.status === 'finished');
    return {
      id,
      jobs: members,
      createdAt: members.map((job) => job.createdAt).sort()[0] ?? '',
      createdByEmail: members.find((job) => job.createdByEmail)?.createdByEmail ?? null,
      preview: members.find((job) => job.outputs.length > 0) ?? (members[0] as ApiRenderJob),
      finished: finishedJobs.length,
      failed: count('failed'),
      inFlight: members.length - finishedJobs.length - count('failed'),
      files: finishedJobs.reduce((total, job) => total + job.outputs.length, 0),
    };
  });
  return batches.sort((left, right) => latest(right).localeCompare(latest(left)));
}

const latest = (batch: RenderBatch) =>
  batch.jobs.reduce((max, job) => (job.createdAt > max ? job.createdAt : max), '');

/** What is still happening reads first, then what went wrong, then done. */
export function batchStatus(batch: RenderBatch): {
  label: string;
  tone: 'warning' | 'destructive' | 'success';
  busy: boolean;
} {
  const total = batch.jobs.length;
  if (batch.inFlight > 0) {
    return { label: `${batch.inFlight} of ${total} rendering`, tone: 'warning', busy: true };
  }
  if (batch.failed === total) return { label: 'failed', tone: 'destructive', busy: false };
  if (batch.failed > 0) {
    return { label: `${batch.failed} of ${total} failed`, tone: 'destructive', busy: false };
  }
  return { label: 'finished', tone: 'success', busy: false };
}
