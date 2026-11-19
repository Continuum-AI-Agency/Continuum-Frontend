'use client';

import type { ApiRenderJob, TemplateRevisionVariant } from '@continuum/contracts';
import { useQueries } from '@tanstack/react-query';
import { useTranslations as useUiTranslations } from 'next-intl';
import { fullSrc, thumbnailSrc } from '@/components/forge/renderOutputMedia';
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
  const translateUi = useUiTranslations('forge');

  const output = job?.outputs[0];
  if (!output)
    return <span className="text-muted-foreground">{translateUi('not_rendered_0ad7b5a0')}</span>;
  const still = output.kind === 'image' ? thumbnailSrc(output) : output.posterUrl;
  return (
    <a href={fullSrc(output)} target="_blank" rel="noreferrer" className="block">
      {still ? (
        <img
          src={still}
          alt={job?.label ?? translateUi('render_6d89eb7d')}
          loading="lazy"
          decoding="async"
          className="max-h-40 w-full rounded-sm object-contain"
        />
      ) : (
        <span className="underline">{translateUi('open_render_42b58ffe')}</span>
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
  const translateUi = useUiTranslations('forge');

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
        {' '}
        {translateUi('could_not_read_these_variants_rende_efd939dc')}{' '}
      </p>
    );
  if (reads.some((read) => !read.data))
    return (
      <p className="text-xs text-muted-foreground">{translateUi('reading_renders_616f34a6')}</p>
    );
  const rows = compareRows(
    variants,
    reads.map((read) => read.data?.items ?? []),
  );
  if (!rows.length)
    return (
      <p className="text-xs text-muted-foreground">
        {' '}
        {translateUi('no_finished_renders_on_these_varian_8899f0d8')}{' '}
      </p>
    );
  return (
    <div className="overflow-x-auto">
      <table
        aria-label={translateUi('variant_comparison_b79776e5')}
        className="w-full table-fixed text-xs"
      >
        <thead>
          <tr>
            <th className="w-32 text-left font-medium">{translateUi('row_95110d74')}</th>
            {variants.map((variant) => (
              <th key={variant.variantId} className="text-left font-medium">
                {variant.original ? translateUi('original_88d759ea') : variant.name}
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
