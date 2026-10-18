'use client';

import type { ApiRenderJob, TemplateRevisionVariant } from '@continuum/contracts';
import { useQueries } from '@tanstack/react-query';
import { apiRendersApi } from '@/StudioCanvas/nodes/api-render/apiRendersApi';
import { FORGE_STALE_MS, forgeQueryKeys } from './queryKeys';

// ponytail: the latest 50 finished renders per variant; page through them if an experiment outgrows it.
const PER_VARIANT = 50;

/**
 * The same row's latest finished render on each variant, side by side. "Run on variants" copies
 * a set's rows with their ids, so one row id is one row across every variant's set; a row
 * rendered without a set is matched by its label instead.
 */
export function compareRows(variants: TemplateRevisionVariant[], jobs: ApiRenderJob[][]) {
  const rows = new Map<string, { label: string; at: string; cells: Array<ApiRenderJob | null> }>();
  jobs.forEach((list, column) => {
    for (const job of list) {
      // Filtered again: a server that ignored `variantId` would hand back every variant's jobs.
      if (job.status !== 'finished') continue;
      if (job.templateRevision?.variantId !== variants[column]?.variantId) continue;
      const key = job.renderSetRowId ?? `label:${job.label ?? job.id}`;
      const row = rows.get(key) ?? {
        label: job.label ?? 'Untitled row',
        at: '',
        cells: variants.map(() => null),
      };
      const at = job.finishedAt ?? job.updatedAt;
      const held = row.cells[column];
      if (!held || at > (held.finishedAt ?? held.updatedAt)) row.cells[column] = job;
      if (at > row.at) row.at = at;
      rows.set(key, row);
    }
  });
  return [...rows.values()].sort((a, b) => b.at.localeCompare(a.at));
}

function Still({ job }: { job: ApiRenderJob | null }) {
  const output = job?.outputs[0];
  if (!output) return <span className="text-muted-foreground">Not rendered</span>;
  const still = output.kind === 'image' ? (output.libraryUrl ?? output.url) : output.posterUrl;
  return (
    <a href={output.libraryUrl ?? output.url} target="_blank" rel="noreferrer" className="block">
      {still ? (
        <img
          src={still}
          alt={job?.label ?? 'Render'}
          loading="lazy"
          decoding="async"
          className="max-h-40 w-full rounded-sm object-contain"
        />
      ) : (
        <span className="underline">Open render</span>
      )}
    </a>
  );
}

export function VariantCompare({
  brandId,
  variants,
}: {
  brandId: string;
  variants: TemplateRevisionVariant[];
}) {
  const reads = useQueries({
    queries: variants.map((variant) => ({
      queryKey: [...forgeQueryKeys.renderJobs(brandId), 'variant', variant.variantId],
      queryFn: () =>
        apiRendersApi.listJobs(brandId, PER_VARIANT, {
          variantId: variant.variantId,
          status: 'finished',
        }),
      staleTime: FORGE_STALE_MS.active,
    })),
  });
  if (reads.some((read) => read.error))
    return (
      <p role="alert" className="text-xs text-destructive">
        Could not read these variants' renders.
      </p>
    );
  if (reads.some((read) => !read.data))
    return <p className="text-xs text-muted-foreground">Reading renders…</p>;
  const rows = compareRows(
    variants,
    reads.map((read) => read.data?.items ?? []),
  );
  if (!rows.length)
    return (
      <p className="text-xs text-muted-foreground">
        No finished renders on these variants yet. Use "Run on variants" from a render set to render
        the same rows on each.
      </p>
    );
  return (
    <div className="overflow-x-auto">
      <table aria-label="Variant comparison" className="w-full table-fixed text-xs">
        <thead>
          <tr>
            <th className="w-32 text-left font-medium">Row</th>
            {variants.map((variant) => (
              <th key={variant.variantId} className="text-left font-medium">
                {variant.original ? 'Original' : variant.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.label}:${row.at}`} className="border-t align-top">
              <td className="py-2 pr-2">{row.label}</td>
              {row.cells.map((job, column) => (
                <td key={variants[column]!.variantId} className="py-2 pr-2">
                  <Still job={job} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
