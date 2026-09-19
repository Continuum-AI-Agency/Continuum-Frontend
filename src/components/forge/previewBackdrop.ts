import {
  type ApiRenderJob,
  type ApiRenderOutput,
  matchOutputFormat,
  type RenderOutputFormatCandidate,
} from '@continuum/contracts';

// A row's preview is composed on the server over the closest real render of the format — the
// backdrop. This file picks it: this row's own render, else the nearest row's in the set, else the
// template's newest. The server erases and redraws only what the row changed since.

export type Backdrop = {
  job: ApiRenderJob;
  /** The job's file for this format: a still when it has one, else a video (a frame is taken). */
  file: ApiRenderOutput;
  /** This row's own render, another row of the set, or any render of the template. */
  from: 'row' | 'set' | 'template';
};

type TreeRow = { id: string; parentId: string | null };

/** Steps between two rows through their nearest shared ancestor. Top-level rows are siblings. */
export function rowDistance(rows: readonly TreeRow[], from: string, to: string): number {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const chain = (id: string) => {
    const ids: string[] = [];
    for (let row = byId.get(id); row && !ids.includes(row.id); ) {
      ids.push(row.id);
      row = row.parentId ? byId.get(row.parentId) : undefined;
    }
    return ids;
  };
  const up = chain(from);
  const down = chain(to);
  if (up.length === 0 || down.length === 0) return Number.POSITIVE_INFINITY;
  const shared = up.findIndex((id) => down.includes(id));
  return shared >= 0 ? shared + down.indexOf(up[shared] as string) : up.length + down.length;
}

const finishedAt = (job: ApiRenderJob) => Date.parse(job.finishedAt ?? job.createdAt);

/** The job's file for one format, by name: its still first, else its video. */
const fileFor = (
  job: ApiRenderJob,
  formats: readonly RenderOutputFormatCandidate[],
  formatId: string,
): ApiRenderOutput | null => {
  if (job.status !== 'finished') return null;
  const ofFormat = job.outputs.filter(
    (output) => matchOutputFormat(output.fileName, formats)?.id === formatId,
  );
  return (
    ofFormat.find((output) => output.kind === 'image') ??
    ofFormat.find((output) => output.kind === 'video') ??
    null
  );
};

/**
 * The closest finished render of one format: this row's newest render, else the nearest row of the
 * set that has one (ties go to the newest), else the template's newest. File by name, never by
 * position — the fleet lists a job's files in a different order every time.
 */
export function pickBackdrop(args: {
  rowId: string;
  rows: readonly TreeRow[];
  rowJob: ApiRenderJob | null | undefined;
  setJobs: readonly ApiRenderJob[];
  templateJobs: readonly ApiRenderJob[];
  formats: readonly RenderOutputFormatCandidate[];
  formatId: string;
}): Backdrop | null {
  const found = (job: ApiRenderJob, from: Backdrop['from']): Backdrop | null => {
    const file = fileFor(job, args.formats, args.formatId);
    return file ? { job, file, from } : null;
  };
  const own = args.rowJob ? found(args.rowJob, 'row') : null;
  if (own) return own;
  const relatives = args.setJobs
    .map((job) => ({
      job,
      distance: job.renderSetRowId
        ? rowDistance(args.rows, args.rowId, job.renderSetRowId)
        : Number.POSITIVE_INFINITY,
    }))
    .filter((entry) => Number.isFinite(entry.distance))
    .sort((a, b) => a.distance - b.distance || finishedAt(b.job) - finishedAt(a.job));
  for (const { job } of relatives) {
    const hit = found(job, job.renderSetRowId === args.rowId ? 'row' : 'set');
    if (hit) return hit;
  }
  for (const job of [...args.templateJobs].sort((a, b) => finishedAt(b) - finishedAt(a))) {
    const hit = found(job, 'template');
    if (hit) return hit;
  }
  return null;
}
